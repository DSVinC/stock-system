#!/usr/bin/env node

const assert = require('assert');
const http = require('http');

function createMockDb() {
  const rows = new Map();

  return {
    rows,

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

async function main() {
  const mockDb = createMockDb();
  const dbModule = require('../api/db');
  dbModule.getDatabase = async () => mockDb;

  const iterationRouter = require('../api/iteration-manager');
  const { activeTasks, persistIterationTaskRun } = iterationRouter.__test;
  const { server, port } = await startTestServer(iterationRouter);

  try {
    const taskId = 'ITER_RESULT_SUMMARY_SNAPSHOT';
    const stoppedAt = '2026-03-27T08:30:00.000Z';
    const task = {
      taskId,
      strategyType: 'double_ma',
      inputSummary: {
        stocks: ['000001.SZ'],
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        config: {
          fast_period: 5,
          slow_period: 20
        },
        parallelTasks: 2
      },
      status: 'stopped',
      progress: 60,
      currentIteration: 3,
      maxIterations: 5,
      bestScore: 91.5,
      bestParams: {
        fast_period: 8,
        slow_period: 34
      },
      history: [
        {
          iteration: 1,
          score: 88.2,
          timestamp: '2026-03-27T08:00:00.000Z'
        }
      ],
      stoppedAt,
      stopReason: 'manual_stop'
    };

    activeTasks.set(taskId, task);
    await persistIterationTaskRun(task);
    activeTasks.delete(taskId);

    const storedRow = mockDb.rows.get(taskId);
    assert.ok(storedRow, '任务快照应写入数据库');

    const storedSummary = JSON.parse(storedRow.result_summary_json);
    assert.equal(storedSummary.status, 'stopped');
    assert.equal(storedSummary.bestScore, 91.5);
    assert.equal(storedSummary.stoppedAt, stoppedAt);
    assert.equal(storedSummary.stopReason, 'manual_stop');

    const statusResponse = await requestJson({
      port,
      method: 'GET',
      path: `/api/iteration/status/${taskId}`
    });

    assert.equal(statusResponse.statusCode, 200);
    assert.equal(statusResponse.body.success, true);
    assert.equal(statusResponse.body.task.taskId, taskId);
    assert.equal(statusResponse.body.task.status, 'stopped');
    assert.ok(statusResponse.body.task.resultSummary, '状态接口应回读 resultSummary');
    assert.equal(statusResponse.body.task.resultSummary.bestScore, 91.5);
    assert.equal(statusResponse.body.task.resultSummary.status, 'stopped');
    assert.equal(statusResponse.body.task.resultSummary.stoppedAt, stoppedAt);
    assert.equal(statusResponse.body.task.resultSummary.stopReason, 'manual_stop');
    assert.ok(statusResponse.body.task.resultSummary.nextActionSuggestion, '应返回下一步建议');
    assert.equal(statusResponse.body.task.resultSummary.nextActionSuggestion.action, 'resume_iteration');
    assert.ok(statusResponse.body.task.resultSummary.deploymentReadiness, '应返回实盘前检查摘要');
    assert.equal(
      statusResponse.body.task.resultSummary.deploymentReadiness.readyForLive,
      false,
      '缺少偏差/风控/飞书测试信息时不应直接标记可实盘'
    );
    assert.equal(
      statusResponse.body.task.resultSummary.deploymentReadiness.checks.length,
      5,
      '应包含 5 项标准化检查项'
    );
    assert.equal(
      statusResponse.body.task.resultSummary.deploymentReadiness.checks[0].id,
      'score_threshold'
    );
    assert.equal(
      statusResponse.body.task.resultSummary.deploymentReadiness.checks[1].id,
      'simulation_period_or_trade_count'
    );

    console.log('✅ iteration manager result summary snapshot test passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`❌ iteration manager result summary snapshot test failed: ${error.message}`);
  process.exit(1);
});
