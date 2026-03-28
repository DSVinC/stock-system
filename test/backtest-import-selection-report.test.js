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
  const reportRes = await request(`/api/selection/report/${reportId}`);
  assert.equal(reportRes.status, 200, '报告详情 API 应返回 200');
  assert.equal(reportRes.payload.success, true, '报告详情 API 应返回 success=true');

  const firstStock = reportRes.payload.data?.selected_stocks?.[0];
  assert.ok(firstStock, '历史报告应至少包含一条 selected_stocks');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:3000/backtest.html?import=selection-report&id=${reportId}`, {
    waitUntil: 'networkidle'
  });

  await page.waitForFunction(() => {
    const countEl = document.getElementById('stockCount');
    return countEl && Number(countEl.textContent) > 0;
  });

  const selectedText = await page.locator('#selectedStocks').innerText();
  assert.ok(selectedText.includes(firstStock.name), '回测页应显示从历史报告导入的股票名称');
  assert.ok(selectedText.includes(firstStock.ts_code), '回测页应显示从历史报告导入的股票代码');

  await browser.close();
  console.log('✅ backtest import selection report test passed');
}

main().catch((error) => {
  console.error(`❌ backtest import selection report test failed: ${error.message}`);
  process.exit(1);
});
