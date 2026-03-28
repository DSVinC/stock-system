#!/usr/bin/env node

const assert = require('assert');
const http = require('http');

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

    if (payload) {
      req.write(payload);
    }

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
      resolve({
        server,
        port: server.address().port
      });
    });
  });
}

async function waitForCompletedStatus(port, taskId) {
  for (let i = 0; i < 100; i++) {
    const response = await requestJson({
      port,
      method: 'GET',
      path: `/api/iteration/status/${taskId}`
    });

    if (response.statusCode === 200 && response.body?.task?.status === 'completed') {
      return response;
    }

    if (response.statusCode >= 400 && response.statusCode !== 404) {
      throw new Error(`状态查询失败: ${JSON.stringify(response.body)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
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
  const { server, port } = await startTestServer(iterationRouter);

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

    const startResponse = await requestJson({
      port,
      method: 'POST',
      path: '/api/iteration/start',
      body: startPayload
    });

    assert.equal(startResponse.statusCode, 200);
    assert.equal(startResponse.body.success, true);

    const taskId = startResponse.body.taskId;
    assert.ok(taskId);

    const statusResponse = await waitForCompletedStatus(port, taskId);
    const task = statusResponse.body.task;

    assert.equal(task.optimizationBackend, 'heuristic');
    assert.equal(task.inputSummary.optimizationBackend, 'heuristic');
    assert.equal(task.resultSummary.optimizationBackend, 'heuristic');
    assert.equal(task.status, 'completed');
    assert.equal(spawnCalls.length, 0, '默认 heuristic 路径不应触发 optuna spawn');

    console.log('✅ iteration manager default backend test passed');
  } finally {
    childProcess.spawn = originalSpawn;
    dbModule.getDatabase = originalGetDatabase;
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager default backend test failed: ${error.message}`);
  process.exit(1);
});
