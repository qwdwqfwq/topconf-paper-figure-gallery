# -*- coding: utf-8 -*-
"""Find a Clash node that can actually TLS-reach openreview, set it on the
Default Proxy / Research + AI groups, and verify via requests."""
import json, time, urllib.parse, urllib.request
import requests

CTRL = "http://127.0.0.1:9097"
PROXY = "http://127.0.0.1:7897"
NODES = ["Premium", "US", "Express", "Auto",
         "US-Dedicated-B1-1", "US-Dedicated-B1-2", "US-Dedicated-B1-3", "US-Dedicated-B1-4",
         "US-Dedicated-B1-5", "US-Dedicated-B1-6", "US-Dedicated-B1-7", "US-Dedicated-B1-8",
         "JP-Dedicated-B1-1", "JP-Dedicated-B1-2", "JP-Dedicated-B1-3",
         "Fast-B1-1", "Fast-B1-2", "Fast-B1-3", "Fast-B1-4", "Fast-B1-5", "Fast-B1-6",
         "Balancer-B1-1", "Balancer-B1-2", "Balancer-B1-3"]

def ctrl(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(CTRL + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read()[:200]
    except Exception as e:
        return None, str(e)[:80]

def set_node(group, node):
    ctrl("/proxies/" + urllib.parse.quote(group) + "", "PUT", {"name": node})

def req_test():
    try:
        r = requests.get("https://openreview.net/", proxies={"http": PROXY, "https": PROXY},
                         timeout=15)
        return r.status_code, len(r.content)
    except Exception as e:
        return None, str(e)[:60]

for n in NODES:
    enc = urllib.parse.quote(n)
    try:
        with urllib.request.urlopen(
                f"{CTRL}/proxies/{enc}/delay?url=https://openreview.net/&timeout=7000",
                timeout=12) as r:
            delay = json.loads(r.read()).get("delay")
    except Exception:
        continue
    set_node("Default Proxy", n)
    set_node("Research + AI", n)
    time.sleep(1.0)
    code, info = req_test()
    print(f"{n}: clash={delay}ms requests={code} {info}", flush=True)
    if code == 200:
        print("SELECTED", n)
        break
