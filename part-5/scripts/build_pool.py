# -*- coding: utf-8 -*-
"""Build the full candidate pool for the 3-venue x 3-year gallery.

Outputs data/pool/<venue>_<year>.jsonl:
  {id, venue, year, title, pdf, page, source, tier, authors?}
- ICML / NeurIPS 2023-24: proceedings indexes (data/indexes.json)
- NeurIPS 2025: arXiv comments search co:"NeurIPS 2025"
- ICLR 2023-25: OpenReview accepted list matched against arXiv co:"ICLR <year>"
"""
import json, re, html, time, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
POOL = DATA / "pool"
POOL.mkdir(exist_ok=True)

STOP = set("a an the of for and or to in on with via using based towards toward new is are "
           "be can we our their his her its as at by from into over under between".split())
def norm(t):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", html.unescape(t).lower())).strip()
def toks(t):
    return set(w for w in norm(t).split() if len(w) > 1 and w not in STOP)
def tscore(a, b):
    A, B = toks(a), toks(b)
    if not A or not B: return 0.0
    inter = len(A & B)
    return max(2*inter/(len(A)+len(B)), 0.95*inter/min(len(A), len(B)))

# topics whose Figure 1 tends to be a designed visual rather than a table/chart
VIS = re.compile(r"(diffus|gaussian|splat|nerf|neural radiance|novel view|3d|three-dimensional|video|text-to-|"
                 r"image|visual|vision|multimodal|multi-modal|vlm|vla|vision-language|robot|embodi|manipulat|"
                 r"grasp|navigat|agent|avatar|generat|editing|edit|styl|animat|portrait|human|scene|driv|"
                 r"segment|detect|paint|draw|render|reconstruct|world model|simulat|game|cloth|motion|"
                 r"dance|face|head|hand|object|open-vocab|open vocab|grounding|caption|understand|mllm|"
                 r"language model|llm|reason|retriev|rag|tool|code|alignment|preference|reinforcement)", re.I)
NEG = re.compile(r"(survey|review of|systematic|meta-analysis|comment on|reply to|erratum)", re.I)

def tier_of(title):
    return 1 if VIS.search(title) and not NEG.search(title) else 2

# ---------------- arXiv bulk pull ----------------
ATOM = "{http://www.w3.org/2005/Atom}"
ARX = "{http://arxiv.org/schemas/atom}"
def arxiv_pull(phrase, max_n=4000):
    """Pull all arXiv entries whose comments contain phrase."""
    out, start, step = [], 0, 200
    q = urllib.parse.quote(f'co:"{phrase}"')
    while start < max_n:
        url = (f"http://export.arxiv.org/api/query?search_query={q}"
               f"&start={start}&max_results={step}&sortBy=submittedDate&sortOrder=descending")
        raw = None
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "research-gallery/1.0 (academic)"})
                with urllib.request.urlopen(req, timeout=90) as r:
                    raw = r.read()
                break
            except Exception as e:
                print("  arxiv retry", attempt, e)
                time.sleep(8 + attempt*5)
        if raw is None:
            break
        root = ET.fromstring(raw)
        entries = root.findall(f"{ATOM}entry")
        if not entries:
            break
        for e in entries:
            aid = e.find(f"{ATOM}id").text.strip().rsplit("/", 1)[-1].split("v")[0]
            title = " ".join(e.find(f"{ATOM}title").text.split())
            comment = e.find(f"{ARX}comment")
            comment = " ".join(comment.text.split()) if comment is not None and comment.text else ""
            authors = [a.find(f"{ATOM}name").text for a in e.findall(f"{ATOM}author")]
            out.append({"arxiv": aid, "title": title, "comment": comment, "authors": authors})
        print(f"  {phrase}: {len(out)}")
        if len(entries) < step:
            break
        start += step
        time.sleep(3.2)
    return out

def write_pool(venue, year, rows):
    rows = sorted(rows, key=lambda r: (r["tier"], norm(r["title"])))
    p = POOL / f"{venue}_{year}.jsonl"
    with p.open("w", encoding="utf-8") as f:
        for i, r in enumerate(rows, 1):
            r["id"] = f"{venue}{year}-{i:04d}"
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    t1 = sum(1 for r in rows if r["tier"] == 1)
    print(f"{venue} {year}: {len(rows)} candidates (tier1={t1}) -> {p.name}")

