# -*- coding: utf-8 -*-
import json, re, time
from pathlib import Path
import requests
ROOT = Path(__file__).resolve().parents[1]; DATA = ROOT / "data"
H = {"User-Agent": "Mozilla/5.0 (research; 939123836@qq.com)"}
figs = json.loads((DATA / "figures.json").read_text(encoding="utf-8"))
matched = {m["id"]: m for m in json.loads((DATA / "matched.json").read_text(encoding="utf-8"))}
vol = {"2023": "v202", "2024": "v235", "2025": "v267"}
for f in figs:
    if f["authors"]:
        continue
    m = matched[f["id"]]
    slug = m["pdf"].split("/")[-1].removesuffix(".pdf")
    url = f"https://proceedings.mlr.press/{vol[str(f['year'])]}/{slug}.html"
    for attempt in range(4):
        try:
            r = requests.get(url, headers=H, timeout=60)
            names = re.findall(r'<meta name="citation_author" content="([^"]+)"', r.text)
            names = [n.strip() for n in dict.fromkeys(names) if n.strip()]
            if names:
                f["authors"] = names
                print("OK", f["id"], ", ".join(names[:4])[:70])
            else:
                print("MISS", f["id"], r.status_code, url)
            break
        except Exception as e:
            print("retry", attempt, e)
            time.sleep(6)
    time.sleep(1)
(DATA / "figures.json").write_text(json.dumps(figs, ensure_ascii=False, indent=1), encoding="utf-8")
print("missing:", [f["id"] for f in figs if not f["authors"]])
