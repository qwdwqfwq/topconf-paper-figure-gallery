# -*- coding: utf-8 -*-
"""Build candidate pools for CVPR (CVF open access), ACL (ACL Anthology)
and AAAI (OJS), 2023-2025.

Writes data/pool/<venue>_2023_2025.jsonl with the same row schema as the
OpenReview pools: id/venue/year/title/authors/pdf/page/tier.

Routing: openaccess.thecvf.com is reachable directly (trust_env=False);
aclanthology.org and ojs.aaai.org are routed through the local proxy
(trust_env=True) in this environment.

Usage:
    python scripts/build_pool_new.py cvpr
    python scripts/build_pool_new.py acl,aaai
"""
from __future__ import annotations
import argparse, json, re, sys, time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "pool"
OUT.mkdir(parents=True, exist_ok=True)
UA = "topconf-paper-figure-gallery/0.3 (research metadata; contact 939123836@qq.com)"


def session(proxy: bool):
    s = requests.Session()
    s.trust_env = proxy
    s.headers.update({"User-Agent": UA})
    return s

SD = session(False)   # direct
SP = session(True)    # via local Clash proxy

# titles that are especially likely to carry a designed overview/teaser figure
VISUAL_RX = re.compile(
    r"\b(visual|vision|image|images|video|videos|photo|photograph|3d|4d|scene|scenes|"
    r"segmentation|detection|detect|generat|diffusion|gaussian|nerf|neural field|render|"
    r"avatar|portrait|face|human|pose|hand|robot|embodi|manipulat|driv|autonomous|"
    r"multimodal|multi-modal|vision-language|vlm|vln|grounding|point cloud|lidar|"
    r"panoram|depth|optical flow|track|reconstruct|reconstruction|editing|edit|style|"
    r"paint|draw|sketch|graphic|infographic|poster|layout|design|teaser|banner|"
    r"medical imag|x-ray|histolog|microscop|remote sensing|satellite|aerial|"
    r"augmented reality|ar\b|virtual reality|vr\b|simulation|simulat|world model|"
    r"game|graphics|animation|animat|texture|mesh|occupancy|slam|odometry|"
    r"image-to|text-to-image|text-to-video|text-to-3d|video generation)\b",
    re.I)


def tier_of(title: str) -> int:
    return 1 if VISUAL_RX.search(title) else 2


def write_pool(venue: str, rows: list[dict]):
    p = OUT / f"{venue}_2023_2025.jsonl"
    old = set()
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            old.add(json.loads(line)["id"])
    n_new = 0
    with p.open("a", encoding="utf-8") as f:
        for r in rows:
            if r["id"] in old:
                continue
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            n_new += 1
    print(f"[{venue}] total={len(rows)} new={n_new} -> {p.name}", flush=True)


# ---------------- CVPR (openaccess.thecvf.com) ----------------
def build_cvpr(year: int) -> list[dict]:
    url = f"https://openaccess.thecvf.com/CVPR{year}?day=all"
    r = SD.get(url, timeout=180)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    rows, seen = [], set()
    for dt in soup.select("dt.ptitle"):
        a = dt.find("a", href=True)
        if not a:
            continue
        page = urljoin(url, a["href"])
        # CVF emits two <dd> siblings per paper: author forms, then pdf/supp links
        authors, pdf_a = [], None
        sib = dt.find_next_sibling("dd")
        for _ in range(3):
            if sib is None:
                break
            if pdf_a is None:
                pdf_a = sib.find("a", href=lambda h: h and "/papers/" in h and h.lower().endswith(".pdf"))
            for inp in sib.select("input[name='query_author']"):
                if inp.get("value") and inp["value"] not in authors:
                    authors.append(inp["value"].strip())
            sib = sib.find_next_sibling("dd")
        if not pdf_a:
            continue
        pdf = urljoin(url, pdf_a["href"])
        stem = pdf.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        fid = f"cvpr{year}-{stem}"
        if fid in seen:
            continue
        seen.add(fid)
        title = a.get_text(" ", strip=True)
        rows.append({"id": fid, "venue": "cvpr", "year": year, "title": title,
                     "authors": authors, "pdf": pdf, "page": page,
                     "tier": tier_of(title), "source": "cvf"})
    return rows


# ---------------- ACL (ACL Anthology events pages) ----------------
PID_RX = re.compile(r"^/?(\d{4})\.(acl-long|acl-short|findings-acl)\.(\d+)/?$")

