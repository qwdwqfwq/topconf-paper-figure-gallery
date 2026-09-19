# -*- coding: utf-8 -*-
import json, pymupdf as fitz
from pathlib import Path
ROOT = Path(r"C:\Users\黎枭\Doubao\chats\2026-09-16\new-chat\topconf-paper-figure-gallery")
ms = json.load(open(ROOT/"data/matched.json", encoding="utf-8"))
for mid in ["icml2023-11", "icml2023-12", "icml2023-13"]:
    m = next(x for x in ms if x["id"] == mid)
    doc = fitz.open(ROOT/"pdfs"/"icml"/f"{mid}.pdf")
    t = doc[0].get_text()[:220].replace("\n", " | ")
    print(mid, "|", m["title"][:70])
    print("   pdf:", m["pdf"])
    print("   page1:", t[:200])
    doc.close()
