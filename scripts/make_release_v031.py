# -*- coding: utf-8 -*-
"""Publish v0.3.1 release on current main (compact UI + lazy-load fix)."""
import subprocess, sys, time
import requests

REPO = "qwdwqfwq/topconf-paper-figure-gallery"
API = f"https://api.github.com/repos/{REPO}"
PROXY = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:7897"

out = subprocess.run(["git", "credential", "fill"],
                     input="protocol=https\nhost=github.com\n\n",
                     capture_output=True, text=True)
TOKEN = next(l.split("=", 1)[1] for l in out.stdout.splitlines() if l.startswith("password="))
H = {"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json",
     "User-Agent": "gallery-release", "X-GitHub-Api-Version": "2022-11-28"}
S = requests.Session(); S.trust_env = False

PROXY_SETS = [{"http": PROXY, "https": PROXY}, None]

def req(method, url, **kw):
    last = None
    for attempt in range(8):
        proxies = PROXY_SETS[attempt % 2]
        try:
            r = S.request(method, url, headers=H, proxies=proxies, timeout=30, **kw)
            return r
        except requests.RequestException as e:
            last = e
            time.sleep(2 + attempt)
    raise last

TAG = "v0.3.1"
main_sha = req("GET", API + "/git/ref/heads/main").json()["object"]["sha"]
print("main:", main_sha[:10])

r = req("GET", API + f"/git/ref/tags/{TAG}")
if r.status_code == 404:
    r = req("POST", API + "/git/refs",
            json={"ref": f"refs/tags/{TAG}", "sha": main_sha})
    print("tag create:", r.status_code)
else:
    print("tag exists:", r.status_code)

body = """
### Top-Conf Figure Gallery v0.3.1 — compact UI & reliable image loading

This is the v0.3 six-venue gallery (**2,298 curated Figure 1 / teasers**,
ICLR · ICML · NeurIPS · CVPR · ACL · AAAI, 2023–2025) with a redesigned
browsing experience.

**Fixed: blank / empty images on slow or proxied connections**
- Native `loading=lazy` under-fetched when scrolling fast and left white,
  collapsed cards; CSS masonry could also place newly appended cards *above*
  the viewport so they never triggered a load.
- New custom IntersectionObserver loader prefetching ~2 screens ahead
  (1800 px), shimmer skeleton placeholders, fade-in, one automatic retry,
  click-to-retry fallback.
- Intrinsic width/height stored per figure; cards reserve their exact layout
  slot (`aspect-ratio`), so there is no layout shift while loading.
- Verified on the live site: human-speed full scroll loads **2,298 / 2,298
  images, zero HTTP failures, zero console errors**.

**Redesigned interface**
- The ~530 px sticky header is split into a short hero (scrolls away) and a
  compact 115 px sticky control bar; the first screen now shows ~3 rows of
  figures instead of ~1.5.
- Richer bilingual intro with bolded key terms and venue-colored names;
  denser filter chips; mobile layout re-tuned.
- Re-recorded 23 s demo GIF.

Live gallery: https://qwdwqfwq.github.io/topconf-paper-figure-gallery/
Full v0.3 notes (six venues, full-enumeration QA, bilingual README):
https://github.com/qwdwqfwq/topconf-paper-figure-gallery/releases/tag/v0.3
""".strip()

r = req("GET", API + f"/releases/tags/{TAG}")
if r.status_code == 404:
    r = req("POST", API + "/releases",
            json={"tag_name": TAG, "target_commitish": "main",
                  "name": "v0.3.1 — compact UI, no more blank images",
                  "body": body, "draft": False, "prerelease": False})
else:
    rid = r.json()["id"]
    r = req("PATCH", API + f"/releases/{rid}",
            json={"body": body, "name": "v0.3.1 — compact UI, no more blank images"})
print("release:", r.status_code, r.json().get("html_url"))