# ---------------- ICML / NeurIPS proceedings ----------------
def build_proceedings():
    idx = json.loads((DATA / "indexes.json").read_text(encoding="utf-8"))
    for venue in ("icml", "neurips"):
        years = ["2023", "2024"] if venue == "neurips" else ["2023", "2024", "2025"]
        for y in years:
            rows = []
            for v in idx[venue][y].values():
                pdf = v["pdf"]
                page = v.get("abs", "")
                if not page:  # PMLR paper landing page
                    slug = pdf.split("/")[-1].removesuffix(".pdf")
                    vol = {"2023": "v202", "2024": "v235", "2025": "v267"}[y]
                    page = f"https://proceedings.mlr.press/{vol}/{slug}.html"
                rows.append({"venue": venue, "year": int(y), "title": v["title"],
                             "pdf": pdf, "page": page, "source": "proceedings",
                             "tier": tier_of(v["title"])})
            write_pool(venue, int(y), rows)

# ---------------- NeurIPS 2025 via arXiv ----------------
def build_neurips2025():
    entries = arxiv_pull("NeurIPS 2025", max_n=3200)
    rows, seen = [], set()
    for e in entries:
        c = e["comment"].lower()
        if "reject" in c or "submitted to" in c:
            continue
        if "neurips 2025" not in c:
            continue
        if e["arxiv"] in seen:
            continue
        seen.add(e["arxiv"])
        rows.append({"venue": "neurips", "year": 2025, "title": e["title"],
                     "pdf": f"https://arxiv.org/pdf/{e['arxiv']}",
                     "page": f"https://arxiv.org/abs/{e['arxiv']}",
                     "source": "arxiv", "authors": e["authors"], "tier": tier_of(e["title"])})
    write_pool("neurips", 2025, rows)

# ---------------- ICLR via OpenReview accepted + arXiv match ----------------
def accepted_iclr(year):
    """Return list of (title, forum, authors, or_pdf) from cached exports."""
    out = {}
    for p in sorted((DATA / "openreview").glob(f"iclr{year}_*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        for n in d.get("notes", []):
            c = n.get("content", {})
            def cv(k):
                x = c.get(k)
                return x.get("value") if isinstance(x, dict) else x
            venue = cv("venue") or ""
            title = cv("title")
            if not title or not venue:
                continue
            if year == 2023:
                ok = venue.startswith("ICLR 2023") and "Submitted" not in venue
            else:
                ok = f"ICLR {year}" in venue and "Submitted" not in venue
            if not ok:
                continue
            out[n["id"]] = {"title": " ".join(title.split()), "forum": n["id"],
                            "authors": cv("authors") or [],
                            "or_pdf": f"https://openreview.net/pdf?id={n['id']}"}
    return list(out.values())

def build_iclr(year):
    acc = accepted_iclr(year)
    print(f"ICLR {year}: {len(acc)} accepted in exports")
    arx = arxiv_pull(f"ICLR {year}", max_n=2200)
    # index arXiv by normalized title for fast matching
    arx_by_norm = {}
    for e in arx:
        arx_by_norm.setdefault(norm(e["title"]), e)
    rows = []
    matched = 0
    for a in acc:
        nt = norm(a["title"])
        e = arx_by_norm.get(nt)
        if e is None:
            best, bs = None, 0.0
            for cand in arx:
                s = tscore(a["title"], cand["title"])
                if s > bs:
                    best, bs = cand, s
            if bs >= 0.92:
                e = best
        row = {"venue": "iclr", "year": year, "title": a["title"],
               "pdf": a["or_pdf"],
               "page": f"https://openreview.net/forum?id={a['forum']}",
               "source": "openreview", "authors": a["authors"],
               "tier": tier_of(a["title"])}
        if e is not None:
            matched += 1
            row["arxiv"] = e["arxiv"]
            row["arxiv_pdf"] = f"https://arxiv.org/pdf/{e['arxiv']}"
        rows.append(row)
    print(f"ICLR {year}: arxiv-matched {matched}/{len(acc)}")
    write_pool("iclr", year, rows)

if __name__ == "__main__":
    import sys
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "proc"):
        build_proceedings()
    if what in ("all", "neurips25"):
        build_neurips2025()
    if what in ("all", "iclr"):
        for y in (2023, 2024, 2025):
            build_iclr(y)
