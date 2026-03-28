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
    }
  };
}

function buildHarness() {
  const localStorage = createLocalStorage();
  localStorage.setItem('stockSelectConfig', JSON.stringify({
    limit: 10,
    minScore: 0,
    decision: '',
    strategy: 'seven_factor'
  }));

  const elements = {
    importConfirmBtn: { disabled: false, textContent: '导入选中参数' },
    configMinScore: { value: 0 },
    configLimit: { value: 10 }
  };

  const alerts = [];
  const fetchCalls = [];

  const context = {
    console,
    localStorage,
    window: {
      selectedImportIndex: 0,
      publicStrategies: []
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
              name: '七因子高分策略（导入副本）'
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
    extractFunction(html, 'fillConfigFromTemplate'),
    extractFunction(html, 'applyStrategyToUI'),
    extractFunction(html, 'confirmImportStrategy')
  ].join('\n\n');

  vm.runInContext(code, context, { filename: 'select-reference-snippets.js' });

  return { context, localStorage, elements, alerts, fetchCalls };
}

function readConfig(localStorage) {
  return JSON.parse(localStorage.getItem('stockSelectConfig'));
}

async function testTemplateImportTracksTemplateSource() {
  const { context, localStorage, elements } = buildHarness();

  context.fillConfigFromTemplate({
    template_id: 'SEVEN_FACTOR_V1',
    name: '七因子模板 V1',
    params: {
      selection: {
        stock_top_n_per_industry: 12,
        min_seven_factor_score: 0.77
      }
    }
  });

  const config = readConfig(localStorage);
  assert.strictEqual(elements.configLimit.value, 12, '模板应填充股票数量');
  assert.strictEqual(elements.configMinScore.value, 77, '模板应填充最低评分');
  assert.strictEqual(config.strategySource, 'template', '模板导入后应标记为 template 来源');
  assert.strictEqual(config.templateId, 'SEVEN_FACTOR_V1', '模板导入后应保存 templateId');
  assert.strictEqual(config.templateName, '七因子模板 V1', '模板导入后应保存 templateName');
  assert.strictEqual(config.strategyConfigId, null, '模板导入后不应残留策略库副本 ID');
  assert.strictEqual(config.strategyConfigName, null, '模板导入后不应残留策略库副本名称');
}

async function testStrategyCopyImportTracksConfigSourceWithoutScore() {
  const { context, localStorage, alerts, fetchCalls } = buildHarness();
  context.window.publicStrategies = [{
    id: 123,
    name: '无分数策略',
    description: '测试策略'
  }];

  await context.confirmImportStrategy();

  const config = readConfig(localStorage);
  assert.strictEqual(fetchCalls.length, 1, '应调用复制策略接口');
  assert.strictEqual(config.strategySource, 'strategy_config', '导入策略库副本后应标记为 strategy_config 来源');
  assert.strictEqual(config.strategyConfigId, 999, '应保存复制后副本 ID');
  assert.strictEqual(config.strategyConfigName, '七因子高分策略（导入副本）', '应保存复制后副本名称');
  assert.strictEqual(config.templateId, 999, '兼容字段 templateId 也应回填');
  assert.strictEqual(config.templateName, '七因子高分策略（导入副本）', '兼容字段 templateName 也应回填');
  assert.deepStrictEqual(
    alerts,
    ['策略库参数导入成功！已应用到当前选股配置。'],
    '成功提示文案应保持不变'
  );
}

async function main() {
  await testTemplateImportTracksTemplateSource();
  await testStrategyCopyImportTracksConfigSourceWithoutScore();
  console.log('✅ select.html 策略身份字段统一测试通过');
}

main().catch((error) => {
  console.error(`❌ select.html 策略身份字段统一测试失败: ${error.message}`);
  process.exit(1);
});
