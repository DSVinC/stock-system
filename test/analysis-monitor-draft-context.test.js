#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'analysis.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunction(source, name) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`未找到函数: ${name}`);
  }

  const braceIndex = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`函数大括号未闭合: ${name}`);
}

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    }
  };
}

function main() {
  const localStorage = createLocalStorage();
  localStorage.setItem('stockSelectConfig', JSON.stringify({
    strategySource: 'strategy_config',
    strategyConfigId: 999,
    strategyConfigName: '七因子高分策略（导入副本）',
    templateId: 999,
    templateName: '七因子高分策略（导入副本）'
  }));

  const context = {
    console,
    localStorage,
    MONITOR_POOL_DRAFT_KEY: 'monitorPoolDraft',
    analyzeStatus: { textContent: '' },
    safeJsonParse(rawValue) {
      try {
        return JSON.parse(rawValue);
      } catch {
        return null;
      }
    },
    window: {
      location: { href: './analysis.html' }
    },
    stocks: [
      { name: '中际旭创', code: '300308.SZ', score: 8.5, decision: '买入', selected: true },
      { name: '宁德时代', code: '300750.SZ', score: 7.8, decision: '观望', selected: false }
    ]
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(html, 'goToMonitorPool'), context, { filename: 'analysis-go-to-monitor.js' });

  context.goToMonitorPool();

  const saved = JSON.parse(localStorage.getItem('monitorPoolDraft'));
  assert.ok(Array.isArray(saved), 'monitorPoolDraft 应为数组');
  assert.strictEqual(saved.length, 1, '只应写入勾选的股票');
  assert.strictEqual(saved[0].name, '中际旭创', '应保留股票名称');
  assert.strictEqual(saved[0].code, '300308.SZ', '应保留股票代码');
  assert.strictEqual(saved[0].strategySource, 'strategy_config', '应继承选股页的策略来源');
  assert.strictEqual(saved[0].strategyConfigId, 999, '应继承策略库副本 ID');
  assert.strictEqual(saved[0].strategyConfigName, '七因子高分策略（导入副本）', '应继承策略库副本名称');
  assert.strictEqual(saved[0].templateId, 999, '兼容字段 templateId 也应保留');
  assert.strictEqual(saved[0].templateName, '七因子高分策略（导入副本）', '兼容字段 templateName 也应保留');
  assert.strictEqual(context.window.location.href, './monitor-pool.html', '应继续跳转到监控池');

  console.log('✅ analysis.html 监控池草稿上下文测试通过');
}

try {
  main();
} catch (error) {
  console.error(`❌ analysis.html 监控池草稿上下文测试失败: ${error.message}`);
  process.exit(1);
}
