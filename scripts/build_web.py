# -*- coding: utf-8 -*-
"""Build web assets: optimized JPGs in images/<venue>/final/, updated figures.json,
and assets/figures.js (embedded data so the page works from file://)."""
import json
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
figs = json.loads((DATA / "figures.json").read_text(encoding="utf-8"))
total = 0
for f in figs:
    src = ROOT / f["image"]
    if src.suffix.lower() in (".jpg", ".jpeg"):
        # already a web jpg (e.g. restored from a previous build) -> just count
        total += src.stat().st_size
        continue
    jpg = src.with_suffix(".jpg")
    im = Image.open(src).convert("RGB")
    if im.width > 1500:
        im = im.resize((1500, round(im.height * 1500 / im.width)), Image.LANCZOS)
    im.save(jpg, "JPEG", quality=90, optimize=True, progressive=True)
    total += jpg.stat().st_size
    f["image"] = str(jpg.relative_to(ROOT)).replace("\\", "/")
    src.unlink()  # remove heavy PNG from final web folder
(DATA / "figures.json").write_text(json.dumps(figs, ensure_ascii=False, indent=1), encoding="utf-8")
(ROOT / "assets").mkdir(exist_ok=True)
(ROOT / "assets" / "figures.js").write_text(
    "// Auto-generated from data/figures.json by scripts/build_web.py\n"
    "window.FIGURES = " + json.dumps(figs, ensure_ascii=False, indent=1) + ";\n",
    encoding="utf-8")
print(f"{len(figs)} images, total {total/1024/1024:.1f} MB")
