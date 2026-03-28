#!/usr/bin/env node

const assert = require('node:assert');
const { chromium } = require('playwright');

async function request(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function main() {
  const stock = {
    stock_code: '111111.SZ',
    stock_name: '测试反馈股',
    strategySource: 'strategy_config',
    strategyConfigId: 999,
    strategyConfigName: '七因子高分策略（导入副本）',
    templateId: 888,
    templateName: '七因子高分策略模板'
  };

  await request('/api/monitor-pool/remove', {
    method: 'DELETE',
    body: JSON.stringify({ stock_code: stock.stock_code })
  });

  const addRes = await request('/api/monitor-pool/add', {
    method: 'POST',
    body: JSON.stringify(stock)
  });
  assert.equal(addRes.payload.success, true, '测试准备：监控池写入应成功');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
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
  await browser.close();

  const listRes = await request('/api/conditional-order?account_id=1');
  const target = Array.isArray(listRes.payload.data)
    ? listRes.payload.data.filter((order) => order.ts_code === stock.stock_code)
    : [];

  assert.ok(target.length >= 1, '应成功从监控池批量创建条件单');
  assert.equal(target[0].strategy_source, 'strategy_config', '新条件单应保留 strategy_source');
  assert.equal(target[0].strategy_config_id, 999, '新条件单应保留 strategy_config_id');
  assert.equal(target[0].template_id, 888, '新条件单应保留 template_id');

  console.log('✅ monitor-to-conditional browser smoke test passed');
}

main().catch((error) => {
  console.error(`❌ monitor-to-conditional browser smoke test failed: ${error.message}`);
  process.exit(1);
});
