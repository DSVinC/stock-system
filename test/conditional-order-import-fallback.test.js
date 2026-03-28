#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'conditional-order.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunction(source, name, { async = false } = {}) {
  const token = `${async ? 'async ' : ''}function ${name}(`;
  const start = source.indexOf(token);
  if (start === -1) throw new Error(`未找到函数: ${name}`);

  let parenDepth = 0;
  let signatureEnd = -1;
  for (let i = start + token.length - 1; i < source.length; i++) {
    const char = source[i];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnd = i;
        break;
      }
    }
  }
  if (signatureEnd === -1) throw new Error(`函数参数未正确闭合: ${name}`);

  const braceIndex = source.indexOf('{', signatureEnd);
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
  const functions = [
    extractFunction(html, 'normalizeTsCode'),
    extractFunction(html, 'parseImportPayload'),
    extractFunction(html, 'pickImportAction'),
    extractFunction(html, 'handleImportFromQuery', { async: true })
  ].join('\n\n');

  const form = {
    ts_code: { value: '' },
    stock_name: { value: '' },
    action: { value: '' },
    order_type: { value: '' },
    condition_logic: { value: '' },
    position_pct: { value: '' },
    stop_loss_price: { value: '' }
  };

  const payload = {
    stock_code: '300308.SZ',
    stock_name: '中际旭创',
    strategySource: 'strategy_config',
    strategyConfigId: 5,
    strategyConfigName: '自动迭代版本（导入副本）',
    templateId: 5,
    templateName: '自动迭代版本（导入副本）',
    strategy: {
      actions: [
        {
          action_type: 'buy',
          trigger_logic: 'AND',
          position_percent: 10,
          stop_loss: 95,
          trigger_conditions: [
            { field: 'price', operator: '>=', value: 100 }
          ]
        }
      ]
    }
  };

  const toasts = [];
  const context = {
    console,
    IMPORT_PARAM_KEY: 'import',
    importedStrategyContext: null,
    window: {
      location: {
        href: `http://127.0.0.1:3000/conditional-order.html?import=${encodeURIComponent(JSON.stringify(payload))}`,
        search: `?import=${encodeURIComponent(JSON.stringify(payload))}`
      },
      history: {
        replaceState() {}
      }
    },
    URL,
    URLSearchParams,
    decodeURIComponent,
    JSON,
    fetchStockInfo: async () => null,
    normalizeImportedConditions(conditions) { return conditions; },
    validateEditableConditions() { return { valid: true }; },
    showCreateModal() { return true; },
    getCreateForm() { return form; },
    inferOrderTypeFromConditions() { return 'price'; },
    resetConditions() {},
    clearImportParam() {},
    showToast(message, type) { toasts.push({ message, type }); }
  };

  vm.createContext(context);
  vm.runInContext(functions, context, { filename: 'conditional-order-import-fallback.js' });

  await context.handleImportFromQuery();

  assert.strictEqual(form.ts_code.value, '300308.SZ', '查不到股票详情时应回退到载荷里的股票代码');
  assert.strictEqual(form.stock_name.value, '中际旭创', '查不到股票详情时应回退到载荷里的股票名称');
  assert.strictEqual(context.importedStrategyContext.strategySource, 'strategy_config', '仍应保留策略上下文');
  assert.ok(toasts.some((item) => item.type === 'success'), '回退导入成功时应提示 success');

  console.log('✅ conditional-order.html 导入股票信息回退测试通过');
}

main().catch((error) => {
  console.error(`❌ conditional-order.html 导入股票信息回退测试失败: ${error.message}`);
  process.exit(1);
});
