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
        rows.set(params[0], {
          task_id: params[0],
          result_summary_json: params[9]
        });
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

function invokeRoute(router, { method, path, body }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const res = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = value;
      },
      getHeader(name) {
        return this.headers[String(name).toLowerCase()];
      },
      json(payload) {
        if (!settled) {
          settled = true;
          resolve({ statusCode: this.statusCode, body: payload });
        }
        return this;
      },
      send(payload) {
        if (!settled) {
          settled = true;
          resolve({ statusCode: this.statusCode, body: payload });
        }
        return this;
      },
      end(payload) {
        if (!settled) {
          settled = true;
          resolve({ statusCode: this.statusCode, body: payload || null });
        }
        return this;
      }
    };

    const req = {
      method,
      url: path,
      originalUrl: path,
      path,
      body: body || {},
      query: {},
      params: {},
      headers: {}
    };

    try {
      router.handle(req, res, (error) => {
        if (error && !settled) {
          settled = true;
          reject(error);
        } else if (!settled) {
          settled = true;
          resolve({ statusCode: res.statusCode, body: null });
        }
      });
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
  });
}

function createMockSpawn(spawnCalls) {
  return (command, args, options) => {
    spawnCalls.push({ command, args, options });

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};

    process.nextTick(() => {
      const idx = args.indexOf('--n-trials');
      const nTrials = idx >= 0 ? Number(args[idx + 1]) : 0;
      const payload = {
        best_score: 88 + nTrials / 100,
        best_params: { ma_short: 10, ma_long: 30, stop_loss: 0.1 },
        trials: nTrials
      };
      child.stdout.emit('data', JSON.stringify(payload));
      child.emit('close', 0);
    });

    return child;
  };
}

async function waitForCompletedStatus(router, taskId) {
  for (let i = 0; i < 120; i++) {
    const response = await invokeRoute(router, {
      method: 'GET',
      path: `/status/${taskId}`
    });

    if (response.statusCode === 200 && response.body?.task?.status === 'completed') {
      return response.body.task;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('等待任务完成超时');
}

async function main() {
  const spawnCalls = [];
  const childProcess = require('child_process');
  const originalSpawn = childProcess.spawn;
  const dbModule = require('../api/db');
  const originalGetDatabase = dbModule.getDatabase;
  const mockDb = createMockDb();

  childProcess.spawn = createMockSpawn(spawnCalls);
  dbModule.getDatabase = async () => mockDb;

  const iterationRouter = require('../api/iteration-manager');

  try {
    const trialSizes = [40, 55, 80];

    for (const nTrials of trialSizes) {
      const startResponse = await invokeRoute(iterationRouter, {
        method: 'POST',
        path: '/start',
        body: {
          strategyType: 'double_ma',
          optimizationBackend: 'optuna',
          config: { fast_period: 5, slow_period: 20 },
          maxIterations: nTrials,
          scoreThreshold: 80,
          stocks: ['000001.SZ', '600519.SH'],
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        }
      });

      assert.equal(startResponse.statusCode, 200);
      assert.equal(startResponse.body.success, true);

      const task = await waitForCompletedStatus(iterationRouter, startResponse.body.taskId);

      assert.equal(task.status, 'completed');
      assert.equal(task.optimizationBackend, 'optuna');
      assert.equal(task.resultSummary.optimizationBackend, 'optuna');
      assert.equal(task.resultSummary.requestedTrials, nTrials);
      assert.equal(task.resultSummary.completedTrials, nTrials);
      assert.equal(task.resultSummary.trialCount, nTrials);
      assert.ok(Number(task.bestScore) > 88);
    }

    assert.equal(spawnCalls.length, trialSizes.length);
    assert.deepStrictEqual(
      spawnCalls.map(call => Number(call.args[call.args.indexOf('--n-trials') + 1])),
      trialSizes
    );

    console.log('✅ iteration manager optuna medium trials test passed');
  } finally {
    childProcess.spawn = originalSpawn;
    dbModule.getDatabase = originalGetDatabase;
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager optuna medium trials test failed: ${error.message}`);
  process.exit(1);
});
