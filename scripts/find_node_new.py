# -*- coding: utf-8 -*-
"""Benchmark Clash nodes against the three new-venue hosts and select the
fastest node that can TLS-reach all of CVF / ACL / AAAI.

Switches both 'Default Proxy' and 'Research + AI' groups like find_node.py.
Usage: python scripts/find_node_new.py [node1 node2 ...]
"""
import json, sys, time, urllib.parse, urllib.request
import requests
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CTRL = "http://127.0.0.1:9097"
PROXY = "http://127.0.0.1:7897"
NODES = sys.argv[1:] or [
    "US-Dedicated-B1-1", "US-Dedicated-B1-2", "US-Dedicated-B1-3", "US-Dedicated-B1-4",
    "US-Dedicated-B1-5", "US-Dedicated-B1-6", "US-Dedicated-B1-7", "US-Dedicated-B1-8",
    "Fast-B1-1", "Fast-B1-2", "Fast-B1-3", "Balancer-B1-1", "JP-Dedicated-B1-1",
]


def pool_url(venue, k=200):
    import json as j
    lines = (ROOT / f"data/pool/{venue}_2023_2025.jsonl").read_text(encoding="utf-8").splitlines()
    # tier-1 first; pick a mid-list file that is usually modest in size
    rows = [j.loads(x) for x in lines if j.loads(x)["tier"] == 1]
    return rows[k]["pdf"]


TARGETS = {"cvf": pool_url("cvpr"), "acl": pool_url("acl"), "aaai": pool_url("aaai")}


def ctrl(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(CTRL + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, r.read()


def set_node(group, node):
    ctrl("/proxies/" + urllib.parse.quote(group), "PUT", {"name": node})


def probe(url, cap_mb=3.0, timeout=45):
    """Stream up to cap_mb; return (ok, MB/s)."""
    t0 = time.time()
    got = 0
    try:
        with requests.get(url, proxies={"http": PROXY, "https": PROXY}, stream=True,
                          timeout=20, headers={"User-Agent": "Mozilla/5.0"}) as r:
            if r.status_code != 200:
                return False, f"http {r.status_code}"
            for chunk in r.iter_content(1 << 16):
                got += len(chunk)
                if got >= cap_mb * 1e6 or time.time() - t0 > timeout:
                    break
        dt = max(1e-6, time.time() - t0)
        if got < 200_000:
            return False, f"only {got//1024}KB"
        return True, got / 1e6 / dt
    except Exception as e:
        return False, type(e).__name__


results = []
for n in NODES:
    try:
        enc = urllib.parse.quote(n)
        with urllib.request.urlopen(
                f"{CTRL}/proxies/{enc}/delay?url=https://www.google.com/generate_204&timeout=5000",
                timeout=9) as r:
            clash_delay = json.loads(r.read()).get("delay")
    except Exception:
        continue
    try:
        set_node("Default Proxy", n)
        set_node("Research + AI", n)
    except Exception:
        continue
    time.sleep(1.2)
    scores, msgs = {}, []
    for host, u in TARGETS.items():
        ok, val = probe(u)
        if not ok:
            msgs.append(f"{host}={val}")
            scores[host] = 0.0
        else:
            scores[host] = val
    if msgs:
        print(f"{n}: clash={clash_delay}ms FAIL {' '.join(msgs)}", flush=True)
    else:
        total = sum(scores.values())
        print(f"{n}: clash={clash_delay}ms cvf={scores['cvf']:.2f} acl={scores['acl']:.2f} "
              f"aaai={scores['aaai']:.2f} MB/s total={total:.2f}", flush=True)
        results.append((total, n, scores))

results.sort(reverse=True)
if results:
    _, best, sc = results[0]
    set_node("Default Proxy", best)
    set_node("Research + AI", best)
    print(f"SELECTED {best} {sc}", flush=True)
else:
    print("NO NODE passed all three hosts", flush=True)
