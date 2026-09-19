# -*- coding: utf-8 -*-
import json
from pathlib import Path
import requests
ROOT = Path(__file__).resolve().parents[1]
BASE = "https://qwdwqfwq.github.io/topconf-paper-figure-gallery"
figs = json.loads((ROOT / "data" / "figures.json").read_text(encoding="utf-8"))
paths = ["/index.html", "/assets/app.js", "/assets/style.css", "/assets/figures.js",
         "/" + figs[0]["image"], "/" + figs[len(figs) // 2]["image"]]
for trust in (False, True):
    s = requests.Session(); s.trust_env = trust
    label = "proxy" if trust else "direct"
    ok = True
    for p in paths:
        try:
            r = s.get(BASE + p, timeout=30)
            print(label, p, "->", r.status_code, len(r.content))
            ok &= r.status_code == 200
        except Exception as e:
            print(label, p, "-> ERR", type(e).__name__); ok = False
    if ok:
        break
