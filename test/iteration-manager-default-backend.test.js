#!/usr/bin/env node

const assert = require('assert');
const { URL } = require('url');

function createMockDb() {
  const rows = new Map();

  return {
    async runPromise(sql, params = []) {
      const normalizedSql = sql.trim().toLowerCase();

      if (normalizedSql.startsWith('create table if not exists iteration_task_runs')) {
        return { changes: 0 };
      }

      if (normalizedSql.startsWith('insert into iteration_task_runs')) {
        const row = {
          task_id: params[0],
          strategy_type: params[1],
          input_summary_json: params[2],
          status: params[3],
          progress: params[4],
          current_iteration: params[5],
          max_iterations: params[6],
          best_score: params[7],
          best_params_json: params[8],
          result_summary_json: params[9],
          created_at: params[10],
          updated_at: params[11]
        };
        rows.set(row.task_id, row);
        return { changes: 1 };
      }

      return { changes: 0 };
    },

    async getPromise(sql, params = []) {
      const normalizedSql = sql.trim().toLowerCase();

      if (normalizedSql.includes('from iteration_task_runs')) {
        return rows.get(params[0]) || null;
      }

      if (normalizedSql.includes('from sqlite_master')) {
        return { name: 'iteration_task_runs' };
      }

      return null;
    },

    async allPromise() {
      return [];
    }
  };
}

function invokeRouter(router, method, rawPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(rawPath, 'http://127.0.0.1');
    const req = {
      method,
      url: `${url.pathname}${url.search}`,
      originalUrl: `${url.pathname}${url.search}`,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: {},
      body,
      params: {}
    };

    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      _done: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = value;
        return this;
      },
      getHeader(name) {
        return this.headers[String(name).toLowerCase()];
      },
      json(payload) {
        this.body = payload;
        finish();
        return this;
      },
      send(payload) {
        this.body = payload;
        finish();
        return this;
      }
    };

    function finish() {
      if (res._done) {
        return;
      }
      res._done = true;
      resolve({
        statusCode: res.statusCode,
        body: res.body
      });
    }

    try {
      router.handle(req, res, err => {
        if (err) {
          reject(err);
          return;
        }
        finish();
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function waitForCompletedStatus(iterationRouter, taskId) {
  for (let i = 0; i < 100; i++) {
    const response = await invokeRouter(iterationRouter, 'GET', `/status/${taskId}`);

    if (response.statusCode === 200 && response.body?.task?.status === 'completed') {
      return response;
    }

    if (response.statusCode >= 400 && response.statusCode !== 404) {
      throw new Error(`状态查询失败: ${JSON.stringify(response.body)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 20));
  }

  throw new Error('等待默认后端任务完成超时');
}

async function main() {
  const spawnCalls = [];
  const childProcess = require('child_process');
  const originalSpawn = childProcess.spawn;
  const dbModule = require('../api/db');
  const originalGetDatabase = dbModule.getDatabase;
  const mockDb = createMockDb();

  childProcess.spawn = (...args) => {
    spawnCalls.push(args);
    return originalSpawn(...args);
  };
  dbModule.getDatabase = async () => mockDb;

  const iterationRouter = require('../api/iteration-manager');
  const { activeTasks } = iterationRouter.__test;

  try {
    const startPayload = {
      strategyType: 'double_ma',
      config: {
        fast_period: 5,
        slow_period: 20
      },
      maxIterations: 1,
      scoreThreshold: 0,
      stocks: ['000001.SZ', '600519.SH'],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      parallelTasks: 6
    };

    const startResponse = await invokeRouter(iterationRouter, 'POST', '/start', startPayload);

    assert.equal(startResponse.statusCode, 200);
    assert.equal(startResponse.body.success, true);

    const taskId = startResponse.body.taskId;
    assert.ok(taskId);

    const statusResponse = await waitForCompletedStatus(iterationRouter, taskId);
    const task = statusResponse.body.task;

    assert.equal(task.optimizationBackend, 'heuristic');
    assert.equal(task.inputSummary.optimizationBackend, 'heuristic');
    assert.equal(task.resultSummary.optimizationBackend, 'heuristic');
    assert.equal(task.status, 'completed');
    assert.equal(spawnCalls.length, 0, '默认 heuristic 路径不应触发 optuna spawn');

    console.log('✅ iteration manager default backend test passed');
  } finally {
    activeTasks.clear();
    childProcess.spawn = originalSpawn;
    dbModule.getDatabase = originalGetDatabase;
  }
}

main().catch(error => {
  console.error(`❌ iteration manager default backend test failed: ${error.message}`);
  process.exit(1);
});
