#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, '..', 'iteration-manager.html');

function loadScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('未找到主脚本');
  }

  return { html, script: match[1] };
}

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

function buildSandbox({ search, optimizationBackendValue }) {
  const logs = [];
  const fetchCalls = [];
  const elements = {
    strategySelect: { value: 'seven_factor' },
    optimizationBackend: { value: optimizationBackendValue },
    maxIterations: { value: '12' },
    scoreThreshold: { value: '80' },
    parallelTasks: { value: '4' },
    startBtn: { disabled: false },
    stopBtn: { disabled: true },
    totalCount: { textContent: '20' },
    researchInputSummary: { innerHTML: '' },
    versionList: { innerHTML: '' },
    iterationLog: { appendChild: () => {}, scrollTop: 0, scrollHeight: 0 },
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
    loadVersionHistory: () => {},
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

async function invokeStartIteration(script, sandbox) {
  for (const fn of [
    'safeParseConfig',
    'getUrlParams',
    'getSelectedOptimizationBackend',
    'formatResearchConfig',
    'normalizeTaskInputSummary',
    'renderResearchInputSummary',
    'initPage',
    'startIteration'
  ]) {
    vm.runInContext(extractFunction(script, fn), sandbox);
  }

  await sandbox.initPage();
  await sandbox.startIteration();
}

async function main() {
  const { html, script } = loadScript();

  assert.ok(html.includes('id="optimizationBackend"'), '页面中应存在优化后端选择器');
  assert.ok(html.includes('heuristic（默认快速模式）'), '页面中应展示 heuristic 默认说明');
  assert.ok(html.includes('optuna（真实优化模式）'), '页面中应展示 optuna 说明');
  assert.ok(script.includes('getSelectedOptimizationBackend'), '脚本中应包含优化后端选择逻辑');
  assert.ok(script.includes('optimizationBackend'), '脚本中应显式提交 optimizationBackend');

  {
    const sandbox = buildSandbox({
      search: '?strategyType=seven_factor&stocks=000001.SZ,600519.SH&startDate=2024-01-01&endDate=2024-12-31&parallelTasks=6&config=%7B%22alpha%22%3A1%7D',
      optimizationBackendValue: ''
    });

    await invokeStartIteration(script, sandbox);

    assert.strictEqual(sandbox.__elements.parallelTasks.value, '6', 'initPage 应将 URL 的并发任务数写回输入框');

    assert.strictEqual(sandbox.__fetchCalls.length, 1, '应发起一次启动请求');
    const [, init] = sandbox.__fetchCalls[0];
    const body = JSON.parse(init.body);

    assert.strictEqual(body.optimizationBackend, 'heuristic', '默认应提交 heuristic');
    assert.strictEqual(body.parallelTasks, 6, 'URL 中的并发任务数应同步进请求体');
    assert.deepStrictEqual(body.stocks, ['000001.SZ', '600519.SH']);
    assert.strictEqual(body.startDate, '2024-01-01');
    assert.strictEqual(body.endDate, '2024-12-31');
  }

  {
    const sandbox = buildSandbox({
      search: '?strategyType=seven_factor&stocks=000001.SZ,600519.SH&startDate=2024-01-01&endDate=2024-12-31&parallelTasks=6&config=%7B%22alpha%22%3A1%7D',
      optimizationBackendValue: 'optuna'
    });

    await invokeStartIteration(script, sandbox);

    assert.strictEqual(sandbox.__fetchCalls.length, 1, '应发起一次启动请求');
    const [, init] = sandbox.__fetchCalls[0];
    const body = JSON.parse(init.body);

    assert.strictEqual(body.optimizationBackend, 'optuna', '选择 optuna 时应提交 optuna');
    assert.strictEqual(body.parallelTasks, 6, '选择 optuna 时仍应同步 URL 并发任务数');
  }

  console.log('✅ iteration manager optimization backend request test passed');
}

main().catch((error) => {
  console.error(`❌ iteration manager optimization backend request test failed: ${error.message}`);
  process.exit(1);
});
