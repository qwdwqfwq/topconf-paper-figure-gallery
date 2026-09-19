# -*- coding: utf-8 -*-
"""Consume browser-downloaded PDFs in pdfs/browser/<id>.pdf: crop the best
figure, append state rows, then delete the PDF. Runs in a watch loop.
Usage: python scripts/analyze_cache.py [--once]
"""
import json, sys, time, threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fitz
import extract_all as E

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pdfs" / "browser"
STATE = ROOT / "data" / "extract_state.jsonl"
lock = threading.Lock()

# id -> pool item
pool = {}
for p in (ROOT / "data/pool").glob("*.jsonl"):
    for line in p.read_text(encoding="utf-8").splitlines():
        m = json.loads(line)
        pool[m["id"]] = m

def load_done():
    done = {}
    if STATE.exists():
        for line in STATE.read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            done[r["id"]] = r
    return done

def analyze(fid, pdf):
    item = pool.get(fid)
    venue = item["venue"] if item else fid.split("20")[0]
    out = E.IMGDIR / venue / "all" / f"{fid}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        doc = fitz.open(pdf)
        best = E.find_best(doc)
        if best is None:
            doc.close()
            return {"id": fid, "ok": False, "reason": "no figure"}
        _, pno, clip = best
        st = E.region_stats(doc[pno], clip)
        pix = doc[pno].get_pixmap(matrix=fitz.Matrix(2.5, 2.5), clip=clip, alpha=False)
        pix.save(out)
        doc.close()
        return {"id": fid, "ok": True, "page": pno + 1, "w": pix.width, "h": pix.height,
                "bytes": out.stat().st_size, **st}
    except Exception as e:
        return {"id": fid, "ok": False, "reason": f"exc {type(e).__name__}: {e}"}

def main():
    once = "--once" in sys.argv
    sf = STATE.open("a", encoding="utf-8")
    n = 0
    while True:
        done = load_done()
        pdfs = sorted(CACHE.glob("*.pdf"))
        idle = True
        for pdf in pdfs:
            fid = pdf.stem
            if done.get(fid, {}).get("ok") is True or done.get(fid, {}).get("reason") == "no figure":
                pdf.unlink(missing_ok=True)
                continue
            idle = False
            r = analyze(fid, pdf)
            with lock:
                sf.write(json.dumps(r, ensure_ascii=False) + "\n"); sf.flush()
            pdf.unlink(missing_ok=True)
            n += 1
            if n % 25 == 0:
                print(f"analyzed {n} last={fid} {'OK' if r.get('ok') else r.get('reason')}", flush=True)
        if once:
            break
        if idle:
            time.sleep(10)
    sf.close()
    print("analyze cache finished, total", n, flush=True)

if __name__ == "__main__":
    main()
