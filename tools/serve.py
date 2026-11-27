"""Dev server for TRIANGLE: plain static files, but with caching disabled.

Browsers cache ES modules aggressively; with `python -m http.server` an edited
module can keep running in its old version after a reload. This server sends
`Cache-Control: no-store` so every reload runs the files on disk.

Usage:  python tools/serve.py [port]      (default 8000, serves the repo root)
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"TRIANGLE dev server: http://localhost:{port}  (no-store)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
