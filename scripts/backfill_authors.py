# -*- coding: utf-8 -*-
"""Backfill missing authors from proceedings pages via citation_author meta tags."""
import json, re, sys, time
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PROXIES = None
for px in ("http://127.0.0.1:7897",):
    try:
        requests.get("https://openreview.net", proxies={"http": px, "https": px}, timeout=4)
        PROXIES = {"http": px, "https": px}
        print("using proxy", px)
        break
    except Exception:
        pass

fig_path = ROOT / "data" / "figures.json"
fig = json.loads(fig_path.read_text(encoding="utf-8"))
missing = [f for f in fig if not f.get("authors")]
print("missing:", len(missing))

HDR = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
ba_path = ROOT / "data" / "bulk_authors.json"
ba = json.loads(ba_path.read_text(encoding="utf-8")) if ba_path.exists() else {}

def authors_from_html(html):
    soup = BeautifulSoup(html, "html.parser")
    names = [m.get("content","").strip() for m in soup.find_all("meta", attrs={"name":"citation_author"})]
    names = [n for n in names if n]
    if names:
        # NeurIPS pages sometimes repeat; dedupe preserve order
        seen, out = set(), []
        for n in names:
            if n not in seen:
                seen.add(n); out.append(n)
        return out
    # MLR press fallback: authors in <span class="authors">
    span = soup.select_one("span.authors")
    if span:
        txt = span.get_text(" ", strip=True)
        parts = re.split(r",| and ", txt)
        return [p.strip(" \t\r\n\xa0") for p in parts if p.strip(" \t\r\n\xa0") and len(p.strip()) < 60]
    return []

filled, failed = 0, []
for f in missing:
    url = f.get("paper") or ""
    if not url:
        failed.append((f["id"], "no-url")); continue
    try:
        r = requests.get(url, headers=HDR, proxies=PROXIES, timeout=25)
        auth = authors_from_html(r.text) if r.status_code == 200 else []
        if not auth:
            failed.append((f["id"], f"http {r.status_code}")); continue
        f["authors"] = auth
        ba[f["id"]] = auth
        filled += 1
        print("ok", f["id"], len(auth))
    except Exception as e:
        failed.append((f["id"], str(e)[:80]))
    time.sleep(0.3)

fig_path.write_text(json.dumps(fig, ensure_ascii=False, indent=1), encoding="utf-8")
ba_path.write_text(json.dumps(ba, ensure_ascii=False, indent=1), encoding="utf-8")
print("filled", filled, "failed", len(failed))
for x in failed[:30]: print("FAIL", x)
