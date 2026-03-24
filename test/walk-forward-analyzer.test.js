#!/usr/bin/env node

/**
 * walk-forward-analyzer.js 单元测试
 * TASK_V3_303 - Walk-Forward 样本外测试
 *
 * 测试覆盖：
 * 1. 分割策略测试
 * 2. 过拟合检测测试
 * 3. 参数稳定性分析测试
 * 4. 报告生成测试
 * 5. 边界情况测试
 */

const assert = require('node:assert');
const {
  WalkForwardAnalyzer,
  SPLIT_STRATEGY,
  OVERFITTING_THRESHOLD
} = require('../api/walk-forward-analyzer.js');

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
console.log('walk-forward-analyzer.js 单元测试');
console.log('TASK_V3_303 - Walk-Forward 样本外测试');
console.log('========================================\n');

// ==================== 1. 常量和枚举测试 ====================
console.log('1. 常量和枚举测试');

runTest('SPLIT_STRATEGY 枚举值', () => {
  assert.strictEqual(SPLIT_STRATEGY.FIXED_RATIO, 'fixed_ratio', '固定比例策略');
  assert.strictEqual(SPLIT_STRATEGY.ROLLING_WINDOW, 'rolling_window', '滚动窗口策略');
  assert.strictEqual(SPLIT_STRATEGY.EXPANDING_WINDOW, 'expanding_window', '扩展窗口策略');
});

runTest('OVERFITTING_THRESHOLD 默认值', () => {
  assert.strictEqual(OVERFITTING_THRESHOLD, 0.30, '默认过拟合阈值应为 0.30');
});

// ==================== 2. WalkForwardAnalyzer 类测试 ====================
console.log('\n2. WalkForwardAnalyzer 类测试');

runTest('类实例化 - 默认配置', () => {
  const analyzer = new WalkForwardAnalyzer();
  assert.ok(analyzer instanceof WalkForwardAnalyzer, '应创建实例');
  assert.strictEqual(analyzer.config.trainRatio, 0.7, '默认训练比例应为 0.7');
  assert.strictEqual(analyzer.config.testRatio, 0.3, '默认测试比例应为 0.3');
  assert.strictEqual(analyzer.config.splitStrategy, 'fixed_ratio', '默认分割策略');
  assert.strictEqual(analyzer.config.overfittingThreshold, 0.30, '默认过拟合阈值');
});

runTest('类实例化 - 自定义配置', () => {
  const analyzer = new WalkForwardAnalyzer({
    trainRatio: 0.6,
    testRatio: 0.4,
    splitStrategy: SPLIT_STRATEGY.ROLLING_WINDOW,
    windowSize: 126,
    stepSize: 21,
    overfittingThreshold: 0.25
  });

  assert.strictEqual(analyzer.config.trainRatio, 0.6, '自定义训练比例');
  assert.strictEqual(analyzer.config.windowSize, 126, '自定义窗口大小');
  assert.strictEqual(analyzer.config.stepSize, 21, '自定义步进大小');
  assert.strictEqual(analyzer.config.overfittingThreshold, 0.25, '自定义过拟合阈值');
});

// ==================== 3. 参数组合生成测试 ====================
console.log('\n3. 参数组合生成测试');

runTest('generateParamCombinations - 空参数', () => {
  const analyzer = new WalkForwardAnalyzer();
  const combinations = analyzer.generateParamCombinations({});

  assert.strictEqual(combinations.length, 1, '空参数应返回 1 个组合');
  assert.deepStrictEqual(combinations[0], {}, '空参数组合');
});

runTest('generateParamCombinations - 单参数', () => {
  const analyzer = new WalkForwardAnalyzer();
  const combinations = analyzer.generateParamCombinations({
    maxStocks: [5, 10, 15]
  });

  assert.strictEqual(combinations.length, 3, '单参数 3 个值应返回 3 个组合');
  assert.strictEqual(combinations[0].maxStocks, 5, '第一个组合');
  assert.strictEqual(combinations[1].maxStocks, 10, '第二个组合');
  assert.strictEqual(combinations[2].maxStocks, 15, '第三个组合');
});

