// From the repo root, run python -m http.server --bind localhost.
// With Playwright installed, run node scripts/test-gallery-favorites.cjs [gallery URL].
// Set CHROME_CHANNEL=chrome to use a locally installed Chrome.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.REVISION_PLAYWRIGHT || 'playwright');

async function main() {
  const url = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL });
  try {
    const page = await browser.newPage({ locale: 'en-US', reducedMotion: 'reduce' });
    await page.goto(url);
    const cards = page.locator('#gallery .card');
    const first = cards.nth(0);
    const second = cards.nth(1);
    const firstId = await first.getAttribute('data-id');
    const secondId = await second.getAttribute('data-id');
    const save = first.locator('.card-favorite');
    await save.press('Enter');
    assert.equal(await save.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#lightbox').isHidden(), true);
    assert.equal(new URL(page.url()).hash, '');

    await second.locator('.card-link').click();
    const detailSave = page.locator('#lb-favorite');
    await detailSave.click();
    assert.equal(await detailSave.getAttribute('aria-pressed'), 'true');
    const paper = await page.locator('#lb-paper').getAttribute('href');
    const image = await page.locator('#lb-image').getAttribute('href');
    assert.match(paper, /^https?:\/\//);
    assert.ok(image);
    await page.locator('#lb-close').click();

    await page.locator('#collection-nav').click();
    assert.equal(new URL(page.url()).searchParams.get('view'), 'favorites');
    await page.reload();
    await page.locator('#favorites-heading').waitFor();
    assert.deepEqual(await cards.evaluateAll(items => items.map(card => card.dataset.id)), [firstId, secondId]);
    await second.locator('.card-link').click();
    assert.equal(await page.locator('#lb-paper').getAttribute('href'), paper);
    assert.equal(await page.locator('#lb-image').getAttribute('href'), image);
    await detailSave.click();
    assert.equal(await detailSave.getAttribute('aria-pressed'), 'false');
    await page.locator('#lb-close').click();
    assert.equal(await cards.count(), 1);
    assert.equal(await first.getAttribute('data-id'), firstId);
    await save.press('Space');
    await page.locator('#empty').waitFor();
    assert.equal(await cards.count(), 0);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
