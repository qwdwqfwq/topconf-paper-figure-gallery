# -*- coding: utf-8 -*-
"""Direct (no-proxy) GitHub API probe: auth, repo visibility, blob write test."""
import subprocess, json, base64, sys
import requests

cred = subprocess.run(["git", "credential", "fill"],
                      input="protocol=https\nhost=github.com\n\n",
                      capture_output=True, text=True, encoding="utf-8", errors="replace")
token = None
for line in cred.stdout.splitlines():
    if line.startswith("password="):
        token = line.split("=", 1)[1].strip()
assert token, "no token from credential manager"

s = requests.Session()
s.trust_env = False
H = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
     "User-Agent": "gallery-pusher", "X-GitHub-Api-Version": "2022-11-28"}

r = s.get("https://api.github.com/user", headers=H, timeout=25)
print("GET /user:", r.status_code)
if r.status_code == 200:
    u = r.json(); print("  login:", u.get("login"), "public_repos:", u.get("public_repos"))

r = s.get("https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery", headers=H, timeout=25)
print("GET repo:", r.status_code, (r.json().get("private") if r.status_code==200 else r.text[:150]))

body = json.dumps({"content": base64.b64encode(b"probe").decode(), "encoding": "base64"})
r = s.post("https://api.github.com/repos/qwdwqfwq/topconf-paper-figure-gallery/git/blobs",
           headers={**H, "Content-Type": "application/json"}, data=body, timeout=25)
print("POST blob:", r.status_code, r.text[:200])
