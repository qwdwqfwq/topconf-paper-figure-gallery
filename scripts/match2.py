# -*- coding: utf-8 -*-
"""Authoritative matching v2.
- NeurIPS 2023/24, ICML 2023-25: cached proceedings indexes
- ICLR 2023-25: local OpenReview exports (accepted only)
- NeurIPS 2025: arXiv comment search (proceedings incomplete)
Outputs data/matched.json
"""
import json, re, html, time, urllib.parse, sys
from pathlib import Path
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from candidates import CANDIDATES

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
HEADERS = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}
STOP = set("a an the of for and or to in on with via as is are be your can we our their this that it its at by from".split())

def norm(t):
    t = html.unescape(t).lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()

def toks(t):
    return set(w for w in norm(t).split() if len(w) > 1 and w not in STOP)

def tscore(a, b):
    """Token F1 with difflib fallback for short titles."""
    A, B = toks(a), toks(b)
    if not A or not B:
        return 0.0
    inter = len(A & B)
    f1 = 2 * inter / (len(A) + len(B))
    contain = inter / min(len(A), len(B))
    return max(f1, contain * 0.95)

def best_match(title, pool):
    nt = norm(title)
    best, bs = None, 0.0
    for k, v in pool.items():
        # cheap prefilter
        if abs(len(k) - len(nt)) > len(nt) * 0.6 + 12:
            continue
        s = tscore(title, k)
        if s > bs:
            bs, best = s, v
    return (best, bs) if best and bs >= 0.86 else (None, bs)

# ---------- load proceedings indexes ----------
indexes = json.loads((DATA / "indexes.json").read_text(encoding="utf-8"))

# ---------- build ICLR index from local OpenReview exports ----------
iclr = {}
def cv(field):
    if isinstance(field, dict):
        return field.get("value")
    return field

for year in (2023, 2024, 2025):
    n = 0
    for off in range(0, 4000, 1000):
        p = DATA / "openreview" / f"iclr{year}_{off}.json"
        if not p.exists():
            continue
        j = json.loads(p.read_text(encoding="utf-8"))
        for note in j.get("notes", []):
            c = note.get("content", {})
            title = cv(c.get("title"))
            if not title:
                continue
            venue = (cv(c.get("venue")) or "") or ""
            if year == 2023:
                if not re.match(r"ICLR\s*2023\s*(poster|spotlight|oral|conference)", venue.strip(), re.I):
                    continue
            fid = note.get("id") or note.get("forum")
            iclr.setdefault(str(year), {})[norm(title)] = {
                "title": re.sub(r"\s+", " ", title).strip(),
                "forum": fid,
                "track": venue,
                "pdf": f"https://openreview.net/pdf?id={fid}",
                "abs": f"https://openreview.net/forum?id={fid}",
            }
            n += 1
    print(f"ICLR {year} accepted: {n}")

matched, unmatched = [], []
def add(venue, year, title, pattern, pdf, abs_url, source, extra=None):
    m = {"venue": venue, "year": year, "title": title, "pattern": pattern,
         "pdf": pdf, "abs": abs_url, "source": source}
    if extra:
        m.update(extra)
    matched.append(m)

for venue, year, title, pattern in CANDIDATES:
    if venue == "iclr":
        pool = iclr.get(str(year), {})
        v, s = best_match(title, pool)
        if v:
            add("iclr", year, v["title"], pattern, v["pdf"], v["abs"], "openreview",
                {"forum": v["forum"], "track": v["track"], "match": round(s, 3)})
        else:
            unmatched.append((venue, year, title, round(s, 2)))
    elif venue == "neurips" and year == 2025:
        continue  # handled below
    else:
        pool = indexes[venue][str(year)]
        v, s = best_match(title, pool)
        if v:
            add(venue, year, v["title"], pattern, v["pdf"], v.get("abs", ""),
                "proceedings:" + v.get("track", "PMLR"), {"match": round(s, 3)})
        else:
            unmatched.append((venue, year, title, round(s, 2)))

# ---------- supplement ICML 2025 by visual keywords ----------
KW = re.compile(r"diffusion|video|3d|gaussian|robot|vision.language|multimodal|text-to-image|"
                r"generative|rendering|world model| vla |embodied|image generation|scene|avatar|"
                r"motion|visual generation|image synthesis|flow matching|autoregressive image", re.I)
pool25 = indexes["icml"]["2025"]
cand25 = [(k, v) for k, v in pool25.items() if KW.search(" " + v["title"] + " ")]
cand25.sort(key=lambda kv: -len(kv[0]))
seen = {norm(m["title"]) for m in matched}
added = 0
for k, v in cand25:
    if added >= 18:
        break
    if k in seen:
        continue
    add("icml", 2025, v["title"], "results", v["pdf"], "", "proceedings-keyword")
    added += 1

# ---------- NeurIPS 2025 via arXiv comment search ----------
def arxiv_co(keyword, n=8):
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
    return out

n25, seen_ids = 0, set()
for kw in ["diffusion", "video", "robot", "3D", "agent", "multimodal", "gaussian",
           "generation", "image", "world", "embodied", "reasoning", "vision", "editing"]:
    if n25 >= 22:
        break
    try:
        for eid, et in arxiv_co(kw, 10):
            if n25 >= 22 or eid in seen_ids:
                continue
            add("neurips", 2025, et, "results", f"https://arxiv.org/pdf/{eid}",
                f"https://arxiv.org/abs/{eid}", "arxiv-keyword")
            seen_ids.add(eid); n25 += 1
        time.sleep(3.2)
    except Exception as ex:
        print("co ERR", kw, ex)

(DATA / "matched.json").write_text(json.dumps(matched, ensure_ascii=False, indent=1), encoding="utf-8")
from collections import Counter
print("\n=== matched ===", Counter((m["venue"], m["year"]) for m in matched))
print("\n=== unmatched (%d) ===" % len(unmatched))
for u in unmatched:
    print("  ", u)
print("total:", len(matched))
