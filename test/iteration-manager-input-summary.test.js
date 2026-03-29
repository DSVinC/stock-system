#!/usr/bin/env node

const assert = require('assert');
const { URL } = require('url');
const { EventEmitter } = require('events');

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

function createMockSpawn() {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};

    process.nextTick(() => {
      child.stdout.emit('data', JSON.stringify({
        best_score: 88.8,
        best_params: {
          fast_period: 8,
          slow_period: 24
        },
        trade_count: 12,
        metrics: {
          tradeCount: 12
        }
      }));
      child.emit('close', 0);
    });

    return child;
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
      params: {},
      body
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
        headers: res.headers,
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

async function waitForCompletedStatus(router, taskId) {
  for (let i = 0; i < 100; i++) {
    const response = await invokeRouter(router, 'GET', `/status/${taskId}`);

    if (response.statusCode === 200 && response.body?.task?.status === 'completed') {
      return response;
    }

    if (response.statusCode >= 400 && response.statusCode !== 404) {
      throw new Error(`状态查询失败: ${JSON.stringify(response.body)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('等待任务完成超时');
}

async function main() {
  const childProcess = require('child_process');
  const dbModule = require('../api/db');
  const originalSpawn = childProcess.spawn;
  const originalGetDatabase = dbModule.getDatabase;
  childProcess.spawn = createMockSpawn();
  dbModule.getDatabase = async () => createMockDb();

  const iterationRouter = require('../api/iteration-manager');

  try {
    const startPayload = {
      strategyType: 'double_ma',
      config: {
        fast_period: 5,
        slow_period: 20
      },
      maxIterations: 0,
      scoreThreshold: 80,
      stocks: ['000001.SZ', '600519.SH'],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      parallelTasks: 6,
      optimizationBackend: 'optuna'
    };

    const startResponse = await invokeRouter(iterationRouter, 'POST', '/start', startPayload);

    assert.equal(startResponse.statusCode, 200);
    assert.equal(startResponse.body.success, true);
    assert.ok(startResponse.body.taskId);

    const statusResponse = await waitForCompletedStatus(iterationRouter, startResponse.body.taskId);
    const task = statusResponse.body.task;

    assert.deepEqual(task.inputSummary, {
      stocks: ['000001.SZ', '600519.SH'],
      excludedStocks: [],
      autoExcludedStocks: [],
      autoAddedStocks: [],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      config: {
        fast_period: 5,
        slow_period: 20
      },
      parallelTasks: 6,
      optimizationBackend: 'optuna'
    });

    console.log('✅ iteration manager input summary test passed');
  } finally {
    childProcess.spawn = originalSpawn;
    dbModule.getDatabase = originalGetDatabase;
    iterationRouter.__test.activeTasks.clear();
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager input summary test failed: ${error.message}`);
  process.exit(1);
});
