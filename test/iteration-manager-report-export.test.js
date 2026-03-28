#!/usr/bin/env node

const assert = require('assert');
const { URL } = require('url');

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

function invokeRouter(router, method, rawPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(rawPath, 'http://127.0.0.1');
    const req = {
      method,
      url: `${url.pathname}${url.search}`,
      originalUrl: `${url.pathname}${url.search}`,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: {},
      params: {}
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

async function main() {
  const mockDb = createMockDb();
  const dbModule = require('../api/db');
  const originalGetDatabase = dbModule.getDatabase;
  dbModule.getDatabase = async () => mockDb;

  const iterationRouter = require('../api/iteration-manager');
  const { activeTasks } = iterationRouter.__test;

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

    const reportRes = await invokeRouter(iterationRouter, 'GET', `/report/${taskId}?format=markdown`);

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
    assert.ok(markdown.includes('## 执行清单'));
    assert.ok(markdown.includes('## 约束条件'));

    const unsupportedRes = await invokeRouter(iterationRouter, 'GET', `/report/${taskId}?format=json`);

    assert.equal(unsupportedRes.statusCode, 400);
    assert.equal(unsupportedRes.body.success, false);
    assert.ok(String(unsupportedRes.body.error || '').includes('format=markdown'));

    const missingRes = await invokeRouter(iterationRouter, 'GET', '/report/ITER_REPORT_NOT_FOUND?format=markdown');

    assert.equal(missingRes.statusCode, 404);
    assert.equal(missingRes.body.success, false);

    console.log('✅ iteration manager report export test passed');
  } finally {
    activeTasks.clear();
    dbModule.getDatabase = originalGetDatabase;
  }
}

main().catch(error => {
  console.error(`❌ iteration manager report export test failed: ${error.message}`);
  process.exit(1);
});