def build_acl(year: int) -> list[dict]:
    url = f"https://aclanthology.org/events/acl-{year}/"
    r = SP.get(url, timeout=180)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    rows, seen = [], set()
    for block in soup.select("div.d-sm-flex"):
        ta = block.find("a", href=PID_RX)
        if ta is None:
            continue
        m = PID_RX.match(ta["href"])
        y, kind, num = int(m.group(1)), m.group(2), int(m.group(3))
        if y != year or num == 0:   # .0 is front matter / proceedings header
            continue
        pid = f"{y}.{kind}.{num}"
        fid = f"acl{year}-{pid}"
        if fid in seen:
            continue
        title = ta.get_text(" ", strip=True)
        pdf_a = block.find("a", href=lambda h: h and h.endswith(f"{pid}.pdf"))
        pdf = urljoin("https://aclanthology.org/", pdf_a["href"]) if pdf_a else f"https://aclanthology.org/{pid}.pdf"
        authors = [a.get_text(" ", strip=True) for a in block.select('a[href^="/people/"]')]
        seen.add(fid)
        rows.append({"id": fid, "venue": "acl", "year": year, "title": title,
                     "authors": authors, "pdf": pdf, "page": f"https://aclanthology.org/{pid}/",
                     "tier": tier_of(title), "source": "aclanthology"})
    return rows


# ---------------- AAAI (OJS technical tracks) ----------------
def _aaai_issue_urls(year: int) -> list[str]:
    # OJS shows 25 issues/archive page and conference boundaries cut across
    # pages; AAAI-23/24/25 technical tracks live on archive pages 2-5.
    tag = re.compile(rf"^AAAI-{str(year)[-2:]} Technical Tracks \d+$")
    urls = []
    for page_no in (2, 3, 4, 5):
        for attempt in range(3):
            try:
                r = SP.get(f"https://ojs.aaai.org/index.php/AAAI/issue/archive/{page_no}",
                           timeout=120)
                r.raise_for_status()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(5)
        soup = BeautifulSoup(r.text, "html.parser")
        for a in soup.select('a[href*="/issue/view/"]'):
            label = a.get_text(" ", strip=True)
            if tag.match(label) and a["href"] not in urls:
                urls.append(a["href"])
        time.sleep(1)
    return urls


def build_aaai(year: int) -> list[dict]:
    rows, seen = [], set()
    for issue in _aaai_issue_urls(year):
        r = SP.get(issue, timeout=120)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for art in soup.select("div.obj_article_summary"):
            ta = art.select_one("h3.title a[href*='/article/view/']")
            pa = art.select_one("a.obj_galley_link.pdf")
            if ta is None or pa is None:
                continue
            page = ta["href"]
            mm = re.search(r"/article/view/(\d+)", page)
            if not mm:
                continue
            aid = mm.group(1)
            fid = f"aaai{year}-{aid}"
            if fid in seen:
                continue
            title = ta.get_text(" ", strip=True)
            au_div = art.select_one("div.authors")
            authors = []
            if au_div is not None:
                authors = [x.strip() for x in re.split(r",|;", au_div.get_text(" ", strip=True)) if x.strip()]
            seen.add(fid)
            rows.append({"id": fid, "venue": "aaai", "year": year, "title": title,
                         "authors": authors, "pdf": pa["href"], "page": page,
                         "tier": tier_of(title), "source": "aaai-ojs"})
        time.sleep(0.5)
    return rows


BUILDERS = {"cvpr": build_cvpr, "acl": build_acl, "aaai": build_aaai}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("venues", nargs="?", default="cvpr,acl,aaai")
    args = ap.parse_args()
    for venue in args.venues.split(","):
        venue = venue.strip()
        if venue not in BUILDERS:
            print("unknown venue", venue, file=sys.stderr)
            continue
        all_rows = []
        for year in (2023, 2024, 2025):
            try:
                rows = BUILDERS[venue](year)
                t1 = sum(1 for r in rows if r["tier"] == 1)
                print(f"  {venue} {year}: {len(rows)} papers (tier1={t1})", flush=True)
                all_rows.extend(rows)
            except Exception as e:
                print(f"  {venue} {year} ERROR {type(e).__name__}: {e}", flush=True)
            time.sleep(1)
        if all_rows:
            write_pool(venue, all_rows)


if __name__ == "__main__":
    main()
