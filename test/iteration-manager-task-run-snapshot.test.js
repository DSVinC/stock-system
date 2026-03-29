#!/usr/bin/env node

const assert = require('assert');
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

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function getRouteHandler(router, path, method) {
  const layer = router.stack.find((entry) => {
    return entry.route && entry.route.path === path && entry.route.methods[method.toLowerCase()];
  });

  if (!layer) {
    throw new Error(`未找到路由: ${method.toUpperCase()} ${path}`);
  }

  const handlerLayer = layer.route.stack.find((entry) => typeof entry.handle === 'function');
  if (!handlerLayer) {
    throw new Error(`路由 ${method.toUpperCase()} ${path} 缺少可执行处理函数`);
  }

  return handlerLayer.handle;
}

async function invokeHandler(handler, req) {
  const res = createMockResponse();
  const maybePromise = handler(req, res);
  if (maybePromise && typeof maybePromise.then === 'function') {
    await maybePromise;
  }
  return res;
}

async function main() {
  const childProcess = require('child_process');
  const dbModule = require('../api/db');
  const originalSpawn = childProcess.spawn;
  const originalGetDatabase = dbModule.getDatabase;
  const mockDb = createMockDb();

  childProcess.spawn = createMockSpawn();
  dbModule.getDatabase = async () => mockDb;

  const iterationRouter = require('../api/iteration-manager');
  const { activeTasks } = iterationRouter.__test;
  const startHandler = getRouteHandler(iterationRouter, '/start', 'post');
  const statusHandler = getRouteHandler(iterationRouter, '/status/:taskId', 'get');

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
      parallelTasks: 6
    };

    const startResponse = await invokeHandler(startHandler, {
      method: 'POST',
      body: startPayload,
      params: {},
      query: {}
    });

    assert.equal(startResponse.statusCode, 200);
    assert.equal(startResponse.body.success, true);
    assert.ok(startResponse.body.taskId);

    const taskId = startResponse.body.taskId;
    activeTasks.delete(taskId);

    const statusResponse = await invokeHandler(statusHandler, {
      method: 'GET',
      params: { taskId },
      query: {}
    });

    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.body.success, true);

    const task = statusResponse.body.task;
    assert.equal(task.taskId, taskId);
    assert.equal(task.strategyType, 'double_ma');
    assert.deepStrictEqual(task.inputSummary, {
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
      optimizationBackend: 'heuristic'
    });
    assert.equal(task.maxIterations, 10);
    assert.equal(typeof task.createdAt, 'string');

    console.log('✅ iteration manager task run snapshot test passed');
  } finally {
    childProcess.spawn = originalSpawn;
    dbModule.getDatabase = originalGetDatabase;
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager task run snapshot test failed: ${error.message}`);
  process.exit(1);
});
