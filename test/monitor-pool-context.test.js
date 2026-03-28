#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'monitor-pool.html');
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
  localStorage.setItem('monitorPoolDraft', JSON.stringify([
    {
      name: '中际旭创',
      code: '300308.SZ',
      strategySource: 'strategy_config',
      strategyConfigId: 999,
      strategyConfigName: '七因子高分策略（导入副本）',
      templateId: 999,
      templateName: '七因子高分策略（导入副本）'
    }
  ]));
  localStorage.setItem('current_account_id', '1');

  const context = {
    console,
    localStorage,
    MONITOR_POOL_DRAFT_KEY: 'monitorPoolDraft',
    safeJsonParse(rawValue) {
      try {
        return JSON.parse(rawValue);
      } catch {
        return null;
      }
    },
    showToast() {},
    window: {
      location: { href: './monitor-pool.html' }
    },
    document: {
      querySelectorAll(selector) {
        if (selector !== '.stock-checkbox:checked') {
          return [];
        }
        return [{
          value: '300308.SZ',
          dataset: {
            name: '中际旭创',
            strategySource: 'strategy_config',
            strategyConfigId: '999',
            strategyConfigName: '七因子高分策略（导入副本）',
            templateId: '999',
            templateName: '七因子高分策略（导入副本）'
          }
        }];
      }
    }
  };

  vm.createContext(context);
  vm.runInContext([
    extractFunction(html, 'normalizeDraftStock'),
    extractFunction(html, 'readDraftStocks'),
    extractFunction(html, 'getSelectedStocks'),
    extractFunction(html, 'showBatchCreateModal')
  ].join('\n\n'), context, { filename: 'monitor-pool-context-snippets.js' });

  const draftStocks = context.readDraftStocks();
  assert.strictEqual(draftStocks.length, 1, '应能读取一条草稿股票');
  assert.strictEqual(draftStocks[0].strategySource, 'strategy_config', '读取草稿时应保留策略来源');
  assert.strictEqual(draftStocks[0].strategyConfigId, 999, '读取草稿时应保留策略库副本 ID');
  assert.strictEqual(draftStocks[0].strategyConfigName, '七因子高分策略（导入副本）', '读取草稿时应保留策略库副本名称');
  assert.strictEqual(draftStocks[0].templateId, 999, '读取草稿时应保留兼容字段 templateId');
  assert.strictEqual(draftStocks[0].templateName, '七因子高分策略（导入副本）', '读取草稿时应保留兼容字段 templateName');

  const selectedStocks = context.getSelectedStocks();
  assert.strictEqual(selectedStocks.length, 1, '应能读取一条已勾选股票');
  assert.strictEqual(selectedStocks[0].strategySource, 'strategy_config', '批量创建参数应保留策略来源');
  assert.strictEqual(selectedStocks[0].strategyConfigId, 999, '批量创建参数应保留策略库副本 ID');
  assert.strictEqual(selectedStocks[0].strategyConfigName, '七因子高分策略（导入副本）', '批量创建参数应保留策略库副本名称');
  assert.strictEqual(selectedStocks[0].templateId, 999, '批量创建参数应保留 templateId');
  assert.strictEqual(selectedStocks[0].templateName, '七因子高分策略（导入副本）', '批量创建参数应保留 templateName');

  console.log('✅ monitor-pool.html 上下文保留测试通过');
}

try {
  main();
} catch (error) {
  console.error(`❌ monitor-pool.html 上下文保留测试失败: ${error.message}`);
  process.exit(1);
}
