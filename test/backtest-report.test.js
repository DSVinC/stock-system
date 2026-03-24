#!/usr/bin/env node

/**
 * backtest-report.js 单元测试
 * TASK_V3_104 - 7 指标计算模块测试
 *
 * 测试覆盖：
 * 1. PerformanceMetrics 类测试
 * 2. 7 个核心指标计算测试
 * 3. 辅助函数测试
 * 4. 边界情况测试
 */

const assert = require('node:assert');
const {
  PerformanceMetrics,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateAnnualizedReturn,
  calculateVolatility,
  calculateWinRate,
  calculateProfitLossRatio,
  calculateCalmarRatio,
  calculateSortinoRatio,
  calculateTradeStatistics,
  calculatePerformanceReport
} = require('../api/backtest-report.js');

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

// 示例交易数据
const sampleTrades = [
  { return: 0.05, entryDate: '2024-01-01', exitDate: '2024-01-05' },
  { return: -0.02, entryDate: '2024-01-10', exitDate: '2024-01-12' },
  { return: 0.08, entryDate: '2024-01-15', exitDate: '2024-01-20' },
  { return: 0.03, entryDate: '2024-01-25', exitDate: '2024-01-28' },
  { return: -0.01, entryDate: '2024-02-01', exitDate: '2024-02-03' }
];

// 示例日收益率序列
const sampleDailyReturns = [
  0.01, -0.005, 0.02, -0.01, 0.015,
  -0.008, 0.012, 0.005, -0.003, 0.008,
  0.01, -0.006, 0.014, -0.002, 0.009
];

// 示例权益曲线
const sampleEquityCurve = [
  100000, 101000, 100500, 102500, 102000,
  103500, 103000, 104500, 104000, 105000,
  106000, 105500, 107000, 106500, 108000
];

// ==================== 测试开始 ====================

console.log('\n========================================');
console.log('backtest-report.js 单元测试');
console.log('TASK_V3_104 - 7 指标计算模块');
console.log('========================================\n');

// ==================== 1. PerformanceMetrics 类测试 ====================
console.log('1. PerformanceMetrics 类测试');

runTest('类实例化 - 正常数据', () => {
  const metrics = new PerformanceMetrics(sampleTrades, 100000, 0.03);
  assert.ok(metrics instanceof PerformanceMetrics, '应创建实例');
  assert.strictEqual(metrics.trades.length, 5, '交易数应为 5');
  assert.strictEqual(metrics.initialCapital, 100000, '初始资金应为 100000');
});

runTest('类实例化 - 空交易列表', () => {
  const metrics = new PerformanceMetrics([], 100000);
  assert.strictEqual(metrics.trades.length, 0, '交易数应为 0');
  assert.strictEqual(metrics.calculateTotalReturn(), 0, '空交易总收益应为 0');
});

runTest('类实例化 - 默认参数', () => {
  const metrics = new PerformanceMetrics();
  assert.strictEqual(metrics.trades.length, 0, '默认交易数应为 0');
  assert.strictEqual(metrics.initialCapital, 1, '默认初始资金应为 1');
  assert.strictEqual(metrics.riskFreeRate, 0.03, '默认无风险利率应为 0.03');
});

// ==================== 2. 7 个核心指标测试 ====================
console.log('\n2. 7 个核心指标测试');

// 2.1 总收益率
runTest('总收益率 - 正常计算', () => {
  const metrics = new PerformanceMetrics(sampleTrades, 100000);
  // 总收益率 = 0.05 - 0.02 + 0.08 + 0.03 - 0.01 = 0.13
  const result = metrics.calculateTotalReturn();
  assertApproxEqual(result, 0.13, 0.0001, '总收益率计算');
});

runTest('总收益率 - 空交易', () => {
  const metrics = new PerformanceMetrics([], 100000);
  assert.strictEqual(metrics.calculateTotalReturn(), 0, '空交易总收益应为 0');
});

runTest('总收益率 - 零初始资金边界', () => {
  // 零初始资金时，类会默认设为 1，所以总收益应为交易收益率之和
  const metrics = new PerformanceMetrics(sampleTrades, 0);
  const result = metrics.calculateTotalReturn();
  // 因为初始资金为 0 时，构造函数会设为 1
  assertApproxEqual(result, 0.13, 0.0001, '零初始资金边界处理');
});

