const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const responses = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/iteration/start') || url.includes('/api/iteration/versions/')) {
      let body = null;
      try { body = await resp.json(); } catch {}
      responses.push({ url, status: resp.status(), body });
    }
  });
  await page.goto('http://127.0.0.1:3000/iteration-manager.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const hasStrategySelect = await page.locator('select').count();
  const hasVersionList = await page.locator('#versionList').count();
  const startBtn = page.locator('button:has-text("开始自迭代")').first();
  if (await startBtn.count()) {
    await startBtn.click();
    await page.waitForTimeout(3000);
  }
  const rows = await page.locator('#versionList tr, #versionList .version-item').count().catch(() => 0);
  console.log(JSON.stringify({ hasStrategySelect, hasVersionList, responses, rows }, null, 2));
  await page.screenshot({ path: 'temp/screenshots/iteration-e2e-20260327.png', fullPage: true });
  await browser.close();
})();
