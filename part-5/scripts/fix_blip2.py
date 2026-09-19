# -*- coding: utf-8 -*-
"""BLIP-2 Figure 1 sits in the right column; crop right-column width exactly."""
from pathlib import Path
import fitz
from extract_figures import find_captions, content_above
ROOT = Path(__file__).resolve().parents[1]
doc = fitz.open(ROOT / "pdfs/icml/icml2023-02.pdf")
page = doc[0]; pw = page.rect.width
for cap in find_captions(page):
    if cap.x0 > 0.45 * pw:   # right column
        xl = cap.x0 - 7
        wide = fitz.Rect(xl, cap.y0-2, 0.96*pw, cap.y1+2)
        cb = content_above(page, wide)
        if cb and cb.height > 60:
            clip = fitz.Rect(xl-3, max(0, cb.y0-4), 0.96*pw+3, cb.y1+3)
            pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=False)
            for out in [ROOT/"images/icml/icml2023-02.png", ROOT/"images/icml/final/icml2023-02.png"]:
                pix.save(out)
            print("ok", pix.width, pix.height, "x0=", round(xl))
doc.close()
