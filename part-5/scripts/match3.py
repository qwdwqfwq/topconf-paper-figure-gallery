# -*- coding: utf-8 -*-
"""Final matching: curated candidates (threshold 0.78) + visual-keyword
supplements from authoritative venue-year pools. Output: data/matched.json
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
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", html.unescape(t).lower())).strip()
def toks(t):
    return set(w for w in norm(t).split() if len(w) > 1 and w not in STOP)
def tscore(a, b):
    A, B = toks(a), toks(b)
    if not A or not B: return 0.0
    inter = len(A & B)
    return max(2*inter/(len(A)+len(B)), 0.95*inter/min(len(A), len(B)))
def best_match(title, pool, thresh=0.78):
    nt = norm(title); best, bs, bk = None, 0.0, None
    for k, v in pool.items():
        if abs(len(k)-len(nt)) > len(nt)*0.7+15: continue
        s = tscore(title, k)
        if s > bs: bs, best, bk = s, v, k
    return (best, bs, bk) if bs >= thresh else (None, bs, bk)

indexes = json.loads((DATA / "indexes.json").read_text(encoding="utf-8"))

# ---- ICLR pools (2023: accepted = not 'Submitted') ----
def cv(f): return f.get("value") if isinstance(f, dict) else f
iclr = {y: {} for y in (2023, 2024, 2025)}
for year in iclr:
    for off in range(0, 4000, 1000):
        p = DATA / "openreview" / f"iclr{year}_{off}.json"
        if not p.exists(): continue
        for note in json.loads(p.read_text(encoding="utf-8")).get("notes", []):
            c = note.get("content", {})
            t = cv(c.get("title"))
            if not t: continue
            venue = (cv(c.get("venue")) or "")
            if year == 2023 and "submitted" in venue.lower(): continue
            fid = note.get("id") or note.get("forum")
            iclr[year][norm(t)] = {"title": re.sub(r"\s+", " ", t).strip(), "forum": fid,
                "track": venue, "pdf": f"https://openreview.net/pdf?id={fid}",
                "abs": f"https://openreview.net/forum?id={fid}"}
    print("ICLR", year, len(iclr[year]))

matched, unmatched = [], []
def add(venue, year, title, pattern, pdf, abs_url, source, extra=None):
    m = {"venue": venue, "year": year, "title": title, "pattern": pattern,
         "pdf": pdf, "abs": abs_url, "source": source}
    if extra: m.update(extra)
    matched.append(m)

# ---- curated ----
for venue, year, title, pattern in CANDIDATES:
    if venue == "neurips" and year == 2025: continue
    if venue == "iclr":
        v, s, _ = best_match(title, iclr[year])
        if v: add("iclr", year, v["title"], pattern, v["pdf"], v["abs"], "openreview",
                  {"forum": v["forum"], "track": v["track"], "match": round(s, 3)})
        else: unmatched.append((venue, year, title, round(s, 2)))
    else:
        v, s, _ = best_match(title, indexes[venue][str(year)])
        if v: add(venue, year, v["title"], pattern, v["pdf"], v.get("abs", ""),
                  "proceedings", {"track": v.get("track", "PMLR"), "match": round(s, 3)})
        else: unmatched.append((venue, year, title, round(s, 2)))

# ---- visual keyword supplements ----
# weight: strong teaser signals first
KW = [
 (r"text-to-3d|text to 3d|3d generation|gaussian splat|novel view|mesh generation|3d reconstruction", 5),
 (r"text-to-video|text to video|video generation|video diffusion|video synthesis|image-to-video", 5),
 (r"text-to-image|text to image|image synthesis|image generation|image editing|diffusion transformer|consistency model|rectified flow|flow matching|distillation for.*(diffusion|image)", 4),
 (r"robot(ic)? (manipulation|policy|learning|agent)|vision-language-action|\bvla\b|embodied (agent|ai|model)|manipulation policy|robot foundation", 5),
 (r"world model|video prediction|visual simulation|interactive simulator", 4),
 (r"vision-language|multimodal (large|model|agent|reasoning)|visual instruction|multi-modal (large|model)|vlm|mllm", 3),
 (r"avatar|digital human|talking|portrait|human motion|motion generation|pose", 3),
 (r"autonomous agent|gui agent|web agent|computer (use|agent)|agent framework|tool-?using|tool use", 3),
 (r"neural rendering|scene reconstruction|radiance field|nerf|3d scene", 4),
 (r"visual reasoning|visual chain|diagram|sketch|drawing|visual program", 2),
]
KW = [(re.compile(p, re.I), w) for p, w in KW]
NEG = re.compile(r"survey|review of|perspective|position paper|comment on|note on|rebuttal", re.I)

def kw_score(title):
    if NEG.search(title): return -1
    return sum(w for rx, w in KW if rx.search(title))

YEAR_CAP = {("iclr", 2023): 13, ("iclr", 2024): 13, ("iclr", 2025): 13,
            ("icml", 2023): 13, ("icml", 2024): 13, ("icml", 2025): 13,
            ("neurips", 2023): 14, ("neurips", 2024): 14}

pools = {}
for (venue, year), cap in YEAR_CAP.items():
    if venue == "iclr":
        pools[(venue, year)] = iclr[year]
    else:
        pools[(venue, year)] = indexes[venue][str(year)]

for (venue, year), pool in pools.items():
    have = [m for m in matched if m["venue"] == venue and m["year"] == year]
    seen = {norm(m["title"]) for m in have}
    scored = sorted(((kw_score(v["title"]), k, v) for k, v in pool.items()),
                    key=lambda x: -x[0])
    for sc, k, v in scored:
        if len(have) >= cap: break
        if sc <= 0 or k in seen: continue
        if venue == "iclr":
            add(venue, year, v["title"], "auto", v["pdf"], v["abs"], "openreview-keyword",
                {"forum": v["forum"], "track": v["track"]})
        else:
            add(venue, year, v["title"], "auto", v["pdf"], v.get("abs", ""),
                "proceedings-keyword", {"track": v.get("track", "PMLR")})
        seen.add(k); have.append(None)

# ---- NeurIPS 2025 via arXiv comments ----
def arxiv_co(keyword, n=10):
    q = urllib.parse.quote(f'co:"NeurIPS 2025" AND ti:{keyword}')
    r = requests.get(f"http://export.arxiv.org/api/query?search_query={q}&max_results={n}",
                     headers=HEADERS, timeout=40)
    out = []
    for e in re.findall(r"<entry>(.*?)</entry>", r.text, re.S):
        eid = re.search(r"<id>http://arxiv.org/abs/([^<]+)</id>", e).group(1).split("v")[0]
        et = re.sub(r"\s+", " ", html.unescape(re.search(r"<title>(.*?)</title>", e, re.S).group(1))).strip()
        mc = re.search(r"<arxiv:comment[^>]*>(.*?)</arxiv:comment>", e, re.S)
        comment = re.sub(r"\s+", " ", html.unescape(mc.group(1))).strip() if mc else ""
        if re.search(r"NeurIPS\s*2025", comment, re.I): out.append((eid, et))
    return out

n25, ids = 0, set()
for kw in ["diffusion", "video", "robot", "3D", "gaussian", "multimodal", "image-generation",
           "world-model", "embodied", "avatar", "editing", "vision-language", "rendering",
           "text-to-video", "reconstruction", "agent"]:
    if n25 >= 24: break
    try:
        for eid, et in arxiv_co(kw, 10):
            if n25 >= 24 or eid in ids: continue
            add("neurips", 2025, et, "auto", f"https://arxiv.org/pdf/{eid}",
                f"https://arxiv.org/abs/{eid}", "arxiv-keyword")
            ids.add(eid); n25 += 1
        time.sleep(3.2)
    except Exception as ex:
        print("co ERR", kw, ex)

# ---- stable ids ----
matched.sort(key=lambda m: (m["venue"], m["year"], m["title"]))
counters = {}
for m in matched:
    counters[m["venue"]] = counters.get(m["venue"], 0) + 1
    m["id"] = f"{m['venue']}{m['year']}-{counters[m['venue']]:02d}"
    m["image"] = f"images/{m['venue']}/{m['id']}.png"

(DATA / "matched.json").write_text(json.dumps(matched, ensure_ascii=False, indent=1), encoding="utf-8")
from collections import Counter
print("\n=== pool ===", Counter((m["venue"], m["year"]) for m in matched))
print("unmatched curated:", len(unmatched))
for u in unmatched: print("  ", u)
print("total:", len(matched))
