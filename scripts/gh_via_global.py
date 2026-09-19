# -*- coding: utf-8 -*-
"""Switch Clash to global mode on a US node that reaches GitHub, verify."""
import json, time, urllib.request, urllib.parse
import requests

CTRL = "http://127.0.0.1:9097"
PROXY = "http://127.0.0.1:7897"


def ctrl(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(CTRL + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, r.read()


st, body = ctrl("/configs")
cfg = json.loads(body)
print("mode before:", cfg.get("mode"))

NODES = ["US-Dedicated-B1-8", "US-Dedicated-B1-5", "US-Dedicated-B1-7",
         "Fast-B1-2", "Balancer-B1-1", "Auto"]

ctrl("/configs", "PATCH", {"mode": "global"})
# GLOBAL selector holds the chosen node
for n in NODES:
    ctrl("/proxies/GLOBAL", "PUT", {"name": n})
    time.sleep(1.2)
    try:
        r = requests.get("https://api.github.com/rate_limit",
                         proxies={"http": PROXY, "https": PROXY}, timeout=15)
        print(n, "->", r.status_code)
        if r.status_code == 200:
            print("GLOBAL-SELECTED", n)
            break
    except Exception as e:
        print(n, "-> ERR", type(e).__name__)
