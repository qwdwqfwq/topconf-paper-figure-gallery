# -*- coding: utf-8 -*-
"""Resolve arXiv ids/PDFs for ICLR matched titles (OpenReview list is the
authoritative venue source; arXiv only supplies the downloadable PDF)."""
import json, re, html, time, urllib.parse, difflib
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
HEADERS = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}

def norm(t):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", html.unescape(t).lower())).strip()
def score(a, b):
    A, B = set(norm(a).split()), set(norm(b).split())
    if not A or not B: return 0
    return 2*len(A & B)/(len(A)+len(B))

def query_terms(title):
    head = title.split(":")[0]
    rest = title.split(":", 1)[1] if ":" in title else title
    terms = []
    # acronym / short head is the strongest signal
    h = norm(head)
    if h and len(h.split()) <= 4:
        terms += h.split()
    # longest tokens of subtitle
    for w in sorted(set(norm(rest).split()), key=len, reverse=True)[:6]:
        if w not in terms and len(w) > 2 and not w.isdigit():
            terms.append(w)
    return terms[:7]

def arxiv_search(title):
    terms = query_terms(title)
    q = " AND ".join(f"ti:{urllib.parse.quote(t)}" for t in terms)
    url = f"http://export.arxiv.org/api/query?search_query={q}&max_results=5"
    r = requests.get(url, headers=HEADERS, timeout=40)
    out = []
    for e in re.findall(r"<entry>(.*?)</entry>", r.text, re.S):
        eid = re.search(r"<id>http://arxiv.org/abs/([^<]+)</id>", e).group(1).split("v")[0]
        et = re.sub(r"\s+", " ", html.unescape(re.search(r"<title>(.*?)</title>", e, re.S).group(1))).strip()
        out.append((eid, et))
    return out

matched = json.loads((DATA / "matched.json").read_text(encoding="utf-8"))
missing = []
for m in matched:
    if m["venue"] != "iclr":
        continue
    best = None
    try:
        for eid, et in arxiv_search(m["title"]):
            s = score(m["title"], et)
            if s > 0.80 and (best is None or s > best[0]):
                best = (s, eid, et)
    except Exception as ex:
        print("ERR", m["title"][:40], ex)
    if best:
        s, eid, et = best
        m["arxiv"] = f"https://arxiv.org/abs/{eid}"
        m["pdf"] = f"https://arxiv.org/pdf/{eid}"
        m["source"] = "openreview+arxiv"
        m["arxiv_title"] = et
        m["arxiv_match"] = round(s, 3)
    else:
        missing.append(m["id"] + " " + m["title"][:60])
    time.sleep(3.2)

(DATA / "matched.json").write_text(json.dumps(matched, ensure_ascii=False, indent=1), encoding="utf-8")
print("resolved:", sum(1 for m in matched if m["venue"]=="iclr" and m.get("arxiv")),
      "/", sum(1 for m in matched if m["venue"]=="iclr"))
print("missing:")
for x in missing: print("  ", x)