runTest('generateParamCombinations - 多参数', () => {
  const analyzer = new WalkForwardAnalyzer();
  const combinations = analyzer.generateParamCombinations({
    maxStocks: [5, 10],
    minFactorScore: [0, 10]
  });

  // 2 * 2 = 4 个组合
  assert.strictEqual(combinations.length, 4, '多参数应返回笛卡尔积');

  // 验证所有组合存在
  const hasCombination = (expected) => {
    return combinations.some(c =>
      c.maxStocks === expected.maxStocks && c.minFactorScore === expected.minFactorScore
    );
  };

  assert.ok(hasCombination({ maxStocks: 5, minFactorScore: 0 }), '组合 1');
  assert.ok(hasCombination({ maxStocks: 5, minFactorScore: 10 }), '组合 2');
  assert.ok(hasCombination({ maxStocks: 10, minFactorScore: 0 }), '组合 3');
  assert.ok(hasCombination({ maxStocks: 10, minFactorScore: 10 }), '组合 4');
});

runTest('generateParamCombinations - 三参数', () => {
  const analyzer = new WalkForwardAnalyzer();
  const combinations = analyzer.generateParamCombinations({
    a: [1, 2],
    b: [3, 4],
    c: [5, 6]
  });

  // 2 * 2 * 2 = 8 个组合
  assert.strictEqual(combinations.length, 8, '三参数应返回 8 个组合');
});

// ==================== 4. 相对差异计算测试 ====================
console.log('\n4. 相对差异计算测试');

runTest('calculateRelativeDifference - 相同值', () => {
  const analyzer = new WalkForwardAnalyzer();
  const diff = analyzer.calculateRelativeDifference(10, 10);

  assert.strictEqual(diff, 0, '相同值差异应为 0');
});

runTest('calculateRelativeDifference - 不同值', () => {
  const analyzer = new WalkForwardAnalyzer();

  // |10 - 7| / 10 = 0.3
  const diff = analyzer.calculateRelativeDifference(10, 7);
  assertApproxEqual(diff, 0.3, 0.0001, '不同值差异');
});

runTest('calculateRelativeDifference - 零基准值', () => {
  const analyzer = new WalkForwardAnalyzer();

  // 基准值为 0 时，比较值 > 0 返回 1
  const diff1 = analyzer.calculateRelativeDifference(0, 10);
  assert.strictEqual(diff1, 1, '基准为零，比较值非零');

  // 两者都为 0 返回 0
  const diff2 = analyzer.calculateRelativeDifference(0, 0);
  assert.strictEqual(diff2, 0, '两者都为零');
});

runTest('calculateRelativeDifference - 负值处理', () => {
  const analyzer = new WalkForwardAnalyzer();

  // 使用绝对值计算
  const diff = analyzer.calculateRelativeDifference(-10, -7);
  assertApproxEqual(diff, 0.3, 0.0001, '负值差异');
});

// ==================== 5. 过拟合得分计算测试 ====================
console.log('\n5. 过拟合得分计算测试');

runTest('calculateOverfittingScore - 无告警', () => {
  const analyzer = new WalkForwardAnalyzer();
  const score = analyzer.calculateOverfittingScore([]);

  assert.strictEqual(score, 0, '无告警得分应为 0');
});

runTest('calculateOverfittingScore - WARNING 告警', () => {
  const analyzer = new WalkForwardAnalyzer();
  const warnings = [
    { severity: 'WARNING' },
    { severity: 'WARNING' }
  ];
  const score = analyzer.calculateOverfittingScore(warnings);

  // 2 * 0.2 = 0.4
  assertApproxEqual(score, 0.4, 0.0001, '2个WARNING告警得分');
});

runTest('calculateOverfittingScore - CRITICAL 告警', () => {
  const analyzer = new WalkForwardAnalyzer();
  const warnings = [
    { severity: 'CRITICAL' },
    { severity: 'WARNING' }
  ];
  const score = analyzer.calculateOverfittingScore(warnings);

  // 1 * 0.4 + 1 * 0.2 = 0.6
  assertApproxEqual(score, 0.6, 0.0001, 'CRITICAL+WARNING告警得分');
});

