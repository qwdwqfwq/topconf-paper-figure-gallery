# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, xml.etree.ElementTree as ET
ATOM = "{http://www.w3.org/2005/Atom}"
q = urllib.parse.quote('co:"NeurIPS 2025"')
url = f"http://export.arxiv.org/api/query?search_query={q}&start=0&max_results=8"
req = urllib.request.Request(url, headers={"User-Agent": "research-gallery/1.0"})
raw = urllib.request.urlopen(req, timeout=60).read()
root = ET.fromstring(raw)
for e in root.findall(f"{ATOM}entry"):
    title = " ".join(e.find(f"{ATOM}title").text.split())[:60]
    c = e.find(f"{ATOM}comment")
    print(repr(c.text[:120] if c is not None and c.text else None), "|", title)
