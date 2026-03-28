const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  page.setDefaultTimeout(10000);
  const requests = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/backtest/joint/run')) {
      let body = null;
      try { body = await resp.text(); } catch {}
      requests.push({ url, status: resp.status(), body });
    }
  });
  await page.goto('http://127.0.0.1:3000/backtest.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.selectOption('#strategySelect', 'seven_factor');
  await page.waitForTimeout(400);

  const selectedStocks = await page.locator('#selectedStocks .stock-tag').count();
  const hasRunButton = await page.locator('#runBacktestBtn').count();
  if (hasRunButton === 0) throw new Error('run button missing');

  await page.click('#runBacktestBtn');
  await page.waitForTimeout(3000);

  const errorVisible = await page.locator('#error').isVisible().catch(() => false);
  const errorText = errorVisible ? await page.locator('#error').innerText() : '';
  const metricTexts = await page.locator('.metric-card .metric-value').evaluateAll(nodes => nodes.map(n => n.textContent.trim()));
  console.log(JSON.stringify({ selectedStocks, errorVisible, errorText, backtestApi: requests[0] || null, metricTexts }, null, 2));
  await page.screenshot({ path: 'temp/screenshots/backtest-recheck-fast-20260327.png', fullPage: true });
  await browser.close();
})();
