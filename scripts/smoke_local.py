# -*- coding: utf-8 -*-
"""Local smoke test: six-venue filters, search, lightbox, console errors."""
from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="msedge")
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
    page.goto("http://localhost:8765/index.html", wait_until="networkidle")
    page.wait_for_timeout(800)
    total = page.eval_on_selector("#total-figures", "el => el.textContent")
    print("total label:", total)
    for v in ("iclr", "icml", "neurips", "cvpr", "acl", "aaai"):
        page.click(f'#venue-chips button[data-venue="{v}"]')
        page.wait_for_timeout(250)
        cnt = page.eval_on_selector("#result-count", "el => el.textContent.trim()")
        cards = page.eval_on_selector_all("#gallery .card", "els => els.length")
        print(v, "->", cnt[:60], "| cards rendered:", cards)
        page.click('#venue-chips button[data-venue="all"]')
        page.wait_for_timeout(150)
    # search
    page.fill("#search", "gaussian")
    page.wait_for_timeout(500)
    print("search gaussian:", page.eval_on_selector("#result-count", "el => el.textContent.trim()")[:60])
    page.fill("#search", "")
    page.wait_for_timeout(300)
    # lightbox
    page.eval_on_selector(".card", "el => el.scrollIntoView({block:'center'})")
    page.click(".card")
    page.wait_for_timeout(600)
    lb = page.is_visible("#lightbox")
    title = page.eval_on_selector("#lb-title", "el => el.textContent") if page.query_selector("#lb-title") else "n/a"
    print("lightbox visible:", lb, "| title:", title[:70])
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    print("lightbox closed:", not page.is_visible("#lightbox"))
    browser.close()
print("console errors:", len(errors))
for e in errors[:10]:
    print("ERR", e[:160])
