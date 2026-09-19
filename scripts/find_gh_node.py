# -*- coding: utf-8 -*-
"""Find a Clash node that can TLS-reach api.github.com, switch both groups."""
import json, time, urllib.parse, urllib.request
import requests

CTRL = "http://127.0.0.1:9097"
PROXY = "http://127.0.0.1:7897"
NODES = ["US-Dedicated-B1-1", "US-Dedicated-B1-2", "US-Dedicated-B1-3", "US-Dedicated-B1-4",
         "US-Dedicated-B1-5", "US-Dedicated-B1-6", "US-Dedicated-B1-7",
         "Fast-B1-1", "Fast-B1-2", "Fast-B1-3", "Fast-B1-4", "Balancer-B1-1",
         "JP-Dedicated-B1-2", "JP-Dedicated-B1-3", "Premium", "US", "Express", "Auto"]


def ctrl(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(CTRL + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status


def set_node(group, node):
    ctrl("/proxies/" + urllib.parse.quote(group), "PUT", {"name": node})


def test():
    try:
        r = requests.get("https://api.github.com/rate_limit",
                         proxies={"http": PROXY, "https": PROXY}, timeout=12)
        return r.status_code
    except Exception as e:
        return type(e).__name__


for n in NODES:
    try:
        set_node("Default Proxy", n)
        set_node("Research + AI", n)
    except Exception:
        continue
    time.sleep(1.0)
    code = test()
    print(n, "->", code, flush=True)
    if code == 200:
        print("SELECTED", n, flush=True)
        break
