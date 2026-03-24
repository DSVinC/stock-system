#!/usr/bin/env node

/**
 * joint-optimizer.js 单元测试
 * TASK_V3_301 - 联合优化器（数学组合）测试
 *
 * 测试覆盖：
 * 1. 仓位比例组合生成测试
 * 2. 绩效指标计算测试
 * 3. 联合净值计算测试
 * 4. JointOptimizer 类测试
 * 5. 边界情况测试
 * 6. 性能测试
 */

const assert = require('node:assert');
const {
  JointOptimizer,
  generateWeightCombinations,
  calculateReturns,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateAnnualizedReturn,
  calculateCalmarRatio,
  calculateJointEquity,
  DEFAULT_WEIGHT_RANGE,
  CONSTRAINTS
} = require('../api/joint-optimizer.js');

// ==================== 测试工具 ====================

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     错误: ${error.message}`);
    failed++;
  }
}

// 近似相等比较
function assertApproxEqual(actual, expected, tolerance = 0.0001, message = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${message} 期望 ${expected}，实际 ${actual}，差值 ${diff}`);
  }
}

// ==================== 测试数据 ====================

// 模拟基础净值曲线（上涨趋势）
const mockBaseEquity = [1.0, 1.02, 1.04, 1.03, 1.05, 1.07, 1.06, 1.08, 1.10, 1.12];

// 模拟网格超额收益曲线（稳定正收益）
const mockGridExcess = [0, 0.005, 0.01, 0.008, 0.015, 0.02, 0.018, 0.025, 0.03, 0.035];

// 波动较大的净值曲线
const volatileEquity = [1.0, 0.95, 1.05, 0.90, 1.10, 0.85, 1.15, 0.80, 1.20, 1.25];

// 单调上涨曲线
const increasingEquity = [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.09];

// 单调下跌曲线
const decreasingEquity = [1.0, 0.99, 0.98, 0.97, 0.96, 0.95, 0.94, 0.93, 0.92, 0.91];

// ==================== 测试开始 ====================

console.log('\n========================================');
console.log('joint-optimizer.js 单元测试');
console.log('TASK_V3_301 - 联合优化器（数学组合）');
console.log('========================================\n');

// ==================== 1. 仓位比例组合生成测试 ====================
console.log('1. 仓位比例组合生成测试');

runTest('generateWeightCombinations - 默认范围', () => {
  const combinations = generateWeightCombinations();

  assert.strictEqual(combinations.length, 10, '应该有 10 种组合');
  assert.strictEqual(combinations[0].coreWeight, 0.50, '最小核心仓 50%');
  assert.strictEqual(combinations[0].satelliteWeight, 0.50, '对应卫星仓 50%');
  assert.strictEqual(combinations[9].coreWeight, 0.95, '最大核心仓 95%');
  assert.strictEqual(combinations[9].satelliteWeight, 0.05, '对应卫星仓 5%');
});

runTest('generateWeightCombinations - 权重总和为 1', () => {
  const combinations = generateWeightCombinations();

  for (const combo of combinations) {
    const sum = combo.coreWeight + combo.satelliteWeight;
    assertApproxEqual(sum, 1.0, 0.0001, '核心仓+卫星仓应该等于 1');
  }
});

runTest('generateWeightCombinations - 自定义范围', () => {
  const combinations = generateWeightCombinations({
    min: 0.60,
    max: 0.80,
    step: 0.10
  });

  assert.strictEqual(combinations.length, 3, '应该有 3 种组合');
  assert.strictEqual(combinations[0].coreWeight, 0.60);
  assert.strictEqual(combinations[1].coreWeight, 0.70);
  assert.strictEqual(combinations[2].coreWeight, 0.80);
});

runTest('generateWeightCombinations - 单一值情况', () => {
  const combinations = generateWeightCombinations({
    min: 0.75,
    max: 0.75,
    step: 0.05
  });

  assert.strictEqual(combinations.length, 1);
  assert.strictEqual(combinations[0].coreWeight, 0.75);
});

// ==================== 2. 绩效指标计算测试 ====================
console.log('\n2. 绩效指标计算测试');

runTest('calculateReturns - 正常计算', () => {
  const equity = [100, 102, 101, 105];
  const returns = calculateReturns(equity);

  assert.strictEqual(returns.length, 3);
  assertApproxEqual(returns[0], 0.02, 0.0001, '第一天收益率 2%');
  assertApproxEqual(returns[1], -0.0098, 0.0001, '第二天收益率 -0.98%');
  assertApproxEqual(returns[2], 0.0396, 0.0001, '第三天收益率 3.96%');
});

runTest('calculateReturns - 空数组', () => {
  const returns = calculateReturns([]);
  assert.deepStrictEqual(returns, []);
});

