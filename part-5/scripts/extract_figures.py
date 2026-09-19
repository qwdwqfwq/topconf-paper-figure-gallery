# -*- coding: utf-8 -*-
"""Download PDFs and extract Figure 1 (teaser/main figure) as high-res PNG.
Find every 'Figure 1' caption candidate on pages 1-4, score by the amount of
vector/raster content directly above it within its x-span, crop the union bbox
and render at ~216 dpi. Resumable: skips PDFs/images already produced.
"""
import json, re, time, sys
from pathlib import Path
import requests
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PDFDIR = ROOT / "pdfs"
IMGDIR = ROOT / "images"
HEADERS = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}
CAP_RE = re.compile(r"^\s*(?:Figure|Fig\.?)\s*1\s*[.:]", re.I)
CAP_RE_LOOSE = re.compile(r"^\s*(?:Figure|Fig\.?)\s*1\b", re.I)

def download(url, dest):
    if dest.exists() and dest.stat().st_size > 50_000:
        return True
    try:
        r = requests.get(url, headers=HEADERS, timeout=150)
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            dest.write_bytes(r.content)
            return True
        print("   bad download", r.status_code, url[:90])
    except Exception as e:
        print("   dl error", e)
    return False

def find_captions(page):
    cands = []
    for b in page.get_text("dict")["blocks"]:
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            txt = "".join(s["text"] for s in spans)
            if CAP_RE.match(txt) or (CAP_RE_LOOSE.match(txt) and not re.match(r"^\s*(?:Figure|Fig\.?)\s*1[0-9]", txt)):
                x0, y0, x1, y1 = line["bbox"]
                cands.append(fitz.Rect(x0 - 2, y0 - 2, x1 + 2, y1 + 2))
    return cands

def content_above(page, cap):
    pw = page.rect.width
    full = cap.width > 0.62 * pw
    xl = 0.05 * pw if full else cap.x0 - 7
    xr = 0.95 * pw if full else cap.x1 + 7
    boxes = []
    for dr in page.get_drawings():
        r = dr.get("rect")
        if r is None or r.width <= 3 or r.height <= 3:
            continue
        # skip full-width hairlines (rules above/below abstract, headers)
        if r.height < 2.5 and r.width > 0.55 * pw:
            continue
        if r.y1 <= cap.y0 + 4 and r.x1 >= xl and r.x0 <= xr:
            boxes.append(fitz.Rect(max(r.x0, xl), r.y0, min(r.x1, xr), r.y1))
    for info in page.get_image_info(xrefs=True):
        r = fitz.Rect(info["bbox"])
        if r.width > 10 and r.height > 10 and r.y1 <= cap.y0 + 4 and r.x1 >= xl and r.x0 <= xr:
            boxes.append(fitz.Rect(max(r.x0, xl), r.y0, min(r.x1, xr), r.y1))
    if not boxes:
        return None
    # vertical gap-based clustering: walk upward from the caption, include boxes
    # while the vertical gap stays small; stop at the first large gap (this is
    # where title/abstract/header content ends and the figure begins).
    boxes.sort(key=lambda r: -r.y1)
    GAP = 58
    kept = []
    top = cap.y0 + 4
    for r in boxes:
        if r.y1 > top + 6:            # below current frontier (overlap) -> keep
            kept.append(r); top = min(top, r.y0)
        elif top - r.y1 <= GAP:       # close enough above -> same figure
            kept.append(r); top = min(top, r.y0)
        # else: separated by a big gap -> stop (ignore higher boxes)
    if not kept:
        return None
    u = fitz.Rect(kept[0])
    for r in kept[1:]:
        u |= r
    u.x0 = max(u.x0, 0); u.x1 = min(u.x1, pw)
    u.y0 = max(u.y0, 0); u.y1 = min(u.y1, page.rect.height)
    return u

def extract(pdf_path):
    doc = fitz.open(pdf_path)
    best = None
    for pno in range(min(4, len(doc))):
        page = doc[pno]
        for cap in find_captions(page):
            cb = content_above(page, cap)
            if cb is None or cb.height < 40 or cb.width < 60:
                continue
            gap = cap.y0 - cb.y1
            if gap > 50:
                continue
            sc = cb.width * cb.height
            if best is None or sc > best[0]:
                best = (sc, pno, fitz.Rect(cb.x0 - 4, max(0, cb.y0 - 4), cb.x1 + 4, cb.y1 + 3), gap)
    doc.close()
    return best

def main():
    venue_filter = sys.argv[1] if len(sys.argv) > 1 else None
    matched = json.loads((DATA / "matched.json").read_text(encoding="utf-8"))
    for m in matched:
        if venue_filter and m["venue"] != venue_filter:
            continue
        fid = m["id"]
        out_png = IMGDIR / m["venue"] / f"{fid}.png"
        if out_png.exists() and m.get("extract", {}).get("ok"):
            continue
        pdf_dest = PDFDIR / m["venue"] / f"{fid}.pdf"
        pdf_dest.parent.mkdir(parents=True, exist_ok=True)
        out_png.parent.mkdir(parents=True, exist_ok=True)
        if not download(m["pdf"], pdf_dest):
            m["extract"] = {"ok": False, "reason": "download"}
            print(fid, "DOWNLOAD FAIL", m["title"][:50]); continue
        try:
            res = extract(pdf_dest)
        except Exception as e:
            m["extract"] = {"ok": False, "reason": f"exc {e}"}
            print(fid, "EXC", e); continue
        if res is None:
            m["extract"] = {"ok": False, "reason": "no figure"}
            print(fid, "NO FIGURE", m["title"][:50]); continue
        sc, pno, clip, gap = res
        doc = fitz.open(pdf_dest)
        pix = doc[pno].get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=False)
        pix.save(out_png)
        doc.close()
        m["extract"] = {"ok": True, "page": pno + 1, "w": pix.width, "h": pix.height, "gap": round(gap, 1)}
        print(fid, f"OK p{pno+1} {pix.width}x{pix.height}", m["title"][:46])
        time.sleep(0.15)
    (DATA / "matched.json").write_text(json.dumps(matched, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for m in matched if m.get("extract", {}).get("ok"))
    print(f"\n{ok}/{len(matched)} extracted")

if __name__ == "__main__":
    main()
