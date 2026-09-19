# -*- coding: utf-8 -*-
"""Full smoke of the deployed site: six-venue filters, search, lightbox."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else \
    "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/index.html"
OUT = Path(__file__).resolve().parents[1] / "data"
use_proxy = "localhost" not in URL and "127.0.0.1" not in URL
launch_proxy = {"server": "http://127.0.0.1:7897"} if use_proxy else None

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="msedge", proxy=launch_proxy)
    pg = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
    pg.goto(URL, wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(1200)
    print("total:", pg.eval_on_selector("#total-figures", "el => el.textContent"))
    for v in ("iclr", "icml", "neurips", "cvpr", "acl", "aaai"):
        pg.click(f'#venue-chips button[data-venue="{v}"]')
        pg.wait_for_timeout(250)
        print(v, "->", pg.eval_on_selector("#result-count", "el => el.textContent.trim()")[:70])
        pg.click('#venue-chips button[data-venue="all"]')
        pg.wait_for_timeout(120)
    pg.fill("#search", "diffusion")
    pg.wait_for_timeout(500)
    print("search diffusion:", pg.eval_on_selector("#result-count", "el => el.textContent.trim()")[:70])
    pg.fill("#search", "")
    pg.wait_for_timeout(300)
    pg.eval_on_selector(".card", "el => el.scrollIntoView({block:'center'})")
    pg.click(".card")
    pg.wait_for_timeout(700)
    print("lightbox:", pg.is_visible("#lightbox"),
          "| title:", pg.eval_on_selector("#lb-title", "el => el.textContent")[:70])
    pg.screenshot(path=str(OUT / "live_2_lightbox.png"))
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)
    print("closed:", not pg.is_visible("#lightbox"))
    browser.close()
    print("console errors:", len(errors))
    for e in errors[:8]:
        print("ERR", e[:150])