runTest('calculateReturns - 单元素数组', () => {
  const returns = calculateReturns([1.0]);
  assert.deepStrictEqual(returns, []);
});

runTest('calculateSharpeRatio - 正收益', () => {
  const returns = [0.01, 0.02, 0.015, 0.025, 0.01];
  const sharpe = calculateSharpeRatio(returns, 0.02, 252);

  assert.ok(typeof sharpe === 'number', '夏普比率应该是一个数字');
  // 由于均值约为 1.6%，标准差较小，夏普比率应该为正
  assert.ok(sharpe > 0, '正收益应该有正的夏普比率');
});

runTest('calculateSharpeRatio - 零波动', () => {
  const returns = [0.01, 0.01, 0.01, 0.01, 0.01];
  const sharpe = calculateSharpeRatio(returns);

  assert.strictEqual(sharpe, 0, '零波动应返回 0');
});

runTest('calculateSharpeRatio - 空数组', () => {
  const sharpe = calculateSharpeRatio([]);
  assert.strictEqual(sharpe, 0);
});

runTest('calculateMaxDrawdown - 正常计算', () => {
  const equity = [100, 110, 105, 115, 100, 120];
  const maxDD = calculateMaxDrawdown(equity);

  // 从 115 跌到 100，回撤 (115-100)/115 = 13.04%
  assertApproxEqual(maxDD, 0.1304, 0.001, '最大回撤约 13.04%');
});

runTest('calculateMaxDrawdown - 单调上涨', () => {
  const maxDD = calculateMaxDrawdown(increasingEquity);
  assert.strictEqual(maxDD, 0, '单调上涨无回撤');
});

runTest('calculateMaxDrawdown - 单调下跌', () => {
  const maxDD = calculateMaxDrawdown(decreasingEquity);
  // 从 1.0 跌到 0.91，最大回撤在最后时刻，(1.0-0.91)/1.0 = 9%
  assertApproxEqual(maxDD, 0.09, 0.001, '单调下跌最大回撤约 9%');
});

runTest('calculateMaxDrawdown - 空数组', () => {
  const maxDD = calculateMaxDrawdown([]);
  assert.strictEqual(maxDD, 0);
});

runTest('calculateAnnualizedReturn - 正收益', () => {
  const equity = [1.0, 1.10]; // 10% 收益，假设 1 天
  const annReturn = calculateAnnualizedReturn(equity, 252);

  // 复利年化: (1.1)^252 - 1 ≈ 很大的数
  assert.ok(annReturn > 0, '应该有正的年化收益');
});

runTest('calculateAnnualizedReturn - 负收益', () => {
  const equity = [1.0, 0.90]; // -10% 收益
  const annReturn = calculateAnnualizedReturn(equity, 252);

  assert.ok(annReturn < 0, '应该有负的年化收益');
});

runTest('calculateCalmarRatio - 正常计算', () => {
  const calmar = calculateCalmarRatio(0.20, 0.10);
  assertApproxEqual(calmar, 2.0, 0.0001, '卡玛比率 = 年化收益/最大回撤');
});

runTest('calculateCalmarRatio - 零回撤', () => {
  const calmar = calculateCalmarRatio(0.20, 0);
  assert.strictEqual(calmar, 0, '零回撤应返回 0');
});

// ==================== 3. 联合净值计算测试 ====================
console.log('\n3. 联合净值计算测试');

runTest('calculateJointEquity - 正常计算', () => {
  const base = [1.0, 1.1, 1.2];
  const excess = [0, 0.05, 0.1];
  const coreWeight = 0.7;
  const satelliteWeight = 0.3;

  const joint = calculateJointEquity(base, excess, coreWeight, satelliteWeight);

  assert.strictEqual(joint.length, 3, '长度应与输入一致');

  // 第一个点: 0.7 * 1.0 + 0.3 * (1.0 + 0) = 1.0
  assertApproxEqual(joint[0], 1.0, 0.0001, '第一点');

  // 第二个点: 0.7 * 1.1 + 0.3 * (1.1 + 0.05) = 0.77 + 0.345 = 1.115
  assertApproxEqual(joint[1], 1.115, 0.0001, '第二点');

  // 第三个点: 0.7 * 1.2 + 0.3 * (1.2 + 0.1) = 0.84 + 0.39 = 1.23
  assertApproxEqual(joint[2], 1.23, 0.0001, '第三点');
});

runTest('calculateJointEquity - 空超额收益', () => {
  const base = [1.0, 1.1, 1.2];
  const joint = calculateJointEquity(base, null, 0.7, 0.3);

  assert.strictEqual(joint.length, 3);

  // 无超额收益时: 0.7 * 1.0 + 0.3 * (1.0 + 0) = 1.0
  assertApproxEqual(joint[0], 1.0, 0.0001);
});

