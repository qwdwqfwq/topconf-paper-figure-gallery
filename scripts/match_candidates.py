# -*- coding: utf-8 -*-
"""Match curated candidates against authoritative indexes.
NeurIPS 2023/24 + ICML 2023-25: proceedings indexes. ICLR: arXiv API + comment verification.
Also supplements ICML 2025 and NeurIPS 2025 pools by keyword.
Outputs data/matched.json
"""
import json, re, time, html, urllib.parse, difflib, sys
from pathlib import Path
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from candidates import CANDIDATES

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
HEADERS = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}

def norm(t):
    t = html.unescape(t).lower()
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()

indexes = json.loads((DATA / "indexes.json").read_text(encoding="utf-8"))
matched, unmatched = [], []

def add(venue, year, title, pattern, pdf, abs_url, source):
    matched.append({
        "venue": venue, "year": year, "title": title, "pattern": pattern,
        "pdf": pdf, "abs": abs_url, "source": source,
    })

# ---------- proceedings venues ----------
for venue, year, title, pattern in CANDIDATES:
    if venue in ("neurips", "icml") and not (venue == "neurips" and year == 2025):
        pool = indexes[venue][str(year)]
        nt = norm(title)
        # exact-ish fuzzy
        best = None
        for k, v in pool.items():
            r = difflib.SequenceMatcher(None, nt, k).ratio()
            if r > 0.80 and (best is None or r > best[0]):
                best = (r, v)
        if best:
            v = best[1]
            add(venue, year, v["title"], pattern, v["pdf"], v.get("abs", ""), "proceedings")
        else:
            unmatched.append((venue, year, title))

# ---------- ICLR via arXiv ----------
def arxiv_query(title):
    q = urllib.parse.quote(f'ti:"{title}"')
    url = f"http://export.arxiv.org/api/query?search_query={q}&max_results=3"
    r = requests.get(url, headers=HEADERS, timeout=40)
    entries = re.findall(r"<entry>(.*?)</entry>", r.text, re.S)
    out = []
    for e in entries:
        eid = re.search(r"<id>http://arxiv.org/abs/([^<]+)</id>", e).group(1).split("v")[0]
        et = re.search(r"<title>(.*?)</title>", e, re.S).group(1)
        et = re.sub(r"\s+", " ", html.unescape(et)).strip()
        mc = re.search(r"<arxiv:comment[^>]*>(.*?)</arxiv:comment>", e, re.S)
        comment = re.sub(r"\s+", " ", html.unescape(mc.group(1))).strip() if mc else ""
        out.append((eid, et, comment))
    return out

for venue, year, title, pattern in CANDIDATES:
    if venue != "iclr":
        continue
    try:
        results = arxiv_query(title)
    except Exception as ex:
        unmatched.append((venue, year, title)); print("ERR", title, ex); time.sleep(3); continue
    ok = None
    for eid, et, comment in results:
        sim = difflib.SequenceMatcher(None, norm(title), norm(et)).ratio()
        if sim > 0.80 and re.search(rf"ICLR\s*{year}", comment, re.I):
            ok = (eid, et, comment, sim); break
    if ok:
        eid, et, comment, sim = ok
        add("iclr", year, et, pattern, f"https://arxiv.org/pdf/{eid}", f"https://arxiv.org/abs/{eid}", "arxiv")
    else:
        unmatched.append((venue, year, title))
    time.sleep(3.2)

# ---------- supplement ICML 2025 by keywords ----------
KW = re.compile(r"diffusion|video|3d|gaussian|robot|vision.language|multimodal|text-to-image|generative|render|world model|vla|embodied|image generation|scene|avatar|motion", re.I)
pool25 = indexes["icml"]["2025"]
supp = [(k, v) for k, v in pool25.items() if KW.search(v["title"])]
# prefer titles that look like systems/teasers
supp.sort(key=lambda kv: -len(kv[0]))
seen = {norm(m["title"]) for m in matched}
added = 0
for k, v in supp:
    if added >= 16:
        break
    if k in seen:
        continue
    add("icml", 2025, v["title"], "results", v["pdf"], "", "proceedings-keyword")
    added += 1

# ---------- supplement NeurIPS 2025 via arXiv comment search ----------
def arxiv_co(keyword, n=6):
    q = urllib.parse.quote(f'co:"NeurIPS 2025" AND ti:{keyword}')
    url = f"http://export.arxiv.org/api/query?search_query={q}&max_results={n}"
    r = requests.get(url, headers=HEADERS, timeout=40)
    out = []
    for e in re.findall(r"<entry>(.*?)</entry>", r.text, re.S):
        eid = re.search(r"<id>http://arxiv.org/abs/([^<]+)</id>", e).group(1).split("v")[0]
        et = re.sub(r"\s+", " ", html.unescape(re.search(r"<title>(.*?)</title>", e, re.S).group(1))).strip()
        mc = re.search(r"<arxiv:comment[^>]*>(.*?)</arxiv:comment>", e, re.S)
        comment = re.sub(r"\s+", " ", html.unescape(mc.group(1))).strip() if mc else ""
        if re.search(r"NeurIPS\s*2025", comment, re.I):
            out.append((eid, et))
        time.sleep(0)
    return out

n25 = 0
for kw in ["diffusion", "video", "robot", "3D", "agent", "multimodal", "gaussian", "generation"]:
    if n25 >= 14:
        break
    try:
        for eid, et in arxiv_co(kw, 8):
            if n25 >= 14:
                break
            add("neurips", 2025, et, "results", f"https://arxiv.org/pdf/{eid}", f"https://arxiv.org/abs/{eid}", "arxiv-keyword")
            n25 += 1
        time.sleep(3.2)
    except Exception as ex:
        print("co ERR", kw, ex)

(DATA / "matched.json").write_text(json.dumps(matched, ensure_ascii=False, indent=1), encoding="utf-8")

from collections import Counter
print("\n=== matched counts ===")
print(Counter((m["venue"], m["year"]) for m in matched))
print("\n=== unmatched ===")
for u in unmatched:
    print(" ", u)
print("\ntotal matched:", len(matched))
