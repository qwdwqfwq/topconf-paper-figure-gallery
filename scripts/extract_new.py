# -*- coding: utf-8 -*-
"""Parallel Figure-1 extraction for the new venues (CVPR / ACL / AAAI).

Same crop logic as extract_all.py (first 4 pages, largest region above a
"Figure N" caption). Network settings:
  - Standard HTTP_PROXY / HTTPS_PROXY env vars are honored automatically.
  - PROXY_URL explicitly forces one proxy for every host.
  - DIRECT_HOSTS is an optional comma-separated list of host substrings that
    must always be connected to directly (bypassing env proxies).

Resumable: appends one row per paper to data/extract_state.jsonl and skips
ids already present. PDFs are never kept on disk.

Usage:
    python scripts/extract_new.py cvpr,acl,aaai [workers] [limit]
"""
import json, os, sys, time, threading, traceback
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, pymupdf as fitz

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_all as E

ROOT = Path(__file__).resolve().parents[1]
DATA, POOL = ROOT / "data", ROOT / "data" / "pool"
STATE = DATA / "extract_state.jsonl"
TMP = ROOT / "pdfs" / "tmp"
TMP.mkdir(parents=True, exist_ok=True)

VENUES = sys.argv[1].split(",") if len(sys.argv) > 1 else ["cvpr", "acl", "aaai"]
WORKERS = int(sys.argv[2]) if len(sys.argv) > 2 else 8
LIMIT = int(sys.argv[3]) if len(sys.argv) > 3 else 0
# Hosts forced to connect directly even when proxy env vars are set.
DIRECT_HOSTS = tuple(h.strip() for h in os.environ.get("DIRECT_HOSTS", "").split(",") if h.strip())
lock = threading.Lock()
host_locks = {}
host_last = {}
MIN_INTERVAL = {"aclanthology.org": 0.25, "ojs.aaai.org": 0.25,
                "openaccess.thecvf.com": 0.0}
local = threading.local()


def host_of(url):
    for h in DIRECT_HOSTS:
        if h in url:
            return h
    if "aclanthology.org" in url:
        return "aclanthology.org"
    if "ojs.aaai.org" in url:
        return "ojs.aaai.org"
    return "other"


def sess_for(host):
    key = "direct" if host in DIRECT_HOSTS else "proxy"
    if not hasattr(local, key):
        s = requests.Session()
        # "proxy" sessions honor standard HTTP(S)_PROXY env vars; "direct"
        # sessions bypass them. PROXY_URL (if set) overrides everything.
        s.trust_env = (key == "proxy")
        if key == "proxy" and os.environ.get("PROXY_URL"):
            pu = os.environ["PROXY_URL"]
            s.proxies.update({"http": pu, "https": pu})
        s.headers.update({"User-Agent": E.BROWSER_UA,
                          "Accept": "application/pdf,text/html,*/*"})
        setattr(local, key, s)
    return getattr(local, key)


def pace(host):
    iv = MIN_INTERVAL.get(host, 0.1)
    if iv <= 0:
        return
    hl = host_locks.setdefault(host, threading.Lock())
    last = host_last.get(host, 0.0)
    with hl:
        wait = iv - (time.time() - host_last.get(host, 0.0))
        if wait > 0:
            time.sleep(wait)
        host_last[host] = time.time()


def download(url, dest):
    host = host_of(url)
    backoff = 10
    for attempt in range(5):
        try:
            pace(host)
            r = sess_for(host).get(url, timeout=150, allow_redirects=True)
            if r.status_code == 200 and r.content[:4] == b"%PDF" and len(r.content) > 50_000:
                dest.write_bytes(r.content)
                return True, len(r.content)
            if r.status_code in (403, 404, 410):
                return False, r.status_code
            if r.status_code in (429, 503):
                time.sleep(min(backoff, 90))
                backoff *= 2
                continue
            # OJS sometimes redirects a galley URL to an abstract page
            if r.status_code == 200 and r.content[:4] != b"%PDF":
                return False, "not-pdf"
        except Exception:
            time.sleep(2 + attempt * 2)
    return False, "fail"


def load_done():
    done = {}
    if STATE.exists():
        for line in STATE.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
                done[r["id"]] = r
            except Exception:
                pass
    return done


def work(item):
    fid, venue = item["id"], item["venue"]
    out = E.IMGDIR / venue / "all" / f"{fid}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = TMP / f"{fid}.pdf"
    ok, info = download(item["pdf"], tmp)
    if not ok:
        return {"id": fid, "venue": venue, "ok": False, "reason": f"download {info}"}
    try:
        doc = fitz.open(tmp)
        best = E.find_best(doc)
        if best is None:
            doc.close()
            return {"id": fid, "venue": venue, "ok": False, "reason": "no figure"}
        _, pno, clip = best
        st = E.region_stats(doc[pno], clip)
        pix = doc[pno].get_pixmap(matrix=fitz.Matrix(2.5, 2.5), clip=clip, alpha=False)
        pix.save(out)
        doc.close()
        return {"id": fid, "venue": venue, "ok": True, "page": pno + 1,
                "w": pix.width, "h": pix.height, "bytes": out.stat().st_size, **st}
    except Exception as e:
        return {"id": fid, "venue": venue, "ok": False,
                "reason": f"exc {type(e).__name__}: {e}"}
    finally:
        try:
            tmp.unlink()
        except Exception:
            pass


def main():
    items = []
    for venue in VENUES:
        p = POOL / f"{venue}_2023_2025.jsonl"
        if not p.exists():
            print("missing pool", p)
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            items.append(json.loads(line))
    items.sort(key=lambda r: (r["tier"], r["venue"], r["year"], r["id"]))
    done = load_done()
    todo = [it for it in items if it["id"] not in done]
    if LIMIT:
        todo = todo[:LIMIT]
    print(f"venues={VENUES} pool={len(items)} done={len(done)} todo={len(todo)} workers={WORKERS}",
          flush=True)
    sf = STATE.open("a", encoding="utf-8")
    n_ok = sum(1 for r in done.values() if r.get("ok") and r.get("venue") in VENUES)
    t0, n, fails = time.time(), 0, 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(work, it): it for it in todo}
        for fut in as_completed(futs):
            it = futs[fut]
            try:
                r = fut.result()
            except Exception as e:
                r = {"id": it["id"], "venue": it["venue"], "ok": False, "reason": f"worker {e}"}
            with lock:
                sf.write(json.dumps(r, ensure_ascii=False) + "\n")
                sf.flush()
            n += 1
            if r.get("ok"):
                n_ok += 1
            else:
                fails += 1
            if n % 25 == 0:
                rate = n / max(1e-6, time.time() - t0)
                eta = (len(todo) - n) / max(1e-6, rate)
                print(f"{n}/{len(todo)} ok={n_ok} fail={fails} {rate:.2f}/s "
                      f"eta={eta/60:.0f}min last={r['id']} "
                      f"{'OK' if r.get('ok') else r.get('reason')}", flush=True)
    sf.close()
    print(f"DONE processed={n} ok={n_ok} fail={fails}", flush=True)


if __name__ == "__main__":
    main()
