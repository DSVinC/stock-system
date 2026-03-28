#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const HTML_PATH = '/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html';

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
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    dump() {
      return { ...store };
    }
  };
}

function buildElements() {
  return {
    strategySelect: { value: 'double_ma', addEventListener: () => {} },
    optimizationBackend: { value: 'heuristic', addEventListener: () => {} },
    maxIterations: { value: '20' },
    scoreThreshold: { value: '70' },
    parallelTasks: { value: '4' },
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
  const clearedIntervals = [];

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
    clearInterval: (id) => {
      clearedIntervals.push(id);
    },
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
    isRunning: false,
    currentTaskId: null,
    pollInterval: null,
    ITERATION_TASK_STORAGE_KEYS: {
      current: 'currentTaskId',
      last: 'lastIterationTaskId'
    },
    __elements: elements,
    __logs: logs,
    __fetchCalls: fetchCalls,
    __clearedIntervals: clearedIntervals
  };

  vm.createContext(sandbox);
  return sandbox;
}

function loadFunctions(script, sandbox, functionNames) {
  const combined = functionNames
    .map((name) => extractFunction(script, name))
    .join('\n\n');
  vm.runInContext(combined, sandbox);
}

async function runSuccessRestoreTest(script) {
  const sandbox = buildSandbox({
    search: '?strategyType=seven_factor',
    storage: {
      lastIterationTaskId: 'task-restore'
    },
    fetchImpl: async (url) => {
      assert.equal(url, '/api/iteration/status/task-restore');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          task: {
            taskId: 'task-restore',
            strategyType: 'seven_factor',
            status: 'running',
            currentIteration: 3,
            maxIterations: 12,
            inputSummary: {
              stocks: ['000001.SZ', '600519.SH'],
              startDate: '2024-01-01',
              endDate: '2024-12-31',
              parallelTasks: 6,
              optimizationBackend: 'optuna',
              config: {
                alpha: 1
              }
            },
            bestScore: 88.3,
            bestParams: { alpha: 1, beta: 2 }
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
    'applyOptimizationBackendToUI',
    'renderResearchInputSummary',
    'updateStatusBadge',
    'updateProgress',
    'updateBestConfig',
    'updateTaskStatus',
    'restoreLastIterationTaskFromStorage',
    'initPage'
  ]);

  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.ok(html.includes('当前任务输入摘要'));
  assert.ok(html.includes('id="researchInputSummary"'));

  await sandbox.initPage();

  assert.equal(sandbox.__elements.statusBadge.textContent, '运行中');
  assert.equal(sandbox.__elements.startBtn.disabled, true);
  assert.equal(sandbox.__elements.stopBtn.disabled, false);
  assert.equal(sandbox.__elements.completedCount.textContent, '3');
  assert.equal(sandbox.__elements.totalCount.textContent, '12');
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('股票池'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('000001.SZ'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('600519.SH'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('2024-01-01 → 2024-12-31'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('并发任务'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('6 个并发任务'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('optuna（真实优化模式）'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('最佳结果'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('最佳得分'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('"alpha": 1'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('"beta": 2'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('alpha: 1'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('beta: 2'));
  assert.equal(sandbox.__elements.optimizationBackend.value, 'optuna');
  assert.equal(sandbox.localStorage.getItem('currentTaskId'), 'task-restore');
  assert.equal(sandbox.localStorage.getItem('lastIterationTaskId'), 'task-restore');
  assert.equal(sandbox.__fetchCalls.length, 1, '初始化应请求一次状态接口');
  assert.equal(sandbox.__startedPolling, true, '恢复运行中任务后应继续轮询');
  assert.equal(sandbox.__logs.some((entry) => entry.message.includes('已恢复最近任务')), true);

  sandbox.updateTaskStatus({
    taskId: 'task-update',
    strategyType: 'seven_factor',
    status: 'running',
    currentIteration: 4,
    maxIterations: 12,
    inputSummary: {
      stocks: ['300750.SZ'],
      startDate: '2024-02-01',
      endDate: '2024-02-29',
      parallelTasks: 8,
      optimizationBackend: 'heuristic',
      config: { foo: 'bar' }
    },
    bestScore: 91.5,
    bestParams: {
      gamma: 3,
      delta: 4
    }
  });

  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('300750.SZ'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('2024-02-01 → 2024-02-29'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('8 个并发任务'));
  assert.ok(sandbox.__elements.researchInputSummary.innerHTML.includes('heuristic（默认快速模式）'));
  assert.equal(sandbox.__elements.optimizationBackend.value, 'heuristic');
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('最佳结果'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('91.5'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('gamma: 3'));
  assert.ok(sandbox.__elements.bestConfig.innerHTML.includes('delta: 4'));
}

async function runPersistenceTest(script) {
  const sandbox = buildSandbox({
    search: '?strategyType=seven_factor&stocks=000001.SZ,600519.SH&startDate=2024-01-01&endDate=2024-12-31&config=%7B%22alpha%22%3A1%7D',
    fetchImpl: async (url) => {
      if (url === '/api/iteration/start') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, taskId: 'task-started' })
        };
      }

      throw new Error(`未预期的请求: ${url}`);
    }
  });

  loadFunctions(script, sandbox, [
    'updateStatusBadge',
    'safeParseConfig',
    'getUrlParams',
    'getSelectedOptimizationBackend',
    'getIterationTaskStorage',
    'persistCurrentTaskId',
    'startIteration'
  ]);

  await sandbox.startIteration();

  assert.equal(sandbox.__fetchCalls.length, 1, '启动应只发起一次请求');
  assert.equal(sandbox.__fetchCalls[0][0], '/api/iteration/start');
  assert.equal(sandbox.localStorage.getItem('currentTaskId'), 'task-started');
  assert.equal(sandbox.localStorage.getItem('lastIterationTaskId'), 'task-started');
  assert.equal(sandbox.__elements.startBtn.disabled, true);
  assert.equal(sandbox.__elements.stopBtn.disabled, false);
}

async function runCacheCleanupTest(script) {
  const sandbox = buildSandbox({
    storage: {
      currentTaskId: 'task-missing',
      lastIterationTaskId: 'task-missing'
    },
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: '任务不存在' })
    })
  });

  loadFunctions(script, sandbox, [
    'getIterationTaskStorage',
    'persistCurrentTaskId',
    'clearIterationTaskCache',
    'getPersistedIterationTaskId',
    'getIterationBadgeState',
    'setIterationTaskControls',
    'updateStatusBadge',
    'updateProgress',
    'updateBestConfig',
    'restoreLastIterationTaskFromStorage'
  ]);

  await sandbox.restoreLastIterationTaskFromStorage();

  assert.equal(sandbox.localStorage.getItem('currentTaskId'), null);
  assert.equal(sandbox.localStorage.getItem('lastIterationTaskId'), null);
  assert.equal(sandbox.__elements.bestConfig.innerHTML, '');
  assert.equal(sandbox.__elements.statusBadge.textContent, '空闲');
}

async function runTerminalStateRecoveryTest(script) {
  const sandbox = buildSandbox({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true })
    })
  });

  loadFunctions(script, sandbox, [
    'updateStatusBadge',
    'stopPolling',
    'finishIteration',
    'updateProgress',
    'updateBestConfig',
    'renderResearchInputSummary',
    'normalizeTaskInputSummary',
    'formatResearchConfig',
    'getIterationBadgeState',
    'applyOptimizationBackendToUI',
    'updateTaskStatus'
  ]);

  sandbox.isRunning = true;
  sandbox.currentTaskId = 'task-stopped';
  sandbox.pollInterval = 42;
  sandbox.__elements.startBtn.disabled = true;
  sandbox.__elements.stopBtn.disabled = false;

  sandbox.updateTaskStatus({
    taskId: 'task-stopped',
    strategyType: 'seven_factor',
    status: 'stopped',
    currentIteration: 5,
    maxIterations: 10,
    inputSummary: {
      stocks: ['000001.SZ']
    }
  });

  assert.equal(sandbox.pollInterval, null, 'stopped 后应停止轮询');
  assert.deepEqual(sandbox.__clearedIntervals, [42], 'stopped 后应清理轮询定时器');
  assert.equal(sandbox.__elements.startBtn.disabled, false);
  assert.equal(sandbox.__elements.stopBtn.disabled, true);
  assert.equal(sandbox.__elements.statusBadge.textContent, '已停止');
  assert.notEqual(sandbox.__elements.statusBadge.textContent, '完成');

  sandbox.isRunning = true;
  sandbox.currentTaskId = 'task-failed';
  sandbox.pollInterval = 99;
  sandbox.__elements.startBtn.disabled = true;
  sandbox.__elements.stopBtn.disabled = false;

  sandbox.updateTaskStatus({
    taskId: 'task-failed',
    strategyType: 'seven_factor',
    status: 'failed',
    currentIteration: 6,
    maxIterations: 10,
    inputSummary: {
      stocks: ['600519.SH']
    }
  });

  assert.equal(sandbox.pollInterval, null, 'failed 后应停止轮询');
  assert.deepEqual(sandbox.__clearedIntervals, [42, 99], 'failed 后也应清理轮询定时器');
  assert.equal(sandbox.__elements.startBtn.disabled, false);
  assert.equal(sandbox.__elements.stopBtn.disabled, true);
  assert.equal(sandbox.__elements.statusBadge.textContent, '错误');
}

async function main() {
  const script = loadScript();

  await runSuccessRestoreTest(script);
  await runPersistenceTest(script);
  await runCacheCleanupTest(script);
  await runTerminalStateRecoveryTest(script);

  console.log('✅ iteration manager recovery test passed');
}

main().catch((error) => {
  console.error(`❌ iteration manager recovery test failed: ${error.message}`);
  if (error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
