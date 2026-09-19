# -*- coding: utf-8 -*-
"""v1.1 curation: 60 figures with the 'designed layout' bar (no pure photo dumps).
Copies images/<venue>/<id>.png -> images/<venue>/final/<id>.png, pulls authors,
writes data/figures.json. Then run enrich_authors.py / enrich_icml.py / build_web.py.
"""
import json, re, shutil
from pathlib import Path
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ms = {m["id"]: m for m in json.loads((DATA / "matched.json").read_text(encoding="utf-8"))}

# retained from v1
SELECTION = {
 # ---- ICLR (retained 13) ----
 "iclr2023-02": "conceptual", "iclr2023-03": "teaser", "iclr2023-04": "pipeline",
 "iclr2023-12": "pipeline",
 "iclr2024-17": "framework", "iclr2024-23": "pipeline", "iclr2024-24": "conceptual",
 "iclr2024-31": "teaser",
 "iclr2025-41": "framework", "iclr2025-43": "pipeline", "iclr2025-44": "pipeline",
 "iclr2025-46": "conceptual", "iclr2025-48": "teaser",
 # ---- ICLR (7 replacements) ----
 "iclr2023-05": "pipeline", "iclr2023-07": "pipeline",
 "iclr2024-28": "framework", "iclr2024-32": "conceptual", "iclr2024-33": "framework",
 "iclr2024-34": "framework", "iclr2025-42": "framework",
 # ---- ICML (retained 16) ----
 "icml2023-02": "architecture", "icml2023-05": "conceptual", "icml2023-06": "conceptual",
 "icml2023-07": "framework", "icml2023-12": "teaser",
 "icml2024-16": "architecture", "icml2024-17": "pipeline", "icml2024-18": "conceptual",
 "icml2024-25": "architecture", "icml2024-27": "conceptual",
 "icml2025-34": "taxonomy", "icml2025-40": "conceptual", "icml2025-41": "pipeline",
 "icml2025-43": "pipeline", "icml2025-44": "framework", "icml2025-45": "conceptual",
 # ---- ICML (4 replacements) ----
 "icml2023-04": "framework", "icml2023-09": "architecture",
 "icml2024-22": "architecture", "icml2024-30": "framework",
 # ---- NeurIPS (retained 13) ----
 "neurips2023-02": "conceptual", "neurips2023-03": "pipeline", "neurips2023-05": "framework",
 "neurips2023-11": "conceptual", "neurips2023-12": "framework", "neurips2023-14": "conceptual",
 "neurips2024-19": "conceptual", "neurips2024-23": "teaser", "neurips2024-27": "framework",
 "neurips2024-30": "pipeline",
 "neurips2025-46": "conceptual", "neurips2025-50": "taxonomy", "neurips2025-53": "pipeline",
 # ---- NeurIPS (7 replacements) ----
 "neurips2023-04": "conceptual", "neurips2024-25": "conceptual", "neurips2024-28": "conceptual",
 "neurips2025-33": "framework", "neurips2025-40": "architecture", "neurips2025-44": "pipeline",
 "neurips2025-48": "framework",
}

or_authors = {}
def cv(f): return f.get("value") if isinstance(f, dict) else f
for p in (DATA / "openreview").glob("iclr*.json"):
    for note in json.loads(p.read_text(encoding="utf-8")).get("notes", []):
        c = note.get("content", {})
        a = cv(c.get("authors"))
        if note.get("id") and a:
            or_authors[note["id"]] = a

def authors_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    txt = doc[0].get_text(); doc.close()
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    cand = []
    for l in lines[1:8]:
        if re.search(r"abstract|keywords|introduction|https?://|@|university|institute|college|lab|inc\.|google|microsoft|meta|deepmind|openai|nvidia|school of|department", l, re.I):
            break
        cand.append(l)
    raw = re.sub(r"[\*\d†‡§¶♦♣♥∗*]", "", " ".join(cand))
    names = []
    for x in re.split(r",| and |;|·", raw):
        x = x.strip(" .")
        if 4 <= len(x) <= 40 and re.match(r"^[A-ZÀ-Ý][A-Za-zÀ-ÿ\.\-’' ]+$", x):
            names.append(x)
    return names[:8]

# clear old final images
for d in (ROOT / "images").glob("*/final"):
    for f in d.glob("*"): f.unlink()

figures = []
missing_src = []
for fid, pattern in SELECTION.items():
    m = ms.get(fid)
    if m is None:
        missing_src.append(fid); continue
    src_png = ROOT / m["image"]
    if not src_png.exists():
        missing_src.append(fid + " (no png)"); continue
    out_dir = ROOT / "images" / m["venue"] / "final"
    out_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_png, out_dir / f"{fid}.png")
    if m["venue"] == "iclr" and m.get("forum") in or_authors:
        authors = or_authors[m["forum"]]
    else:
        pdf = ROOT / "pdfs" / m["venue"] / f"{fid}.pdf"
        authors = authors_from_pdf(pdf) if pdf.exists() else []
    paper_url = m.get("abs") or m.get("arxiv") or ""
    if m["venue"] == "icml":
        slug = m["pdf"].split("/")[-1].removesuffix(".pdf")
        vol = {2023: "v202", 2024: "v235", 2025: "v267"}[m["year"]]
        paper_url = f"https://proceedings.mlr.press/{vol}/{slug}.html"
    figures.append({
        "id": fid, "venue": m["venue"], "year": m["year"],
        "title": re.sub(r"\s+", " ", m["title"]).replace("$\\alpha$", "α").replace("$\\tau$", "τ"),
        "authors": authors, "pattern": pattern,
        "image": f"images/{m['venue']}/final/{fid}.png",
        "paper": paper_url, "pdf_source": m["pdf"],
    })

figures.sort(key=lambda f: (f["venue"], f["year"], f["id"]))
(DATA / "figures.json").write_text(json.dumps(figures, ensure_ascii=False, indent=1), encoding="utf-8")
print("total:", len(figures), "| missing:", missing_src)
print("need authors:", [f["id"] for f in figures if not f["authors"]])