runTest('calculateOverfittingScore - 得分上限', () => {
  const analyzer = new WalkForwardAnalyzer();
  const warnings = [
    { severity: 'CRITICAL' },
    { severity: 'CRITICAL' },
    { severity: 'CRITICAL' },
    { severity: 'CRITICAL' }
  ];
  const score = analyzer.calculateOverfittingScore(warnings);

  // 4 * 0.4 = 1.6, 但上限为 1
  assert.strictEqual(score, 1, '得分上限为 1');
});

// ==================== 6. 优化得分计算测试 ====================
console.log('\n6. 优化得分计算测试');

runTest('calculateOptimizationScore - 正常计算', () => {
  const analyzer = new WalkForwardAnalyzer();

  const result = {
    summary: {
      sharpeRatio: 1.0,
      annualizedReturn: 0.2,
      maxDrawdown: -0.1,
      winRate: 0.6
    }
  };

  const score = analyzer.calculateOptimizationScore(result);

  // 1.0 * 0.4 + 0.2 * 0.3 - 0.1 * 0.2 + 0.6 * 0.1
  // = 0.4 + 0.06 - 0.02 + 0.06 = 0.5
  assertApproxEqual(score, 0.5, 0.001, '优化得分');
});

runTest('calculateOptimizationScore - 空数据', () => {
  const analyzer = new WalkForwardAnalyzer();

  const result = { summary: {} };
  const score = analyzer.calculateOptimizationScore(result);

  assert.strictEqual(score, 0, '空数据得分应为 0');
});

runTest('calculateOptimizationScore - 高夏普低回撤', () => {
  const analyzer = new WalkForwardAnalyzer();

  const result = {
    summary: {
      sharpeRatio: 2.0,
      annualizedReturn: 0.3,
      maxDrawdown: -0.05,
      winRate: 0.7
    }
  };

  const score = analyzer.calculateOptimizationScore(result);

  // 高夏普、低回撤应得高分
  assert.ok(score > 0.8, '高夏普低回撤应得高分');
});

// ==================== 7. 关键指标提取测试 ====================
console.log('\n7. 关键指标提取测试');

runTest('extractKeyMetrics - 完整数据', () => {
  const analyzer = new WalkForwardAnalyzer();

  const backtestResult = {
    summary: {
      totalReturn: 0.5,
      annualizedReturn: 0.2,
      sharpeRatio: 1.5,
      maxDrawdown: -0.1,
      winRate: 0.6,
      profitLossRatio: 2.0,
      totalTrades: 100,
      calmarRatio: 2.0
    }
  };

  const metrics = analyzer.extractKeyMetrics(backtestResult);

  assert.strictEqual(metrics.totalReturn, 0.5, '总收益');
  assert.strictEqual(metrics.annualizedReturn, 0.2, '年化收益');
  assert.strictEqual(metrics.sharpeRatio, 1.5, '夏普比率');
  assert.strictEqual(metrics.maxDrawdown, -0.1, '最大回撤');
  assert.strictEqual(metrics.winRate, 0.6, '胜率');
  assert.strictEqual(metrics.totalTrades, 100, '交易次数');
});

runTest('extractKeyMetrics - 空数据', () => {
  const analyzer = new WalkForwardAnalyzer();

  const metrics = analyzer.extractKeyMetrics({ summary: {} });

  assert.strictEqual(metrics.totalReturn, 0, '空数据总收益应为 0');
  assert.strictEqual(metrics.sharpeRatio, 0, '空数据夏普应为 0');
  assert.strictEqual(metrics.totalTrades, 0, '空数据交易次数应为 0');
});

// ==================== 8. 过拟合检测测试 ====================
console.log('\n8. 过拟合检测测试');

