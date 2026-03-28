const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  page.setDefaultTimeout(15000);
  const apiResults = [];
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/select?')) {
      let body = null;
      try { body = await resp.json(); } catch {}
      apiResults.push({ status: resp.status(), body });
    }
  });
  await page.goto('http://127.0.0.1:3000/select.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const strategyOptions = await page.locator('#configStrategy option').evaluateAll(nodes => nodes.map(n => n.value).filter(Boolean));
  await page.click('button:has-text("参数配置")');
  await page.waitForTimeout(300);
  await page.fill('#configMinScore', '0');
  await page.selectOption('#configStrategy', 'seven_factor');
  await page.click('button:has-text("应用并刷新")');
  await page.waitForTimeout(5000);
  const cards = await page.locator('.stock-card').count().catch(() => 0);
  console.log(JSON.stringify({ strategyOptions, api: apiResults[apiResults.length - 1] || null, cards }, null, 2));
  await page.screenshot({ path: 'temp/screenshots/select-e2e-20260327.png', fullPage: true });
  await browser.close();
})();
