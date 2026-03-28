#!/usr/bin/env node

const assert = require('assert');
const http = require('http');
const express = require('express');
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
        }
      }));
      child.emit('close', 0);
    });

    return child;
  };
}

function startTestServer(iterationRouter) {
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

async function main() {
  const childProcess = require('child_process');
  const dbModule = require('../api/db');
  const originalSpawn = childProcess.spawn;
  const originalGetDatabase = dbModule.getDatabase;
  childProcess.spawn = createMockSpawn();
  dbModule.getDatabase = async () => createMockDb();

  const iterationRouter = require('../api/iteration-manager');
  const { server, port } = await startTestServer(iterationRouter);

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

    const startResponse = await requestJson({
      port,
      method: 'POST',
      path: '/api/iteration/start',
      body: startPayload
    });

    assert.equal(startResponse.statusCode, 200);
    assert.equal(startResponse.body.success, true);
    assert.ok(startResponse.body.taskId);

    const statusResponse = await requestJson({
      port,
      method: 'GET',
      path: `/api/iteration/status/${startResponse.body.taskId}`
    });

    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.body.success, true);

    const task = statusResponse.body.task;
    assert.deepEqual(task.inputSummary, {
      stocks: ['000001.SZ', '600519.SH'],
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
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager input summary test failed: ${error.message}`);
  process.exit(1);
});