runTest('detectOverfitting - 无过拟合', () => {
  const analyzer = new WalkForwardAnalyzer();

  const trainResult = {
    summary: {
      sharpeRatio: 1.0,
      annualizedReturn: 0.2,
      maxDrawdown: -0.1,
      winRate: 0.6
    }
  };

  const testResult = {
    summary: {
      sharpeRatio: 0.9,
      annualizedReturn: 0.18,
      maxDrawdown: -0.11,
      winRate: 0.58
    }
  };

  const analysis = analyzer.detectOverfitting(trainResult, testResult);

  assert.strictEqual(analysis.isOverfitting, false, '无过拟合');
  assert.ok(analysis.warnings.length === 0, '无告警');
  assert.ok(analysis.overfittingScore < 0.3, '过拟合得分低');
});

runTest('detectOverfitting - 明显过拟合', () => {
  const analyzer = new WalkForwardAnalyzer();

  const trainResult = {
    summary: {
      sharpeRatio: 2.0,
      annualizedReturn: 0.5,
      maxDrawdown: -0.05,
      winRate: 0.8
    }
  };

  const testResult = {
    summary: {
      sharpeRatio: 0.5,  // 差异 75% > 30%
      annualizedReturn: 0.1,
      maxDrawdown: -0.15,
      winRate: 0.4
    }
  };

  const analysis = analyzer.detectOverfitting(trainResult, testResult);

  assert.strictEqual(analysis.isOverfitting, true, '检测到过拟合');
  assert.ok(analysis.warnings.length > 0, '应有告警');
  assert.ok(analysis.overfittingScore > 0.3, '过拟合得分高');
});

runTest('detectOverfitting - 告警级别判断', () => {
  const analyzer = new WalkForwardAnalyzer();

  const trainResult = {
    summary: {
      sharpeRatio: 2.0,
      annualizedReturn: 0.5,
      maxDrawdown: -0.1,
      winRate: 0.7
    }
  };

  // 差异 > 50% 应为 CRITICAL
  const testResult = {
    summary: {
      sharpeRatio: 0.5,  // 差异 75% > 50%
      annualizedReturn: 0.2,
      maxDrawdown: -0.12,
      winRate: 0.6
    }
  };

  const analysis = analyzer.detectOverfitting(trainResult, testResult);

  const criticalWarnings = analysis.warnings.filter(w => w.severity === 'CRITICAL');
  assert.ok(criticalWarnings.length > 0, '应有 CRITICAL 告警');
});

// ==================== 9. 参数稳定性分析测试 ====================
console.log('\n9. 参数稳定性分析测试');

runTest('analyzeParameterStability - 无数据', () => {
  const analyzer = new WalkForwardAnalyzer();

  const analysis = analyzer.analyzeParameterStability([], {});

  assert.strictEqual(analysis.isStable, true, '无数据默认稳定');
  assert.strictEqual(analysis.stabilityScore, 1, '无数据得分 1');
});

runTest('analyzeParameterStability - 稳定参数', () => {
  const analyzer = new WalkForwardAnalyzer();

  const allResults = [
    { params: { maxStocks: 10 }, score: 0.5 },
    { params: { maxStocks: 10 }, score: 0.49 },
    { params: { maxStocks: 10 }, score: 0.51 }
  ];

  const analysis = analyzer.analyzeParameterStability(allResults, { maxStocks: 10 });

  assert.strictEqual(analysis.isStable, true, '相同参数应稳定');
  assert.ok(analysis.stabilityScore > 0.9, '稳定得分高');
});

runTest('analyzeParameterStability - 不稳定参数', () => {
  const analyzer = new WalkForwardAnalyzer();

  const allResults = [
    { params: { maxStocks: 5 }, score: 0.8 },
    { params: { maxStocks: 10 }, score: 0.2 },
    { params: { maxStocks: 15 }, score: 0.1 }
  ];

  const analysis = analyzer.analyzeParameterStability(allResults, { maxStocks: 5 });

  // 得分方差大，不稳定
  assert.strictEqual(analysis.isStable, false, '得分波动大应不稳定');
  assert.ok(analysis.stabilityScore < 0.7, '不稳定得分低');
});

// ==================== 10. 过拟合摘要生成测试 ====================
console.log('\n10. 过拟合摘要生成测试');

runTest('generateOverfittingSummary - 无告警', () => {
  const analyzer = new WalkForwardAnalyzer();

  const summary = analyzer.generateOverfittingSummary([], 0);

  assert.ok(summary.includes('稳定'), '无告警摘要应包含"稳定"');
});

