# -*- coding: utf-8 -*-
"""Post-push GitHub setup: enable Pages (GitHub Actions source), set topics,
optionally create a release. Direct connection (trust_env=False).

Usage:
    python scripts/gh_setup.py pages
    python scripts/gh_setup.py topics
    python scripts/gh_setup.py release v0.3
"""
import json, subprocess, sys
from pathlib import Path
import requests

REPO = "qwdwqfwq/topconf-paper-figure-gallery"
API = f"https://api.github.com/repos/{REPO}"

out = subprocess.run(["git", "credential", "fill"],
                     input="protocol=https\nhost=github.com\n\n",
                     capture_output=True, text=True)
TOKEN = next((ln.split("=", 1)[1] for ln in out.stdout.splitlines()
              if ln.startswith("password=")), None)
assert TOKEN, "no token"
S = requests.Session(); S.trust_env = False
H = {"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json",
     "User-Agent": "gallery-setup", "X-GitHub-Api-Version": "2022-11-28"}


def pages():
    r = S.get(API + "/pages", headers=H, timeout=30)
    print("GET pages:", r.status_code)
    if r.status_code == 200:
        print("  build_type:", r.json().get("build_type"), "html_url:", r.json().get("html_url"))
        return
    r = S.post(API + "/pages", headers=H, json={"build_type": "workflow"}, timeout=30)
    print("POST pages:", r.status_code, r.text[:300])


def topics():
    t = ["awesome-list", "paper-figures", "figure", "scientific-figures",
         "academic-writing", "paper-writing", "research", "machine-learning",
         "deep-learning", "computer-vision", "nlp", "iclr", "icml", "neurips",
         "cvpr", "acl", "aaai", "gallery", "data-visualization", "inspiration"]
    r = S.put(API + "/topics", headers=H, json={"names": t}, timeout=30)
    print("PUT topics:", r.status_code, r.text[:200] if r.status_code != 200 else
          [x for x in r.json().get("names", [])])


def release(tag):
    r = S.get(API + f"/releases/tags/{tag}", headers=H, timeout=30)
    if r.status_code == 200:
        print("release exists:", r.json().get("html_url")); return
    body = (RESP or "").strip()
    r = S.post(API + "/releases", headers=H, timeout=30, json={
        "tag_name": tag, "target_commitish": "main", "name": tag,
        "body": body, "draft": False, "prerelease": False})
    print("POST release:", r.status_code, r.json().get("html_url", r.text[:300]))


RESP = """
### Top-Conf Figure Gallery v0.3

A searchable gallery of well-designed Figure 1 / teaser figures from six top
ML conferences (ICLR, ICML, NeurIPS, CVPR, ACL, AAAI), 2023–2025.

- Thousands of curated figures with venue / year / visual-pattern filters
- Pure static site, full-text search, masonry + lightbox, works offline
- Open and reproducible curation pipeline (PDF crop → 25+ design-quality
  rules → dHash de-duplication → sampled visual QA)
- Bilingual README (EN/中文) and a "how to design your own overview figure" guide

Live gallery: https://qwdwqfwq.github.io/topconf-paper-figure-gallery/
"""

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "pages"
    if cmd == "pages":
        pages()
    elif cmd == "topics":
        topics()
    elif cmd == "release":
        release(sys.argv[2])
    else:
        print("unknown cmd", cmd)
