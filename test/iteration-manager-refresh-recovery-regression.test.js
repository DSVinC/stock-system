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

  return match[1];
}

function extractFunction(source, functionName) {
  const asyncToken = `async function ${functionName}`;
  const syncToken = `function ${functionName}`;
  let start = source.indexOf(asyncToken);

  if (start === -1) {
    start = source.indexOf(syncToken);
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

  return source.slice(start, end);
}

function buildLocalStorage(initial = {}) {
  const store = { ...initial };

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    dump() {
      return { ...store };
    }
  };
}

function buildElements() {
  return {
    strategySelect: { value: 'seven_factor', addEventListener: () => {} },
    maxIterations: { value: '12', addEventListener: () => {}, focus: () => {}, title: '' },
    scoreThreshold: { value: '70', addEventListener: () => {}, focus: () => {}, title: '' },
    parallelTasks: { value: '4', addEventListener: () => {}, focus: () => {}, title: '' },
    startBtn: { disabled: false },
    stopBtn: { disabled: true },
    totalCount: { textContent: '20' },
    completedCount: { textContent: '0' },
    timeRemaining: { textContent: '--' },
    progressFill: { style: { width: '0%' } },
    statusBadge: { className: 'status-badge', textContent: '空闲', classList: { add: () => {} } },
    bestConfig: { innerHTML: '' },
    versionList: { innerHTML: '' },
    researchInputSummary: { innerHTML: '' },
    iterationLog: { appendChild: () => {}, scrollTop: 0, scrollHeight: 0 },
    feedbackStatusFilter: { value: 'all', addEventListener: () => {} },
    feedbackConfidenceFilter: { value: 'all', addEventListener: () => {} }
  };
}

function buildSandbox({ search = '', storage = {}, fetchImpl }) {
  const elements = buildElements();
  const localStorage = buildLocalStorage(storage);
  const logs = [];
  const fetchCalls = [];

  const sandbox = {
    window: {
      location: { search },
      localStorage
    },
    localStorage,
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
      return fetchImpl(...args);
    },
    addLog: (message, type) => {
      logs.push({ message, type });
    },
    loadVersionHistory: () => {},
    startPolling: () => {
      sandbox.__startedPolling = true;
    },
    stopPolling: () => {
      sandbox.__stoppedPolling = true;
    },
    updateRadarChart: () => {},
    radarChart: null,
    attachNumberFieldValidation: () => {},
    validateIterationInputs: () => ({ valid: true, values: { maxIterations: 12, scoreThreshold: 70, parallelTasks: 4 } }),
    hasImportedResearchInput: () => false,
    applyOptimizationBackendToUI: () => {},
    isRunning: false,
    currentTaskId: null,
    ITERATION_TASK_STORAGE_KEYS: {
      current: 'currentTaskId',
      last: 'lastIterationTaskId'
    },
    __elements: elements,
    __logs: logs,
    __fetchCalls: fetchCalls
  };

  vm.createContext(sandbox);
  return sandbox;
}

function loadFunctions(script, sandbox, functionNames) {
  for (const name of functionNames) {
    vm.runInContext(extractFunction(script, name), sandbox);
  }
}

async function runRestoreSuccessScenario(script) {
  const sandbox = buildSandbox({
    search: '?strategyType=seven_factor',
    storage: {
      lastIterationTaskId: 'task-refresh-recover'
    },
    fetchImpl: async (url) => {
      if (url === '/api/iteration/versions/seven_factor') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            versions: []
          })
        };
      }

      assert.equal(url, '/api/iteration/status/task-refresh-recover');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          task: {
            taskId: 'task-refresh-recover',
            strategyType: 'seven_factor',
            status: 'running',
            currentIteration: 3,
            maxIterations: 12,
            inputSummary: {
              stocks: ['000001.SZ', '600519.SH'],
              startDate: '2024-01-01',
              endDate: '2024-12-31',
              parallelTasks: 6,
              config: {
                alpha: 1
              }
            },
            bestScore: 88.3,
            bestParams: { alpha: 1, beta: 2 },
            resultSummary: {
              currentStatus: 'running',
              finalStatus: 'running',
              bestScore: 88.3,
              stopReason: '仍在运行'
            }
          }
        })
      };
    }
  });

  loadFunctions(script, sandbox, [
    'getIterationTaskStorage',
    'persistCurrentTaskId',
    'clearIterationTaskCache',
    'getPersistedIterationTaskId',
    'getIterationBadgeState',
    'setIterationTaskControls',
    'safeParseConfig',
    'getUrlParams',
    'formatResearchConfig',
    'normalizeTaskInputSummary',
    'renderResearchInputSummary',
    'updateStatusBadge',
    'updateProgress',
    'formatCompactParamValue',
    'flattenConfigSummary',
    'buildParamSummary',
    'updateBestConfig',
    'loadVersionHistory',
    'restoreLastIterationTaskFromStorage',
    'initPage'
  ]);

  await sandbox.initPage();

  assert.equal(sandbox.getPersistedIterationTaskId(), 'task-refresh-recover');
  assert.equal(sandbox.__elements.statusBadge.textContent, '运行中');
  assert.equal(sandbox.__elements.startBtn.disabled, true);
  assert.equal(sandbox.__elements.stopBtn.disabled, false);
  assert.equal(sandbox.__elements.completedCount.textContent, '3');
  assert.equal(sandbox.__elements.totalCount.textContent, '12');
  assert.equal(sandbox.__startedPolling, true);

  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('股票池'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('000001.SZ'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('600519.SH'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('2024-01-01 → 2024-12-31'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('6 个并发任务'));

  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('最佳结果'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('任务结果摘要'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('当前状态'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('running'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('最佳得分'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('88.3'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('仍在运行'));

  return sandbox;
}

async function runRestoreFailureScenario(script) {
  const sandbox = buildSandbox({
    storage: {
      lastIterationTaskId: 'task-broken-cache'
    },
    fetchImpl: async (url) => {
      assert.equal(url, '/api/iteration/status/task-broken-cache');
      return {
        ok: false,
        status: 503,
        json: async () => ({
          success: false,
          error: 'service unavailable'
        })
      };
    }
  });

  loadFunctions(script, sandbox, [
    'getIterationTaskStorage',
    'persistCurrentTaskId',
    'clearIterationTaskCache',
    'getPersistedIterationTaskId',
    'restoreLastIterationTaskFromStorage'
  ]);

  await sandbox.restoreLastIterationTaskFromStorage();

  assert.equal(sandbox.localStorage.getItem('lastIterationTaskId'), null);
  assert.equal(sandbox.localStorage.getItem('currentTaskId'), null);
  assert.equal(sandbox.getPersistedIterationTaskId(), null);
  assert.equal(sandbox.__fetchCalls.length, 1);
}

async function main() {
  const script = loadScript();
  await runRestoreSuccessScenario(script);
  await runRestoreFailureScenario(script);
  console.log('✅ iteration manager refresh recovery regression test passed');
}

main().catch((error) => {
  console.error(`❌ iteration manager refresh recovery regression test failed: ${error.message}`);
  process.exit(1);
});