runTest('generateOverfittingSummary - 高过拟合', () => {
  const analyzer = new WalkForwardAnalyzer();

  const warnings = [
    { severity: 'CRITICAL', message: 'test' }
  ];

  const summary = analyzer.generateOverfittingSummary(warnings, 0.7);

  assert.ok(summary.includes('严重'), '高过拟合应提到"严重"');
});

runTest('generateOverfittingSummary - 中等风险', () => {
  const analyzer = new WalkForwardAnalyzer();

  const warnings = [
    { severity: 'WARNING', message: 'test' }
  ];

  const summary = analyzer.generateOverfittingSummary(warnings, 0.35);

  assert.ok(summary.includes('风险'), '中等风险应提到"风险"');
});

// ==================== 11. 多折结果聚合测试 ====================
console.log('\n11. 多折结果聚合测试');

runTest('aggregateFoldResults - 空数组', () => {
  const analyzer = new WalkForwardAnalyzer();

  const result = analyzer.aggregateFoldResults([]);

  assert.strictEqual(result, null, '空数组应返回 null');
});

runTest('aggregateFoldResults - 单折', () => {
  const analyzer = new WalkForwardAnalyzer();

  const splits = [{
    trainPerformance: {
      annualizedReturn: 0.2,
      sharpeRatio: 1.0,
      maxDrawdown: -0.1
    },
    testPerformance: {
      annualizedReturn: 0.15,
      sharpeRatio: 0.8,
      maxDrawdown: -0.12
    },
    overfittingAnalysis: {
      overfittingScore: 0.2
    }
  }];

  const result = analyzer.aggregateFoldResults(splits);

  assert.strictEqual(result.folds, 1, '折数应为 1');
  assert.strictEqual(result.train.avgReturn, 0.2, '训练集平均收益');
  assert.strictEqual(result.test.avgReturn, 0.15, '测试集平均收益');
});

runTest('aggregateFoldResults - 多折平均计算', () => {
  const analyzer = new WalkForwardAnalyzer();

  const splits = [
    {
      trainPerformance: { annualizedReturn: 0.2, sharpeRatio: 1.0, maxDrawdown: -0.1 },
      testPerformance: { annualizedReturn: 0.15, sharpeRatio: 0.8, maxDrawdown: -0.12 },
      overfittingAnalysis: { overfittingScore: 0.2 }
    },
    {
      trainPerformance: { annualizedReturn: 0.3, sharpeRatio: 1.2, maxDrawdown: -0.08 },
      testPerformance: { annualizedReturn: 0.25, sharpeRatio: 1.0, maxDrawdown: -0.1 },
      overfittingAnalysis: { overfittingScore: 0.3 }
    }
  ];

  const result = analyzer.aggregateFoldResults(splits);

  assert.strictEqual(result.folds, 2, '折数应为 2');
  assertApproxEqual(result.train.avgReturn, 0.25, 0.001, '训练集平均收益');
  assertApproxEqual(result.test.avgReturn, 0.2, 0.001, '测试集平均收益');
  assertApproxEqual(result.overfitting.avgScore, 0.25, 0.001, '平均过拟合得分');
});

// ==================== 12. Markdown 报告生成测试 ====================
console.log('\n12. Markdown 报告生成测试');

runTest('generateMarkdownReport - 未执行分析', () => {
  const analyzer = new WalkForwardAnalyzer();

  const report = analyzer.generateMarkdownReport();

  assert.ok(report.includes('尚未执行分析'), '未执行分析报告');
});

