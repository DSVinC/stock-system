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

async function main() {
  const localStorage = createLocalStorage();
  localStorage.setItem('stockSelectConfig', JSON.stringify({
    strategySource: 'strategy_config',
    strategyConfigId: 5,
    strategyConfigName: '自动迭代版本（导入副本）',
    templateId: 5,
    templateName: '自动迭代版本（导入副本）'
  }));

  const context = {
    console,
    localStorage,
    encodeURIComponent,
    decodeURIComponent,
    alert(message) {
      throw new Error(`不应触发 alert: ${message}`);
    },
    fetch() {
      return Promise.resolve({
        json: () => Promise.resolve({
          success: true,
          data: {
            stock_code: '300308.SZ',
            stock_name: '中际旭创',
            strategy: {
              actions: [
                { action_type: 'buy', trigger_conditions: [{ field: 'price', operator: '>=', value: 100 }] }
              ]
            }
          }
        })
      });
    },
    window: {
      location: { href: './analysis.html' }
    }
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(html, 'importToConditional', { async: true }), context, { filename: 'analysis-import-conditional.js' });

  await context.importToConditional('300308.SZ', '中际旭创', 'balanced');

  assert.ok(
    context.window.location.href.startsWith('./conditional-order.html?import='),
    '应跳转到 conditional-order.html 并附带 import 参数'
  );

  const [, rawImport] = context.window.location.href.split('?import=');
  const payload = JSON.parse(decodeURIComponent(rawImport));

  assert.strictEqual(payload.strategySource, 'strategy_config', '应透传 strategySource');
  assert.strictEqual(payload.strategyConfigId, 5, '应透传 strategyConfigId');
  assert.strictEqual(payload.strategyConfigName, '自动迭代版本（导入副本）', '应透传 strategyConfigName');
  assert.strictEqual(payload.templateId, 5, '应透传 templateId');
  assert.strictEqual(payload.templateName, '自动迭代版本（导入副本）', '应透传 templateName');

  console.log('✅ analysis.html 导入条件单上下文测试通过');
}

main().catch((error) => {
  console.error(`❌ analysis.html 导入条件单上下文测试失败: ${error.message}`);
  process.exit(1);
});