runTest('calculateJointEquity - 纯核心仓', () => {
  const base = [1.0, 1.1, 1.2];
  const excess = [0, 0.05, 0.1];
  const joint = calculateJointEquity(base, excess, 1.0, 0.0);

  // 纯核心仓: 联合净值 = 基础净值
  assertApproxEqual(joint[0], 1.0, 0.0001);
  assertApproxEqual(joint[1], 1.1, 0.0001);
  assertApproxEqual(joint[2], 1.2, 0.0001);
});

runTest('calculateJointEquity - 空基础净值报错', () => {
  try {
    calculateJointEquity([], null, 0.7, 0.3);
    throw new Error('应该抛出错误');
  } catch (error) {
    assert.ok(error.message.includes('不能为空'), '应提示基础净值不能为空');
  }
});

// ==================== 4. JointOptimizer 类测试 ====================
console.log('\n4. JointOptimizer 类测试');

runTest('JointOptimizer - 初始化默认配置', () => {
  const optimizer = new JointOptimizer();

  assert.strictEqual(optimizer.config.weightRange.min, DEFAULT_WEIGHT_RANGE.min);
  assert.strictEqual(optimizer.config.weightRange.max, DEFAULT_WEIGHT_RANGE.max);
  assert.strictEqual(optimizer.config.constraints.maxDrawdown, CONSTRAINTS.maxDrawdown);
  assert.strictEqual(optimizer.status, 'initialized');
});

runTest('JointOptimizer - 自定义配置', () => {
  const optimizer = new JointOptimizer({
    weightRange: { min: 0.6, max: 0.8, step: 0.1 },
    constraints: { maxDrawdown: 0.15 },
    riskFreeRate: 0.03
  });

  assert.strictEqual(optimizer.config.weightRange.min, 0.6);
  assert.strictEqual(optimizer.config.weightRange.max, 0.8);
  assert.strictEqual(optimizer.config.constraints.maxDrawdown, 0.15);
  assert.strictEqual(optimizer.config.riskFreeRate, 0.03);
});

runTest('JointOptimizer - setData 方法', () => {
  const optimizer = new JointOptimizer();
  optimizer.setData(mockBaseEquity, mockGridExcess);

  assert.deepStrictEqual(optimizer.baseEquity, mockBaseEquity);
  assert.deepStrictEqual(optimizer.gridExcess, mockGridExcess);
});

runTest('JointOptimizer - 优化运行', () => {
  const optimizer = new JointOptimizer({
    constraints: { maxDrawdown: 0.30 }  // 放宽约束确保有有效结果
  });

  optimizer.setData(mockBaseEquity, mockGridExcess);
  const result = optimizer.optimize();

  assert.strictEqual(result.status, 'completed');
  assert.ok(result.elapsed_ms < 1000, '计算应该在 1 秒内完成');
  assert.ok(result.totalCombinations > 0, '应该有组合数');
  assert.ok(result.bestAllocation, '应该有最佳配置');
  assert.ok(result.bestMetrics, '应该有最佳绩效指标');
});

runTest('JointOptimizer - 未加载数据报错', () => {
  const optimizer = new JointOptimizer();

  try {
    optimizer.optimize();
    throw new Error('应该抛出错误');
  } catch (error) {
    assert.ok(error.message.includes('请先加载'), '应提示需要加载数据');
  }
});

runTest('JointOptimizer - 获取最佳配置', () => {
  const optimizer = new JointOptimizer();
  optimizer.setData(mockBaseEquity, mockGridExcess);
  optimizer.optimize();

  const best = optimizer.getBestAllocation();

  assert.ok(best, '应该返回最佳配置');
  assert.ok(best.coreWeight >= 0.5 && best.coreWeight <= 0.95, '核心仓比例应在范围内');
  assert.ok(best.satelliteWeight >= 0.05 && best.satelliteWeight <= 0.5, '卫星仓比例应在范围内');
  assert.ok(best.metrics, '应该有绩效指标');
});

runTest('JointOptimizer - 获取进度', () => {
  const optimizer = new JointOptimizer();
  const progress = optimizer.getProgress();

  assert.strictEqual(progress.status, 'initialized');
  assert.ok(progress.totalCombinations > 0, '应该有组合总数');
});

// ==================== 5. 边界情况测试 ====================
console.log('\n5. 边界情况测试');

runTest('边界 - 波动较大的净值曲线', () => {
  // volatileEquity 最大回撤约 30.4%，需设置更宽松约束
  const optimizer = new JointOptimizer({
    constraints: { maxDrawdown: 0.35 }  // 放宽约束到 35%
  });

  optimizer.setData(volatileEquity, null);
  const result = optimizer.optimize();

  assert.strictEqual(result.status, 'completed');
  assert.ok(result.validCombinations > 0, '应该有有效组合');
});

