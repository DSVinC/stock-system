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
  assert.equal(
    buildTaskResultSummary(drawdownTask).nextActionSuggestion.action,
    'tighten_risk_limits',
    '高回撤应优先建议收紧风险'
  );

  const deviationTask = buildTask({
    taskId: 'ITER_RULE_DEVIATION',
    metrics: { maxDrawdown: -0.1, winRate: 0.52, simulationDeviation: 0.28 }
  });
  assert.equal(
    buildTaskResultSummary(deviationTask).nextActionSuggestion.action,
    'recalibrate_slippage_model',
    '高模拟偏差应建议校准模拟假设'
  );

  const sharpeTask = buildTask({
    taskId: 'ITER_RULE_SHARPE',
    metrics: { maxDrawdown: -0.1, winRate: 0.52, sharpeRatio: 0.6 }
  });
  assert.equal(
    buildTaskResultSummary(sharpeTask).nextActionSuggestion.action,
    'optimize_exit_ratio',
    '低夏普应建议优化止盈止损比'
  );

  const lowReturnHighWinTask = buildTask({
    taskId: 'ITER_RULE_RETURN',
    metrics: { maxDrawdown: -0.1, winRate: 0.58, sharpeRatio: 1.2, returnRate: 0.06 }
  });
  assert.equal(
    buildTaskResultSummary(lowReturnHighWinTask).nextActionSuggestion.action,
    'increase_holding_period',
    '胜率高但收益低应建议延长持仓周期'
  );

  const belowThresholdCompletedTask = buildTask({
    taskId: 'ITER_RULE_THRESHOLD',
    status: 'completed',
    scoreThreshold: 85,
    bestScore: 78,
    metrics: { maxDrawdown: -0.1, winRate: 0.55, sharpeRatio: 1.1 }
  });
  assert.equal(
    buildTaskResultSummary(belowThresholdCompletedTask).nextActionSuggestion.action,
    'increase_trials',
    'completed 但未达阈值应建议扩迭代'
  );

  console.log('✅ iteration manager next action rules test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ iteration manager next action rules test failed: ${error.message}`);
  process.exit(1);
}
