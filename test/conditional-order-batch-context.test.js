#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'conditional-order.html');
const html = fs.readFileSync(htmlPath, 'utf8');

/**
 * 测试目标：验证 executeBatchCreate 函数在批量创建条件单时，
 * 正确透传策略身份字段到 POST /api/conditional-order/create 的请求体
 */

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
  // ====== 结构断言测试 ======
  const fnToken = 'async function executeBatchCreate()';
  const fnStart = html.indexOf(fnToken);
  assert.notStrictEqual(fnStart, -1, '未找到 executeBatchCreate 函数');

  // 找到函数体的开始和结束
  const braceStart = html.indexOf('{', fnStart);
  let depth = 0;
  let fnEnd = -1;
  for (let i = braceStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        fnEnd = i + 1;
        break;
      }
    }
  }
  assert.notStrictEqual(fnEnd, -1, '函数体未正确闭合');

  const fnBody = html.slice(fnStart, fnEnd);

  // 验证函数中是否包含 orderData 对象构建
  const orderDataMatch = fnBody.match(/const orderData = \{[\s\S]*?\};/);
  assert.ok(orderDataMatch, '未找到 orderData 对象定义');

  const orderDataDef = orderDataMatch[0];

  // 检查策略身份字段是否在 orderData 中被透传
  const requiredFields = [
    'strategySource',
    'strategyConfigId',
    'strategyConfigName',
    'templateId',
    'templateName'
  ];

  const missingFields = [];
  for (const field of requiredFields) {
    // 检查是否存在 field: stock.field 形式的透传
    const patterns = [
      new RegExp(`${field}:\\s*stock\\.${field}`),
      new RegExp(`${field}:\\s*stock\\['${field}'\\]`),
      new RegExp(`${field}:\\s*stock\\["${field}"\\]`)
    ];

    const found = patterns.some(p => p.test(orderDataDef));
    if (!found) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    console.log(`❌ executeBatchCreate 中 orderData 缺少以下策略身份字段的透传:`);
    missingFields.forEach(f => console.log(`   - ${f}`));
    console.log('\n请在 orderData 对象中添加:');
    missingFields.forEach(f => console.log(`      ${f}: stock.${f},`));
    throw new Error(`executeBatchCreate 缺少策略身份字段透传: ${missingFields.join(', ')}`);
  }

  console.log('✅ 结构断言: executeBatchCreate 中 orderData 包含所有策略身份字段');

  // ====== 运行时测试 ======
  // 捕获 fetch 请求
  const fetchBodies = [];

  // 创建模拟的 DOM 元素
  function createMockElement(value) {
    return { value };
  }

  // 创建模拟的 localStorage
  const localStorage = {
    store: new Map(),
    getItem(key) {
      return this.store.has(key) ? this.store.get(key) : null;
    },
    setItem(key, value) {
      this.store.set(key, String(value));
    }
  };
  localStorage.setItem('current_account_id', '1');

  // 用于同步等待异步操作完成的标志
  let asyncComplete = false;
  let asyncError = null;

  // 创建上下文
  const context = {
    console,
    localStorage,
    window: {
      batchCreateStocks: [
        {
          ts_code: '300308.SZ',
          stock_name: '中际旭创',
          strategySource: 'strategy_config',
          strategyConfigId: 999,
          strategyConfigName: '七因子高分策略（导入副本）',
          templateId: 888,
          templateName: '七因子高分策略'
        }
      ]
    },
    document: {
      getElementById(id) {
        // 返回模拟的表单元素
        const values = {
          'batch-action': 'buy',
          'batch-order-type': 'limit',
          'batch-position-pct': '10',
          'batch-quantity': '100',
          'batch-start-date': '2024-01-01',
          'batch-end-date': '2024-12-31'
        };
        return createMockElement(values[id] || '');
      },
      querySelectorAll(selector) {
        if (selector === '#batch-conditions-list .condition-row') {
          return [
            {
              querySelector(sel) {
                if (sel === 'select') return createMockElement('price_above');
                if (sel === 'input') return createMockElement('100');
                return null;
              }
            }
          ];
        }
        return [];
      }
    },
    fetch(url, options) {
      // 捕获请求体
      if (url === '/api/conditional-order' && options.method === 'POST') {
        const body = JSON.parse(options.body);
        fetchBodies.push(body);
        return Promise.resolve({
          json: () => Promise.resolve({ success: true })
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: false })
      });
    },
    showToast() {},
    closeBatchCreateModal() {},
    loadOrders() {},
    getAccountId() {
      return localStorage.getItem('current_account_id');
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
    },
    // 用于通知测试代码异步操作完成
    __testDone__(error) {
      asyncComplete = true;
      asyncError = error;
    }
  };

  vm.createContext(context);

  // 提取并执行 executeBatchCreate 函数
  const executeBatchCreateCode = extractAsyncFunction(html, 'executeBatchCreate');

  // 包装为可执行的异步代码，在完成后调用 __testDone__
  const wrappedCode = `
    (async function() {
      ${extractFunction(html, 'normalizeBatchTriggerType')}
      ${extractFunction(html, 'createLegacyCompatibleCondition')}
      ${executeBatchCreateCode}

      try {
        await executeBatchCreate();
        __testDone__();
      } catch (e) {
        __testDone__(e);
      }
    })();
  `;

  // 执行代码
  vm.runInContext(wrappedCode, context, { filename: 'conditional-order-context.js' });

  // 等待异步操作完成（轮询方式，最多等待 5 秒）
  const maxWait = 5000;
  const startTime = Date.now();
  while (!asyncComplete && (Date.now() - startTime) < maxWait) {
    // 使用 setTimeout 让出事件循环控制权
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // 检查是否完成
  if (!asyncComplete) {
    throw new Error('异步操作超时（5秒）');
  }

  // 检查是否有错误
  if (asyncError) {
    throw asyncError;
  }

  // 验证 fetch 被调用
  assert.strictEqual(fetchBodies.length, 1, '应创建一个条件单');

  const body = fetchBodies[0];

  // 验证策略身份字段
  assert.strictEqual(body.strategySource, 'strategy_config', 'strategySource 应正确透传');
  assert.strictEqual(body.strategyConfigId, 999, 'strategyConfigId 应正确透传');
  assert.strictEqual(body.strategyConfigName, '七因子高分策略（导入副本）', 'strategyConfigName 应正确透传');
  assert.strictEqual(body.templateId, 888, 'templateId 应正确透传');
  assert.strictEqual(body.templateName, '七因子高分策略', 'templateName 应正确透传');

  console.log('✅ 运行时测试: executeBatchCreate 正确透传策略身份字段');
  console.log('✅ conditional-order.html 批量创建策略身份字段透传测试通过');
}

// 执行主函数（支持异步）
Promise.resolve(main()).catch(error => {
  console.error(`❌ 测试失败: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
