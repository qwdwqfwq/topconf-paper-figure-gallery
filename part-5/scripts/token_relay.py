# -*- coding: utf-8 -*-
"""Localhost relay that receives fresh OpenReview clearance cookies from a
browser-side feeder JS (Cloudflare Turnstile auto-solves in the real browser;
the resulting token only lives 5 minutes).

POST /token  body: {"cookies": {"openreview.clearanceToken": "...", ...}}
Writes data/or_cookies_live.json (same shape as or_cookies.json).
Run: python scripts/token_relay.py
"""
import json, threading, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "data" / "or_cookies_live.json"
ORIGIN = "https://openreview.net"

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type, Access-Control-Request-Private-Network")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        if self.path != "/token":
            self.send_response(404); self.end_headers(); return
        n = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(n) or b"{}")
            cookies = data.get("cookies", {})
            tok = cookies.get("openreview.clearanceToken")
            if not tok:
                raise ValueError("no token")
            out = [{"name": k, "value": v, "domain": ".openreview.net", "path": "/"}
                   for k, v in cookies.items()]
            LIVE.write_text(json.dumps(out), encoding="utf-8")
            print(datetime.datetime.now().strftime("%H:%M:%S"), "token saved, len", len(tok), flush=True)
            self.send_response(200); self._cors()
            self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(b'{"ok":true}')
        except Exception as e:
            self.send_response(400); self._cors(); self.end_headers()
            self.wfile.write(str(e).encode())

    def do_GET(self):
        self.send_response(200); self._cors(); self.send_header("Content-Type", "text/plain"); self.end_headers()
        self.wfile.write(b"relay ok\n")

    def log_message(self, *a):
        pass

if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", 8899), H)
    print("token relay on http://127.0.0.1:8899", flush=True)
    srv.serve_forever()
