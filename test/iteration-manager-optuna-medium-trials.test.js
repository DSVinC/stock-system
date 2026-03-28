#!/usr/bin/env node

const assert = require('assert');
const http = require('http');
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

function requestJson({ port, method, path, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          : {}
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              body: raw ? JSON.parse(raw) : null
            });
          } catch (error) {
            reject(new Error(`响应不是有效 JSON: ${raw}`));
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function startTestServer(iterationRouter) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/iteration', iterationRouter);

  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
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

async function waitForCompletedStatus(port, taskId) {
  for (let i = 0; i < 120; i++) {
    const response = await requestJson({
      port,
      method: 'GET',
      path: `/api/iteration/status/${taskId}`
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
  const { server, port } = await startTestServer(iterationRouter);

  try {
    const trialSizes = [40, 55, 80];

    for (const nTrials of trialSizes) {
      const startResponse = await requestJson({
        port,
        method: 'POST',
        path: '/api/iteration/start',
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

      const task = await waitForCompletedStatus(port, startResponse.body.taskId);

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
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager optuna medium trials test failed: ${error.message}`);
  process.exit(1);
});
