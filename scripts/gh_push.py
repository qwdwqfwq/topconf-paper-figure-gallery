# -*- coding: utf-8 -*-
"""Resilient push of the working tree to GitHub via the Data API.

api.github.com is reachable directly in this environment while git's TLS
handshake is reset, so every file goes up as a blob, then one tree/commit is
created and heads/main updated.

Features:
  * blob uploads are cached in data/gh_blobs.json (content-addressed by sha1
    of file bytes), so interrupted runs resume and re-pushes are incremental;
  * ConnectionError / 5xx / abuse limits are retried with backoff;
  * final tree/commit/update retried as well.

Usage: python gh_push.py [probe|push] [workers]
"""
import base64, hashlib, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
REPO = "qwdwqfwq/topconf-paper-figure-gallery"
API = f"https://api.github.com/repos/{REPO}"
CACHE = ROOT / "data" / "gh_blobs.json"
COMMIT_MSG = sys.argv[3] if len(sys.argv) > 3 else "v0.3: launch figure gallery"

out = subprocess.run(["git", "credential", "fill"],
                     input="protocol=https\nhost=github.com\n\n",
                     capture_output=True, text=True, cwd=ROOT)
TOKEN = next((ln.split("=", 1)[1] for ln in out.stdout.splitlines()
              if ln.startswith("password=")), None)
assert TOKEN, "no token"
S = requests.Session()
# Route through the local Clash proxy when argv has "proxy" (use with Clash
# global mode) or GH_PROXY=1; otherwise connect directly.
_use_proxy = ("proxy" in sys.argv[3:]) or (os.environ.get("GH_PROXY") == "1")
if _use_proxy:
    S.trust_env = False
    S.proxies = {"http": "http://127.0.0.1:7897", "https": "http://127.0.0.1:7897"}
    print("pushing via local Clash proxy")
else:
    S.trust_env = False
H = {"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json",
     "User-Agent": "gallery-pusher", "X-GitHub-Api-Version": "2022-11-28"}


def req(method, url, max_tries=7, **kw):
    for i in range(max_tries):
        try:
            r = S.request(method, url, headers=H, timeout=120, **kw)
            if r.status_code in (429, 500, 502, 503, 504) or \
               (r.status_code == 403 and ("rate limit" in r.text.lower()
                                          or "abuse" in r.text.lower())):
                ra = r.headers.get("Retry-After")
                wait = int(ra) if ra and ra.isdigit() else min(2 ** i * 2, 90)
                print(f"  {method} {url.rsplit('/', 1)[-1]} -> {r.status_code}, sleep {wait}s",
                      flush=True)
                time.sleep(wait)
                continue
            return r
        except (requests.ConnectionError, requests.Timeout) as e:
            wait = min(2 ** i * 2, 60)
            print(f"  conn error {type(e).__name__}, retry in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"{method} {url} failed after retries")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "probe"
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    r = req("GET", API + "/git/ref/heads/main")
    print("ref main:", r.status_code)
    parent = None
    if r.status_code == 200:
        parent = r.json()["object"]["sha"]
        print("parent:", parent)
    r = req("POST", API + "/git/blobs", json={"content": "probe", "encoding": "utf-8"})
    print("blob probe:", r.status_code)
    if mode == "probe":
        sys.exit(0)

    files = subprocess.run(["git", "ls-files"], cwd=ROOT,
                           capture_output=True, text=True).stdout.splitlines()
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    print("files:", len(files), "| cached blobs:", len(cache), flush=True)

    def blob(path):
        data = (ROOT / path).read_bytes()
        key = hashlib.sha1(data).hexdigest()
        if key in cache:
            return {"path": path.replace("\\", "/"), "mode": "100644",
                    "type": "blob", "sha": cache[key]}
        rr = req("POST", API + "/git/blobs",
                 json={"content": base64.b64encode(data).decode(), "encoding": "base64"})
        if rr.status_code not in (200, 201):
            raise RuntimeError(f"{path}: {rr.status_code} {rr.text[:200]}")
        return {"path": path.replace("\\", "/"), "mode": "100644",
                "type": "blob", "sha": rr.json()["sha"], "_key": key}

    entries, done = [], 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        fs = {ex.submit(blob, p): p for p in files}
        for fut in as_completed(fs):
            e = fut.result()
            if "_key" in e:
                cache[e.pop("_key")] = e["sha"]
            entries.append(e)
            done += 1
            if done % 50 == 0:
                CACHE.write_text(json.dumps(cache), encoding="utf-8")
                print("blobs", done, "/", len(files), flush=True)
    CACHE.write_text(json.dumps(cache), encoding="utf-8")
    print("all blobs up:", len(entries), flush=True)

    # Build the tree in chunks with base_tree: a single 2000+ entry tree POST
    # times out at GitHub's gateway (504), while ~400-entry chunks succeed.
    CHUNK = 400
    tree_sha = parent
    for i in range(0, len(entries), CHUNK):
        chunk = entries[i:i + CHUNK]
        body = {"tree": chunk}
        if tree_sha:
            body["base_tree"] = tree_sha
        tree = req("POST", API + "/git/trees", json=body)
        if tree.status_code not in (200, 201):
            raise RuntimeError(tree.text[:1000])
        tree_sha = tree.json()["sha"]
        print(f"tree chunk {i + len(chunk)}/{len(entries)} -> {tree_sha[:8]}", flush=True)
    commit = req("POST", API + "/git/commits",
                 json={"message": COMMIT_MSG, "tree": tree_sha,
                       **({"parents": [parent]} if parent else {})})
    if commit.status_code not in (200, 201):
        raise RuntimeError(commit.text[:1000])
    csha = commit.json()["sha"]
    if parent:
        ref = req("PATCH", API + "/git/refs/heads/main", json={"sha": csha, "force": True})
    else:
        ref = req("POST", API + "/git/refs", json={"ref": "refs/heads/main", "sha": csha})
    print("publish:", ref.status_code, csha, flush=True)
