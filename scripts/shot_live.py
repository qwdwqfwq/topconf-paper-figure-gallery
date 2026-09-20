# -*- coding: utf-8 -*-
"""Smoke-test the deployed site (or local) with Edge/Chromium: load, filter,
lightbox; save screenshots to data/live_*.png. Also verifies Playwright works
without downloading Chromium (uses installed Edge channel)."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else \
    "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/index.html"
OUT = Path(__file__).resolve().parents[1] / "data"

use_proxy = URL.startswith("http") and "localhost" not in URL and "127.0.0.1" not in URL
if len(sys.argv) > 2 and sys.argv[2] == "noproxy":
    use_proxy = False
launch_proxy = {"server": "http://127.0.0.1:7897"} if use_proxy else None
with sync_playwright() as p:
    browser = None
    for ch in ("msedge", "chrome", None):
        try:
            kw = {"headless": True, "proxy": launch_proxy} if launch_proxy else {"headless": True}
            if ch: kw["channel"] = ch
            browser = p.chromium.launch(**kw)
            print("channel:", ch, "| proxy:", bool(launch_proxy)); break
        except Exception as e:
            print("channel", ch, "failed:", type(e).__name__)
    assert browser
    pg = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    import time
    last_err = None
    for attempt in range(4):
        try:
            pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
            last_err = None
            break
        except Exception as e:
            last_err = e
            time.sleep(3)
    if last_err:
        raise last_err
    pg.wait_for_timeout(3000)
    pg.screenshot(path=str(OUT / "live_1_landing.png"))
    n_cards = pg.eval_on_selector_all(".card", "els => els.length")
    total = pg.eval_on_selector("#total-figures", "el => el.textContent")
    print("total label:", total, "| cards rendered:", n_cards)
    # lightbox
    pg.click(".card")
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(OUT / "live_2_lightbox.png"))
    title = pg.eval_on_selector("#lb-title", "el => el.textContent")
    paper = pg.eval_on_selector("#lb-paper", "el => el.href")
    print("lightbox title:", title[:80], "| paper:", paper[:80])
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)
    # search
    pg.fill("#search", "diffusion")
    pg.wait_for_timeout(700)
    cnt = pg.eval_on_selector("#result-count", "el => el.textContent")
    pg.screenshot(path=str(OUT / "live_3_search.png"))
    print("search diffusion:", cnt)
    browser.close()
    print("console errors:", errors[:5] if errors else "none")
