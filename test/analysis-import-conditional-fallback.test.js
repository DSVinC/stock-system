#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'analysis.html');
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
      if (depth === 0) return source.slice(start, i + 1);
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

async function main() {
  const localStorage = createLocalStorage();
  localStorage.setItem('stockSelectConfig', JSON.stringify({
    strategySource: 'strategy_config',
    strategyConfigId: 5,
    strategyConfigName: '自动迭代版本（导入副本）',
    templateId: 5,
    templateName: '自动迭代版本（导入副本）'
  }));

  const stockV2Data = new Map([
    ['300308.SZ', {
      strategies: {
        balanced: {
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
      }
    }]
  ]);

  let alertMessage = null;
  const context = {
    console,
    localStorage,
    stockV2Data,
    encodeURIComponent,
    fetch() {
      return Promise.resolve({
        json: () => Promise.resolve({
          success: false,
          error: '未配置 TUSHARE_TOKEN'
        })
      });
    },
    alert(message) {
      alertMessage = message;
    },
    window: {
      location: { href: './analysis.html' }
    }
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(html, 'importToConditional', { async: true }), context, {
    filename: 'analysis-import-conditional-fallback.js'
  });

  await context.importToConditional('300308.SZ', '中际旭创', 'balanced');

  assert.strictEqual(alertMessage, null, '本地已有 v2Data 时，不应因为 API 失败而 alert');
  assert.ok(
    context.window.location.href.startsWith('./conditional-order.html?import='),
    '应回退到本地策略并继续跳转条件单页'
  );

  const [, rawImport] = context.window.location.href.split('?import=');
  const payload = JSON.parse(decodeURIComponent(rawImport));
  assert.strictEqual(payload.stock_code, '300308.SZ', '应保留股票代码');
  assert.ok(payload.strategy?.actions?.length > 0, '应带上本地 balanced 策略');
  assert.strictEqual(payload.strategySource, 'strategy_config', '应继续附带策略身份');

  console.log('✅ analysis.html 导入条件单本地回退测试通过');
}

main().catch((error) => {
  console.error(`❌ analysis.html 导入条件单本地回退测试失败: ${error.message}`);
  process.exit(1);
});
