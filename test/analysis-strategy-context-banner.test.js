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
    strategyConfigName: '七因子高分策略（导入副本）'
  }));

  const strategyContextBanner = {
    hidden: true,
    textContent: ''
  };

  const context = {
    console,
    localStorage,
    strategyContextBanner,
    safeJsonParse(rawValue) {
      try {
        return JSON.parse(rawValue);
      } catch {
        return null;
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(html, 'renderStrategyContextBanner'), context, {
    filename: 'analysis-strategy-context-banner.js'
  });

  context.renderStrategyContextBanner();
  assert.strictEqual(strategyContextBanner.hidden, false, '有策略上下文时应显示 banner');
  assert.ok(strategyContextBanner.textContent.includes('策略库'), '应显示策略来源');
  assert.ok(strategyContextBanner.textContent.includes('七因子高分策略（导入副本）'), '应显示策略名称');

  localStorage.setItem('stockSelectConfig', JSON.stringify({}));
  context.renderStrategyContextBanner();
  assert.strictEqual(strategyContextBanner.hidden, true, '无可显示字段时应隐藏 banner');

  console.log('✅ analysis strategy context banner test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ analysis strategy context banner test failed: ${error.message}`);
  process.exit(1);
}
