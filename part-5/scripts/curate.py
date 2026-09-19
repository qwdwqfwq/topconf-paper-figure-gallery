# -*- coding: utf-8 -*-
"""Curate the final 60 figures, assign visual-pattern labels, collect authors,
emit data/figures.json and copy selected images into images/<venue>/final/."""
import json, re, shutil
from pathlib import Path
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ms = {m["id"]: m for m in json.loads((DATA / "matched.json").read_text(encoding="utf-8"))}

# id -> visual pattern label
SELECTION = {
 # ---- ICLR ----
 "iclr2023-01": "teaser", "iclr2023-02": "conceptual", "iclr2023-03": "teaser",
 "iclr2023-04": "pipeline", "iclr2023-06": "teaser", "iclr2023-11": "teaser",
 "iclr2023-12": "pipeline",
 "iclr2024-16": "teaser", "iclr2024-17": "framework", "iclr2024-22": "teaser",
 "iclr2024-23": "pipeline", "iclr2024-24": "conceptual", "iclr2024-25": "teaser",
 "iclr2024-31": "teaser",
 "iclr2025-41": "framework", "iclr2025-43": "pipeline", "iclr2025-44": "pipeline",
 "iclr2025-46": "conceptual", "iclr2025-48": "teaser", "iclr2025-52": "teaser",
 # ---- ICML ----
 "icml2023-02": "architecture", "icml2023-03": "teaser", "icml2023-05": "conceptual",
 "icml2023-06": "conceptual", "icml2023-07": "framework", "icml2023-12": "teaser",
 "icml2023-14": "conceptual",
 "icml2024-15": "teaser", "icml2024-16": "architecture", "icml2024-17": "pipeline",
 "icml2024-18": "conceptual", "icml2024-25": "architecture", "icml2024-27": "conceptual",
 "icml2024-28": "teaser",
 "icml2025-34": "taxonomy", "icml2025-40": "conceptual", "icml2025-41": "pipeline",
 "icml2025-43": "pipeline", "icml2025-44": "framework", "icml2025-45": "conceptual",
 # ---- NeurIPS ----
 "neurips2023-01": "teaser", "neurips2023-02": "conceptual", "neurips2023-03": "pipeline",
 "neurips2023-05": "framework", "neurips2023-11": "conceptual", "neurips2023-12": "framework",
 "neurips2023-14": "conceptual",
 "neurips2024-18": "teaser", "neurips2024-19": "conceptual", "neurips2024-20": "teaser",
 "neurips2024-23": "teaser", "neurips2024-24": "teaser", "neurips2024-27": "framework",
 "neurips2024-30": "pipeline",
 "neurips2025-38": "teaser", "neurips2025-43": "teaser", "neurips2025-46": "conceptual",
 "neurips2025-50": "taxonomy", "neurips2025-52": "teaser", "neurips2025-53": "pipeline",
}

# ---- authors from OpenReview exports (ICLR) ----
or_authors = {}
def cv(f): return f.get("value") if isinstance(f, dict) else f
for p in (DATA / "openreview").glob("iclr*.json"):
    for note in json.loads(p.read_text(encoding="utf-8")).get("notes", []):
        c = note.get("content", {})
        fid = note.get("id")
        a = cv(c.get("authors"))
        if fid and a:
            or_authors[fid] = a

def authors_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    txt = doc[0].get_text()
    doc.close()
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    # title is usually line 0; authors are among lines 1-6, stop at affiliation/abstract
    cand = []
    for l in lines[1:8]:
        if re.search(r"abstract|keywords|introduction|https?://|@|university|institute|college|lab|inc\.|google|microsoft|meta|deepmind|openai|nvidia|school of|department", l, re.I):
            break
        cand.append(l)
    raw = " ".join(cand)
    raw = re.sub(r"[\*\d†‡§¶♦♣♥∗*]", "", raw)
    parts = re.split(r",| and |;|·", raw)
    names = []
    for x in parts:
        x = x.strip(" .")
        if 4 <= len(x) <= 40 and re.match(r"^[A-ZÀ-Ý][A-Za-zÀ-ÿ\.\-’' ]+$", x):
            names.append(x)
    return names[:8]

figures = []
for fid, pattern in SELECTION.items():
    m = ms[fid]
    src_png = ROOT / m["image"]
    out_dir = ROOT / "images" / m["venue"] / "final"
    out_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_png, out_dir / f"{fid}.png")
    if m["venue"] == "iclr" and m.get("forum") in or_authors:
        authors = or_authors[m["forum"]]
    else:
        pdf = ROOT / "pdfs" / m["venue"] / f"{fid}.pdf"
        authors = authors_from_pdf(pdf) if pdf.exists() else []
    paper_url = m.get("arxiv") or m.get("abs") or ""
    if m["venue"] == "iclr":
        paper_url = m.get("abs", paper_url)  # OpenReview forum as canonical
    figures.append({
        "id": fid, "venue": m["venue"], "year": m["year"],
        "title": re.sub(r"\s+", " ", m["title"]).replace("$\\alpha$", "α").replace("$\\tau$", "τ"),
        "authors": authors, "pattern": pattern,
        "image": f"images/{m['venue']}/final/{fid}.png",
        "paper": paper_url, "pdf_source": m["pdf"],
    })

figures.sort(key=lambda f: (f["venue"], f["year"], f["id"]))
(DATA / "figures.json").write_text(json.dumps(figures, ensure_ascii=False, indent=1), encoding="utf-8")
for f in figures:
    print(f["id"], "|", ", ".join(f["authors"][:4])[:70])
print("total:", len(figures))
