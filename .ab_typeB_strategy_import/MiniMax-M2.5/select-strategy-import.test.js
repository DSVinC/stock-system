#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'select.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunction(source, name) {
  const asyncToken = `async function ${name}(`;
  const plainToken = `function ${name}(`;
  const asyncStart = source.indexOf(asyncToken);
  const plainStart = source.indexOf(plainToken);
  const start = asyncStart !== -1 ? asyncStart : plainStart;
  if (start === -1) {
    throw new Error(`未找到函数: ${name}`);
  }

  let braceIndex = source.indexOf('{', start);
  if (braceIndex === -1) {
    throw new Error(`函数缺少起始大括号: ${name}`);
  }

  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`函数大括号未闭合: ${name}`);
}

function extractConstObject(source, name) {
  const startToken = `const ${name} =`;
  const start = source.indexOf(startToken);
  if (start === -1) {
    throw new Error(`未找到常量: ${name}`);
  }

  let braceIndex = source.indexOf('{', start);
  if (braceIndex === -1) {
    throw new Error(`常量缺少对象字面量: ${name}`);
  }

  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const semicolon = source.indexOf(';', i);
        return source.slice(start, semicolon + 1);
      }
    }
  }

  throw new Error(`常量对象未闭合: ${name}`);
}

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

async function main() {
  const localStorage = createLocalStorage();
  localStorage.setItem('stockSelectConfig', JSON.stringify({
    limit: 10,
    minScore: 0,
    decision: '',
    strategy: 'seven_factor'
  }));

  const elements = {
    importConfirmBtn: { disabled: false, textContent: '导入选中参数' },
    configMinScore: { value: 0 }
  };

  const alerts = [];
  const fetchCalls = [];

  const context = {
    console,
    localStorage,
    window: {
      selectedImportIndex: 0,
      publicStrategies: [{
        id: 123,
        name: '七因子高分策略',
        seven_factor_min_score: 0.82
      }]
    },
    document: {
      getElementById(id) {
        if (!(id in elements)) {
          throw new Error(`未 stub 的 DOM 节点: ${id}`);
        }
        return elements[id];
      }
    },
    alert(message) {
      alerts.push(message);
    },
    hideImportPanel() {},
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        async json() {
          return {
            success: true,
            data: {
              id: 999,
              name: '七因子高分策略（导入副本）',
              seven_factor_min_score: 0.82
            }
          };
        }
      };
    }
  };

  vm.createContext(context);

  const code = [
    extractConstObject(html, 'DEFAULT_CONFIG'),
    extractFunction(html, 'getConfig'),
    extractFunction(html, 'saveConfig'),
    extractFunction(html, 'applyStrategyToUI'),
    extractFunction(html, 'confirmImportStrategy')
  ].join('\n\n');

  vm.runInContext(code, context, { filename: 'select-import-snippets.js' });

  await context.confirmImportStrategy();

  const savedConfig = JSON.parse(localStorage.getItem('stockSelectConfig'));

  assert.strictEqual(fetchCalls.length, 1, '应调用一次复制策略接口');
  assert.strictEqual(fetchCalls[0].url, '/api/strategy-config/copy', '应复制公开策略到用户策略库');
  assert.strictEqual(elements.configMinScore.value, 82, '应应用七因子最低评分到 UI');
  assert.strictEqual(savedConfig.minScore, 82, '应把最低评分保存到当前配置');
  assert.strictEqual(
    savedConfig.templateId,
    999,
    '导入策略库参数后，应把复制后的策略副本 ID 写入当前配置'
  );
  assert.strictEqual(
    savedConfig.templateName,
    '七因子高分策略（导入副本）',
    '导入策略库参数后，应把复制后的策略副本名称写入当前配置'
  );
  assert.deepStrictEqual(
    alerts,
    ['策略库参数导入成功！已应用到当前选股配置。'],
    '成功提示应保持不变'
  );

  console.log('✅ select.html 策略库导入身份同步测试通过');
}

main().catch((error) => {
  console.error(`❌ select.html 策略库导入身份同步测试失败: ${error.message}`);
  process.exit(1);
});
