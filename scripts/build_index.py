# -*- coding: utf-8 -*-
"""
Build cached proceedings indexes for NeurIPS (2023, 2024) and ICML/PMLR (2023-2025).
ICLR and NeurIPS 2025 (proceedings incomplete) are handled via arXiv title queries.
Outputs data/indexes.json
"""
import requests, re, json, html, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
HEADERS = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}

def get(url, **kw):
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS, timeout=60, **kw)
            if r.status_code == 200:
                return r
            print("  status", r.status_code, url)
        except Exception as e:
            print("  retry", attempt, e)
        time.sleep(2)
    return None

def norm(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t))).strip().lower()

indexes = {"neurips": {}, "icml": {}}

# ---------- NeurIPS 2023, 2024 ----------
for year in (2023, 2024):
    r = get(f"https://proceedings.neurips.cc/paper_files/paper/{year}")
    found = {}
    if r:
        # links like /hash/HASH-Abstract-<Track>.html" ... >Title</a>
        for h, track, t in re.findall(r'hash/([0-9a-f]+)-Abstract-(Conference|Datasets_and_Benchmarks_Track)\.html"[^>]*>([^<]+)</a>', r.text):
            title = html.unescape(t).strip()
            found[norm(title)] = {
                "title": title,
                "year": year,
                "track": track,
                "pdf": f"https://proceedings.neurips.cc/paper_files/paper/{year}/file/{h}-Paper-{track}.pdf",
                "abs": f"https://proceedings.neurips.cc/paper_files/paper/{year}/hash/{h}-Abstract-{track}.html",
            }
    indexes["neurips"][str(year)] = found
    print(f"NeurIPS {year}: {len(found)} papers")

# ---------- ICML via PMLR: v202 (2023), v235 (2024), v267 (2025) ----------
pmlr = {2023: "v202", 2024: "v235", 2025: "v267"}
for year, vol in pmlr.items():
    r = get(f"https://proceedings.mlr.press/{vol}/")
    found = {}
    if r:
        # Each paper block: <p class="title">TITLE</p> ... <a href="...pdf">
        blocks = re.split(r'<p class="title">', r.text)[1:]
        for b in blocks:
            mt = re.match(r"(.*?)</p>", b, re.S)
            mp = re.search(r'href="([^"]+?\.pdf)"', b)
            if mt and mp:
                title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", mt.group(1)))).strip()
                found[norm(title)] = {"title": title, "year": year, "pdf": mp.group(1)}
    indexes["icml"][str(year)] = found
    print(f"ICML {year} ({vol}): {len(found)} papers")

with open(DATA / "indexes.json", "w", encoding="utf-8") as f:
    json.dump(indexes, f, ensure_ascii=False, indent=1)
print("saved", DATA / "indexes.json")
