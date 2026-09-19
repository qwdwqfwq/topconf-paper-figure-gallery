# -*- coding: utf-8 -*-
"""Requests-based OpenReview PDF downloader via local Clash proxy, with
automatic exit-node rotation through the Clash external controller.

Reads clearance token from data/or_token.txt (browser-refreshed via CDP).
Downloads jobs (default data/batch_jobs.json) into pdfs/browser/<id>.pdf for
analyze_cache.py. Stops on the first expired-clearance challenge (403) so the
caller can refresh the token. Rotates Default Proxy node on TLS/connection
errors.

Usage: python req_dl.py [jobs_file] [max_jobs]
"""
import json, sys, time, threading, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "pdfs" / "browser"
OUT.mkdir(parents=True, exist_ok=True)
PROXY = "http://127.0.0.1:7897"
CTRL = "http://127.0.0.1:9097"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36")

jobs_f = sys.argv[1] if len(sys.argv) > 1 else str(DATA / "batch_jobs.json")
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 80
jobs = json.loads(Path(jobs_f).read_text(encoding="utf-8"))[:limit]
token = (DATA / "or_token.txt").read_text(encoding="utf-8").strip()
assert token, "no token"

NODES = ["Premium", "US", "Express", "Auto", "US-Dedicated-B1-1", "US-Dedicated-B1-2",
         "US-Dedicated-B1-3", "US-Dedicated-B1-4", "US-Dedicated-B1-5", "US-Dedicated-B1-6",
         "US-Dedicated-B1-7", "US-Dedicated-B1-8", "JP-Dedicated-B1-1", "JP-Dedicated-B1-2",
         "JP-Dedicated-B1-3", "Fast-B1-1", "Fast-B1-2", "Fast-B1-3", "Fast-B1-4",
         "Balancer-B1-1", "Balancer-B1-2"]
node_i = 0
node_lock = threading.Lock()
err_burst = 0

def ctrl(path, method="GET", body=None):
    url = CTRL + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except Exception:
        return None

def set_node(name):
    ctrl("/proxies/" + urllib.parse.quote("Default Proxy"), "PUT", {"name": name})
    ctrl("/proxies/" + urllib.parse.quote("Research + AI"), "PUT", {"name": name})
    time.sleep(1.5)

def node_works(name):
    enc = urllib.parse.quote(name)
    try:
        with urllib.request.urlopen(
                f"{CTRL}/proxies/{enc}/delay?url=https://openreview.net/&timeout=8000",
                timeout=14) as r:
            json.loads(r.read())
            return True
    except Exception:
        return False

def rotate(reason=""):
    global node_i, err_burst
    with node_lock:
        for _ in range(len(NODES)):
            cand = NODES[node_i % len(NODES)]
            node_i += 1
            if node_works(cand):
                set_node(cand)
                print(f"[rotate] {reason} -> {cand}", flush=True)
                err_burst = 0
                return cand
        set_node(NODES[0])
        print("[rotate] no healthy node, default", flush=True)
        return NODES[0]

# node must already be healthy (find_node.py); clearance is IP-bound

TL = threading.local()
def sess():
    s = getattr(TL, "s", None)
    if s is None:
        s = requests.Session()
        s.trust_env = False
        s.proxies = {"http": PROXY, "https": PROXY}
        s.headers["User-Agent"] = UA
        s.cookies.set("openreview.clearanceToken", token, domain=".openreview.net")
        TL.s = s
    return s

stop = threading.Event()
needs_refresh = threading.Event()
stats = {"ok": 0, "challenge": 0, "missing": 0, "error": 0, "exists": 0}
lock = threading.Lock()

def note_err():
    global err_burst
    with lock:
        err_burst += 1
        if err_burst >= 10:
            # clearance is IP-bound: stop instead of rotating mid-token;
            # caller re-runs find_node.py + browser token refresh
            stop.set()
            print("[stop] too many connection errors; need node+token refresh", flush=True)

def fetch(job):
    global err_burst
    if stop.is_set():
        return ("skip", job["id"])
    fid, url = job["id"], job["url"]
    dst = OUT / f"{fid}.pdf"
    if dst.exists() and dst.stat().st_size > 20000:
        return ("exists", fid)
    for attempt in range(4):
        if stop.is_set():
            return ("skip", fid)
        try:
            r = sess().get(url, timeout=60, allow_redirects=True)
            ct = r.headers.get("content-type", "")
            if r.status_code == 403 or "html" in ct or r.content[:5] != b"%PDF-":
                low = r.text[:3000].lower()
                if r.status_code == 403 or "turnstile" in low or "cloudflare" in low or "challenge" in low:
                    needs_refresh.set(); stop.set()
                    return ("challenge", fid)
                if r.status_code == 404:
                    return ("missing", fid)
                time.sleep(1.2 + attempt)
                continue
            if len(r.content) < 20000:
                time.sleep(1)
                continue
            tmp = dst.with_suffix(".part")
            tmp.write_bytes(r.content)
            tmp.replace(dst)
            with lock:
                err_burst = max(0, err_burst - 1)
            return ("ok", fid)
        except Exception:
            note_err()
            time.sleep(1.2 + attempt * 2)
    return ("error", fid)

t0 = time.time()
with ThreadPoolExecutor(max_workers=8) as ex:
    futs = {ex.submit(fetch, j): j for j in jobs}
    for fu in as_completed(futs):
        kind, fid = fu.result()
        with lock:
            stats[kind] = stats.get(kind, 0) + 1
            done = sum(v for k, v in stats.items() if k != "exists") + stats["exists"]
            if done % 10 == 0:
                print(f"{done}/{len(jobs)} {stats} {time.time()-t0:.0f}s", flush=True)
print("DONE", stats, f"{time.time()-t0:.0f}s", "REFRESH" if needs_refresh.is_set() else "TOKEN-OK")
