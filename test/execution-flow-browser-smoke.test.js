#!/usr/bin/env node

const assert = require('node:assert');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:3000${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function main() {
  const stock = {
    name: '完整流程测试股',
    code: '333333.SZ',
    score: 9.5,
    decision: '买入',
    selected: true
  };

  // 清理同 stock_code 的监控池记录和条件单记录
  console.log('清理测试数据...');
  await request('/api/monitor-pool/remove', {
    method: 'DELETE',
    body: JSON.stringify({ stock_code: stock.code })
  });

  try {
    execFileSync('sqlite3', [DB_PATH, `DELETE FROM conditional_orders WHERE ts_code = '${stock.code}'`], { stdio: 'pipe' });
  } catch (e) {
    // 忽略删除错误（可能不存在记录）
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 预置 localStorage
  await page.addInitScript((payload) => {
    localStorage.setItem('current_account_id', '1');
    localStorage.setItem('selectedDirections', JSON.stringify([{ name: '科技', score: 9, reason: '测试方向' }]));
    localStorage.setItem('analysisResults', JSON.stringify([payload.stock]));
    localStorage.setItem('stockSelectConfig', JSON.stringify({
      strategySource: 'strategy_config',
      strategyConfigId: 999,
      strategyConfigName: '七因子高分策略（导入副本）',
      templateId: 888,
      templateName: '七因子高分策略模板'
    }));
  }, { stock });

  // Step 1: 打开 analysis.html，验证策略上下文 banner
  console.log('Step 1: 打开 analysis.html...');
  await page.goto('http://127.0.0.1:3000/analysis.html', { waitUntil: 'networkidle' });

  const bannerText = await page.locator('#strategy-context-banner').innerText();
  assert.ok(bannerText.includes('策略库'), '分析页应显示策略来源');
  assert.ok(bannerText.includes('七因子高分策略（导入副本）'), '分析页应显示策略名称');
  console.log('✓ 策略上下文 banner 验证通过');

  // Step 2: 点击加入监控池，跳转到 monitor-pool.html
  console.log('Step 2: 点击加入监控池...');
  await page.click('#go-monitor-pool');
  await page.waitForURL(/monitor-pool\.html/, { timeout: 5000 });
  await page.waitForLoadState('networkidle');

  const firstRowText = await page.locator('tbody tr').first().innerText();
  assert.ok(firstRowText.includes('完整流程测试股'), '监控池应显示导入股票');
  assert.ok(firstRowText.includes('策略库'), '监控池应显示策略来源');
  assert.ok(firstRowText.includes('七因子高分策略（导入副本）'), '监控池应显示策略名称');
  console.log('✓ 监控池首行验证通过');

  // Step 3: 批量创建条件单
  console.log('Step 3: 批量创建条件单...');
  await page.locator('.stock-checkbox').first().check();
  await page.evaluate(() => showBatchCreateModal());
  await page.waitForURL(/conditional-order\.html/, { timeout: 5000 });
  await page.waitForSelector('#batch-create-modal.show');
  await page.fill('#batch-conditions-list .condition-row input', '15');
  await page.fill('#batch-position-pct', '20');
  await page.click('#batch-create-modal .button-primary');
  await page.waitForTimeout(1500);
  console.log('✓ 条件单创建流程完成');

  await browser.close();

  // Step 4: 验证条件单创建成功，并保留策略上下文
  console.log('Step 4: 验证条件单...');
  const listRes = await request('/api/conditional-order?account_id=1');
  const target = Array.isArray(listRes.payload.data)
    ? listRes.payload.data.filter((order) => order.ts_code === stock.code)
    : [];

  assert.ok(target.length >= 1, '应成功创建条件单');
  assert.equal(target[0].strategy_source, 'strategy_config', '条件单应保留 strategy_source');
  assert.equal(target[0].strategy_config_id, 999, '条件单应保留 strategy_config_id');
  assert.equal(target[0].template_id, 888, '条件单应保留 template_id');
  console.log('✓ 条件单策略上下文验证通过');

  console.log('✅ execution-flow browser smoke test passed');
}

main().catch((error) => {
  console.error(`❌ execution-flow browser smoke test failed: ${error.message}`);
  process.exit(1);
});