// 2.2 年化收益率
runTest('年化收益率 - 正常计算', () => {
  const metrics = new PerformanceMetrics(sampleTrades, 100000);
  const totalReturn = 0.13;
  const tradingDays = 252;
  const expected = Math.pow(1 + totalReturn, 365 / tradingDays) - 1;
  const result = metrics.calculateAnnualizedReturn(tradingDays);
  assertApproxEqual(result, expected, 0.0001, '年化收益率计算');
});

runTest('年化收益率 - 零交易日', () => {
  const metrics = new PerformanceMetrics(sampleTrades, 100000);
  assert.strictEqual(metrics.calculateAnnualizedReturn(0), 0, '零交易日应返回 0');
});

runTest('年化收益率 - 负交易日', () => {
  const metrics = new PerformanceMetrics(sampleTrades, 100000);
  assert.strictEqual(metrics.calculateAnnualizedReturn(-10), 0, '负交易日应返回 0');
});

// 2.3 夏普比率
runTest('夏普比率 - 正常计算', () => {
  const result = calculateSharpeRatio(sampleDailyReturns, 0.03);
  assert.ok(typeof result === 'number', '夏普比率应为数字');
  // 夏普比率可以是正或负，取决于收益
});

runTest('夏普比率 - 空数组', () => {
  assert.strictEqual(calculateSharpeRatio([], 0.03), 0, '空数组应返回 0');
});

runTest('夏普比率 - null 输入', () => {
  assert.strictEqual(calculateSharpeRatio(null, 0.03), 0, 'null 应返回 0');
});

runTest('夏普比率 - 零波动', () => {
  const zeroVolReturns = [0.01, 0.01, 0.01, 0.01];
  assert.strictEqual(calculateSharpeRatio(zeroVolReturns, 0.03), 0, '零波动应返回 0');
});

// 2.4 最大回撤
runTest('最大回撤 - 正常计算', () => {
  const result = calculateMaxDrawdown(sampleEquityCurve);
  assert.ok(result.maxDrawdown >= 0, '最大回撤应 >= 0');
  assert.ok(result.maxDrawdown < 1, '最大回撤应 < 1');
});

runTest('最大回撤 - 识别正确位置', () => {
  // 递减曲线：100 -> 90 -> 80 -> 70，最大回撤应为 0.3
  const decliningCurve = [100, 90, 80, 70];
  const result = calculateMaxDrawdown(decliningCurve);
  assertApproxEqual(result.maxDrawdown, 0.3, 0.0001, '递减曲线最大回撤');
});

runTest('最大回撤 - 递增曲线', () => {
  const increasingCurve = [100, 110, 120, 130];
  const result = calculateMaxDrawdown(increasingCurve);
  assert.strictEqual(result.maxDrawdown, 0, '递增曲线最大回撤应为 0');
});

runTest('最大回撤 - 单点曲线', () => {
  const singlePoint = [100];
  const result = calculateMaxDrawdown(singlePoint);
  assert.strictEqual(result.maxDrawdown, 0, '单点曲线最大回撤应为 0');
});

runTest('最大回撤 - 空数组', () => {
  const result = calculateMaxDrawdown([]);
  assert.strictEqual(result.maxDrawdown, 0, '空数组最大回撤应为 0');
  assert.strictEqual(result.startIndex, -1, '空数组起始索引应为 -1');
});

// 2.5 波动率
runTest('波动率 - 正常计算', () => {
  const result = calculateVolatility(sampleDailyReturns);
  assert.ok(typeof result === 'number', '波动率应为数字');
  assert.ok(result >= 0, '波动率应 >= 0');
});

runTest('波动率 - 年化计算验证', () => {
  // 使用已知波动率的序列
  const knownReturns = [0.01, -0.01, 0.01, -0.01, 0.01];
  const result = calculateVolatility(knownReturns);
  // 日标准差约为 0.01，年化约为 0.01 * sqrt(252) ≈ 0.1587
  // 由于样本标准差计算差异，使用较大容差
  assertApproxEqual(result, 0.01 * Math.sqrt(252), 0.01, '波动率年化计算');
});

