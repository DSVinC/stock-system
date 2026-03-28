#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'conditional-order.html');
const html = fs.readFileSync(htmlPath, 'utf8');

/**
 * 测试目标：验证从 analysis.html 通过 ?import=... 导入策略后，
 * createOrder() 创建条件单时正确透传策略身份字段
 *
 * 策略身份字段：
 * - strategySource: 来源标识 ('strategy_config' | 'template')
 * - strategyConfigId: 策略配置 ID
 * - strategyConfigName: 策略配置名称
 * - templateId: 模板 ID (向后兼容)
 * - templateName: 模板名称 (向后兼容)
 *
 * 背景：
 * - executeBatchCreate() 已正确透传这些字段
 * - 单条 createOrder() 也应该在已有 importedStrategyContext 时透传
 * - 本测试只验证条件单页“消费并带出上下文”，不验证上游页面是否提供这些字段
 */

function extractFunction(source, name, { async = false } = {}) {
  const token = `${async ? 'async ' : ''}function ${name}(`;
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

async function main() {
  console.log('=== 条件单导入策略身份字段透传测试 ===\n');

  const createOrderCode = extractFunction(html, 'createOrder', { async: true });

  const capturedRequests = [];
  let completed = false;
  let failure = null;

  // 模拟表单数据 - 来自 handleImportFromQuery 填充后的状态
  const form = {
    action: { value: 'buy' },
    quantity: { value: '' },
    amount: { value: '' },
    position_pct: { value: '10' },
    condition_logic: { value: 'AND' },
    start_date: { value: '2026-03-27' },
    end_date: { value: '2026-06-27' },
    max_trigger_count: { value: '1' },
    ts_code: { value: '300308.SZ' },
    stock_name: { value: '中际旭创' }
  };

  const importedStrategyContext = {
    strategySource: 'strategy_config',
    strategyConfigId: 999,
    strategyConfigName: '七因子高分策略（导入副本）',
    templateId: 888,
    templateName: '七因子高分策略'
  };

  const context = {
    console,
    editingOrderId: null,
    importedStrategyContext,  // 关键：存储导入时的策略身份信息
    getAccountId() {
      return 1;
    },
    normalizeTsCode(value) {
      return value;
    },
    collectFormConditions() {
      return [
        {
          trigger_type: 'price_above',
          params: { price: 100 },
          preview: '股价上穿 100 元'
        }
      ];
    },
    validateEditableConditions() {
      return { valid: true };
    },
    inferOrderTypeFromConditions() {
      return 'price';
    },
    api(url, options) {
      capturedRequests.push({
        url,
        method: options.method,
        body: JSON.parse(options.body)
      });
      return Promise.resolve({ success: true });
    },
    closeCreateModal() {},
    resetCreateForm() {},
    loadOrders() {},
    showToast() {},
    Number,
    parseInt,
    parseFloat,
    JSON,
    __done(error) {
      completed = true;
      failure = error || null;
    }
  };

  vm.createContext(context);
  const wrapped = `
    const form = globalThis.__form;
    ${createOrderCode}
    (async () => {
      try {
        await createOrder({ preventDefault() {}, target: form });
        __done();
      } catch (error) {
        __done(error);
      }
    })();
  `;
  context.__form = form;

  vm.runInContext(wrapped, context, { filename: 'conditional-order-import-context.js' });

  const startedAt = Date.now();
  while (!completed && Date.now() - startedAt < 3000) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (!completed) {
    throw new Error('createOrder 运行超时');
  }
  if (failure) {
    throw failure;
  }

  // ====== 验证请求 ======
  console.log('1. 验证基础请求...');
  assert.strictEqual(capturedRequests.length, 1, '应发起一次创建请求');
  const request = capturedRequests[0];
  assert.strictEqual(request.url, '/api/conditional-order', '新建条件单应请求 /api/conditional-order');
  assert.strictEqual(request.method, 'POST', '新建条件单应使用 POST');
  console.log('   ✅ 基础请求正确\n');

  // ====== 验证策略身份字段 ======
  console.log('2. 验证策略身份字段透传...');

  const requiredFields = [
    { name: 'strategySource', expected: 'strategy_config' },
    { name: 'strategyConfigId', expected: 999 },
    { name: 'strategyConfigName', expected: '七因子高分策略（导入副本）' },
    { name: 'templateId', expected: 888 },
    { name: 'templateName', expected: '七因子高分策略' }
  ];

  const missingFields = [];
  const incorrectFields = [];

  for (const field of requiredFields) {
    const actual = request.body[field.name];
    if (actual === undefined) {
      missingFields.push(field.name);
    } else if (actual !== field.expected) {
      incorrectFields.push({
        name: field.name,
        expected: field.expected,
        actual: actual
      });
    }
  }

  if (missingFields.length > 0 || incorrectFields.length > 0) {
    console.log('   ❌ createOrder() 请求体策略身份字段不完整：\n');

    if (missingFields.length > 0) {
      console.log('   缺少字段:');
      missingFields.forEach(f => console.log(`     - ${f}`));
    }

    if (incorrectFields.length > 0) {
      console.log('   值不正确:');
      incorrectFields.forEach(f => console.log(`     - ${f.name}: 期望 "${f.expected}", 实际 "${f.actual}"`));
    }

    console.log('\n   当前 createOrder() 请求体:');
    console.log('   ', JSON.stringify(request.body, null, 2).split('\n').join('\n    '));

    console.log('\n\n   修复建议:');
    console.log('   问题根源: conditional-order.html 未将 importedStrategyContext 合并进创建请求');
    console.log('\n   当前 executeBatchCreate() 的实现参考:');
    console.log('   orderData.strategySource = stock.strategySource;');
    console.log('   orderData.strategyConfigId = stock.strategyConfigId;');
    console.log('   orderData.strategyConfigName = stock.strategyConfigName;');
    console.log('   orderData.templateId = stock.templateId;');
    console.log('   orderData.templateName = stock.templateName;\n');

    throw new Error(
      `createOrder() 未透传策略身份字段。缺少: [${missingFields.join(', ')}]` +
      (incorrectFields.length > 0 ? `, 值不正确: [${incorrectFields.map(f => f.name).join(', ')}]` : '')
    );
  }

  console.log('   ✅ 策略身份字段全部透传正确');
  console.log('   - strategySource:', request.body.strategySource);
  console.log('   - strategyConfigId:', request.body.strategyConfigId);
  console.log('   - strategyConfigName:', request.body.strategyConfigName);
  console.log('   - templateId:', request.body.templateId);
  console.log('   - templateName:', request.body.templateName);

  console.log('\n✅ conditional-order.html 单条导入策略身份字段透传测试通过');
}

main()
  .then(() => {
    console.log('\n=== 测试完成 ===');
    process.exit(0);
  })
  .catch((error) => {
    // 错误已在 main() 中打印，这里只退出
    process.exit(1);
  });
