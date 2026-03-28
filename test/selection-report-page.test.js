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

  await page.goto(`http://127.0.0.1:3000/selection-report.html?id=${reportId}`, {
    waitUntil: 'networkidle'
  });

  const bodyText = await page.locator('body').innerText();
  assert.ok(bodyText.includes('选股报告') || bodyText.includes('报告概览'), '详情页应显示报告标题或概览');
  assert.ok(bodyText.includes('2026') || bodyText.includes('20260324'), '详情页应显示 trade_date');
  assert.ok(bodyText.includes('选中') || bodyText.includes('推荐股票'), '详情页应显示选中股票数量');

  const stockItems = await page.locator('[data-role=\"selected-stock-item\"]').count();
  assert.ok(stockItems >= 1, '详情页应至少显示一条 selected_stocks 记录');

  await browser.close();
  console.log('✅ selection-report page test passed');
}

main().catch((error) => {
  console.error(`❌ selection-report page test failed: ${error.message}`);
  process.exit(1);
});
