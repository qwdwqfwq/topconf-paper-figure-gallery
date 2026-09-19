# -*- coding: utf-8 -*-
import re, pathlib
root = pathlib.Path(__file__).resolve().parents[1]
t = (root / "README.md").read_text(encoding="utf-8")
print("chars", len(t))
imgs = re.findall(r'<img src="([^"]+)"', t)
missing = [p for p in imgs if not (root / p).exists()]
print("img refs", len(imgs), "missing", missing[:5])
links = re.findall(r'href="([^"]+)"', t)
bad = [l for l in links if l.endswith(".md") and not (root / l.split("#")[0]).exists()]
print("bad local md links", bad)
