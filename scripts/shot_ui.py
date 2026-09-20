# -*- coding: utf-8 -*-
"""Local UI QA shots: landing, scrolled (sticky bar), filter, lightbox, mobile."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765/index.html"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel="msedge")
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.wait_for_timeout(3500)
    pg.screenshot(path="data/ui_landing.png")
    # measure header footprint
    h = pg.evaluate("""() => {
      const hero = document.querySelector('.hero').getBoundingClientRect();
      const bar = document.querySelector('.stickbar').getBoundingClientRect();
      return {hero: Math.round(hero.height), bar: Math.round(bar.height),
              firstRowCards: (() => { const r=[...document.querySelectorAll('.card')].map(c=>Math.round(c.getBoundingClientRect().top)); return [...new Set(r)].slice(0,3);})()};
    }""")
    print("layout:", h)
    # scroll down: hero should scroll away, sticky bar remains
    pg.evaluate("window.scrollTo(0, 1200)")
    pg.wait_for_timeout(1500)
    pg.screenshot(path="data/ui_scrolled.png")
    # filter CVPR + 2025
    pg.evaluate("window.scrollTo(0,0)")
    pg.wait_for_timeout(500)
    pg.click('#venue-chips .chip[data-venue="cvpr"]')
    pg.wait_for_timeout(900)
    pg.click('#year-chips .chip[data-year="2025"]')
    pg.wait_for_timeout(2500)
    pg.screenshot(path="data/ui_filter.png")
    cnt = pg.text_content("#result-count")
    print("cvpr2025 count:", cnt)
    # lightbox
    pg.click(".card")
    pg.wait_for_timeout(1200)
    pg.screenshot(path="data/ui_lightbox.png")
    pg.keyboard.press("Escape")
    # mobile
    pg2 = b.new_page(viewport={"width": 390, "height": 844})
    pg2.goto(BASE, wait_until="domcontentloaded")
    pg2.wait_for_timeout(3000)
    pg2.screenshot(path="data/ui_mobile.png")
    # lazy load audit after human-speed scroll to bottom
    pg.evaluate("window.scrollTo(0,0)")
    pg.wait_for_timeout(800)
    for _ in range(60):
        pg.evaluate("window.scrollBy(0, Math.round(innerHeight*0.9))")
        pg.wait_for_timeout(450)
        if pg.eval_on_selector_all("#gallery .card", "e=>e.length") >= 2298:
            break
    pg.wait_for_timeout(2500)
    st = pg.evaluate("""() => {
      const im=[...document.querySelectorAll('#gallery img')];
      return {total:im.length, broken:im.filter(i=>i.naturalWidth===0).length,
        failed:im.filter(i=>i.parentElement.classList.contains('img-failed')).length};
    }""")
    print("lazy audit:", st)
    print("console errors:", errs[:10])
    b.close()