runTest('波动率 - 单元素数组', () => {
  assert.strictEqual(calculateVolatility([0.01]), 0, '单元素数组波动率应为 0');
});

runTest('波动率 - 空数组', () => {
  assert.strictEqual(calculateVolatility([]), 0, '空数组波动率应为 0');
});

runTest('波动率 - null 输入', () => {
  assert.strictEqual(calculateVolatility(null), 0, 'null 波动率应为 0');
});

// 2.6 胜率
runTest('胜率 - 正常计算', () => {
  const result = calculateWinRate([0.05, -0.02, 0.08, 0.03, -0.01]);
  // 3 盈利 / 5 总 = 0.6
  assertApproxEqual(result.winRate, 0.6, 0.0001, '胜率计算');
  assert.strictEqual(result.winCount, 3, '盈利次数应为 3');
  assert.strictEqual(result.totalTrades, 5, '总交易数应为 5');
});

runTest('胜率 - 全盈利', () => {
  const result = calculateWinRate([0.01, 0.02, 0.03]);
  assert.strictEqual(result.winRate, 1, '全盈利胜率应为 1');
});

runTest('胜率 - 全亏损', () => {
  const result = calculateWinRate([-0.01, -0.02, -0.03]);
  assert.strictEqual(result.winRate, 0, '全亏损胜率应为 0');
});

runTest('胜率 - 空数组', () => {
  const result = calculateWinRate([]);
  assert.strictEqual(result.winRate, 0, '空数组胜率应为 0');
  assert.strictEqual(result.totalTrades, 0, '空数组交易数应为 0');
});

// 2.7 交易次数
runTest('交易次数 - 正常计算', () => {
  const metrics = new PerformanceMetrics(sampleTrades, 100000);
  assert.strictEqual(metrics.calculateTradeCount(), 5, '交易次数应为 5');
});

runTest('交易次数 - 空交易', () => {
  const metrics = new PerformanceMetrics([], 100000);
  assert.strictEqual(metrics.calculateTradeCount(), 0, '空交易次数应为 0');
});

// ==================== 3. getAllMetrics 测试 ====================
console.log('\n3. getAllMetrics 综合测试');

runTest('getAllMetrics - 返回所有 7 个指标', () => {
  const metrics = new PerformanceMetrics(sampleTrades, 100000, 0.03);
  const result = metrics.getAllMetrics({
    tradingDays: 252,
    dailyReturns: sampleDailyReturns,
    equityCurve: sampleEquityCurve
  });

  // 验证 7 个核心指标存在
  assert.ok('totalReturn' in result, '应有 totalReturn');
  assert.ok('annualizedReturn' in result, '应有 annualizedReturn');
  assert.ok('sharpeRatio' in result, '应有 sharpeRatio');
  assert.ok('maxDrawdown' in result, '应有 maxDrawdown');
  assert.ok('volatility' in result, '应有 volatility');
  assert.ok('winRate' in result, '应有 winRate');
  assert.ok('tradeCount' in result, '应有 tradeCount');

  // 验证类型
  assert.strictEqual(typeof result.totalReturn, 'number', 'totalReturn 应为数字');
  assert.strictEqual(typeof result.annualizedReturn, 'number', 'annualizedReturn 应为数字');
  assert.strictEqual(typeof result.sharpeRatio, 'number', 'sharpeRatio 应为数字');
  assert.strictEqual(typeof result.maxDrawdown, 'number', 'maxDrawdown 应为数字');
  assert.strictEqual(typeof result.volatility, 'number', 'volatility 应为数字');
  assert.strictEqual(typeof result.winRate, 'number', 'winRate 应为数字');
  assert.strictEqual(typeof result.tradeCount, 'number', 'tradeCount 应为数字');
});

runTest('getAllMetrics - 空数据边界情况', () => {
  const metrics = new PerformanceMetrics([], 100000, 0.03);
  const result = metrics.getAllMetrics();

  assert.strictEqual(result.totalReturn, 0, '空交易总收益应为 0');
  assert.strictEqual(result.tradeCount, 0, '空交易次数应为 0');
  assert.strictEqual(result.winRate, 0, '空交易胜率应为 0');
});

