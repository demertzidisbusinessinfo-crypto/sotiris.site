"""Run with Python Playwright and Chromium: python3 tests/resource_links.py."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import unittest

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class ResourceLinksTest(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1]
        handler = partial(QuietHandler, directory=str(root))
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.addCleanup(server.server_close)
        Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        self.origin = f"http://127.0.0.1:{server.server_port}"

    def test_stored_links_render_without_changing_attributes(self):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page()
            page.route("**/*", lambda route: (
                route.continue_()
                if route.request.url.startswith(self.origin + "/") else route.abort()
            ))
            # Leave authentication paused; exercise the actual render paths with local data.
            page.add_init_script("""
                window.supabase = {
                    createClient: () => ({ auth: { getSession: () => new Promise(() => {}) } })
                };
            """)

            views = [
                ("admin-dashboard", "#cd-icp-items", "#cd-frame-link-display"),
                ("client-detail", "#icp-items", "#frame-link-display"),
                ("client-dashboard", "#brand-grid .brand-subcard:first-child", "#frame-current"),
                ("partner-dashboard", "#icp-items", "#detail-frame-row"),
            ]
            values = [
                ("plain URL", "https://example.org/resource"),
                ("quoted search URL", 'https://example.org/search?q="café"&lang=fr'),
                ("empty value", ""),
                ("missing value", None),
            ]
            for view, brand, frame in views:
                page.goto(f"{self.origin}/{view}.html?id=test-client")
                for case, url in values:
                    self.render(page, view, url)
                    with self.subTest(view=view, case=case, field="brand"):
                        self.assert_link(page.locator(brand), url)
                        if not url:
                            self.assertIn("Nothing submitted yet", page.locator(brand).text_content())
                    with self.subTest(view=view, case=case, field="frame"):
                        if view == "partner-dashboard":
                            if url:
                                self.assert_link(page.locator(frame), url, id="detail-frame-link")
                            else:
                                self.assertEqual(page.locator(frame).evaluate("(el) => el.style.display"), "none")
                        else:
                            self.assert_link(page.locator(frame), url)
                    if view == "client-dashboard":
                        with self.subTest(view=view, case=case, field="input"):
                            field = page.locator(f"{brand} .brand-link-input")
                            self.assertEqual(field.input_value(), url or "")
                            self.assertEqual(
                                field.evaluate("(input) => input.getAttributeNames().sort()"),
                                ["autocomplete", "class", "data-key", "inputmode",
                                 "placeholder", "spellcheck", "type", "value"],
                            )

                with self.subTest(view=view, case="quoted filename"):
                    filename = 'Brand "draft".pdf'
                    path = f"test-client/{filename}"
                    self.render(page, view, None, path)
                    if view == "client-dashboard":
                        self.assertIn(filename, page.locator(brand).text_content())
                    else:
                        self.assert_link(page.locator(brand), "#", text=filename, **{"data-filepath": path})

    def assert_link(self, container, url, **attributes):
        actual = container.locator("a").evaluate_all("""
            (links) => links.map((link) => ({
                ...Object.fromEntries([...link.attributes].map(({name, value}) => [name, value])),
                text: link.textContent
            }))
        """)
        expected = [] if not url else [{
            "href": url,
            "text": url,
            **({"target": "_blank", "rel": "noopener"} if url != "#" else {}),
            **attributes,
        }]
        self.assertEqual(actual, expected)

    @staticmethod
    def render(page, view, url, file_path=None):
        page.evaluate("""
            async ({view, url, filePath}) => {
                const profile = { frame_link: url, icp_link: url, icp_file: filePath };
                if (view === 'client-dashboard') return renderProfile(profile);
                if (view === 'partner-dashboard') return openClientDetail(profile);

                supabaseClient.from = () => ({
                    select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) })
                });
                window.loadTrackerMonth = () => {};
                window.loadClientMetricsChart = () => {};
                if (view === 'admin-dashboard') return loadClientDetail('test-client');
                return loadClient();
            }
        """, {"view": view, "url": url, "filePath": file_path})


if __name__ == "__main__":
    unittest.main(verbosity=2)
