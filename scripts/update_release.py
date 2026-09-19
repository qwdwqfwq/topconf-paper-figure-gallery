# -*- coding: utf-8 -*-
"""Ensure v0.3 release targets current main and carries up-to-date notes."""
import subprocess, sys
import requests

REPO = "qwdwqfwq/topconf-paper-figure-gallery"
API = f"https://api.github.com/repos/{REPO}"
out = subprocess.run(["git", "credential", "fill"],
                     input="protocol=https\nhost=github.com\n\n",
                     capture_output=True, text=True)
TOKEN = next(l.split("=", 1)[1] for l in out.stdout.splitlines() if l.startswith("password="))
H = {"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json",
     "User-Agent": "gallery-setup", "X-GitHub-Api-Version": "2022-11-28"}
S = requests.Session(); S.trust_env = False

rel = S.get(API + "/releases/tags/v0.3", headers=H).json()
main_sha = S.get(API + "/git/ref/heads/main", headers=H).json()["object"]["sha"]
tag = rel.get("target_commitish")
print("release id:", rel.get("id"), "| target:", tag, "| tag:", rel.get("tag_name"),
      "| draft:", rel.get("draft"), "| main:", main_sha[:10])

body = """
### Top-Conf Figure Gallery v0.3

A searchable gallery of well-designed Figure 1 / teaser figures from six top
ML conferences, 2023–2025: **2,298 curated figures**
(NeurIPS 803 · ICLR 370 · ACL 326 · ICML 310 · AAAI 264 · CVPR 225).

- Six venues (ICLR, ICML, NeurIPS, CVPR, ACL, AAAI) with venue / year /
  visual-pattern filters, full-text title/author search, masonry + lightbox
- Every surviving candidate checked in **page-by-page full-enumeration human
  QA** (81 contact sheets) plus 8 multi-seed random audits; ~1,400 low-quality
  crops (default charts, photo dumps, screenshots, video-frame strips) excluded
- Pure static site, no backend, no build, works offline
- Open reproducible pipeline: proceedings index → PDF crop → 25+ design-quality
  rules → dHash de-duplication → full-enumeration visual QA
- Bilingual README (EN/中文), a "how to design your own overview figure"
  methodology guide, and a 24 s screen-recorded demo GIF

Live gallery: https://qwdwqfwq.github.io/topconf-paper-figure-gallery/
""".strip()

# Ensure the tag points at current main
tag_sha = None
r = S.get(API + "/git/ref/tags/v0.3", headers=H)
if r.status_code == 200:
    tag_sha = r.json()["object"]["sha"]
    print("tag ref ->", r.json()["object"]["type"], tag_sha[:10])
if not tag_sha or tag_sha != main_sha:
    r = S.patch(API + "/git/refs/tags/v0.3", headers=H,
                json={"sha": main_sha, "force": True})
    print("retag:", r.status_code)

r = S.patch(API + f"/releases/{rel['id']}", headers=H,
            json={"body": body, "name": "v0.3 — six-venue gallery, 2,298 curated figures",
                  "target_commitish": "main", "draft": False, "prerelease": False})
print("update release:", r.status_code, r.json().get("html_url"))
