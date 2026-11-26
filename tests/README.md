# Login regression test

Requires Python 3 and Playwright (`python3 -m pip install playwright`). Start the
site with `python3 -m http.server 8080` and Chrome with remote debugging on port
29229 (for example `google-chrome --remote-debugging-port=29229
--user-data-dir="$HOME/.login-test-chrome"`). Then run from the repository root:

```sh
python3 -m unittest discover -s tests -v
```

`BASE_URL` and `CDP_URL` override the server and Chrome URLs. Optionally set
`SCREENSHOT` to save the submitted form at the fixed 1280×900 viewport.
The test intercepts the SDK request and never sends credentials to Supabase.
