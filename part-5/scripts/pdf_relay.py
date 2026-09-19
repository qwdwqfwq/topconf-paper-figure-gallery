# -*- coding: utf-8 -*-
"""Relay between the OpenReview browser tab (which passes Cloudflare Turnstile)
and the local extractor.

  POST /jobs   bulk enqueue [{"id": ..., "url": ...}, ...]
  GET  /job    pop one job (204 when empty)
  POST /pdf/<id>   raw PDF bytes -> pdfs/browser/<id>.pdf
  POST /fail/<id>  {"reason": ...}
  GET  /status     queue / done / fail counts
CORS + Private Network Access headers included for https->127.0.0.1.
Run: python scripts/pdf_relay.py
"""
import json, threading, datetime, collections, base64, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDFDIR = ROOT / "pdfs" / "browser"
QUEUE_F = ROOT / "data" / "pdf_queue.json"
FAILS_F = ROOT / "data" / "pdf_fails.json"
PDFDIR.mkdir(parents=True, exist_ok=True)
ORIGIN = "https://openreview.net"

lock = threading.Lock()
queue = []
done = set()
fails = {}
if QUEUE_F.exists():
    queue = json.loads(QUEUE_F.read_text(encoding="utf-8"))
for p in PDFDIR.glob("*.pdf"):
    done.add(p.stem)
queue = [j for j in queue if j["id"] not in done]
if FAILS_F.exists():
    fails = json.loads(FAILS_F.read_text(encoding="utf-8"))

def save_queue():
    QUEUE_F.write_text(json.dumps(queue), encoding="utf-8")

class H(BaseHTTPRequestHandler):
    def _cors(self, ctype="application/json"):
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Type", ctype)

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        if self.path == "/job":
            with lock:
                while queue:
                    j = queue.pop(0)
                    if j["id"] not in done:
                        save_queue()
                        self.send_response(200); self._cors(); self.end_headers()
                        self.wfile.write(json.dumps(j).encode()); return
            self.send_response(204); self._cors(); self.end_headers(); return
        if self.path == "/status":
            with lock:
                body = json.dumps({"queue": len(queue), "done": len(done), "fails": len(fails)}).encode()
            self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(body); return
        self.send_response(404); self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        if self.path == "/jobs":
            jobs = json.loads(body or b"[]")
            with lock:
                have = {j["id"] for j in queue} | done
                added = 0
                for j in jobs:
                    if j["id"] not in have:
                        queue.append(j); added += 1
                save_queue()
            self.send_response(200); self._cors(); self.end_headers()
            self.wfile.write(json.dumps({"added": added, "queue": len(queue)}).encode()); return
        if self.path.startswith("/pdf/"):
            fid = self.path.split("/pdf/", 1)[1][:40]
            if body[:4] != b"%PDF" or len(body) < 50_000:
                self.send_response(400); self._cors(); self.end_headers()
                self.wfile.write(b'{"error":"not a pdf"}'); return
            (PDFDIR / f"{fid}.pdf").write_bytes(body)
            with lock:
                done.add(fid); fails.pop(fid, None); save_queue()
            print(datetime.datetime.now().strftime("%H:%M:%S"), "pdf", fid, f"{len(body)//1024}KB",
                  "q", len(queue), "done", len(done), flush=True)
            self.send_response(200); self._cors(); self.end_headers()
            self.wfile.write(b'{"ok":true}'); return
        if self.path.startswith("/b64/"):
            fid = self.path.split("/b64/", 1)[1][:40]
            text = body.decode("ascii", "ignore").strip()
            if text.startswith("data="):
                text = text[5:].strip()
            else:
                form = urllib.parse.parse_qs(body.decode("utf-8", "ignore"))
                text = (form.get("data") or [""])[0]
            try:
                raw = base64.b64decode(text + "=" * (-len(text) % 4))
            except Exception:
                raw = b""
            if raw[:4] != b"%PDF" or len(raw) < 50_000:
                self.send_response(400); self._cors(); self.end_headers()
                self.wfile.write(b'{"error":"bad b64"}'); return
            (PDFDIR / f"{fid}.pdf").write_bytes(raw)
            with lock:
                done.add(fid); fails.pop(fid, None); save_queue()
            print(datetime.datetime.now().strftime("%H:%M:%S"), "b64", fid, f"{len(raw)//1024}KB",
                  "q", len(queue), "done", len(done), flush=True)
            self.send_response(200); self._cors(); self.end_headers()
            self.wfile.write(b'{"ok":true}'); return
        if self.path.startswith("/fail/"):
            fid = self.path.split("/fail/", 1)[1][:40]
            try: reason = json.loads(body or b"{}").get("reason", "?")
            except Exception: reason = "?"
            with lock:
                fails[fid] = reason
                FAILS_F.write_text(json.dumps(fails), encoding="utf-8")
            self.send_response(200); self._cors(); self.end_headers()
            self.wfile.write(b'{"ok":true}'); return
        self.send_response(404); self.end_headers()

    def log_message(self, *a):
        pass

if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", 8899), H)
    print("pdf relay on http://127.0.0.1:8899  pending", len(queue), flush=True)
    srv.serve_forever()
