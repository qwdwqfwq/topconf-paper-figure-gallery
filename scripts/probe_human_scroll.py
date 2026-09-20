# -*- coding: utf-8 -*-
"""Human-speed scroll probe: load each screen fully, report remaining empties."""
from playwright.sync_api import sync_playwright

URL = "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/index.html"
PROXY = {"server": "http://127.0.0.1:7897"}
failed = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel="msedge", proxy=PROXY)
    pg = b.new_page(viewport={"width": 1440, "height": 1000})
    def on_resp(r):
        try:
            if r.status >= 400 and ".jpg" in r.url:
                failed.append((r.status, r.url))
        except Exception:
            pass
    pg.on("response", on_resp)
    pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
    pg.wait_for_timeout(2500)
    # human-like: one viewport per step, wait for this screen's imgs to decode
    for step in range(260):
        pg.evaluate("window.scrollBy(0, Math.round(window.innerHeight*0.95))")
        pg.wait_for_timeout(300)
        # wait for visible images to finish loading
        pg.evaluate("""async () => {
          const vis = [...document.querySelectorAll('#gallery img')].filter(i => {
            const r = i.getBoundingClientRect();
            return r.top < innerHeight + 1800 && r.bottom > -200;
          });
          await Promise.all(vis.map(i => i.complete ? null :
            new Promise(res => { i.addEventListener('load', res, {once:true});
                                 i.addEventListener('error', res, {once:true}); })));
        }""")
        at_bottom = pg.evaluate("() => scrollY + innerHeight >= document.body.scrollHeight - 5")
        cards = pg.eval_on_selector_all("#gallery .card", "els => els.length")
        if at_bottom and cards >= 2298:
            break
    pg.wait_for_timeout(2500)
    stats = pg.evaluate("""() => {
      const imgs = [...document.querySelectorAll('#gallery img')];
      const broken = imgs.filter(i => i.naturalWidth === 0).map(i => ({src:(i.currentSrc||i.src).split('/').pop(),
        top: Math.round(i.getBoundingClientRect().top + scrollY)}));
      return {total: imgs.length, broken};
    }""")
    print("cards:", pg.eval_on_selector_all("#gallery .card", "e=>e.length"))
    print("imgs:", stats["total"], "broken:", len(stats["broken"]))
    for x in stats["broken"][:25]:
        print("  BROKEN", x)
    print("http failures:", len(failed))
    for s, u in failed[:15]:
        print("  HTTP", s, u.split('/')[-1])
    pg.screenshot(path="data/live_human_scroll.png")
    b.close()
