const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('current_account_id', '1');
  });
  await page.goto('http://127.0.0.1:3000/monitor-pool.html', { waitUntil: 'networkidle' });
  await page.locator('.stock-checkbox').first().check();
  await page.evaluate(() => showBatchCreateModal());
  await page.waitForURL(/conditional-order\.html/, { timeout: 5000 });
  await page.waitForTimeout(500);
  const payload = await page.evaluate(() => (window.batchCreateStocks || [])[0] || null);
  console.log(JSON.stringify(payload));
  await browser.close();
})();
