# -*- coding: utf-8 -*-
"""Set repo description, homepage and social-friendly metadata."""
import subprocess
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
body = {
    "description": ("A searchable gallery of well-designed Figure 1 / teaser figures "
                    "from ICLR, ICML, NeurIPS, CVPR, ACL, AAAI (2023-2025) — 2,298 curated "
                    "figures for paper-overview inspiration. Pure static site."),
    "homepage": "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/",
}
r = S.patch(API, headers=H, json=body, timeout=30)
print(r.status_code)
j = r.json()
print("desc:", j.get("description"))
print("home:", j.get("homepage"))
