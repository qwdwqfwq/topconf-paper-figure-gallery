# -*- coding: utf-8 -*-
"""Identify images that stay unloaded after full scroll."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel="msedge")
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    failed = []
    pg.on("response", lambda r: failed.append((r.status, r.url)) if r.status >= 400 and ".jpg" in r.url else None)
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.wait_for_timeout(2000)
    pg.click('#venue-chips .chip[data-venue="cvpr"]')
    pg.wait_for_timeout(600)
    pg.click('#year-chips .chip[data-year="2025"]')
    pg.wait_for_timeout(1500)
    for _ in range(60):
        pg.evaluate("window.scrollBy(0, Math.round(innerHeight*0.9))")
        pg.wait_for_timeout(350)
        h = pg.evaluate("() => document.body.scrollHeight")
        y = pg.evaluate("() => scrollY + innerHeight")
        if y >= h - 5:
            pg.wait_for_timeout(800)
            if pg.evaluate("() => scrollY + innerHeight >= document.body.scrollHeight - 5"):
                break
    pg.wait_for_timeout(4000)
    info = pg.evaluate("""() => [...document.querySelectorAll('#gallery img')]
      .filter(i => i.naturalWidth === 0)
      .map(i => ({id: i.closest('.card').dataset.id, src: (i.getAttribute('src')||'').split('/').pop(),
                  ds: (i.dataset.src||'').split('/').pop(), top: Math.round(i.getBoundingClientRect().top+scrollY),
                  retried: i.dataset.retried||''}))""")
    print("broken:", info)
    print("http failures:", failed)
    b.close()
