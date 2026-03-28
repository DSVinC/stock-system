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
    name: '分析链路测试股',
    code: '222222.SZ',
    score: 8.8,
    decision: '买入',
    selected: true
  };

  await request('/api/monitor-pool/remove', {
    method: 'DELETE',
    body: JSON.stringify({ stock_code: stock.code })
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript((payload) => {
    localStorage.setItem('selectedDirections', JSON.stringify([{ name: '算力', score: 9, reason: '测试方向' }]));
    localStorage.setItem('analysisResults', JSON.stringify([payload.stock]));
    localStorage.setItem('stockSelectConfig', JSON.stringify({
      strategySource: 'strategy_config',
      strategyConfigId: 999,
      strategyConfigName: '七因子高分策略（导入副本）',
      templateId: 888,
      templateName: '七因子高分策略模板'
    }));
  }, { stock });

  await page.goto('http://127.0.0.1:3000/analysis.html', { waitUntil: 'networkidle' });

  const bannerText = await page.locator('#strategy-context-banner').innerText();
  assert.ok(bannerText.includes('策略库'), '分析页应显示策略来源');
  assert.ok(bannerText.includes('七因子高分策略（导入副本）'), '分析页应显示策略名称');

  await page.click('#go-monitor-pool');
  await page.waitForURL(/monitor-pool\.html/, { timeout: 5000 });
  await page.waitForLoadState('networkidle');

  const firstRowText = await page.locator('tbody tr').first().innerText();
  assert.ok(firstRowText.includes('分析链路测试股'), '监控池应显示导入股票');
  assert.ok(firstRowText.includes('策略库'), '监控池应显示策略来源');
  assert.ok(firstRowText.includes('七因子高分策略（导入副本）'), '监控池应显示策略名称');

  await browser.close();
  console.log('✅ analysis-to-monitor browser smoke test passed');
}

main().catch((error) => {
  console.error(`❌ analysis-to-monitor browser smoke test failed: ${error.message}`);
  process.exit(1);
});
