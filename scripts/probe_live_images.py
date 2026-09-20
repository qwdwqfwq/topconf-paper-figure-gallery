# -*- coding: utf-8 -*-
"""Scroll the full live gallery and report broken / empty images."""
import json
from playwright.sync_api import sync_playwright

URL = "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/index.html"
PROXY = {"server": "http://127.0.0.1:7897"}
failed_resp = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel="msedge", proxy=PROXY)
    pg = b.new_page(viewport={"width": 1440, "height": 1000})
    def on_resp(r):
        try:
            if r.status >= 400 and ".jpg" in r.url:
                failed_resp.append((r.status, r.url))
        except Exception:
            pass
    pg.on("response", on_resp)
    def on_fail(r):
        try:
            if ".jpg" in r.url:
                failed_resp.append(("REQFAIL", r.url + " " + str(r.failure)))
        except Exception:
            pass
    pg.on("requestfailed", on_fail)
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(3500)
    # scroll to bottom in steps to trigger infinite scroll + lazy load
    last = -1
    for i in range(200):
        h = pg.evaluate("document.body.scrollHeight")
        pg.mouse.wheel(0, 4000)
        pg.wait_for_timeout(250)
        cards = pg.eval_on_selector_all("#gallery .card", "els => els.length")
        if cards == last and i > 4:
            # try scrolling the loader into view a few more times
            pg.wait_for_timeout(800)
            h2 = pg.evaluate("document.body.scrollHeight")
            cards2 = pg.eval_on_selector_all("#gallery .card", "els => els.length")
            if cards2 == last:
                break
        last = cards
    pg.wait_for_timeout(2500)
    stats = pg.evaluate("""() => {
      const imgs = [...document.querySelectorAll('#gallery img')];
      const broken = imgs.filter(i => i.naturalWidth === 0).map(i => i.currentSrc || i.src);
      const tiny = imgs.filter(i => i.naturalWidth > 0 && i.naturalWidth < 60).map(i => (i.currentSrc||i.src));
      return {total: imgs.length, broken: broken, tiny: tiny};
    }""")
    print("cards rendered:", pg.eval_on_selector_all("#gallery .card", "els => els.length"))
    print("img total:", stats["total"])
    print("broken (naturalWidth=0):", len(stats["broken"]))
    for u in stats["broken"][:30]:
        print("  BROKEN", u)
    print("tiny:", len(stats["tiny"]))
    for u in stats["tiny"][:10]:
        print("  TINY", u)
    print("failed image responses:", len(failed_resp))
    for s, u in failed_resp[:30]:
        print("  HTTP", s, u[:160])
    pg.screenshot(path="data/live_full_scroll.png", full_page=False)
    b.close()
