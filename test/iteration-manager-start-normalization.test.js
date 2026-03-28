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
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: raw ? JSON.parse(raw) : null
          });
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
  return (command, args) => {
    spawnCalls.push({ command, args });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};
    process.nextTick(() => {
      child.stdout.emit('data', JSON.stringify({ best_score: 88.8, best_params: { a: 1 } }));
      child.emit('close', 0);
    });
    return child;
  };
}

async function waitForTask(port, taskId) {
  for (let i = 0; i < 100; i++) {
    const response = await requestJson({
      port,
      method: 'GET',
      path: `/api/iteration/status/${taskId}`
    });
    if (response.statusCode === 200 && response.body?.task) {
      return response.body.task;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('等待任务状态超时');
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
    const startResponse = await requestJson({
      port,
      method: 'POST',
      path: '/api/iteration/start',
      body: {
        strategyType: 'double_ma',
        optimizationBackend: 'optuna',
        config: { fast_period: 5, slow_period: 20 },
        maxIterations: 0,
        scoreThreshold: -9,
        parallelTasks: 0,
        stocks: ['000001.SZ'],
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      }
    });

    assert.equal(startResponse.statusCode, 200);
    assert.equal(startResponse.body.success, true);
    const taskId = startResponse.body.taskId;
    assert.ok(taskId);

    const task = await waitForTask(port, taskId);
    assert.equal(task.maxIterations, 10, 'maxIterations 非法值应回退默认 10');
    assert.equal(task.inputSummary.parallelTasks, null, 'parallelTasks 非法值应回退 null');
    assert.equal(task.scoreThreshold, 0, 'scoreThreshold 下限应 clamp 到 0');

    assert.equal(spawnCalls.length, 1);
    const args = spawnCalls[0].args;
    assert.equal(args[args.indexOf('--n-trials') + 1], '10', 'optuna 试验次数应使用归一化后的 maxIterations');

    console.log('✅ iteration manager start normalization test passed');
  } finally {
    childProcess.spawn = originalSpawn;
    dbModule.getDatabase = originalGetDatabase;
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager start normalization test failed: ${error.message}`);
  process.exit(1);
});