// ==================== 4. 辅助函数测试 ====================
console.log('\n4. 辅助函数测试');

runTest('calculateProfitLossRatio - 正常计算', () => {
  const result = calculateProfitLossRatio([0.05, -0.02, 0.08, -0.01]);
  // avgWin = (0.05 + 0.08) / 2 = 0.065
  // avgLoss = (0.02 + 0.01) / 2 = 0.015
  // ratio = 0.065 / 0.015 ≈ 4.333
  assertApproxEqual(result.avgWin, 0.065, 0.0001, '平均盈利');
  assertApproxEqual(result.avgLoss, 0.015, 0.0001, '平均亏损');
  assertApproxEqual(result.profitLossRatio, 4.333, 0.01, '盈亏比');
});

runTest('calculateProfitLossRatio - 无亏损', () => {
  const result = calculateProfitLossRatio([0.05, 0.08, 0.03]);
  assert.strictEqual(result.profitLossRatio, Infinity, '无亏损盈亏比应为 Infinity');
});

runTest('calculateProfitLossRatio - 无盈利', () => {
  const result = calculateProfitLossRatio([-0.02, -0.01, -0.03]);
  assert.strictEqual(result.profitLossRatio, 0, '无盈利盈亏比应为 0');
});

runTest('calculateCalmarRatio - 正常计算', () => {
  const result = calculateCalmarRatio(0.2, 0.1);
  assert.strictEqual(result, 2, '卡玛比率应为 2');
});

runTest('calculateCalmarRatio - 零最大回撤', () => {
  const result = calculateCalmarRatio(0.2, 0);
  assert.strictEqual(result, Infinity, '零回撤卡玛比率应为 Infinity');
});

runTest('calculateSortinoRatio - 正常计算', () => {
  const result = calculateSortinoRatio(sampleDailyReturns, 0);
  assert.ok(typeof result === 'number', '索提诺比率应为数字');
});

runTest('calculateSortinoRatio - 空数组', () => {
  assert.strictEqual(calculateSortinoRatio([], 0), 0, '空数组索提诺比率应为 0');
});

runTest('calculateTradeStatistics - 正常计算', () => {
  const trades = [
    { return: 0.05, entryDate: '2024-01-01', exitDate: '2024-01-05', commission: 10 },
    { return: -0.02, entryDate: '2024-01-10', exitDate: '2024-01-12', commission: 10 }
  ];

  const result = calculateTradeStatistics(trades);

  assert.strictEqual(result.totalTrades, 2, '总交易数应为 2');
  assert.strictEqual(result.winningTrades, 1, '盈利交易数应为 1');
  assert.strictEqual(result.losingTrades, 1, '亏损交易数应为 1');
  assert.strictEqual(result.totalCommission, 20, '总佣金应为 20');
});

runTest('calculateTradeStatistics - 空数组', () => {
  const result = calculateTradeStatistics([]);
  assert.strictEqual(result.totalTrades, 0, '空交易数应为 0');
  assert.strictEqual(result.avgTradeReturn, 0, '空交易平均收益应为 0');
});

// ==================== 5. calculatePerformanceReport 测试 ====================
console.log('\n5. calculatePerformanceReport 综合测试');

runTest('calculatePerformanceReport - 完整数据', () => {
  const backtestData = {
    equityCurve: sampleEquityCurve,
    dailyReturns: sampleDailyReturns,
    trades: sampleTrades,
    initialCapital: 100000,
    finalCapital: 113000, // 100000 * (1 + 0.13)
    tradingDays: 252
  };

  const report = calculatePerformanceReport(backtestData);

  // 验证 7 个核心指标
  assert.ok(typeof report.totalReturn === 'number', '应有 totalReturn');
  assert.ok(typeof report.annualizedReturn === 'number', '应有 annualizedReturn');
  assert.ok(typeof report.sharpeRatio === 'number', '应有 sharpeRatio');
  assert.ok(typeof report.maxDrawdown === 'number', '应有 maxDrawdown');
  assert.ok(typeof report.volatility === 'number', '应有 volatility');
  assert.ok(typeof report.winRate === 'number', '应有 winRate');
  assert.ok(typeof report.tradeCount === 'number', '应有 tradeCount');

  // 验证额外指标
  assert.ok(typeof report.sortinoRatio === 'number', '应有 sortinoRatio');
  assert.ok(typeof report.calmarRatio === 'number', '应有 calmarRatio');
  assert.ok(typeof report.profitLossRatio === 'number', '应有 profitLossRatio');
});

