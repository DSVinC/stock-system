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
    strategySelect: { value: 'seven_factor', addEventListener: () => {} },
    maxIterations: { value: '12' },
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

function buildSandbox({ storage = {}, fetchImpl }) {
  const elements = buildElements();
  const localStorage = buildLocalStorage(storage);
  const logs = [];
  const fetchCalls = [];

  const sandbox = {
    window: {
      location: { search: '?strategyType=seven_factor' },
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

async function runScenario(script, { taskId, task, assertions }) {
  const sandbox = buildSandbox({
    storage: {
      lastIterationTaskId: taskId
    },
    fetchImpl: async (url) => {
      assert.equal(url, `/api/iteration/status/${taskId}`);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          task
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
    'updateBestConfig',
    'restoreLastIterationTaskFromStorage'
  ]);

  await sandbox.restoreLastIterationTaskFromStorage();

  assertions(sandbox);

  assert.equal(sandbox.__fetchCalls.length, 1, '恢复任务应仅请求一次状态接口');
  assert.equal(sandbox.localStorage.getItem('currentTaskId'), taskId);
  assert.equal(sandbox.localStorage.getItem('lastIterationTaskId'), taskId);
  assert.equal(sandbox.__startedPolling, undefined, '完成/停止态恢复后不应继续轮询');
}

async function main() {
  const script = loadScript();

  await runScenario(script, {
    taskId: 'task-completed-recovery',
    task: {
      taskId: 'task-completed-recovery',
      strategyType: 'seven_factor',
      status: 'completed',
      currentIteration: 12,
      maxIterations: 12,
      inputSummary: {
        stocks: ['000001.SZ', '600519.SH'],
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        parallelTasks: 6,
        config: { alpha: 1 }
      },
      bestScore: 96.8,
      bestParams: { alpha: 1, beta: 2 },
      resultSummary: {
        currentStatus: 'completed',
        finalStatus: 'completed',
        bestScore: 96.8,
        completedAt: '2026-03-27 11:20:00',
        stopReason: '已完成全部迭代'
      }
    },
    assertions: (sandbox) => {
      const { bestConfig, startBtn, stopBtn, completedCount, totalCount } = sandbox.__elements;

      assert.equal(startBtn.disabled, false);
      assert.equal(stopBtn.disabled, true);
      assert.equal(completedCount.textContent, '12');
      assert.equal(totalCount.textContent, '12');
      assert.ok(bestConfig.innerHTML.includes('任务结果摘要'));
      assert.ok(bestConfig.innerHTML.includes('最终状态'));
      assert.ok(bestConfig.innerHTML.includes('completed'));
      assert.ok(bestConfig.innerHTML.includes('完成时间'));
      assert.ok(bestConfig.innerHTML.includes('2026-03-27 11:20:00'));
      assert.ok(bestConfig.innerHTML.includes('停止原因'));
      assert.ok(bestConfig.innerHTML.includes('已完成全部迭代'));
    }
  });

  await runScenario(script, {
    taskId: 'task-stopped-recovery',
    task: {
      taskId: 'task-stopped-recovery',
      strategyType: 'seven_factor',
      status: 'stopped',
      currentIteration: 7,
      maxIterations: 12,
      inputSummary: {
        stocks: ['300750.SZ'],
        startDate: '2024-02-01',
        endDate: '2024-02-29',
        parallelTasks: 4,
        config: { alpha: 2 }
      },
      bestScore: 81.2,
      bestParams: { alpha: 2 },
      resultSummary: {
        currentStatus: 'stopped',
        finalStatus: 'stopped',
        bestScore: 81.2,
        stoppedAt: '2026-03-27 12:05:00',
        stopReason: '手动停止任务'
      }
    },
    assertions: (sandbox) => {
      const { bestConfig, startBtn, stopBtn, completedCount, totalCount } = sandbox.__elements;

      assert.equal(startBtn.disabled, false);
      assert.equal(stopBtn.disabled, true);
      assert.equal(completedCount.textContent, '7');
      assert.equal(totalCount.textContent, '12');
      assert.ok(bestConfig.innerHTML.includes('任务结果摘要'));
      assert.ok(bestConfig.innerHTML.includes('最终状态'));
      assert.ok(bestConfig.innerHTML.includes('stopped'));
      assert.ok(bestConfig.innerHTML.includes('停止时间'));
      assert.ok(bestConfig.innerHTML.includes('2026-03-27 12:05:00'));
      assert.ok(bestConfig.innerHTML.includes('停止原因'));
      assert.ok(bestConfig.innerHTML.includes('手动停止任务'));
    }
  });

  console.log('✅ iteration-manager completed/stopped recovery test passed');
}

main().catch((error) => {
  console.error(`❌ iteration-manager completed/stopped recovery test failed: ${error.message}`);
  process.exit(1);
});
