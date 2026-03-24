#!/usr/bin/env node

/**
 * grid-optimizer.js 单元测试
 * TASK_V3_204 - 网格参数优化模块测试
 *
 * 测试覆盖：
 * 1. 参数范围生成测试
 * 2. 参数组合生成测试
 * 3. GridBacktestExecutor 测试
 * 4. GridOptimizer 测试
 * 5. 多目标优化测试
 * 6. 性能测试
 */

const assert = require('node:assert');
const {
  GridOptimizer,
  GridBacktestExecutor,
  generateParamRange,
  generateAllCombinations,
  GRID_PARAMETER_SPACE
} = require('../api/grid-optimizer.js');

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

// ==================== 测试开始 ====================

console.log('\n========================================');
console.log('grid-optimizer.js 单元测试');
console.log('TASK_V3_204 - 网格参数优化模块');
console.log('========================================\n');

// ==================== 1. 参数范围生成测试 ====================
console.log('1. 参数范围生成测试');

runTest('generateParamRange - 整数步长', () => {
  const range = generateParamRange({ min: 10, max: 50, step: 5 });
  assert.deepStrictEqual(range, [10, 15, 20, 25, 30, 35, 40, 45, 50]);
});

runTest('generateParamRange - 小数步长', () => {
  const range = generateParamRange({ min: 0.5, max: 1.0, step: 0.1 });
  assert.deepStrictEqual(range, [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
});

runTest('generateParamRange - 边界值精度', () => {
  const range = generateParamRange({ min: 0.5, max: 2.0, step: 0.1 });
  assert.strictEqual(range.length, 16, '应该有 16 个值');
  assert.strictEqual(range[0], 0.5, '第一个值应该是 0.5');
  assert.strictEqual(range[range.length - 1], 2.0, '最后一个值应该是 2.0');
});

runTest('generateParamRange - 单值情况', () => {
  const range = generateParamRange({ min: 10, max: 10, step: 5 });
  assert.deepStrictEqual(range, [10]);
});

runTest('generateParamRange - 默认仓位比例范围', () => {
  const range = generateParamRange(GRID_PARAMETER_SPACE.positionRatio);
  assert.strictEqual(range.length, 9, '仓位比例应有 9 个值');
  assert.strictEqual(range[0], 10, '最小仓位 10%');
  assert.strictEqual(range[range.length - 1], 50, '最大仓位 50%');
});

runTest('generateParamRange - 默认网格步长范围', () => {
  const range = generateParamRange(GRID_PARAMETER_SPACE.gridStep);
  assert.strictEqual(range.length, 16, '网格步长应有 16 个值');
  assert.strictEqual(range[0], 0.5, '最小步长 0.5%');
  assert.strictEqual(range[range.length - 1], 2.0, '最大步长 2.0%');
});

// ==================== 2. 参数组合生成测试 ====================
console.log('\n2. 参数组合生成测试');

runTest('generateAllCombinations - 两参数组合', () => {
  const paramRanges = {
    a: { min: 1, max: 2, step: 1 },
    b: { min: 10, max: 20, step: 10 }
  };

  const combinations = generateAllCombinations(paramRanges);

  assert.strictEqual(combinations.length, 4, '应该有 4 个组合');
  assert.deepStrictEqual(combinations, [
    { a: 1, b: 10 },
    { a: 1, b: 20 },
    { a: 2, b: 10 },
    { a: 2, b: 20 }
  ]);
});

runTest('generateAllCombinations - 单参数情况', () => {
  const paramRanges = {
    a: { min: 1, max: 3, step: 1 }
  };

  const combinations = generateAllCombinations(paramRanges);
  assert.strictEqual(combinations.length, 3);
});

runTest('generateAllCombinations - 空参数情况', () => {
  const combinations = generateAllCombinations({});
  assert.deepStrictEqual(combinations, [{}]);
});

runTest('generateAllCombinations - 默认参数空间组合数', () => {
  const combinations = generateAllCombinations(GRID_PARAMETER_SPACE);
  // 网格步长: 16 个值 (0.5 到 2.0, 步长 0.1)
  // 仓位比例: 9 个值 (10 到 50, 步长 5)
  // 网格数量: 16 个值 (5 到 20, 步长 1)
  const expectedCount = 16 * 9 * 16;
  assert.strictEqual(combinations.length, expectedCount);
});

// ==================== 3. GridBacktestExecutor 测试 ====================
console.log('\n3. GridBacktestExecutor 测试');

runTest('GridBacktestExecutor - 初始化', () => {
  const executor = new GridBacktestExecutor({
    initialCapital: 1000000,
    commissionRate: 0.00025,
    minCommission: 5
  });

  assert.strictEqual(executor.config.initialCapital, 1000000);
  assert.strictEqual(executor.config.commissionRate, 0.00025);
});

runTest('GridBacktestExecutor - 买入信号生成', () => {
  const executor = new GridBacktestExecutor({
    initialCapital: 1000000
  });
  executor.gridReferencePrice = 100;

  const stock = { ts_code: '000001.SZ', close: 99 }; // 下跌 1%
  const positions = new Map();

  const signal = executor.generateGridSignal(stock, {}, { gridStep: 1.0, positionRatio: 0.3 }, positions);
  assert.strictEqual(signal, 'buy', '价格下跌超过网格步长应生成买入信号');
});

runTest('GridBacktestExecutor - 卖出信号生成', () => {
  const executor = new GridBacktestExecutor({
    initialCapital: 1000000
  });
  executor.gridReferencePrice = 100;

  const stock = { ts_code: '000001.SZ', close: 102 }; // 上涨 2%
  const positions = new Map([['000001.SZ', { entryPrice: 100, shares: 1000 }]]);

  const signal = executor.generateGridSignal(stock, {}, { gridStep: 1.0, positionRatio: 0.3 }, positions);
  assert.strictEqual(signal, 'sell', '持仓盈利超过网格步长应生成卖出信号');
});

runTest('GridBacktestExecutor - 持有信号生成', () => {
  const executor = new GridBacktestExecutor({
    initialCapital: 1000000
  });
  executor.gridReferencePrice = 100;

  const stock = { ts_code: '000001.SZ', close: 100.5 }; // 变动 0.5%
  const positions = new Map();

  const signal = executor.generateGridSignal(stock, {}, { gridStep: 1.0, positionRatio: 0.3 }, positions);
  assert.strictEqual(signal, 'hold', '价格变动不足应持有');
});

runTest('GridBacktestExecutor - 小网格步长买入', () => {
  const executor = new GridBacktestExecutor({
    initialCapital: 1000000
  });
  executor.gridReferencePrice = 100;

  const stock = { ts_code: '000001.SZ', close: 99.5 }; // 下跌 0.5%
  const positions = new Map();

  // 步长 0.5%，下跌 0.5% 应触发买入
  const signal = executor.generateGridSignal(stock, {}, { gridStep: 0.5, positionRatio: 0.3 }, positions);
  assert.strictEqual(signal, 'buy', '小步长网格应更频繁触发');
});

// ==================== 4. GridOptimizer 测试 ====================
console.log('\n4. GridOptimizer 测试');

runTest('GridOptimizer - 初始化默认配置', () => {
  const optimizer = new GridOptimizer({
    parallelWorkers: 2
  });

  assert.strictEqual(optimizer.config.parallelWorkers, 2);
  assert.strictEqual(optimizer.status, 'initialized');
  assert.ok(optimizer.config.parameterSpace);
});

runTest('GridOptimizer - 自定义目标权重', () => {
  const optimizer = new GridOptimizer({
    objectiveWeights: {
      totalReturn: 0.5,
      sharpeRatio: 0.3,
      maxDrawdown: -0.2
    }
  });
  assert.strictEqual(optimizer.config.objectiveWeights.totalReturn, 0.5);
  assert.strictEqual(optimizer.config.objectiveWeights.sharpeRatio, 0.3);
  assert.strictEqual(optimizer.config.objectiveWeights.maxDrawdown, -0.2);
});

runTest('GridOptimizer - 综合得分计算', () => {
  const optimizer = new GridOptimizer({
    objectiveWeights: {
      totalReturn: 0.4,
      sharpeRatio: 0.4,
      maxDrawdown: -0.2
    }
  });

  const metrics = {
    totalReturn: 0.2, // 20% 收益率
    sharpeRatio: 1.5,
    maxDrawdown: 0.1 // 10% 回撤
  };

  const score = optimizer.calculateScore(metrics);
  // 0.2 * 0.4 + 1.5 * 0.4 + 0.1 * (-0.2) = 0.08 + 0.6 - 0.02 = 0.66
  assertApproxEqual(score, 0.66, 0.001, '综合得分计算');
});

runTest('GridOptimizer - 零值得分计算', () => {
  const optimizer = new GridOptimizer();
  const score = optimizer.calculateScore({
    totalReturn: 0,
    sharpeRatio: 0,
    maxDrawdown: 0
  });
  assert.strictEqual(score, 0);
});

runTest('GridOptimizer - 负收益率得分', () => {
  const optimizer = new GridOptimizer({
    objectiveWeights: {
      totalReturn: 0.4,
      sharpeRatio: 0.4,
      maxDrawdown: -0.2
    }
  });
  const score = optimizer.calculateScore({
    totalReturn: -0.1,
    sharpeRatio: 0,
    maxDrawdown: 0.2
  });
  assert.ok(score < 0, '负收益率应该导致负得分');
});

runTest('GridOptimizer - 结果排序', () => {
  const optimizer = new GridOptimizer();
  optimizer.results = [
    { success: true, score: 0.5, params: { gridStep: 1.0 } },
    { success: true, score: 0.8, params: { gridStep: 1.5 } },
    { success: true, score: 0.3, params: { gridStep: 0.5 } }
  ];

  optimizer.rankResults();

  assert.strictEqual(optimizer.results[0].score, 0.8);
  assert.strictEqual(optimizer.results[1].score, 0.5);
  assert.strictEqual(optimizer.results[2].score, 0.3);
});

runTest('GridOptimizer - 失败结果排在后面', () => {
  const optimizer = new GridOptimizer();
  optimizer.results = [
    { success: false, score: 0, params: {} },
    { success: true, score: 0.5, params: {} },
    { success: true, score: 0.3, params: {} }
  ];

  optimizer.rankResults();

  assert.strictEqual(optimizer.results[0].success, true);
  assert.strictEqual(optimizer.results[2].success, false);
});

runTest('GridOptimizer - 获取进度', () => {
  const optimizer = new GridOptimizer();
  optimizer.progress = { completed: 50, total: 100 };
  optimizer.status = 'running';

  const progress = optimizer.getProgress();

  assert.strictEqual(progress.status, 'running');
  assert.strictEqual(progress.completed, 50);
  assert.strictEqual(progress.total, 100);
  assert.strictEqual(progress.percentage, '50.0');
});

runTest('GridOptimizer - 获取最佳参数', () => {
  const optimizer = new GridOptimizer();
  optimizer.bestResult = {
    params: { gridStep: 1.5, positionRatio: 30, gridCount: 10 },
    metrics: { totalReturn: 0.2 }
  };

  const bestParams = optimizer.getBestParams();

  assert.deepStrictEqual(bestParams, {
    gridStep: 1.5,
    positionRatio: 30,
    gridCount: 10
  });
});

runTest('GridOptimizer - 无最佳参数时返回 null', () => {
  const optimizer = new GridOptimizer();
  optimizer.bestResult = null;
  assert.strictEqual(optimizer.getBestParams(), null);
});

runTest('GridOptimizer - 获取限制数量结果', () => {
  const optimizer = new GridOptimizer();
  optimizer.results = Array(100).fill(null).map((_, i) => ({
    success: true,
    score: i,
    params: { gridStep: i * 0.1 }
  }));

  const results = optimizer.getAllResults(10);
  assert.strictEqual(results.length, 10);
});

// ==================== 5. 多目标优化测试 ====================
console.log('\n5. 多目标优化测试');

runTest('getParetoFront - 识别帕累托最优解', () => {
  const optimizer = new GridOptimizer();
  optimizer.results = [
    {
      success: true,
      params: { gridStep: 1.0 },
      metrics: { totalReturn: 0.2, sharpeRatio: 1.5, maxDrawdown: 0.1 },
      score: 0.66
    },
    {
      success: true,
      params: { gridStep: 0.5 },
      metrics: { totalReturn: 0.15, sharpeRatio: 1.2, maxDrawdown: 0.15 },
      score: 0.49
    },
    {
      success: true,
      params: { gridStep: 2.0 },
      metrics: { totalReturn: 0.25, sharpeRatio: 1.8, maxDrawdown: 0.08 },
      score: 0.91
    }
  ];

  const paretoFront = optimizer.getParetoFront();
  assert.ok(paretoFront.length > 0, '应该有帕累托前沿');
});

runTest('getParetoFront - 空结果处理', () => {
  const optimizer = new GridOptimizer();
  optimizer.results = [];
  const paretoFront = optimizer.getParetoFront();
  assert.deepStrictEqual(paretoFront, []);
});

runTest('getParetoFront - 全失败结果处理', () => {
  const optimizer = new GridOptimizer();
  optimizer.results = [
    { success: false, params: {}, error: 'test' }
  ];
  const paretoFront = optimizer.getParetoFront();
  assert.deepStrictEqual(paretoFront, []);
});

// ==================== 6. 性能测试 ====================
console.log('\n6. 性能测试');

runTest('性能 - 参数组合生成高效', () => {
  const start = Date.now();

  // 生成 1000 个组合
  const combinations = generateAllCombinations({
    a: { min: 0, max: 9, step: 1 },
    b: { min: 0, max: 9, step: 1 },
    c: { min: 0, max: 9, step: 1 }
  });

  const elapsed = Date.now() - start;

  assert.strictEqual(combinations.length, 1000);
  assert.ok(elapsed < 100, `生成 1000 个组合耗时 ${elapsed}ms，应该 < 100ms`);
});

runTest('性能 - 得分计算高效', () => {
  const optimizer = new GridOptimizer();
  const metrics = {
    totalReturn: 0.2,
    sharpeRatio: 1.5,
    maxDrawdown: 0.1
  };

  const start = Date.now();

  // 计算 10000 次得分
  for (let i = 0; i < 10000; i++) {
    optimizer.calculateScore(metrics);
  }

  const elapsed = Date.now() - start;
  assert.ok(elapsed < 50, `计算 10000 次得分耗时 ${elapsed}ms，应该 < 50ms`);
});

runTest('性能 - 排序高效', () => {
  const optimizer = new GridOptimizer();
  optimizer.results = Array(1000).fill(null).map((_, i) => ({
    success: true,
    score: Math.random(),
    params: { gridStep: i * 0.1 }
  }));

  const start = Date.now();
  optimizer.rankResults();
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 50, `排序 1000 个结果耗时 ${elapsed}ms，应该 < 50ms`);
});

// ==================== 7. 模块导出测试 ====================
console.log('\n7. 模块导出测试');

runTest('模块导出 - 所有组件', () => {
  assert.ok(GridOptimizer, '应该导出 GridOptimizer');
  assert.ok(GridBacktestExecutor, '应该导出 GridBacktestExecutor');
  assert.ok(generateParamRange, '应该导出 generateParamRange');
  assert.ok(generateAllCombinations, '应该导出 generateAllCombinations');
  assert.ok(GRID_PARAMETER_SPACE, '应该导出 GRID_PARAMETER_SPACE');
});

runTest('GRID_PARAMETER_SPACE - 默认参数空间', () => {
  assert.ok(GRID_PARAMETER_SPACE.gridStep, '应有 gridStep');
  assert.ok(GRID_PARAMETER_SPACE.positionRatio, '应有 positionRatio');
  assert.ok(GRID_PARAMETER_SPACE.gridCount, '应有 gridCount');

  assert.strictEqual(GRID_PARAMETER_SPACE.gridStep.min, 0.5);
  assert.strictEqual(GRID_PARAMETER_SPACE.gridStep.max, 2.0);
  assert.strictEqual(GRID_PARAMETER_SPACE.gridStep.step, 0.1);

  assert.strictEqual(GRID_PARAMETER_SPACE.positionRatio.min, 10);
  assert.strictEqual(GRID_PARAMETER_SPACE.positionRatio.max, 50);
  assert.strictEqual(GRID_PARAMETER_SPACE.positionRatio.step, 5);
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