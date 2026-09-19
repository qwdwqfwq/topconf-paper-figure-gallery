# -*- coding: utf-8 -*-
"""Probe arXiv comment-search pool sizes for venue-year bulk pulls."""
import urllib.request, urllib.parse, time, re

def probe(phrase):
    q = urllib.parse.quote(f'co:"{phrase}"')
    url = f"http://export.arxiv.org/api/query?search_query={q}&start=0&max_results=1"
    req = urllib.request.Request(url, headers={"User-Agent": "research-gallery/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        txt = r.read().decode("utf-8", "ignore")
    total = int(re.search(r"opensearch:totalResults[^>]*>(\d+)<", txt).group(1))
    return total

for phrase in ["ICLR 2025", "ICLR 2024", "ICLR 2023", "NeurIPS 2025", "ICML 2025"]:
    try:
        print(phrase, "->", probe(phrase))
    except Exception as e:
        print(phrase, "ERR", e)
    time.sleep(3.5)
