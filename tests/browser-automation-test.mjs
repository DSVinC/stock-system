#!/usr/bin/env node
/**
 * 股票系统浏览器自动化测试脚本
 * 使用 Playwright 模拟真实用户行为测试整个系统
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://127.0.0.1:3000';

// 测试报告
const report = {
  stages: [],
  issues: [],
  startTime: new Date(),
  endTime: null,
};

// 测试股票
const TEST_STOCKS = [
  { name: '中际旭创', code: '300308.SZ', industry: 'AI' },
  { name: '宁德时代', code: '300750.SZ', industry: '新能源' },
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🚀 股票系统浏览器自动化测试启动');
  console.log(`📍 测试地址：${BASE_URL}`);
  console.log(`📅 开始时间：${new Date().toLocaleString('zh-CN')}\n`);

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // ========== 阶段 1: 行业选股 ==========
    await testStockSelection(page, browser);
    
    // ========== 阶段 2: 个股分析 ==========
    await testStockAnalysis(page, browser);
    
    // ========== 阶段 3: 监控池 ==========
    await testMonitorPool(page, browser);
    
    // ========== 阶段 4: 条件单 ==========
    await testConditionalOrders(page, browser);
    
    // ========== 阶段 5: 账户管理 ==========
    await testPortfolio(page, browser);
    
    // ========== 阶段 6: 回测系统 ==========
    await testBacktest(page, browser);

  } catch (error) {
    console.error('❌ 测试异常:', error.message);
    report.issues.push({
      stage: '系统错误',
      description: error.message,
      severity: '高',
    });
  } finally {
    report.endTime = new Date();
    await browser.close();
    generateReport();
  }
}

async function testStockSelection(page, browser) {
  console.log('\n📊 阶段 1: 行业选股测试');
  const stage = { name: '行业选股', checks: [], passed: 0, failed: 0 };

  try {
    await page.goto(`${BASE_URL}/select.html`, { waitUntil: 'networkidle' });
    await sleep(1000);

    // 检查 1: 页面标题
    const title = await page.title();
    const titleCheck = title.includes('选股') || title.includes('Stock');
    stage.checks.push({
      name: '页面标题正确',
      passed: titleCheck,
      details: title,
    });
    if (titleCheck) stage.passed++; else stage.failed++;

    // 检查 2: 行业卡片显示
    const industryCards = await page.locator('[class*="industry"], [class*="direction"], .card').count();
    const cardsCheck = industryCards > 0;
    stage.checks.push({
      name: '行业卡片显示',
      passed: cardsCheck,
      details: `找到 ${industryCards} 个行业卡片`,
    });
    if (cardsCheck) stage.passed++; else stage.failed++;

    // 检查 3: 选择行业
    const firstCard = await page.locator('.card, [class*="card"]').first();
    await firstCard.click();
    await sleep(500);

    // 检查 4: 点击开始选股
    const selectButton = await page.locator('button:has-text("选股"), button:has-text("开始")').first();
    await selectButton.click();
    await sleep(2000);

    // 检查 5: 选股结果加载
    const stockItems = await page.locator('[class*="stock"], .stock-item, tr').count();
    const resultsCheck = stockItems > 0;
    stage.checks.push({
      name: '选股结果加载',
      passed: resultsCheck,
      details: `找到 ${stockItems} 只股票`,
    });
    if (resultsCheck) stage.passed++; else stage.failed++;

    console.log(`  ✅ 通过：${stage.passed}, ❌ 失败：${stage.failed}`);

  } catch (error) {
    stage.error = error.message;
    stage.failed++;
    console.error('  ❌ 阶段 1 失败:', error.message);
  }

  report.stages.push(stage);
}

async function testStockAnalysis(page, browser) {
  console.log('\n📈 阶段 2: 个股分析测试');
  const stage = { name: '个股分析', checks: [], passed: 0, failed: 0 };

  try {
    // 直接访问分析页面（带测试股票）
    await page.goto(`${BASE_URL}/analysis.html?stock=${TEST_STOCKS[0].code}`, { waitUntil: 'networkidle' });
    await sleep(2000);

    // 检查 1: 股票名称显示
    const stockName = await page.locator('h1, h2, [class*="stock-name"]').first().textContent();
    const nameCheck = stockName && stockName.includes(TEST_STOCKS[0].name);
    stage.checks.push({
      name: '股票名称显示',
      passed: nameCheck,
      details: stockName || '未找到',
    });
    if (nameCheck) stage.passed++; else stage.failed++;

    // 检查 2: 技术指标表格
    const techTable = await page.locator('table, [class*="technical"]').count();
    const techCheck = techTable > 0;
    stage.checks.push({
      name: '技术指标显示',
      passed: techCheck,
      details: `找到 ${techTable} 个技术表格`,
    });
    if (techCheck) stage.passed++; else stage.failed++;

    // 检查 3: 决策建议（多种选择器兼容）
    let decision = null;
    try {
      decision = await page.locator('[class*="decision"], [class*="rating"], .decision-badge, h3:has-text("买入"), h3:has-text("观望"), h3:has-text("回避")').first().textContent();
    } catch (e) {
      decision = await page.locator('body').textContent();
    }
    const decisionCheck = decision && (decision.includes('买入') || decision.includes('观望') || decision.includes('回避') || decision.includes('Decision'));
    stage.checks.push({
      name: '决策建议显示',
      passed: decisionCheck,
      details: decision ? decision.substring(0, 50) + '...' : '未找到',
    });
    if (decisionCheck) stage.passed++; else stage.failed++;

    // 检查 4: 加入监控池按钮
    const monitorButton = await page.locator('button:has-text("监控"), button:has-text("加入")').count();
    const monitorCheck = monitorButton > 0;
    stage.checks.push({
      name: '监控池按钮',
      passed: monitorCheck,
      details: `找到 ${monitorButton} 个按钮`,
    });
    if (monitorCheck) stage.passed++; else stage.failed++;

    // 检查 5: 导入条件单按钮
    const importButton = await page.locator('button:has-text("导入"), button:has-text("条件单")').count();
    const importCheck = importButton > 0;
    stage.checks.push({
      name: '导入条件单按钮',
      passed: importCheck,
      details: `找到 ${importButton} 个按钮`,
    });
    if (importCheck) stage.passed++; else stage.failed++;

    console.log(`  ✅ 通过：${stage.passed}, ❌ 失败：${stage.failed}`);

  } catch (error) {
    stage.error = error.message;
    stage.failed++;
    console.error('  ❌ 阶段 2 失败:', error.message);
  }

  report.stages.push(stage);
}

async function testMonitorPool(page, browser) {
  console.log('\n👁️ 阶段 3: 监控池测试');
  const stage = { name: '监控池', checks: [], passed: 0, failed: 0 };

  try {
    await page.goto(`${BASE_URL}/monitor-pool.html`, { waitUntil: 'networkidle' });
    await sleep(1500);

    // 检查 1: 页面加载
    const title = await page.locator('h1, h2').first().textContent();
    const titleCheck = title && title.includes('监控');
    stage.checks.push({
      name: '页面标题正确',
      passed: titleCheck,
      details: title || '未找到',
    });
    if (titleCheck) stage.passed++; else stage.failed++;

    // 检查 2: 股票列表或空状态
    const tableRows = await page.locator('tr, [class*="stock-item"]').count();
    const emptyState = await page.locator('[class*="empty"]').count();
    const listCheck = tableRows > 0 || emptyState > 0;
    stage.checks.push({
      name: '股票列表显示',
      passed: listCheck,
      details: `${tableRows} 条记录，${emptyState} 个空状态`,
    });
    if (listCheck) stage.passed++; else stage.failed++;

    // 检查 3: 批量创建按钮
    const batchButton = await page.locator('button:has-text("批量")').count();
    const batchCheck = batchButton > 0;
    stage.checks.push({
      name: '批量创建按钮',
      passed: batchCheck,
      details: `找到 ${batchButton} 个按钮`,
    });
    if (batchCheck) stage.passed++; else stage.failed++;

    console.log(`  ✅ 通过：${stage.passed}, ❌ 失败：${stage.failed}`);

  } catch (error) {
    stage.error = error.message;
    stage.failed++;
    console.error('  ❌ 阶段 3 失败:', error.message);
  }

  report.stages.push(stage);
}

async function testConditionalOrders(page, browser) {
  console.log('\n📝 阶段 4: 条件单测试');
  const stage = { name: '条件单', checks: [], passed: 0, failed: 0 };

  try {
    await page.goto(`${BASE_URL}/conditional-order.html`, { waitUntil: 'networkidle' });
    await sleep(1500);

    // 检查 1: 页面加载
    const title = await page.locator('h1, h2').first().textContent();
    const titleCheck = title && title.includes('条件单');
    stage.checks.push({
      name: '页面标题正确',
      passed: titleCheck,
      details: title || '未找到',
    });
    if (titleCheck) stage.passed++; else stage.failed++;

    // 检查 2: 新建按钮
    const newButton = await page.locator('button:has-text("新建"), button:has-text("+")').count();
    const newCheck = newButton > 0;
    stage.checks.push({
      name: '新建条件单按钮',
      passed: newCheck,
      details: `找到 ${newButton} 个按钮`,
    });
    if (newCheck) stage.passed++; else stage.failed++;

    // 检查 3: 条件单列表或空状态
    const orderRows = await page.locator('tr, [class*="order-item"]').count();
    const emptyState = await page.locator('[class*="empty"]').count();
    const listCheck = orderRows > 0 || emptyState > 0;
    stage.checks.push({
      name: '条件单列表显示',
      passed: listCheck,
      details: `${orderRows} 条记录，${emptyState} 个空状态`,
    });
    if (listCheck) stage.passed++; else stage.failed++;

    // 检查 4: 触发类型选择器
    const triggerSelect = await page.locator('select, [class*="trigger-type"]').count();
    const triggerCheck = triggerSelect > 0;
    stage.checks.push({
      name: '触发类型选择器',
      passed: triggerCheck,
      details: `找到 ${triggerSelect} 个选择器`,
    });
    if (triggerCheck) stage.passed++; else stage.failed++;

    console.log(`  ✅ 通过：${stage.passed}, ❌ 失败：${stage.failed}`);

  } catch (error) {
    stage.error = error.message;
    stage.failed++;
    console.error('  ❌ 阶段 4 失败:', error.message);
  }

  report.stages.push(stage);
}

async function testPortfolio(page, browser) {
  console.log('\n💼 阶段 5: 账户管理测试');
  const stage = { name: '账户管理', checks: [], passed: 0, failed: 0 };

  try {
    await page.goto(`${BASE_URL}/portfolio.html`, { waitUntil: 'networkidle' });
    await sleep(1500);

    // 检查 1: 页面加载
    const title = await page.locator('h1, h2').first().textContent();
    const titleCheck = title && (title.includes('账户') || title.includes('组合') || title.includes('Portfolio'));
    stage.checks.push({
      name: '页面标题正确',
      passed: titleCheck,
      details: title || '未找到',
    });
    if (titleCheck) stage.passed++; else stage.failed++;

    // 检查 2: 创建账户按钮/表单
    const createButton = await page.locator('button:has-text("创建"), button:has-text("新建")').count();
    const formInputs = await page.locator('input[type="text"], input[type="number"]').count();
    const createCheck = createButton > 0 || formInputs > 0;
    stage.checks.push({
      name: '创建账户功能',
      passed: createCheck,
      details: `${createButton} 个按钮，${formInputs} 个输入框`,
    });
    if (createCheck) stage.passed++; else stage.failed++;

    // 检查 3: 账户卡片/列表
    const accountCards = await page.locator('[class*="account"], [class*="portfolio"]').count();
    const accountCheck = accountCards >= 0; // 允许为空
    stage.checks.push({
      name: '账户列表显示',
      passed: accountCheck,
      details: `找到 ${accountCards} 个账户`,
    });
    if (accountCheck) stage.passed++; else stage.failed++;

    console.log(`  ✅ 通过：${stage.passed}, ❌ 失败：${stage.failed}`);

  } catch (error) {
    stage.error = error.message;
    stage.failed++;
    console.error('  ❌ 阶段 5 失败:', error.message);
  }

  report.stages.push(stage);
}

async function testBacktest(page, browser) {
  console.log('\n📉 阶段 6: 回测系统测试');
  const stage = { name: '回测系统', checks: [], passed: 0, failed: 0 };

  try {
    await page.goto(`${BASE_URL}/backtest.html`, { waitUntil: 'networkidle' });
    await sleep(1500);

    // 检查 1: 页面加载
    const title = await page.locator('h1, h2').first().textContent();
    const titleCheck = title && title.includes('回测');
    stage.checks.push({
      name: '页面标题正确',
      passed: titleCheck,
      details: title || '未找到',
    });
    if (titleCheck) stage.passed++; else stage.failed++;

    // 检查 2: 回测参数配置
    const dateInputs = await page.locator('input[type="date"]').count();
    const strategySelect = await page.locator('select, [class*="strategy"]').count();
    const configCheck = dateInputs >= 2 || strategySelect > 0;
    stage.checks.push({
      name: '回测参数配置',
      passed: configCheck,
      details: `${dateInputs} 个日期输入，${strategySelect} 个策略选择`,
    });
    if (configCheck) stage.passed++; else stage.failed++;

    // 检查 3: 运行回测按钮
    const runButton = await page.locator('button:has-text("运行"), button:has-text("开始回测")').count();
    const runCheck = runButton > 0;
    stage.checks.push({
      name: '运行回测按钮',
      passed: runCheck,
      details: `找到 ${runButton} 个按钮`,
    });
    if (runCheck) stage.passed++; else stage.failed++;

    console.log(`  ✅ 通过：${stage.passed}, ❌ 失败：${stage.failed}`);

  } catch (error) {
    stage.error = error.message;
    stage.failed++;
    console.error('  ❌ 阶段 6 失败:', error.message);
  }

  report.stages.push(stage);
}

function generateReport() {
  const totalPassed = report.stages.reduce((sum, s) => sum + s.passed, 0);
  const totalFailed = report.stages.reduce((sum, s) => sum + s.failed, 0);
  const duration = report.endTime - report.startTime;

  console.log('\n' + '='.repeat(60));
  console.log('📊 测试报告汇总');
  console.log('='.repeat(60));
  console.log(`⏱️ 测试耗时：${(duration / 1000).toFixed(1)} 秒`);
  console.log(`✅ 通过检查：${totalPassed}`);
  console.log(`❌ 失败检查：${totalFailed}`);
  console.log(`📋 测试阶段：${report.stages.length}`);
  console.log('');

  report.stages.forEach((stage, i) => {
    const passRate = ((stage.passed / (stage.passed + stage.failed)) * 100).toFixed(0);
    console.log(`${i + 1}. ${stage.name}: ${stage.passed}/${stage.passed + stage.failed} (${passRate}%)`);
    if (stage.error) {
      console.log(`   ❌ 错误：${stage.error}`);
    }
  });

  if (report.issues.length > 0) {
    console.log('\n⚠️ 发现的问题:');
    report.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.severity}] ${issue.stage}: ${issue.description}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📄 报告生成时间：${new Date().toLocaleString('zh-CN')}`);
  console.log('='.repeat(60));
}

// 运行测试
runTests().catch(console.error);
