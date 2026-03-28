#!/usr/bin/env node

const assert = require('assert');
const iterationRouter = require('../api/iteration-manager');

async function main() {
  const { deriveExecutionFeedbackStatus, DEFAULT_EXECUTION_SUMMARY } = iterationRouter.__test;

  // 测试 1: no_data / none - 缺少 execution_summary 时稳定返回
  console.log('测试 1: no_data / none - 空数据');
  const result1 = deriveExecutionFeedbackStatus(null);
  assert.equal(result1.status, 'no_data');
  assert.equal(result1.confidence, 'none');

  const result1b = deriveExecutionFeedbackStatus(undefined);
  assert.equal(result1b.status, 'no_data');
  assert.equal(result1b.confidence, 'none');

  const result1c = deriveExecutionFeedbackStatus(DEFAULT_EXECUTION_SUMMARY);
  assert.equal(result1c.status, 'no_data');
  assert.equal(result1c.confidence, 'none');

  // 测试 2: positive / low - 有正收益和足够胜率
  console.log('测试 2: positive / low - 正收益且胜率>=0.5');
  const result2 = deriveExecutionFeedbackStatus({
    position_closed_count: 1,
    simulated_trade_count: 2,
    trigger_failure_count: 0,
    trigger_failure_rate: 0,
    total_realized_pnl: 100,
    win_rate: 1
  });
  assert.equal(result2.status, 'positive');
  assert.equal(result2.confidence, 'low');

  // 测试 2b: positive / medium
  console.log('测试 2b: positive / medium');
  const result2b = deriveExecutionFeedbackStatus({
    position_closed_count: 3,
    simulated_trade_count: 5,
    trigger_failure_count: 1,
    trigger_failure_rate: 0.1667,
    total_realized_pnl: 200,
    win_rate: 0.6667
  });
  assert.equal(result2b.status, 'positive');
  assert.equal(result2b.confidence, 'medium');

  // 测试 3: caution - 高 trigger_failure_rate
  console.log('测试 3: caution - 高 trigger_failure_rate');
  const result3 = deriveExecutionFeedbackStatus({
    position_closed_count: 5,
    simulated_trade_count: 3,
    trigger_failure_count: 2,
    trigger_failure_rate: 0.4,
    total_realized_pnl: 100,
    win_rate: 0.6
  });
  assert.equal(result3.status, 'caution');
  assert.equal(result3.confidence, 'medium');

  // 测试 4: caution - 负 pnl
  console.log('测试 4a: caution - 负 pnl');
  const result4a = deriveExecutionFeedbackStatus({
    position_closed_count: 4,
    simulated_trade_count: 5,
    trigger_failure_count: 0,
    trigger_failure_rate: 0,
    total_realized_pnl: -50,
    win_rate: 0.5
  });
  assert.equal(result4a.status, 'caution');
  assert.equal(result4a.confidence, 'medium');

  // 测试 4b: caution - 低 win_rate
  console.log('测试 4b: caution - 低 win_rate');
  const result4b = deriveExecutionFeedbackStatus({
    position_closed_count: 2,
    simulated_trade_count: 3,
    trigger_failure_count: 0,
    trigger_failure_rate: 0,
    total_realized_pnl: 50,
    win_rate: 0.35
  });
  assert.equal(result4b.status, 'caution');
  assert.equal(result4b.confidence, 'low');

  // 测试 5: mixed - 不满足 positive 也不触发 caution
  console.log('测试 5: mixed - 中间状态');
  const result5 = deriveExecutionFeedbackStatus({
    position_closed_count: 5,
    simulated_trade_count: 5,
    trigger_failure_count: 0,
    trigger_failure_rate: 0,
    total_realized_pnl: 100,  // 正收益
    win_rate: 0.4  // 胜率低于 0.5 但高于 0.4
  });
  assert.equal(result5.status, 'mixed');
  assert.equal(result5.confidence, 'medium');

  // 测试 5b: mixed - total_realized_pnl = 0 且 win_rate 在 0.4-0.5 之间
  console.log('测试 5b: mixed - pnl=0 且中间胜率');
  const result5b = deriveExecutionFeedbackStatus({
    position_closed_count: 3,
    simulated_trade_count: 5,
    trigger_failure_count: 0,
    trigger_failure_rate: 0,
    total_realized_pnl: 0,
    win_rate: 0.45
  });
  assert.equal(result5b.status, 'mixed');
  assert.equal(result5b.confidence, 'medium');

  // 测试 6: high confidence
  console.log('测试 6: high confidence - position_closed_count >= 10');
  const result6 = deriveExecutionFeedbackStatus({
    position_closed_count: 10,
    simulated_trade_count: 15,
    trigger_failure_count: 2,
    trigger_failure_rate: 0.1176,
    total_realized_pnl: 500,
    win_rate: 0.7
  });
  assert.equal(result6.status, 'positive');
  assert.equal(result6.confidence, 'high');

  // 测试 6b: high confidence with caution
  console.log('测试 6b: high confidence - caution 状态');
  const result6b = deriveExecutionFeedbackStatus({
    position_closed_count: 12,
    simulated_trade_count: 10,
    trigger_failure_count: 8,
    trigger_failure_rate: 0.4444,
    total_realized_pnl: 300,
    win_rate: 0.6
  });
  assert.equal(result6b.status, 'caution');
  assert.equal(result6b.confidence, 'high');

  // 测试边界条件
  console.log('测试边界条件');
  // win_rate = 0.5 正好满足 positive 条件
  const edge1 = deriveExecutionFeedbackStatus({
    position_closed_count: 3,
    simulated_trade_count: 5,
    trigger_failure_count: 0,
    trigger_failure_rate: 0,
    total_realized_pnl: 1,
    win_rate: 0.5
  });
  assert.equal(edge1.status, 'positive');
  assert.equal(edge1.confidence, 'medium');

  // win_rate = 0.4 正好是 mixed 边界（不触发 caution，因为 < 0.4 才是 caution）
  const edge2 = deriveExecutionFeedbackStatus({
    position_closed_count: 2,
    simulated_trade_count: 3,
    trigger_failure_count: 0,
    trigger_failure_rate: 0,
    total_realized_pnl: 100,
    win_rate: 0.4
  });
  assert.equal(edge2.status, 'mixed');

  // trigger_failure_rate = 0.4 正好是 caution 边界
  const edge3 = deriveExecutionFeedbackStatus({
    position_closed_count: 5,
    simulated_trade_count: 3,
    trigger_failure_count: 2,
    trigger_failure_rate: 0.4,
    total_realized_pnl: 500,
    win_rate: 0.8
  });
  assert.equal(edge3.status, 'caution');

  console.log('✅ iteration feedback status test passed');
}

main().catch((error) => {
  console.error(`❌ iteration feedback status test failed: ${error.message}`);
  process.exit(1);
});