runTest('generateMarkdownReport - 有分析结果', () => {
  const analyzer = new WalkForwardAnalyzer();

  // 模拟分析结果
  analyzer.results = {
    timestamp: '2024-01-01T00:00:00.000Z',
    config: {
      splitStrategy: 'fixed_ratio',
      trainRatio: 0.7,
      testRatio: 0.3,
      overfittingThreshold: 0.30
    },
    results: {
      trainPeriod: {
        startDate: '2020-01-01',
        endDate: '2022-12-31',
        tradingDays: 730
      },
      testPeriod: {
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        tradingDays: 242
      },
      bestParams: { maxStocks: 10 },
      trainPerformance: {
        annualizedReturn: 0.2,
        sharpeRatio: 1.5,
        maxDrawdown: -0.1,
        winRate: 0.6,
        totalReturn: 0.5,
        totalTrades: 100
      },
      testPerformance: {
        annualizedReturn: 0.15,
        sharpeRatio: 1.2,
        maxDrawdown: -0.12,
        winRate: 0.55,
        totalReturn: 0.15,
        totalTrades: 50
      },
      overfittingAnalysis: {
        overfittingScore: 0.2,
        warnings: []
      }
    },
    conclusion: {
      isValid: true,
      recommendation: '策略表现稳定',
      summary: '测试摘要'
    }
  };

  const report = analyzer.generateMarkdownReport();

  assert.ok(report.includes('# Walk-Forward 分析报告'), '应包含标题');
  assert.ok(report.includes('分析配置'), '应包含配置');
  assert.ok(report.includes('数据分割'), '应包含分割信息');
  assert.ok(report.includes('最优参数'), '应包含最优参数');
  assert.ok(report.includes('过拟合分析'), '应包含过拟合分析');
  assert.ok(report.includes('结论'), '应包含结论');
});

// ==================== 13. 结论生成测试 ====================
console.log('\n13. 结论生成测试');

runTest('generateConclusion - 有效策略', () => {
  const analyzer = new WalkForwardAnalyzer();

  const aggregatedMetrics = {
    train: { avgReturn: 0.2, avgSharpe: 1.5, avgDrawdown: -0.1 },
    test: { avgReturn: 0.18, avgSharpe: 1.3, avgDrawdown: -0.12 },
    overfitting: { avgScore: 0.1 }
  };

  const conclusion = analyzer.generateConclusion({ aggregatedMetrics });

  assert.strictEqual(conclusion.isValid, true, '低过拟合得分应有效');
  assert.ok(conclusion.recommendation.includes('稳定'), '推荐应提到稳定');
});

runTest('generateConclusion - 无效策略', () => {
  const analyzer = new WalkForwardAnalyzer();

  const aggregatedMetrics = {
    train: { avgReturn: 0.5, avgSharpe: 2.0, avgDrawdown: -0.05 },
    test: { avgReturn: 0.1, avgSharpe: 0.5, avgDrawdown: -0.2 },
    overfitting: { avgScore: 0.7 }
  };

  const conclusion = analyzer.generateConclusion({ aggregatedMetrics });

  assert.strictEqual(conclusion.isValid, false, '高过拟合得分应无效');
  assert.ok(conclusion.recommendation.includes('不推荐'), '推荐应提到不推荐');
});

// ==================== 14. 边界情况测试 ====================
console.log('\n14. 边界情况测试');

runTest('边界情况 - 零收益', () => {
  const analyzer = new WalkForwardAnalyzer();

  const trainResult = {
    summary: {
      sharpeRatio: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      winRate: 0
    }
  };

  const testResult = {
    summary: {
      sharpeRatio: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      winRate: 0
    }
  };

  const analysis = analyzer.detectOverfitting(trainResult, testResult);

  // 零收益不应产生除以零错误
  assert.ok(typeof analysis.overfittingScore === 'number', '应返回数值');
});

runTest('边界情况 - 极端夏普比率', () => {
  const analyzer = new WalkForwardAnalyzer();

  const diff = analyzer.calculateRelativeDifference(10, -5);
  // |10 - (-5)| / 10 = 1.5
  assertApproxEqual(diff, 1.5, 0.0001, '极端差异');
});

runTest('边界情况 - 大量参数组合', () => {
  const analyzer = new WalkForwardAnalyzer();

  const combinations = analyzer.generateParamCombinations({
    a: [1, 2, 3, 4, 5],
    b: [1, 2, 3, 4, 5],
    c: [1, 2, 3, 4, 5]
  });

  // 5^3 = 125
  assert.strictEqual(combinations.length, 125, '大量参数组合');
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