#!/usr/bin/env node

const assert = require('assert');

function main() {
  const iterationRouter = require('../api/iteration-manager');
  const { buildTaskResultSummary } = iterationRouter.__test;

  const blockedTask = {
    taskId: 'ITER_NEXT_ACTION_BLOCKED',
    status: 'completed',
    scoreThreshold: 80,
    bestScore: 88,
    inputSummary: {
      startDate: '2026-03-01',
      endDate: '2026-03-03',
      notifications: {
        feishuTested: false
      }
    },
    bestParams: {},
    history: []
  };

  const blockedSummary = buildTaskResultSummary(blockedTask);
  assert.ok(blockedSummary.nextActionSuggestion, '应返回下一步建议');
  assert.equal(
    blockedSummary.nextActionSuggestion.action,
    'complete_preflight_checklist',
    '评分达标但检查未完成时应先补齐清单'
  );
  assert.equal(blockedSummary.deploymentReadiness.readyForLive, false);

  const readyTask = {
    taskId: 'ITER_NEXT_ACTION_READY',
    status: 'completed',
    scoreThreshold: 80,
    bestScore: 92,
    inputSummary: {
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      notifications: {
        feishuTested: true
      }
    },
    bestParams: {
      stop_loss: 0.08,
      max_position: 0.2
    },
    history: [
      {
        iteration: 1,
        score: 92,
        metrics: {
          tradeCount: 38,
          simulationDeviation: 0.12
        }
      }
    ]
  };

  const readySummary = buildTaskResultSummary(readyTask);
  assert.equal(readySummary.deploymentReadiness.readyForLive, true, '检查全部通过时应允许实盘');
  assert.equal(
    readySummary.nextActionSuggestion.action,
    'publish_to_strategy_library',
    '评分达标且检查通过时应建议发布'
  );

  console.log('✅ iteration manager next action readiness test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ iteration manager next action readiness test failed: ${error.message}`);
  process.exit(1);
}
