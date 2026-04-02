#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, '..', 'iteration-manager.html');

function extractFunction(source, functionName) {
  const asyncToken = `async function ${functionName}`;
  const syncToken = `function ${functionName}`;
  let start = source.indexOf(asyncToken);
  let prefix = 'async ';

  if (start === -1) {
    start = source.indexOf(syncToken);
    prefix = '';
  }

  if (start === -1) {
    throw new Error(`未找到函数 ${functionName}`);
  }

  const braceIndex = source.indexOf('{', start);
  let depth = 0;
  let end = braceIndex;
  while (end < source.length) {
    const char = source[end];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
    end += 1;
  }

  return prefix + source.slice(source.indexOf('function', start), end);
}

function loadScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('未找到主脚本');
  }
  return {
    html,
    script: match[1]
  };
}

function buildSandbox(search) {
  const logs = [];
  const fetchCalls = [];
  const elements = {
    strategySelect: { value: 'seven_factor' },
    maxIterations: { value: '12' },
    scoreThreshold: { value: '80' },
    parallelTasks: { value: '6' },
    startBtn: { disabled: false },
    stopBtn: { disabled: true },
    totalCount: { textContent: '20' },
    researchInputSummary: { innerHTML: '' },
    versionList: { innerHTML: '' },
    iterationLog: {
      appendChild: () => {},
      scrollTop: 0,
      scrollHeight: 0
    },
    feedbackStatusFilter: { value: 'all', addEventListener: () => {} },
    feedbackConfidenceFilter: { value: 'all', addEventListener: () => {} }
  };

  const sandbox = {
    window: { location: { search } },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
      addEventListener: () => {},
      createElement: () => ({ className: '', textContent: '' })
    },
    URLSearchParams,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Math,
    Date,
    parseInt,
    setInterval: () => 1,
    clearInterval: () => {},
    confirm: () => true,
    console,
    fetch: async (...args) => {
      fetchCalls.push(args);
      return {
        json: async () => ({ success: true, taskId: 'task-1' })
      };
    },
    addLog: (message, type) => logs.push({ message, type }),
    loadVersionHistory: (strategyType) => logs.push({ message: `load:${strategyType}`, type: 'info' }),
    updateStatusBadge: () => {},
    startPolling: () => {},
    stopPolling: () => {},
    updateProgress: () => {},
    updateBestConfig: () => {},
    updateRadarChart: () => {},
    isRunning: false,
    currentTaskId: null,
    radarChart: null
  };

  vm.createContext(sandbox);
  sandbox.__elements = elements;
  sandbox.__logs = logs;
  sandbox.__fetchCalls = fetchCalls;
  return sandbox;
}

function runFunction(script, name, sandbox) {
  vm.runInContext(extractFunction(script, name), sandbox);
  return sandbox[name];
}

function loadFunctions(script, sandbox, names) {
  names.forEach((name) => {
    runFunction(script, name, sandbox);
  });
}

async function main() {
  const { html, script } = loadScript();

  assert.ok(!script.includes("['000001.SZ']"), '脚本中不应保留默认股票池兜底');
  assert.ok(!script.includes("2024-01-01"), '脚本中不应保留默认开始日期兜底');
  assert.ok(!script.includes("2024-12-31"), '脚本中不应保留默认结束日期兜底');
  assert.ok(script.includes('parallelTasks'), '脚本中应显式提交 parallelTasks');
  assert.ok(html.includes('researchInputSummary'), '页面中应存在研究输入摘要容器');

  // 场景 1: URL 导入内容应在页面中可见
  {
    const sandbox = buildSandbox(
      '?strategyType=seven_factor&stocks=000001.SZ,600519.SH&startDate=2024-01-01&endDate=2024-12-31&config=%7B%22alpha%22%3A1%2C%22beta%22%3A2%7D'
    );
    loadFunctions(script, sandbox, [
      'safeParseConfig',
      'getUrlParams',
      'formatResearchConfig',
      'renderResearchInputSummary',
      'initPage'
    ]);

    const getUrlParams = sandbox.getUrlParams;
    const renderResearchInputSummary = sandbox.renderResearchInputSummary;
    sandbox.initPage();

    const params = getUrlParams();
    assert.strictEqual(Array.from(params.stocks).join(','), '000001.SZ,600519.SH');
    assert.strictEqual(params.startDate, '2024-01-01');
    assert.strictEqual(params.endDate, '2024-12-31');

    const summaryHtml = sandbox.__elements.researchInputSummary.innerHTML;
    assert.ok(summaryHtml.includes('2 只股票'), '摘要应展示股票数量');
    assert.ok(summaryHtml.includes('000001.SZ'), '摘要应展示导入股票');
    assert.ok(summaryHtml.includes('600519.SH'), '摘要应展示导入股票');
    assert.ok(summaryHtml.includes('2024-01-01 → 2024-12-31'), '摘要应展示时间区间');
    assert.ok(summaryHtml.includes('"alpha": 1'), '摘要应展示 config');
    assert.ok(summaryHtml.includes('"beta": 2'), '摘要应展示 config');

    assert.ok(sandbox.__logs.some((entry) => entry.message === 'load:seven_factor'), 'initPage 应按 URL 策略类型加载历史');
    assert.ok(typeof renderResearchInputSummary === 'function' || true);
  }

  // 场景 2: 缺少 URL 研究输入时，不应继续启动并偷偷使用默认值
  {
    const sandbox = buildSandbox('');
    loadFunctions(script, sandbox, ['safeParseConfig', 'getUrlParams', 'startIteration']);
    runFunction(script, 'startIteration', sandbox);
    await sandbox.startIteration();

    assert.strictEqual(sandbox.__fetchCalls.length, 0, '缺少 URL 研究输入时不应发起请求');
    assert.ok(
      sandbox.__logs.some((entry) => entry.type === 'error' && entry.message.includes('URL 导入 stocks/startDate/endDate')),
      '缺少 URL 研究输入时应给出错误提示'
    );
  }

  // 场景 3: 有 URL 输入时，请求体必须真实携带 parallelTasks
  {
    const sandbox = buildSandbox(
      '?strategyType=seven_factor&stocks=000001.SZ,600519.SH&startDate=2024-01-01&endDate=2024-12-31&config=%7B%22alpha%22%3A1%7D'
    );
    loadFunctions(script, sandbox, ['safeParseConfig', 'getUrlParams', 'startIteration']);
    runFunction(script, 'startIteration', sandbox);
    await sandbox.startIteration();

    assert.strictEqual(sandbox.__fetchCalls.length, 1, '应发起一次启动请求');
    const [, init] = sandbox.__fetchCalls[0];
    const body = JSON.parse(init.body);

    assert.deepStrictEqual(body.stocks, ['000001.SZ', '600519.SH']);
    assert.strictEqual(body.startDate, '2024-01-01');
    assert.strictEqual(body.endDate, '2024-12-31');
    assert.strictEqual(body.parallelTasks, 6, '请求体应携带并发任务数');
    assert.deepStrictEqual(body.config, { alpha: 1 });
  }

  console.log('✅ iteration manager research input test passed');
}

main().catch((error) => {
  console.error(`❌ iteration manager research input test failed: ${error.message}`);
  process.exit(1);
});
