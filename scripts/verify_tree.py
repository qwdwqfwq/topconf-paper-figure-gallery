# -*- coding: utf-8 -*-
"""Verify remote main tree equals local git ls-files."""
import subprocess, sys
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
REPO = "qwdwqfwq/topconf-paper-figure-gallery"
out = subprocess.run(["git", "credential", "fill"],
                     input="protocol=https\nhost=github.com\n\n",
                     capture_output=True, text=True, cwd=ROOT)
TOKEN = next(ln.split("=", 1)[1] for ln in out.stdout.splitlines() if ln.startswith("password="))
H = {"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json",
     "User-Agent": "gallery-pusher"}
S = requests.Session(); S.trust_env = False

ref = S.get(f"https://api.github.com/repos/{REPO}/git/ref/heads/main", headers=H).json()
sha = ref["object"]["sha"]
commit = S.get(f"https://api.github.com/repos/{REPO}/commits/{sha}", headers=H).json()
tree_sha = commit["commit"]["tree"]["sha"]
paths = set()
r = S.get(f"https://api.github.com/repos/{REPO}/git/trees/{tree_sha}?recursive=1", headers=H).json()
assert not r.get("truncated"), "truncated"
for t in r["tree"]:
    if t["type"] == "blob":
        paths.add(t["path"])
local = set(subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                           text=True).stdout.splitlines())
print("remote blobs:", len(paths), "local files:", len(local))
print("only remote:", len(paths - local))
for p in sorted(paths - local)[:10]: print("  R+", p)
print("only local:", len(local - paths))
for p in sorted(local - paths)[:10]: print("  L+", p)
print("HEAD:", sha, commit["commit"]["message"].splitlines()[0])
