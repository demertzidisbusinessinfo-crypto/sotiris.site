import os
import unittest

from playwright.sync_api import expect, sync_playwright


class LoginTest(unittest.TestCase):
    def test_blocked_sdk_recovers(self):
        with sync_playwright() as p, p.chromium.connect_over_cdp(
            os.environ.get('CDP_URL', 'http://localhost:29229')
        ).new_context(viewport={'width': 1280, 'height': 900}) as context:
            page = context.new_page()
            errors = []
            blocked = []
            page.on('pageerror', lambda error: errors.append(str(error)))

            def block_sdk(route):
                blocked.append(route.request.url)
                route.abort()

            page.route('https://cdn.jsdelivr.net/npm/@supabase/**', block_sdk)
            page.goto(os.environ.get('BASE_URL', 'http://localhost:8080') + '/login.html')
            self.assertTrue(blocked, 'SDK request was not intercepted')
            self.assertIsNone(page.evaluate('supabaseClient'))
            button = page.locator('#submit-btn')
            original_label = button.inner_text()
            page.locator('#email').fill('sdk-test@example.com')
            page.locator('#password').fill('not-a-real-password')
            for _ in range(2):
                button.click()
                try:
                    expect(button).to_be_enabled()
                    expect(button).to_have_text(original_label)
                    expect(page.locator('#form-error')).to_be_visible()
                    expect(page.locator('#form-error')).to_contain_text('reload')
                    self.assertEqual(errors, [])
                finally:
                    if os.environ.get('SCREENSHOT'):
                        page.screenshot(path=os.environ['SCREENSHOT'])
                    print('Page errors:', errors)


if __name__ == '__main__':
    unittest.main()
