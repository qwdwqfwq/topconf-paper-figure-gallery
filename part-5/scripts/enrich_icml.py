# -*- coding: utf-8 -*-
import json, re, time
from pathlib import Path
import requests
ROOT = Path(__file__).resolve().parents[1]; DATA = ROOT / "data"
H = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}
figs = json.loads((DATA / "figures.json").read_text(encoding="utf-8"))
matched = {m["id"]: m for m in json.loads((DATA / "matched.json").read_text(encoding="utf-8"))}

def first_last(name):
    # "Zheng, Kaiwen" -> "Kaiwen Zheng"
    if "," in name:
        a, b = name.split(",", 1)
        return (b.strip() + " " + a.strip()).strip()
    return name.strip()

for f in figs:
    if f["venue"] == "neurips":
        f["authors"] = [first_last(a) for a in f["authors"]]
    if f["venue"] != "icml" or f["authors"]:
        continue
    m = matched[f["id"]]
    # pdf like .../v202/li23q/li23q.pdf or raw.githubusercontent .../assets/li23q/li23q.pdf
    slug = m["pdf"].rstrip(".pdf").split("/")[-1]
    vol = {"2023": "v202", "2024": "v235", "2025": "v267"}[str(f["year"])]
    url = f"https://proceedings.mlr.press/{vol}/{slug}.html"
    try:
        r = requests.get(url, headers=H, timeout=60)
        names = re.findall(r'<meta name="citation_author" content="([^"]+)"', r.text)
        names = [first_last(n) for n in dict.fromkeys(names) if n.strip()]
        if names:
            f["authors"] = names
            print("OK", f["id"], ", ".join(names[:4])[:70])
        else:
            print("MISS", f["id"], r.status_code, url)
    except Exception as e:
        print("ERR", f["id"], e)
    time.sleep(0.5)

(DATA / "figures.json").write_text(json.dumps(figs, ensure_ascii=False, indent=1), encoding="utf-8")
print("missing:", [f["id"] for f in figs if not f["authors"]])
