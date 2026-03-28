#!/usr/bin/env node

const assert = require('assert');

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

async function main() {
  const mockDb = createMockDb();
  const dbModule = require('../api/db');
  dbModule.getDatabase = async () => mockDb;

  const iterationRouter = require('../api/iteration-manager');
  const { activeTasks, persistIterationTaskRun } = iterationRouter.__test;
  const statusLayer = iterationRouter.stack.find((layer) => layer.route && layer.route.path === '/status/:taskId');
  assert.ok(statusLayer, '应存在 /status/:taskId 路由');
  const statusHandler = statusLayer.route.stack[0].handle;

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

  const response = {
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

  await statusHandler(
    { params: { taskId } },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.task.taskId, taskId);
  assert.equal(response.body.task.status, 'stopped');
  assert.ok(response.body.task.resultSummary, '状态接口应回读 resultSummary');
  assert.equal(response.body.task.resultSummary.bestScore, 91.5);
  assert.equal(response.body.task.resultSummary.status, 'stopped');
  assert.equal(response.body.task.resultSummary.stoppedAt, stoppedAt);
  assert.equal(response.body.task.resultSummary.stopReason, 'manual_stop');
  assert.ok(response.body.task.resultSummary.nextActionSuggestion, '应返回下一步建议');
  assert.equal(response.body.task.resultSummary.nextActionSuggestion.action, 'resume_iteration');
  assert.ok(response.body.task.resultSummary.deploymentReadiness, '应返回实盘前检查摘要');
  assert.equal(
    response.body.task.resultSummary.deploymentReadiness.readyForLive,
    false,
    '缺少偏差/风控/飞书测试信息时不应直接标记可实盘'
  );
  assert.equal(
    response.body.task.resultSummary.deploymentReadiness.checks.length,
    5,
    '应包含 5 项标准化检查项'
  );
  assert.equal(
    response.body.task.resultSummary.deploymentReadiness.checks[0].id,
    'score_threshold'
  );
  assert.equal(
    response.body.task.resultSummary.deploymentReadiness.checks[1].id,
    'simulation_period_or_trade_count'
  );

  console.log('✅ iteration manager result summary snapshot test passed');
}

main().catch((error) => {
  console.error(`❌ iteration manager result summary snapshot test failed: ${error.message}`);
  process.exit(1);
});