runTest('边界 - 单调上涨净值曲线', () => {
  const optimizer = new JointOptimizer();
  optimizer.setData(increasingEquity, null);
  const result = optimizer.optimize();

  // 单调上涨无回撤
  assert.strictEqual(result.status, 'completed');
  assert.ok(result.bestMetrics.maxDrawdown === 0, '单调上涨无回撤');
});

runTest('边界 - 极短净值曲线', () => {
  const optimizer = new JointOptimizer();
  optimizer.setData([1.0, 1.1], null);
  const result = optimizer.optimize();

  assert.strictEqual(result.status, 'completed');
});

runTest('边界 - 不满足约束的组合处理', () => {
  const optimizer = new JointOptimizer({
    constraints: { maxDrawdown: 0.05 }  // 非常严格的约束
  });

  optimizer.setData(volatileEquity, null);
  const result = optimizer.optimize();

  // 即使不满足约束，也应该返回结果（回撤最小的）
  assert.strictEqual(result.status, 'completed');
  assert.ok(result.bestAllocation, '应该返回一个配置');
});

runTest('边界 - 负收益净值曲线', () => {
  const optimizer = new JointOptimizer();
  optimizer.setData(decreasingEquity, null);
  const result = optimizer.optimize();

  assert.strictEqual(result.status, 'completed');
  assert.ok(result.bestMetrics.totalReturn < 0, '应该识别出负收益');
});

// ==================== 6. 性能测试 ====================
console.log('\n6. 性能测试');

runTest('性能 - 大数据量计算', () => {
  // 生成 1000 个数据点
  const largeEquity = [];
  const largeExcess = [];
  for (let i = 0; i < 1000; i++) {
    largeEquity.push(1 + i * 0.001);
    largeExcess.push(i * 0.0001);
  }

  const optimizer = new JointOptimizer();
  optimizer.setData(largeEquity, largeExcess);

  const start = Date.now();
  const result = optimizer.optimize();
  const elapsed = Date.now() - start;

  assert.strictEqual(result.status, 'completed');
  assert.ok(elapsed < 1000, `大数据量计算耗时 ${elapsed}ms，应该 < 1s`);
});

runTest('性能 - 指标计算高效', () => {
  const equity = Array(10000).fill(0).map((_, i) => 1 + i * 0.0001);

  const start = Date.now();

  // 计算 100 次最大回撤
  for (let i = 0; i < 100; i++) {
    calculateMaxDrawdown(equity);
  }

  const elapsed = Date.now() - start;
  assert.ok(elapsed < 100, `计算 100 次最大回撤耗时 ${elapsed}ms，应该 < 100ms`);
});

runTest('性能 - 组合生成高效', () => {
  const start = Date.now();

  // 生成 1000 次组合
  for (let i = 0; i < 1000; i++) {
    generateWeightCombinations();
  }

  const elapsed = Date.now() - start;
  assert.ok(elapsed < 50, `生成 1000 次组合耗时 ${elapsed}ms，应该 < 50ms`);
});

// ==================== 7. 模块导出测试 ====================
console.log('\n7. 模块导出测试');

runTest('模块导出 - 所有组件', () => {
  assert.ok(JointOptimizer, '应该导出 JointOptimizer');
  assert.ok(generateWeightCombinations, '应该导出 generateWeightCombinations');
  assert.ok(calculateReturns, '应该导出 calculateReturns');
  assert.ok(calculateSharpeRatio, '应该导出 calculateSharpeRatio');
  assert.ok(calculateMaxDrawdown, '应该导出 calculateMaxDrawdown');
  assert.ok(calculateAnnualizedReturn, '应该导出 calculateAnnualizedReturn');
  assert.ok(calculateCalmarRatio, '应该导出 calculateCalmarRatio');
  assert.ok(calculateJointEquity, '应该导出 calculateJointEquity');
  assert.ok(DEFAULT_WEIGHT_RANGE, '应该导出 DEFAULT_WEIGHT_RANGE');
  assert.ok(CONSTRAINTS, '应该导出 CONSTRAINTS');
});

runTest('DEFAULT_WEIGHT_RANGE - 默认值', () => {
  assert.strictEqual(DEFAULT_WEIGHT_RANGE.min, 0.50, '最小核心仓 50%');
  assert.strictEqual(DEFAULT_WEIGHT_RANGE.max, 0.95, '最大核心仓 95%');
  assert.strictEqual(DEFAULT_WEIGHT_RANGE.step, 0.05, '步长 5%');
});

runTest('CONSTRAINTS - 默认约束', () => {
  assert.strictEqual(CONSTRAINTS.maxDrawdown, 0.20, '默认最大回撤 20%');
});

// ==================== 测试结果汇总 ====================
console.log('\n========================================');
console.log('测试结果汇总');
console.log('========================================');
console.log(`总计: ${passed + failed} 个测试`);
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('========================================\n');

// 退出码
process.exit(failed > 0 ? 1 : 0);