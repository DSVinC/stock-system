#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'conditional-order.html');
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

function extractAsyncFunction(source, name) {
  const token = `async function ${name}(`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`未找到 async 函数: ${name}`);
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

  throw new Error(`async 函数大括号未闭合: ${name}`);
}

async function main() {
  const postedBodies = [];
  const requestedUrls = [];

  const context = {
    console,
    window: {
      batchCreateStocks: [{
        ts_code: '111111.SZ',
        stock_name: '测试反馈股',
        strategySource: 'strategy_config',
        strategyConfigId: 999,
        strategyConfigName: '七因子高分策略（导入副本）',
        templateId: 888,
        templateName: '七因子高分策略模板'
      }]
    },
    showToast() {},
    closeBatchCreateModal() {},
    loadOrders() {},
    getAccountId() {
      return 1;
    },
    fetch: async (url, options) => {
      requestedUrls.push(url);
      postedBodies.push(JSON.parse(options.body));
      return {
        async json() {
          return { success: true };
        }
      };
    },
    document: {
      getElementById(id) {
        const values = {
          'batch-action': { value: 'buy' },
          'batch-order-type': { value: 'price' },
          'batch-position-pct': { value: '10' },
          'batch-quantity': { value: '' },
          'batch-start-date': { value: '2026-03-27' },
          'batch-end-date': { value: '2026-06-27' }
        };
        return values[id];
      },
      querySelectorAll(selector) {
        if (selector !== '#batch-conditions-list .condition-row') {
          return [];
        }
        return [{
          querySelector(query) {
            if (query === 'select') {
              return { value: 'price_cross_up' };
            }
            if (query === 'input') {
              return { value: '10' };
            }
            return null;
          }
        }];
      }
    },
    normalizeNumericParam(value) {
      const trimmed = String(value ?? '').trim();
      if (trimmed === '') return '';
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : trimmed;
    },
    TRIGGER_TYPE_DEFS: {
      price_above: { category: 'price', label: '股价高于' },
      price_below: { category: 'price', label: '股价低于' }
    },
    buildConditionPreview(triggerType, params) {
      return `${triggerType}:${JSON.stringify(params)}`;
    }
  };

  vm.createContext(context);
  vm.runInContext([
    extractFunction(html, 'createLegacyCompatibleCondition'),
    extractFunction(html, 'normalizeBatchTriggerType'),
    extractAsyncFunction(html, 'executeBatchCreate')
  ].join('\n\n'), context, { filename: 'conditional-order-batch-create.js' });

  await context.executeBatchCreate();

  assert.strictEqual(postedBodies.length, 1, '应发起一次创建请求');
  assert.strictEqual(requestedUrls[0], '/api/conditional-order', '批量创建应调用条件单根创建接口');
  assert.strictEqual(postedBodies[0].conditions[0].trigger_type, 'price_above', 'price_cross_up 应归一化为 price_above');
  assert.strictEqual(postedBodies[0].conditions[0].type, 'price', '应生成兼容条件格式');
  assert.strictEqual(postedBodies[0].strategySource, 'strategy_config', '应保留策略来源');
  assert.strictEqual(postedBodies[0].strategyConfigId, 999, '应保留策略库副本 ID');

  console.log('✅ conditional-order batch create trigger test passed');
}

main().catch((error) => {
  console.error(`❌ conditional-order batch create trigger test failed: ${error.message}`);
  process.exit(1);
});
