const { chromium } = require('playwright');

(async () => {
  let createResponses = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/conditional-order')) {
      let body;
      try { body = await response.json(); } catch { body = { raw: await response.text() }; }
      createResponses.push({ status: response.status(), body });
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('current_account_id', '1');
  });
  await page.goto('http://127.0.0.1:3000/monitor-pool.html', { waitUntil: 'networkidle' });
  await page.locator('.stock-checkbox').first().check();
  await page.evaluate(() => showBatchCreateModal());
  await page.waitForURL(/conditional-order\.html/, { timeout: 5000 });
  await page.waitForSelector('#batch-create-modal.show');
  await page.fill('#batch-conditions-list .condition-row input', '10');
  await page.fill('#batch-position-pct', '10');
  await page.click('#batch-create-modal .button-primary');
  await page.waitForTimeout(1500);
  const listRes = await fetch('http://127.0.0.1:3000/api/conditional-order?account_id=1');
  const listJson = await listRes.json();
  const target = Array.isArray(listJson.data) ? listJson.data.filter(o => o.ts_code === '111111.SZ') : [];
  console.log(JSON.stringify({ afterCount: target.length, createResponses, latest: target[0] || null }));
  await browser.close();
})();
