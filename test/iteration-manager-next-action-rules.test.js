#!/usr/bin/env node

const assert = require('assert');

function buildTask({
  taskId,
  status = 'running',
  scoreThreshold = 80,
  bestScore = 70,
  metrics = {},
  resultSummary = null
}) {
  return {
    taskId,
    status,
    scoreThreshold,
    bestScore,
    inputSummary: {
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    },
    bestParams: {
      stop_loss: 0.08
    },
    history: [
      {
        iteration: 1,
        score: bestScore,
        metrics
      }
    ],
    ...(resultSummary ? { resultSummary } : {})
  };
}

function main() {
  const iterationRouter = require('../api/iteration-manager');
  const { buildTaskResultSummary } = iterationRouter.__test;

  const drawdownTask = buildTask({
    taskId: 'ITER_RULE_DRAWDOWN',
    metrics: { maxDrawdown: -0.23, winRate: 0.52 }
  });
  const drawdownSummary = buildTaskResultSummary(drawdownTask);
  assert.equal(
    drawdownSummary.nextActionSuggestion.action,
    'tighten_risk_limits',
    '高回撤应优先建议收紧风险'
  );
  assert.equal(drawdownSummary.tuningPlan.action, 'tighten_risk_limits');
  assert.ok(drawdownSummary.tuningPlan.steps.length >= 3);

  const deviationTask = buildTask({
    taskId: 'ITER_RULE_DEVIATION',
    metrics: { maxDrawdown: -0.1, winRate: 0.52, simulationDeviation: 0.28 }
  });
  const deviationSummary = buildTaskResultSummary(deviationTask);
  assert.equal(
    deviationSummary.nextActionSuggestion.action,
    'recalibrate_slippage_model',
    '高模拟偏差应建议校准模拟假设'
  );
  assert.equal(deviationSummary.tuningPlan.action, 'recalibrate_slippage_model');

  const sharpeTask = buildTask({
    taskId: 'ITER_RULE_SHARPE',
    metrics: { maxDrawdown: -0.1, winRate: 0.52, sharpeRatio: 0.6 }
  });
  const sharpeSummary = buildTaskResultSummary(sharpeTask);
  assert.equal(
    sharpeSummary.nextActionSuggestion.action,
    'optimize_exit_ratio',
    '低夏普应建议优化止盈止损比'
  );
  assert.equal(sharpeSummary.tuningPlan.action, 'optimize_exit_ratio');

  const lowReturnHighWinTask = buildTask({
    taskId: 'ITER_RULE_RETURN',
    metrics: { maxDrawdown: -0.1, winRate: 0.58, sharpeRatio: 1.2, returnRate: 0.06 }
  });
  const lowReturnSummary = buildTaskResultSummary(lowReturnHighWinTask);
  assert.equal(
    lowReturnSummary.nextActionSuggestion.action,
    'increase_holding_period',
    '胜率高但收益低应建议延长持仓周期'
  );
  assert.equal(lowReturnSummary.tuningPlan.action, 'increase_holding_period');

  const belowThresholdCompletedTask = buildTask({
    taskId: 'ITER_RULE_THRESHOLD',
    status: 'completed',
    scoreThreshold: 85,
    bestScore: 78,
    metrics: { maxDrawdown: -0.1, winRate: 0.55, sharpeRatio: 1.1 }
  });
  const belowThresholdSummary = buildTaskResultSummary(belowThresholdCompletedTask);
  assert.equal(
    belowThresholdSummary.nextActionSuggestion.action,
    'increase_trials',
    'completed 但未达阈值应建议扩迭代'
  );
  assert.equal(belowThresholdSummary.tuningPlan.action, 'increase_trials');

  console.log('✅ iteration manager next action rules test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ iteration manager next action rules test failed: ${error.message}`);
  process.exit(1);
}
