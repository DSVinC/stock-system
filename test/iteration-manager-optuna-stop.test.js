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
    const server = app.listen(0, () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function createHangingSpawn(spawnState) {
  return () => {
    spawnState.calls += 1;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};
    child.killedSignal = null;
    child.kill = (signal) => {
      spawnState.killCalls += 1;
      child.killedSignal = signal;
      process.nextTick(() => child.emit('close', 143));
      return true;
    };
    spawnState.child = child;
    return child;
  };
}

async function waitForStatus(port, taskId, expected) {
  for (let i = 0; i < 80; i++) {
    const response = await requestJson({
      port,
      method: 'GET',
      path: `/api/iteration/status/${taskId}`
    });
    if (response.statusCode === 200 && response.body?.task?.status === expected) {
      return response.body.task;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`等待状态 ${expected} 超时`);
}

async function main() {
  const spawnState = { calls: 0, killCalls: 0, child: null };
  const childProcess = require('child_process');
  const originalSpawn = childProcess.spawn;
  const dbModule = require('../api/db');
  const originalGetDatabase = dbModule.getDatabase;
  const mockDb = createMockDb();

  childProcess.spawn = createHangingSpawn(spawnState);
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
        maxIterations: 12,
        stocks: ['000001.SZ'],
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      }
    });

    assert.equal(startResponse.statusCode, 200);
    assert.equal(startResponse.body.success, true);
    const taskId = startResponse.body.taskId;
    assert.ok(taskId);

    const stopResponse = await requestJson({
      port,
      method: 'POST',
      path: `/api/iteration/stop/${taskId}`
    });
    assert.equal(stopResponse.statusCode, 200);
    assert.equal(stopResponse.body.success, true);
    assert.equal(stopResponse.body.task.status, 'stopped');
    assert.equal(stopResponse.body.task.stopReason, 'manual_stop');

    const task = await waitForStatus(port, taskId, 'stopped');
    assert.equal(task.status, 'stopped');
    assert.equal(task.stopReason, 'manual_stop');
    assert.equal(task.resultSummary?.stopReason, 'manual_stop');
    assert.ok(task.stoppedAt);
    assert.equal(task.error, undefined, '手动停止不应带 failed 错误');
    assert.equal(spawnState.calls, 1, 'optuna 任务应启动一次子进程');
    assert.equal(spawnState.killCalls, 1, '手动停止应终止子进程');
    assert.equal(spawnState.child.killedSignal, 'SIGTERM');

    console.log('✅ iteration manager optuna stop test passed');
  } finally {
    childProcess.spawn = originalSpawn;
    dbModule.getDatabase = originalGetDatabase;
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager optuna stop test failed: ${error.message}`);
  process.exit(1);
});
