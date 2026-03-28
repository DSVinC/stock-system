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

function requestJson({ port, path }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET'
      },
      res => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
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
    req.end();
  });
}

async function startTestServer(iterationRouter) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/iteration', iterationRouter);

  return new Promise(resolve => {
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
  const { activeTasks } = iterationRouter.__test;
  const { server, port } = await startTestServer(iterationRouter);

  try {
    const taskId = 'ITER_REPORT_EXPORT';
    activeTasks.set(taskId, {
      taskId,
      strategyType: 'seven_factor',
      optimizationBackend: 'optuna',
      inputSummary: {
        stocks: ['000001.SZ', '600519.SH'],
        startDate: '2026-01-01',
        endDate: '2026-03-01',
        notifications: {
          feishuTested: true
        }
      },
      status: 'completed',
      progress: 100,
      currentIteration: 30,
      maxIterations: 30,
      scoreThreshold: 80,
      bestScore: 91.2,
      bestParams: {
        stop_loss: 0.08,
        max_position: 0.2
      },
      history: [
        {
          iteration: 1,
          score: 89,
          metrics: {
            tradeCount: 42,
            simulationDeviation: 0.1
          }
        }
      ],
      createdAt: '2026-03-28T01:00:00.000Z',
      completedAt: '2026-03-28T01:30:00.000Z',
      optunaTrialsRequested: 30,
      optunaTrialsCompleted: 30
    });

    const reportRes = await requestJson({
      port,
      path: `/api/iteration/report/${taskId}?format=markdown`
    });

    assert.equal(reportRes.statusCode, 200);
    assert.equal(reportRes.body.success, true);
    assert.equal(reportRes.body.data.taskId, taskId);
    assert.equal(reportRes.body.data.format, 'markdown');
    assert.ok(reportRes.body.data.fileName.endsWith('_report.md'));

    const markdown = reportRes.body.data.markdown;
    assert.ok(markdown.includes('# 迭代任务回测报告'));
    assert.ok(markdown.includes('## 任务信息'));
    assert.ok(markdown.includes('## 回测输入'));
    assert.ok(markdown.includes('## 结果摘要'));
    assert.ok(markdown.includes('## 最佳参数'));
    assert.ok(markdown.includes('## 实盘前检查'));
    assert.ok(markdown.includes('## 下一步建议'));

    const unsupportedRes = await requestJson({
      port,
      path: `/api/iteration/report/${taskId}?format=json`
    });

    assert.equal(unsupportedRes.statusCode, 400);
    assert.equal(unsupportedRes.body.success, false);
    assert.ok(String(unsupportedRes.body.error || '').includes('format=markdown'));

    const missingRes = await requestJson({
      port,
      path: '/api/iteration/report/ITER_REPORT_NOT_FOUND?format=markdown'
    });

    assert.equal(missingRes.statusCode, 404);
    assert.equal(missingRes.body.success, false);

    console.log('✅ iteration manager report export test passed');
  } finally {
    activeTasks.clear();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(`❌ iteration manager report export test failed: ${error.message}`);
  process.exit(1);
});
