const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const requests = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/backtest/joint/run')) {
      let body = null;
      try { body = await resp.text(); } catch {}
      requests.push({ url, status: resp.status(), body });
    }
  });
  await page.goto('http://127.0.0.1:3000/backtest.html', { waitUntil: 'networkidle' });
  await page.selectOption('#strategySelect', 'seven_factor');
  await page.waitForTimeout(300);
  const selectedCount = await page.locator('#selectedStocks .stock-tag').count();
  if (selectedCount === 0) {
    const addBtn = page.locator('button:has-text("添加")').first();
    if (await addBtn.count()) {
      await addBtn.click();
      await page.waitForTimeout(200);
    }
  }
  await page.click('#runBacktestBtn');
  await page.waitForTimeout(2500);
  const errorVisible = await page.locator('#error').isVisible().catch(() => false);
  const errorText = errorVisible ? await page.locator('#error').innerText() : '';
  const selectedStocks = await page.locator('#selectedStocks .stock-tag').count();
  const metricTexts = await page.locator('.metric-card .metric-value').evaluateAll(nodes => nodes.map(n => n.textContent.trim()));
  console.log(JSON.stringify({ selectedStocks, errorVisible, errorText, backtestApi: requests[0] || null, metricTexts }, null, 2));
  await page.screenshot({ path: 'temp/screenshots/backtest-recheck-20260327.png', fullPage: true });
  await browser.close();
})();
