#!/usr/bin/env node

const assert = require('node:assert');
const { chromium } = require('playwright');

async function request(path) {
  const response = await fetch(`http://127.0.0.1:3000${path}`);
  const payload = await response.json();
  return { status: response.status, payload };
}

async function main() {
  const historyRes = await request('/api/selection/history?limit=1');
  assert.equal(historyRes.status, 200, '历史 API 应返回 200');
  assert.equal(historyRes.payload.success, true, '历史 API 应返回 success=true');
  assert.ok(Array.isArray(historyRes.payload.data) && historyRes.payload.data.length >= 1, '历史 API 应至少返回一条记录');

  const reportId = historyRes.payload.data[0].report_id;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1:3000/selection-history.html', {
    waitUntil: 'networkidle'
  });

  await page.waitForSelector('.report-card');
  page.on('dialog', async (dialog) => {
    await dialog.dismiss();
  });

  await page.locator('.report-actions .btn-secondary').first().click();
  await page.waitForURL(new RegExp(`backtest\\.html\\?import=selection-report&id=${reportId}`), {
    timeout: 5000
  });
  await page.waitForFunction(() => {
    const countEl = document.getElementById('stockCount');
    return countEl && Number(countEl.textContent) > 0;
  });

  const selectedText = await page.locator('#selectedStocks').innerText();
  assert.ok(selectedText.length > 0, '导入回测后应出现已选股票');

  await browser.close();
  console.log('✅ selection-history import backtest test passed');
}

main().catch((error) => {
  console.error(`❌ selection-history import backtest test failed: ${error.message}`);
  process.exit(1);
});
