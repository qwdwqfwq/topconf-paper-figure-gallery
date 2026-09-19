# -*- coding: utf-8 -*-
"""Third pass for 5 stragglers: id_list verification + all-field search."""
import json, re, html, time, urllib.parse, requests
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; DATA = ROOT / "data"
H = {"User-Agent": "Mozilla/5.0 (research; 939123836@qq.com)"}
KNOWN = {"iclr2023-08": "2210.04628", "iclr2023-09": "2210.17323"}

def norm(t): return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", html.unescape(t).lower())).strip()
def score(a, b):
    A, B = set(norm(a).split()), set(norm(b).split())
    return 2*len(A & B)/(len(A)+len(B)) if A and B else 0

def get(url):
    for i in range(3):
        try:
            r = requests.get(url, headers=H, timeout=45)
            if r.status_code == 200: return r.text
        except Exception as e: print("retry", e)
        time.sleep(5)
    return None

def parse(txt):
    out = []
    for e in re.findall(r"<entry>(.*?)</entry>", txt, re.S):
        eid = re.search(r"<id>http://arxiv.org/abs/([^<]+)</id>", e).group(1).split("v")[0]
        et = re.sub(r"\s+", " ", html.unescape(re.search(r"<title>(.*?)</title>", e, re.S).group(1))).strip()
        out.append((eid, et))
    return out

matched = json.loads((DATA / "matched.json").read_text(encoding="utf-8"))
for m in matched:
    if m["venue"] != "iclr" or m.get("arxiv"):
        continue
    fid, title = m["id"], m["title"]
    res = None
    if fid in KNOWN:
        txt = get(f"http://export.arxiv.org/api/query?id_list={KNOWN[fid]}")
        cands = parse(txt) if txt else []
    else:
        q = urllib.parse.quote(" AND ".join(f"all:{w}" for w in
            sorted(set(norm(title).split()), key=len, reverse=True)[:6]))
        txt = get(f"http://export.arxiv.org/api/query?search_query={q}&max_results=8")
        cands = parse(txt) if txt else []
    for eid, et in cands:
        if score(title, et) > 0.72:
            res = (eid, et); break
    if res:
        m["arxiv"] = f"https://arxiv.org/abs/{res[0]}"
        m["pdf"] = f"https://arxiv.org/pdf/{res[0]}"
        m["source"] = "openreview+arxiv"; m["arxiv_title"] = res[1]
        print("OK ", fid, res[0], res[1][:60])
    else:
        print("MISS", fid, title[:60])
    time.sleep(3.2)
(DATA / "matched.json").write_text(json.dumps(matched, ensure_ascii=False, indent=1), encoding="utf-8")
n = sum(1 for m in matched if m["venue"]=="iclr" and m.get("arxiv"))
print("iclr with arxiv:", n, "/", sum(1 for m in matched if m["venue"]=="iclr"))
