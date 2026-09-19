"""Build candidate pools for CVPR, ACL and AAAI (2023-2025).

This step only creates metadata queues.  It deliberately does not download or
publish every paper: the existing extract -> score -> QA pipeline must review
the resulting Figure 1 crops before they enter the gallery.

Usage: python scripts/harvest_new_venues.py [--venue cvpr,acl,aaai]
"""
from __future__ import annotations
import argparse, json, re, time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "pool"
S = requests.Session(); S.trust_env = False
S.headers.update({"User-Agent": "topconf-paper-figure-gallery/0.3 (research metadata)"})

def write(venue, rows):
    p = OUT / f"{venue}_2023_2025.jsonl"
    old = {r["id"] for r in (json.loads(x) for x in p.read_text(encoding="utf-8").splitlines())} if p.exists() else set()
    with p.open("a", encoding="utf-8") as f:
        for r in rows:
            if r["id"] not in old: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(venue, "candidates", len(rows), "new", len([r for r in rows if r["id"] not in old]))

def acl(year):
    # ACL Anthology exposes one stable proceedings page per track.  The paper
    # links contain both title and PDF URL, so no third-party index is needed.
    url = f"https://aclanthology.org/events/acl-{year}/"
    r = S.get(url, timeout=60); r.raise_for_status(); soup = BeautifulSoup(r.text, "html.parser")
    rows=[]
    for a in soup.select("a[href^='/papers/']"):
        href = urljoin(url, a.get("href")); pid = href.rstrip('/').split('/')[-1]
        title = a.get_text(" ", strip=True)
        if not title or pid == f"acl-{year}": continue
        # Anthology PDF URLs are stable and derivable without a request per paper.
        # Authors are enriched later from the paper page/OpenAlex cache.
        pdf = f"https://aclanthology.org/{pid}.pdf"
        authors = []
        if pdf:
            rows.append({"id": f"acl{year}-{pid}", "venue":"acl", "year":year, "title":title,
                         "authors":authors, "pdf":pdf, "page":href, "tier":1})
    return rows

def cvpr(year):
    url=f"https://openaccess.thecvf.com/CVPR{year}"
    r=S.get(url,timeout=60); r.raise_for_status(); soup=BeautifulSoup(r.text,"html.parser"); rows=[]
    for a in soup.select("a[href*='papers/']"):
        href=urljoin(url,a.get("href")); txt=a.get_text(" ",strip=True)
        if not txt or not href.lower().endswith(".pdf"): continue
        stem=href.rsplit('/',1)[-1].rsplit('.',1)[0]
        rows.append({"id":f"cvpr{year}-{stem}","venue":"cvpr","year":year,"title":txt,
                     "authors":[],"pdf":href,"page":href.rsplit('/',1)[0]+"/"+stem+".html","tier":1})
    return rows

def aaai(year):
    # AAAI issues are paginated; keep the canonical landing URL and discover
    # article PDF links from each issue page when the archive exposes them.
    archive="https://ojs.aaai.org/index.php/AAAI/issue/archive"
    r=S.get(archive,timeout=60); r.raise_for_status(); soup=BeautifulSoup(r.text,"html.parser"); rows=[]
    for a in soup.select("a[href*='/issue/view/']"):
        label=a.get_text(" ",strip=True)
        if str(year) not in label and f"AAAI-{str(year)[-2:]}" not in label: continue
        issue=urljoin(archive,a.get("href")); isoup=BeautifulSoup(S.get(issue,timeout=60).text,"html.parser")
        for p in isoup.select("a[href*='/article/view/']"):
            page=urljoin(issue,p.get("href")); ps=BeautifulSoup(S.get(page,timeout=60).text,"html.parser")
            pdf=next((urljoin(page,x.get("href")) for x in ps.select("a") if '.pdf' in x.get('href','').lower()),None)
            title=(ps.select_one("h1") or p).get_text(" ",strip=True)
            if pdf: rows.append({"id":f"aaai{year}-{page.rstrip('/').split('/')[-1]}","venue":"aaai","year":year,"title":title,"authors":[],"pdf":pdf,"page":page,"tier":2})
    return rows

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--venue",default="cvpr,acl,aaai"); args=ap.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    for venue in args.venue.split(','):
        for year in range(2023,2026):
            try:
                rows={'acl':acl,'cvpr':cvpr,'aaai':aaai}[venue](year); write(venue,rows)
            except Exception as e: print(venue,year,"ERROR",type(e).__name__,e)
            time.sleep(1)
if __name__=='__main__': main()
