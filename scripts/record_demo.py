# -*- coding: utf-8 -*-
"""Record a real UI demo of the gallery -> docs/demo.gif with Playwright.

Scenario (~26 s): masonry browse -> venue filter -> type a search -> open
lightbox -> arrow through figures -> close -> reset.

Usage:
    1) python -m http.server 8765  (in repo root)
    2) python scripts/record_demo.py
"""
import io, time
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = "http://localhost:8765/index.html"
W, H = 1440, 900
SHOT_W = 980

frames = []


def grab(page, n=1, hold=0.18):
    for _ in range(n):
        frames.append(Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB"))
        time.sleep(hold)


def type_slowly(page, sel, text, delay=0.12):
    page.eval_on_selector(sel, "el => el.scrollIntoView({block:'center'})")
    page.wait_for_timeout(120)
    page.click(sel)
    page.fill(sel, "")
    for ch in text:
        page.type(sel, ch, delay=delay)


def click_ready(page, sel):
    """Scroll into view then click (toolbar can exceed viewport height)."""
    page.eval_on_selector(sel, "el => el.scrollIntoView({block:'center'})")
    page.wait_for_timeout(150)
    page.click(sel)


def main():
    with sync_playwright() as p:
        browser = None
        for channel in ("msedge", "chrome", None):
            try:
                browser = p.chromium.launch(headless=True, channel=channel) if channel \
                    else p.chromium.launch(headless=True)
                print("launched channel:", channel)
                break
            except Exception as e:
                print("channel", channel, "failed:", type(e).__name__)
        assert browser, "no usable Chromium/Edge/Chrome"
        page = browser.new_page(viewport={"width": W, "height": H},
                                device_scale_factor=1)
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1200)
        grab(page, 6)                                   # landing
        page.mouse.wheel(0, 420); page.wait_for_timeout(300)
        grab(page, 6)                                   # scroll masonry
        page.mouse.wheel(0, -900); page.wait_for_timeout(400)
        # venue filter: CVPR
        click_ready(page, '#venue-chips button[data-venue="cvpr"]')
        page.wait_for_timeout(500)
        grab(page, 7)
        # year filter 2025
        click_ready(page, '#year-chips button[data-year="2025"]')
        page.wait_for_timeout(400)
        grab(page, 5)
        # reset: toggle the active venue/year chips back to All
        click_ready(page, '#year-chips button[data-year="all"]')
        page.wait_for_timeout(300)
        click_ready(page, '#venue-chips button[data-venue="all"]')
        page.wait_for_timeout(400)
        grab(page, 6)
        # search
        type_slowly(page, "#search", "gaussian")
        page.wait_for_timeout(700)
        grab(page, 8)
        # open the first card's lightbox
        page.eval_on_selector(".card", "el => el.scrollIntoView({block:'center'})")
        page.wait_for_timeout(300)
        page.click(".card")
        page.wait_for_timeout(900)
        grab(page, 5)
        # next figure twice
        for _ in range(2):
            page.click("#lb-next")
            page.wait_for_timeout(800)
            grab(page, 5)
        # back once
        page.click("#lb-prev")
        page.wait_for_timeout(700)
        grab(page, 4)
        # close lightbox
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        grab(page, 4)
        # change search term to show agent frameworks
        page.fill("#search", "")
        type_slowly(page, "#search", "agent framework")
        page.wait_for_timeout(800)
        grab(page, 8)
        browser.close()

    print("raw frames:", len(frames))
    # scale + caption bar
    out = []
    for im in frames:
        s = SHOT_W / im.width
        im = im.resize((SHOT_W, int(im.height * s)), Image.LANCZOS)
        out.append(im)
    gif = ROOT / "docs" / "demo.gif"
    # try progressively; shrink if > 9 MB
    FRAME_MS = 340
    for stride, w in ((1, SHOT_W), (2, SHOT_W), (2, 820), (3, 720)):
        seq = out[::stride]
        if w != SHOT_W:
            seq = [im.resize((w, int(im.height * w / SHOT_W)), Image.LANCZOS) for im in seq]
        seq[0].save(gif, save_all=True, append_images=seq[1:], duration=FRAME_MS,
                    loop=0, optimize=False, disposal=2)
        mb = gif.stat().st_size / 1e6
        print(f"stride={stride} w={w} frames={len(seq)} size={mb:.1f}MB dur={len(seq)*FRAME_MS/1000:.1f}s")
        if mb <= 9.0:
            break
    print("saved", gif)


if __name__ == "__main__":
    main()
