"""Local server for testing on a phone over Wi-Fi.

Like `python -m http.server`, but tells browsers never to cache, so a reload
always gets the latest files (phones otherwise mix old and new scripts).

    python dev-server.py [port]     # default 5174
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5174
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    print(f'Serving {root} on http://0.0.0.0:{port} (no caching)')
    http.server.ThreadingHTTPServer(('0.0.0.0', port), handler).serve_forever()
