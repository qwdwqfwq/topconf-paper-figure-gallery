# -*- coding: utf-8 -*-
"""Push the working tree to GitHub via the Data API (works when github.com git
TLS is throttled but api.github.com is reachable). Creates blobs concurrently,
builds one tree/commit and updates heads/main.

Usage: python gh_push.py [probe|push]
"""
import base64, json, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
REPO = "qwdwqfwq/topconf-paper-figure-gallery"
API = f"https://api.github.com/repos/{REPO}"

out = subprocess.run(["git", "credential", "fill"],
                     input="protocol=https\nhost=github.com\n\n",
                     capture_output=True, text=True, cwd=ROOT)
TOKEN = next((ln.split("=", 1)[1] for ln in out.stdout.splitlines()
              if ln.startswith("password=")), None)
assert TOKEN, "no token"
S = requests.Session()
S.trust_env = False
H = {"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json",
     "User-Agent": "gallery-pusher"}

def req(method, url, **kw):
    for i in range(5):
        r = S.request(method, url, headers=H, timeout=60, **kw)
        if r.status_code in (429, 500, 502, 503) or (r.status_code == 403 and "rate limit" in r.text.lower()):
            time.sleep(2 ** i * 2)
            continue
        return r
    return r

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "probe"
    r = req("GET", API + "/git/ref/heads/main")
    print("ref main:", r.status_code)
    parent = None
    if r.status_code == 200:
        parent = r.json()["object"]["sha"]
        print("parent:", parent)
    # probe: create a tiny blob
    r = req("POST", API + "/git/blobs", json={"content": "probe", "encoding": "utf-8"})
    print("blob probe:", r.status_code, r.text[:200])
    if mode == "probe":
        sys.exit(0)

    files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
    print("files:", len(files), flush=True)
    def blob(path):
        data = (ROOT / path).read_bytes()
        rr = req("POST", API + "/git/blobs", json={"content": base64.b64encode(data).decode(), "encoding": "base64"})
        if rr.status_code not in (200, 201): raise RuntimeError(f"{path}: {rr.status_code} {rr.text[:200]}")
        return {"path": path.replace('\\','/'), "mode": "100644", "type": "blob", "sha": rr.json()["sha"]}
    entries=[]
    with ThreadPoolExecutor(max_workers=8) as ex:
        fs={ex.submit(blob,p):p for p in files}
        for i,f in enumerate(as_completed(fs),1):
            entries.append(f.result())
            if i % 100 == 0: print("blobs", i, flush=True)
    tree=req("POST", API+"/git/trees", json={"tree":entries})
    if tree.status_code not in (200,201): raise RuntimeError(tree.text)
    commit=req("POST", API+"/git/commits", json={"message":"v0.3: launch figure gallery","tree":tree.json()["sha"], **({"parents":[parent]} if parent else {})})
    if commit.status_code not in (200,201): raise RuntimeError(commit.text)
    ref=req("POST", API+"/git/refs", json={"ref":"refs/heads/main","sha":commit.json()["sha"]}) if not parent else req("PATCH",API+"/git/refs/heads/main",json={"sha":commit.json()["sha"],"force":True})
    print("publish:",ref.status_code,ref.text[:200])