runTest('calculatePerformanceReport - 空数据边界情况', () => {
  const report = calculatePerformanceReport({});

  assert.strictEqual(report.totalReturn, 0, '空数据总收益应为 0');
  assert.strictEqual(report.tradeCount, 0, '空数据交易数应为 0');
  assert.strictEqual(report.maxDrawdown, 0, '空数据最大回撤应为 0');
});

runTest('calculatePerformanceReport - 默认值处理', () => {
  const report = calculatePerformanceReport({
    trades: [{ return: 0.1 }]
  });

  assert.strictEqual(report.initialCapital, 1, '默认初始资金应为 1');
  assert.strictEqual(report.tradingDays, 252, '默认交易日应为 252');
});

// ==================== 6. 边界情况综合测试 ====================
console.log('\n6. 边界情况综合测试');

runTest('边界情况 - 单笔盈利交易', () => {
  const singleWin = [{ return: 0.1 }];
  const metrics = new PerformanceMetrics(singleWin, 100000);

  assertApproxEqual(metrics.calculateTotalReturn(), 0.1, 0.0001, '单笔盈利总收益');
  assert.strictEqual(metrics.calculateWinRate(), 1, '单笔盈利胜率应为 1');
  assert.strictEqual(metrics.calculateTradeCount(), 1, '单笔交易次数应为 1');
});

runTest('边界情况 - 单笔亏损交易', () => {
  const singleLoss = [{ return: -0.1 }];
  const metrics = new PerformanceMetrics(singleLoss, 100000);

  assertApproxEqual(metrics.calculateTotalReturn(), -0.1, 0.0001, '单笔亏损总收益');
  assert.strictEqual(metrics.calculateWinRate(), 0, '单笔亏损胜率应为 0');
});

runTest('边界情况 - 零收益交易', () => {
  const zeroReturn = [{ return: 0 }, { return: 0.01 }];
  const metrics = new PerformanceMetrics(zeroReturn, 100000);

  assertApproxEqual(metrics.calculateTotalReturn(), 0.01, 0.0001, '零收益交易总收益');
  assert.strictEqual(metrics.calculateWinRate(), 0.5, '零收益交易胜率');
});

runTest('边界情况 - 超大收益率', () => {
  const hugeReturn = [{ return: 10 }]; // 1000% 收益
  const metrics = new PerformanceMetrics(hugeReturn, 100000);

  assert.strictEqual(metrics.calculateTotalReturn(), 10, '超大收益率应正确计算');
  assert.strictEqual(metrics.calculateWinRate(), 1, '超大收益胜率应为 1');
});

runTest('边界情况 - 极端负收益', () => {
  const extremeLoss = [{ return: -0.99 }]; // -99%
  const metrics = new PerformanceMetrics(extremeLoss, 100000);

  assert.strictEqual(metrics.calculateTotalReturn(), -0.99, '极端负收益应正确计算');
  assert.strictEqual(metrics.calculateWinRate(), 0, '极端负收益胜率应为 0');
});

runTest('边界情况 - 无风险利率为 0', () => {
  const metrics = new PerformanceMetrics(sampleTrades, 100000, 0);
  assert.strictEqual(metrics.riskFreeRate, 0, '无风险利率应为 0');

  const sharpe = metrics.calculateSharpeRatio(sampleDailyReturns);
  assert.ok(typeof sharpe === 'number', '零无风险利率夏普比率应为数字');
});

runTest('边界情况 - 权益曲线波动', () => {
  const volatileCurve = [100, 150, 80, 200, 50, 300, 40];
  const result = calculateMaxDrawdown(volatileCurve);

  // 从 300 跌到 40，回撤应为 (300 - 40) / 300 = 0.867
  assertApproxEqual(result.maxDrawdown, 0.867, 0.01, '高波动权益曲线最大回撤');
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