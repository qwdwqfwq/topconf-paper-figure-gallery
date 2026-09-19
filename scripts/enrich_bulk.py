# -*- coding: utf-8 -*-
"""Fill missing authors for assembled figures.json.

Order: local pool (OpenReview / arXiv metadata) -> citation_author meta tags
(PMLR / NeurIPS proceedings) -> OpenAlex title search (works without proxy).
Fully resumable via data/bulk_authors.json; never crashes on a single bad host.
"""
import json, re, time, sys, unicodedata
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"}
MAILTO = "939123836@qq.com"

pool = {}
for p in (DATA / "pool").glob("*.jsonl"):
    for line in p.read_text(encoding="utf-8").splitlines():
        r = json.loads(line); pool[r["id"]] = r

cache_path = DATA / "bulk_authors.json"
cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

S = requests.Session(); S.trust_env = False; S.headers.update(UA)

def norm(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()

def fl(n):
    n = n.strip()
    return (n.split(",", 1)[1].strip() + " " + n.split(",", 1)[0].strip()) if "," in n else n

def fetch_meta_authors(url):
    try:
        r = S.get(url, timeout=45)
    except Exception:
        return None
    if r.status_code != 200:
        return None
    names = re.findall(r'<meta[^>]+name=["\']citation_author["\'][^>]+content=["\']([^"\']+)', r.text)
    if not names:
        names = re.findall(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']citation_author', r.text)
    out = [fl(x) for x in dict.fromkeys(names) if x.strip()]
    return out or None

def authors_of(it):
    return [a["author"]["display_name"] for a in it.get("authorships", [])
            if a.get("author", {}).get("display_name")]

def pick(items, nt):
    for it in items:
        if norm(it.get("display_name", "")) == nt:
            au = authors_of(it)
            if au:
                return au
    # fuzzy: best token-overlap result, require >=70% of query title words
    best, best_sc = None, 0
    qw = set(nt.split())
    for it in items:
        tw = set(norm(it.get("display_name", "")).split())
        sc = len(qw & tw) / max(1, len(qw))
        if sc > best_sc:
            best_sc, best = sc, it
    if best is not None and best_sc >= 0.7:
        au = authors_of(best)
        if au:
            return au
    return None

def fetch_openalex(title):
    nt = norm(title)
    try:
        r = S.get("https://api.openalex.org/works",
                  params={"filter": f"title.search:{title}", "per-page": 8,
                          "mailto": MAILTO}, timeout=45)
        items = r.json().get("results", []) if r.status_code == 200 else []
        hit = pick(items, nt)
        if hit:
            return hit
    except Exception:
        pass
    # fallback: full-text search (indexes proceedings titles title.search misses)
    try:
        r = S.get("https://api.openalex.org/works",
                  params={"search": title, "per-page": 8, "mailto": MAILTO}, timeout=45)
        if r.status_code == 200:
            return pick(r.json().get("results", []), nt)
    except Exception:
        pass
    return None

figs = json.loads((DATA / "figures.json").read_text(encoding="utf-8"))
filled, failed = 0, []
for i, f in enumerate(figs):
    if f.get("authors"):
        continue
    fid = f["id"]
    if pool.get(fid, {}).get("authors"):
        f["authors"] = pool[fid]["authors"]; filled += 1; continue
    if fid in cache:
        f["authors"] = cache[fid]; filled += 1; continue
    au = None
    url = f.get("paper")
    if isinstance(url, str) and url.startswith("http"):
        au = fetch_meta_authors(url)
        time.sleep(0.4)
    if not au:
        au = fetch_openalex(f["title"])
        time.sleep(0.3)
    if au:
        cache[fid] = au; f["authors"] = au; filled += 1
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    else:
        failed.append(fid)
    if (i + 1) % 100 == 0:
        print(f"processed {i+1}/{len(figs)}, filled={filled}, missing={len(failed)}", flush=True)

(DATA / "figures.json").write_text(json.dumps(figs, ensure_ascii=False, indent=1), encoding="utf-8")
(ROOT / "assets" / "figures.js").write_text(
    "window.FIGURES = " + json.dumps(figs, ensure_ascii=False) + ";\n", encoding="utf-8")
miss = [f["id"] for f in figs if not f.get("authors")]
print("filled:", filled, "still missing:", len(miss))
print("missing sample:", miss[:20])
