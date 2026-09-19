# -*- coding: utf-8 -*-
"""Second pass: resolve arXiv ids for ICLR entries still missing them.
Cleans LaTeX, retries on transient SSL errors, and falls back to acronym-only
queries."""
import json, re, html, time, urllib.parse
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

def clean(title):
    t = re.sub(r"\$[^$]*\$", " ", title)
    t = re.sub(r"[\\{}\\]", " ", t)
    return t

def http_get(url, tries=4):
    for i in range(tries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=45)
            if r.status_code == 200:
                return r
        except Exception as e:
            if i == tries - 1:
                raise
        time.sleep(5 + i * 4)
    return None

def arxiv(q, n=8):
    url = f"http://export.arxiv.org/api/query?search_query={urllib.parse.quote(q)}&max_results={n}"
    r = http_get(url)
    out = []
    for e in re.findall(r"<entry>(.*?)</entry>", r.text, re.S):
        eid = re.search(r"<id>http://arxiv.org/abs/([^<]+)</id>", e).group(1).split("v")[0]
        et = re.sub(r"\s+", " ", html.unescape(re.search(r"<title>(.*?)</title>", e, re.S).group(1))).strip()
        out.append((eid, et))
    return out

def resolve(title):
    ct = clean(title)
    head = ct.split(":")[0].strip()
    rest = ct.split(":", 1)[1] if ":" in ct else ct
    variants = []
    htokens = [w for w in norm(head).split() if len(w) > 1]
    rtokens = [w for w in sorted(set(norm(rest).split()), key=len, reverse=True)
               if len(w) > 2 and not w.isdigit()][:5]
    if htokens and len(norm(head)) <= 30:
        variants.append(" AND ".join(f"ti:{t}" for t in htokens + rtokens[:3]))
        variants.append(" AND ".join(f"ti:{t}" for t in htokens))
    variants.append(" AND ".join(f"ti:{t}" for t in (htokens + rtokens)[:6]))
    for q in variants:
        try:
            res = arxiv(q)
        except Exception as e:
            print("  http fail", e); continue
        best = None
        for eid, et in res:
            s = score(ct, et)
            if s > 0.78 and (best is None or s > best[0]):
                best = (s, eid, et)
        if best:
            return best
        time.sleep(3.2)
    return None

matched = json.loads((DATA / "matched.json").read_text(encoding="utf-8"))
still = []
for m in matched:
    if m["venue"] != "iclr" or m.get("arxiv"):
        continue
    r = resolve(m["title"])
    if r:
        s, eid, et = r
        m["arxiv"] = f"https://arxiv.org/abs/{eid}"
        m["pdf"] = f"https://arxiv.org/pdf/{eid}"
        m["source"] = "openreview+arxiv"
        m["arxiv_title"] = et
        m["arxiv_match"] = round(s, 3)
        print("OK ", m["id"], eid, et[:55])
    else:
        still.append(m["id"] + " " + m["title"][:60])
        print("MISS", m["id"], m["title"][:60])
    time.sleep(3.2)

(DATA / "matched.json").write_text(json.dumps(matched, ensure_ascii=False, indent=1), encoding="utf-8")
print("\nstill missing:", len(still))
for x in still: print("  ", x)
