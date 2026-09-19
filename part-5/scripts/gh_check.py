# -*- coding: utf-8 -*-
import subprocess, requests
out = subprocess.run(["git", "credential", "fill"],
                     input="protocol=https\nhost=github.com\n\n",
                     capture_output=True, text=True)
tok = None
for line in out.stdout.splitlines():
    if line.startswith("password="):
        tok = line.split("=", 1)[1]
print("token found:", bool(tok))
s = requests.Session(); s.trust_env = False
h = {"Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json"}
r = s.get("https://api.github.com/user", headers=h, timeout=30)
print("/user:", r.status_code, r.json().get("login"))
r = s.get("https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery", headers=h, timeout=30)
print("repo auth:", r.status_code,
      (r.json().get("visibility"), r.json().get("size")) if r.status_code == 200 else r.json().get("message"))
r = s.get("https://api.github.com/user/repos?per_page=100&affiliation=owner", headers=h, timeout=30)
print("owned repos:", [x["name"] for x in r.json()] if r.status_code == 200 else r.status_code)
