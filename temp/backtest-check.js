const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.on('dialog', async (dialog) => {
    try {
      await dialog.accept();
    } catch {}
  });

  let selectionApi = null;
  let backtestApi = null;

  page.on('response', async (resp) => {
    const url = resp.url();
    try {
      if (url.includes('/api/select?')) {
        selectionApi = { url, status: resp.status(), body: await resp.json() };
      }
      if (url.includes('/api/backtest/joint/run')) {
        backtestApi = { url, status: resp.status(), body: await resp.json() };
      }
    } catch {}
  });

  await page.goto('http://127.0.0.1:3000/backtest.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('#coreSlider').evaluate((el) => {
    el.value = '60';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#satelliteSlider').evaluate((el) => {
    el.value = '40';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.selectOption('#strategySelect', 'seven_factor');
  await page.locator('details.selection-config').evaluate((el) => {
    el.open = true;
  });
  await page.fill('#selectionLimit', '5');
  await page.fill('#selectionMinScore', '0');
  await page.click('#runSelectionBtn');
  await page.waitForResponse((r) => r.url().includes('/api/select?'), { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2500);

  const applyBtn = page.getByRole('button', { name: /应用到已选股票/ });
  if ((await applyBtn.count()) > 0) {
    await applyBtn.click();
  }
  await page.waitForTimeout(800);

  const selectedStockCount = parseInt(((await page.locator('#stockCount').textContent()) || '0').trim(), 10) || 0;
  const hasMaxPositionInput = (await page.locator('#maxPosition').count()) > 0;

  await page.getByRole('button', { name: /^开始回测$/ }).click();
  await page.waitForTimeout(2000);

  const errorVisible = await page.locator('#error').isVisible().catch(() => false);
  const errorText = await page.locator('#error').textContent().catch(() => '');
  const resultContainerVisible = await page.locator('#resultContainer').isVisible().catch(() => false);
  const metricIds = ['totalReturn', 'returnRate', 'annualizedReturn', 'maxDrawdown', 'sharpeRatio', 'calmarRatio', 'winRate', 'profitLossRatio', 'tradeCount'];
  const metricValues = {};
  for (const id of metricIds) {
    metricValues[id] = await page.locator(`#${id}`).textContent().catch(() => null);
  }

  await page.screenshot({ path: 'temp/screenshots/backtest-results-20260327.png', fullPage: true });

  console.log(
    JSON.stringify(
      {
        selectedStockCount,
        hasMaxPositionInput,
        selectionApi,
        backtestApi,
        errorVisible,
        errorText,
        resultContainerVisible,
        metricValues
      },
      null,
      2
    )
  );

  await browser.close();
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
