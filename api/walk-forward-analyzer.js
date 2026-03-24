/**
 * Walk-Forward 样本外测试分析器
 * 用于验证策略参数在样本外数据上的表现，防止过拟合
 *
 * TASK_V3_303 - Walk-Forward 样本外测试
 */

const FactorSnapshotBacktest = require('./backtest-engine');

/**
 * 分割策略类型
 */
const SPLIT_STRATEGY = {
  FIXED_RATIO: 'fixed_ratio',      // 固定比例分割
  ROLLING_WINDOW: 'rolling_window', // 滚动窗口
  EXPANDING_WINDOW: 'expanding_window' // 扩展窗口
};

/**
 * 过拟合检测阈值
 */
const OVERFITTING_THRESHOLD = 0.30; // 30% 差异告警

/**
 * Walk-Forward 分析器类
 */
class WalkForwardAnalyzer {
  constructor(config = {}) {
    this.config = {
      // 分割配置
      trainRatio: config.trainRatio || 0.7,          // 训练集比例（70%）
      testRatio: config.testRatio || 0.3,            // 测试集比例（30%）
      splitStrategy: config.splitStrategy || SPLIT_STRATEGY.FIXED_RATIO,

      // 滚动窗口配置
      windowSize: config.windowSize || 252,          // 窗口大小（约1年交易日）
      stepSize: config.stepSize || 63,               // 步进大小（约3个月交易日）

      // 过拟合检测阈值
      overfittingThreshold: config.overfittingThreshold || OVERFITTING_THRESHOLD,

      // 回测配置
      backtestConfig: config.backtestConfig || {},

      // 参数优化配置
      paramRanges: config.paramRanges || {},

      ...config
    };

    this.backtestEngine = null;
    this.results = null;
  }

  /**
   * 运行 Walk-Forward 分析
   * @param {Object} params - 分析参数
   * @returns {Promise<Object>} 分析结果
   */
  async runAnalysis(params) {
    const {
      startDate,
      endDate,
      strategyConfig = {},
      paramRanges = this.config.paramRanges
    } = params;

    console.log(`[Walk-Forward] 开始分析: ${startDate} 到 ${endDate}`);
    const startTime = Date.now();

    // 1. 获取交易日列表
    this.backtestEngine = new FactorSnapshotBacktest(this.config.backtestConfig);
    const allDates = await this.backtestEngine.getTradingDates(startDate, endDate);

    if (allDates.length === 0) {
      throw new Error(`在 ${startDate} 到 ${endDate} 范围内未找到交易日数据`);
    }

    console.log(`[Walk-Forward] 共 ${allDates.length} 个交易日`);

    // 2. 根据分割策略执行分析
    let analysisResults;
    switch (this.config.splitStrategy) {
      case SPLIT_STRATEGY.ROLLING_WINDOW:
        analysisResults = await this.runRollingWindowAnalysis(allDates, strategyConfig, paramRanges);
        break;
      case SPLIT_STRATEGY.EXPANDING_WINDOW:
        analysisResults = await this.runExpandingWindowAnalysis(allDates, strategyConfig, paramRanges);
        break;
      case SPLIT_STRATEGY.FIXED_RATIO:
      default:
        analysisResults = await this.runFixedRatioAnalysis(allDates, strategyConfig, paramRanges);
        break;
    }

    // 3. 生成综合报告
    const finalResults = this.generateFinalReport(analysisResults);

    const endTime = Date.now();
    console.log(`[Walk-Forward] 分析完成，耗时: ${(endTime - startTime) / 1000}秒`);

    this.results = finalResults;
    return finalResults;
  }

  /**
   * 固定比例分割分析
   * @param {Array} allDates - 所有交易日
   * @param {Object} strategyConfig - 策略配置
   * @param {Object} paramRanges - 参数范围
   * @returns {Promise<Object>} 分析结果
   */
  async runFixedRatioAnalysis(allDates, strategyConfig, paramRanges) {
    const splitIndex = Math.floor(allDates.length * this.config.trainRatio);

    const trainDates = allDates.slice(0, splitIndex);
    const testDates = allDates.slice(splitIndex);

    console.log(`[Walk-Forward] 固定比例分割:`);
    console.log(`  训练集: ${trainDates[0]} ~ ${trainDates[trainDates.length - 1]} (${trainDates.length}天)`);
    console.log(`  测试集: ${testDates[0]} ~ ${testDates[testDates.length - 1]} (${testDates.length}天)`);

    return await this.runSingleSplit(trainDates, testDates, strategyConfig, paramRanges);
  }

  /**
   * 滚动窗口分析
   * @param {Array} allDates - 所有交易日
   * @param {Object} strategyConfig - 策略配置
   * @param {Object} paramRanges - 参数范围
   * @returns {Promise<Object>} 分析结果
   */
  async runRollingWindowAnalysis(allDates, strategyConfig, paramRanges) {
    const { windowSize, stepSize } = this.config;
    const splits = [];
    let startIndex = 0;
    let foldIndex = 0;

    console.log(`[Walk-Forward] 滚动窗口分析 (窗口=${windowSize}, 步进=${stepSize})`);

    while (startIndex + windowSize < allDates.length) {
      const trainEnd = startIndex + windowSize;
      const testEnd = Math.min(trainEnd + stepSize, allDates.length);

      const trainDates = allDates.slice(startIndex, trainEnd);
      const testDates = allDates.slice(trainEnd, testEnd);

      if (testDates.length === 0) break;

      console.log(`[Walk-Forward] Fold ${foldIndex + 1}:`);
      console.log(`  训练集: ${trainDates[0]} ~ ${trainDates[trainDates.length - 1]}`);
      console.log(`  测试集: ${testDates[0]} ~ ${testDates[testDates.length - 1]}`);

      const splitResult = await this.runSingleSplit(trainDates, testDates, strategyConfig, paramRanges);
      splits.push({
        fold: foldIndex + 1,
        ...splitResult
      });

      startIndex += stepSize;
      foldIndex++;
    }

    return {
      strategy: SPLIT_STRATEGY.ROLLING_WINDOW,
      splits,
      aggregatedMetrics: this.aggregateFoldResults(splits)
    };
  }

  /**
   * 扩展窗口分析
   * @param {Array} allDates - 所有交易日
   * @param {Object} strategyConfig - 策略配置
   * @param {Object} paramRanges - 参数范围
   * @returns {Promise<Object>} 分析结果
   */
  async runExpandingWindowAnalysis(allDates, strategyConfig, paramRanges) {
    const { windowSize, stepSize } = this.config;
    const splits = [];
    let trainStart = 0;
    let testStart = windowSize;
    let foldIndex = 0;

    console.log(`[Walk-Forward] 扩展窗口分析 (初始窗口=${windowSize}, 步进=${stepSize})`);

    while (testStart < allDates.length) {
      const testEnd = Math.min(testStart + stepSize, allDates.length);

      const trainDates = allDates.slice(trainStart, testStart);
      const testDates = allDates.slice(testStart, testEnd);

      if (testDates.length === 0) break;

      console.log(`[Walk-Forward] Fold ${foldIndex + 1}:`);
      console.log(`  训练集: ${trainDates[0]} ~ ${trainDates[trainDates.length - 1]} (${trainDates.length}天)`);
      console.log(`  测试集: ${testDates[0]} ~ ${testDates[testDates.length - 1]} (${testDates.length}天)`);

      const splitResult = await this.runSingleSplit(trainDates, testDates, strategyConfig, paramRanges);
      splits.push({
        fold: foldIndex + 1,
        ...splitResult
      });

      testStart = testEnd;
      foldIndex++;
    }

    return {
      strategy: SPLIT_STRATEGY.EXPANDING_WINDOW,
      splits,
      aggregatedMetrics: this.aggregateFoldResults(splits)
    };
  }

  /**
   * 执行单次训练/测试分割分析
   * @param {Array} trainDates - 训练集日期
   * @param {Array} testDates - 测试集日期
   * @param {Object} strategyConfig - 策略配置
   * @param {Object} paramRanges - 参数范围
   * @returns {Promise<Object>} 分析结果
   */
  async runSingleSplit(trainDates, testDates, strategyConfig, paramRanges) {
    const trainStartDate = trainDates[0];
    const trainEndDate = trainDates[trainDates.length - 1];
    const testStartDate = testDates[0];
    const testEndDate = testDates[testDates.length - 1];

    // 1. 在训练集上优化参数
    console.log(`[Walk-Forward] 在训练集上优化参数...`);
    const optimizationResult = await this.optimizeParameters(
      trainStartDate,
      trainEndDate,
      strategyConfig,
      paramRanges
    );

    const bestParams = optimizationResult.bestParams;

    // 2. 在训练集上使用最优参数回测
    console.log(`[Walk-Forward] 在训练集上验证最优参数...`);
    this.backtestEngine.reset();
    const trainResult = await this.backtestEngine.run({
      startDate: trainStartDate,
      endDate: trainEndDate,
      strategyConfig: {
        ...strategyConfig,
        ...bestParams
      }
    });

    // 3. 在测试集上使用相同参数回测
    console.log(`[Walk-Forward] 在测试集上验证参数...`);
    this.backtestEngine.reset();
    const testResult = await this.backtestEngine.run({
      startDate: testStartDate,
      endDate: testEndDate,
      strategyConfig: {
        ...strategyConfig,
        ...bestParams
      }
    });

    // 4. 检测过拟合
    const overfittingAnalysis = this.detectOverfitting(trainResult, testResult);

    // 5. 参数稳定性分析
    const stabilityAnalysis = this.analyzeParameterStability(
      optimizationResult.allResults,
      bestParams
    );

    return {
      trainPeriod: {
        startDate: trainStartDate,
        endDate: trainEndDate,
        tradingDays: trainDates.length
      },
      testPeriod: {
        startDate: testStartDate,
        endDate: testEndDate,
        tradingDays: testDates.length
      },
      bestParams,
      trainPerformance: this.extractKeyMetrics(trainResult),
      testPerformance: this.extractKeyMetrics(testResult),
      overfittingAnalysis,
      stabilityAnalysis,
      optimizationDetails: {
        totalCombinations: optimizationResult.totalCombinations,
        topResults: optimizationResult.topResults
      }
    };
  }

  /**
   * 参数优化
   * @param {string} startDate - 开始日期
   * @param {string} endDate - 结束日期
   * @param {Object} baseConfig - 基础策略配置
   * @param {Object} paramRanges - 参数范围
   * @returns {Promise<Object>} 优化结果
   */
  async optimizeParameters(startDate, endDate, baseConfig, paramRanges) {
    // 如果没有参数范围，返回默认配置
    if (!paramRanges || Object.keys(paramRanges).length === 0) {
      return {
        bestParams: {},
        allResults: [],
        totalCombinations: 1,
        topResults: []
      };
    }

    // 生成参数组合
    const combinations = this.generateParamCombinations(paramRanges);
    console.log(`[Walk-Forward] 生成 ${combinations.length} 组参数组合`);

    const results = [];

    // 批量运行回测
    for (const params of combinations) {
      try {
        this.backtestEngine.reset();
        const result = await this.backtestEngine.run({
          startDate,
          endDate,
          strategyConfig: {
            ...baseConfig,
            ...params
          }
        });

        results.push({
          params,
          sharpeRatio: result.summary.sharpeRatio || 0,
          annualizedReturn: result.summary.annualizedReturn || 0,
          maxDrawdown: result.summary.maxDrawdown || 0,
          winRate: result.summary.winRate || 0,
          score: this.calculateOptimizationScore(result)
        });
      } catch (error) {
        console.error(`[Walk-Forward] 参数组合失败:`, params, error.message);
      }
    }

    // 按优化得分排序
    results.sort((a, b) => b.score - a.score);

    // 获取最优参数
    const bestResult = results[0] || { params: {}, score: 0 };

    return {
      bestParams: bestResult.params,
      allResults: results,
      totalCombinations: combinations.length,
      topResults: results.slice(0, 5) // 返回前5个结果
    };
  }

  /**
   * 生成参数组合
   * @param {Object} paramRanges - 参数范围
   * @returns {Array} 参数组合数组
   */
  generateParamCombinations(paramRanges) {
    const keys = Object.keys(paramRanges);
    if (keys.length === 0) return [{}];

    const combinations = [];

    const generate = (index, current) => {
      if (index === keys.length) {
        combinations.push({ ...current });
        return;
      }

      const key = keys[index];
      const values = paramRanges[key];

      for (const value of values) {
        current[key] = value;
        generate(index + 1, current);
      }
    };

    generate(0, {});
    return combinations;
  }

  /**
   * 计算优化得分
   * @param {Object} result - 回测结果
   * @returns {number} 优化得分
   */
  calculateOptimizationScore(result) {
    const sharpe = result.summary.sharpeRatio || 0;
    const return_ = result.summary.annualizedReturn || 0;
    const drawdown = Math.abs(result.summary.maxDrawdown || 0);
    const winRate = result.summary.winRate || 0;

    // 综合得分：夏普权重最高，回撤惩罚
    return sharpe * 0.4 + return_ * 0.3 - drawdown * 0.2 + winRate * 0.1;
  }

  /**
   * 提取关键指标
   * @param {Object} result - 回测结果
   * @returns {Object} 关键指标
   */
  extractKeyMetrics(result) {
    return {
      totalReturn: result.summary.totalReturn || 0,
      annualizedReturn: result.summary.annualizedReturn || 0,
      sharpeRatio: result.summary.sharpeRatio || 0,
      maxDrawdown: result.summary.maxDrawdown || 0,
      winRate: result.summary.winRate || 0,
      profitLossRatio: result.summary.profitLossRatio || 0,
      totalTrades: result.summary.totalTrades || 0,
      calmarRatio: result.summary.calmarRatio || 0
    };
  }

  /**
   * 检测过拟合
   * @param {Object} trainResult - 训练集结果
   * @param {Object} testResult - 测试集结果
   * @returns {Object} 过拟合分析
   */
  detectOverfitting(trainResult, testResult) {
    const trainMetrics = this.extractKeyMetrics(trainResult);
    const testMetrics = this.extractKeyMetrics(testResult);

    const warnings = [];
    const isOverfitting = false;

    // 1. 夏普比率差异检测
    const sharpeDiff = this.calculateRelativeDifference(
      trainMetrics.sharpeRatio,
      testMetrics.sharpeRatio
    );
    if (sharpeDiff > this.config.overfittingThreshold) {
      warnings.push({
        metric: 'sharpeRatio',
        trainValue: trainMetrics.sharpeRatio,
        testValue: testMetrics.sharpeRatio,
        difference: sharpeDiff,
        severity: sharpeDiff > 0.5 ? 'CRITICAL' : 'WARNING',
        message: `夏普比率差异 ${(sharpeDiff * 100).toFixed(1)}%，训练集: ${trainMetrics.sharpeRatio.toFixed(2)}，测试集: ${testMetrics.sharpeRatio.toFixed(2)}`
      });
    }

    // 2. 最大回撤差异检测
    const drawdownDiff = this.calculateRelativeDifference(
      Math.abs(trainMetrics.maxDrawdown),
      Math.abs(testMetrics.maxDrawdown)
    );
    if (drawdownDiff > this.config.overfittingThreshold) {
      warnings.push({
        metric: 'maxDrawdown',
        trainValue: trainMetrics.maxDrawdown,
        testValue: testMetrics.maxDrawdown,
        difference: drawdownDiff,
        severity: drawdownDiff > 0.5 ? 'CRITICAL' : 'WARNING',
        message: `最大回撤差异 ${(drawdownDiff * 100).toFixed(1)}%，训练集: ${(trainMetrics.maxDrawdown * 100).toFixed(2)}%，测试集: ${(testMetrics.maxDrawdown * 100).toFixed(2)}%`
      });
    }

    // 3. 年化收益差异检测
    const returnDiff = this.calculateRelativeDifference(
      trainMetrics.annualizedReturn,
      testMetrics.annualizedReturn
    );
    if (returnDiff > this.config.overfittingThreshold) {
      warnings.push({
        metric: 'annualizedReturn',
        trainValue: trainMetrics.annualizedReturn,
        testValue: testMetrics.annualizedReturn,
        difference: returnDiff,
        severity: returnDiff > 0.5 ? 'CRITICAL' : 'WARNING',
        message: `年化收益差异 ${(returnDiff * 100).toFixed(1)}%，训练集: ${(trainMetrics.annualizedReturn * 100).toFixed(2)}%，测试集: ${(testMetrics.annualizedReturn * 100).toFixed(2)}%`
      });
    }

    // 4. 胜率差异检测
    const winRateDiff = this.calculateRelativeDifference(
      trainMetrics.winRate,
      testMetrics.winRate
    );
    if (winRateDiff > this.config.overfittingThreshold) {
      warnings.push({
        metric: 'winRate',
        trainValue: trainMetrics.winRate,
        testValue: testMetrics.winRate,
        difference: winRateDiff,
        severity: 'WARNING',
        message: `胜率差异 ${(winRateDiff * 100).toFixed(1)}%，训练集: ${(trainMetrics.winRate * 100).toFixed(1)}%，测试集: ${(testMetrics.winRate * 100).toFixed(1)}%`
      });
    }

    // 判断整体是否过拟合
    const hasCriticalWarnings = warnings.some(w => w.severity === 'CRITICAL');
    const overfittingScore = this.calculateOverfittingScore(warnings);

    return {
      isOverfitting: hasCriticalWarnings || overfittingScore > 0.6,
      overfittingScore,
      warnings,
      summary: this.generateOverfittingSummary(warnings, overfittingScore)
    };
  }

  /**
   * 计算相对差异
   * @param {number} value1 - 值1
   * @param {number} value2 - 值2
   * @returns {number} 相对差异（0-1）
   */
  calculateRelativeDifference(value1, value2) {
    if (value1 === 0 && value2 === 0) return 0;
    const base = Math.abs(value1);
    if (base === 0) return Math.abs(value2) > 0 ? 1 : 0;
    return Math.abs(value1 - value2) / base;
  }

  /**
   * 计算过拟合得分
   * @param {Array} warnings - 告警列表
   * @returns {number} 过拟合得分（0-1）
   */
  calculateOverfittingScore(warnings) {
    if (warnings.length === 0) return 0;

    const criticalCount = warnings.filter(w => w.severity === 'CRITICAL').length;
    const warningCount = warnings.filter(w => w.severity === 'WARNING').length;

    // CRITICAL 权重更高
    return Math.min(1, (criticalCount * 0.4 + warningCount * 0.2));
  }

  /**
   * 生成过拟合摘要
   * @param {Array} warnings - 告警列表
   * @param {number} score - 过拟合得分
   * @returns {string} 摘要
   */
  generateOverfittingSummary(warnings, score) {
    if (warnings.length === 0) {
      return '策略表现稳定，未检测到明显过拟合';
    }

    if (score > 0.6) {
      return `检测到严重过拟合风险！存在 ${warnings.length} 项指标差异超过阈值，建议重新评估策略参数`;
    }

    if (score > 0.3) {
      return `存在一定过拟合风险，有 ${warnings.length} 项指标差异超过阈值，建议谨慎使用`;
    }

    return `轻微过拟合风险，${warnings.length} 项指标存在差异，建议持续监控`;
  }

  /**
   * 分析参数稳定性
   * @param {Array} allResults - 所有优化结果
   * @param {Object} bestParams - 最优参数
   * @returns {Object} 稳定性分析
   */
  analyzeParameterStability(allResults, bestParams) {
    if (!allResults || allResults.length === 0) {
      return {
        isStable: true,
        stabilityScore: 1,
        topParamsVariance: 0,
        analysis: '无参数优化数据'
      };
    }

    // 获取前10个结果
    const topResults = allResults.slice(0, 10);

    // 计算参数方差
    const paramKeys = Object.keys(bestParams);
    const varianceByParam = {};

    for (const key of paramKeys) {
      const values = topResults
        .filter(r => r.params && r.params[key] !== undefined)
        .map(r => r.params[key]);

      if (values.length > 1) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        varianceByParam[key] = {
          mean,
          variance,
          stdDev: Math.sqrt(variance),
          values
        };
      }
    }

    // 计算得分稳定性
    const topScores = topResults.map(r => r.score || 0);
    const avgScore = topScores.reduce((a, b) => a + b, 0) / topScores.length;
    const scoreVariance = topScores.length > 1
      ? topScores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / topScores.length
      : 0;

    // 稳定性得分：得分方差越小越稳定
    const stabilityScore = Math.max(0, 1 - Math.sqrt(scoreVariance) / (avgScore || 1));

    // 判断参数是否稳定
    const isStable = stabilityScore > 0.7;

    return {
      isStable,
      stabilityScore,
      topParamsVariance: varianceByParam,
      scoreAnalysis: {
        averageScore: avgScore,
        variance: scoreVariance,
        stdDev: Math.sqrt(scoreVariance)
      },
      analysis: isStable
        ? '参数稳定性良好，最优参数附近表现一致'
        : '参数稳定性较差，最优参数附近表现波动较大'
    };
  }

  /**
   * 聚合多折结果
   * @param {Array} splits - 各折结果
   * @returns {Object} 聚合指标
   */
  aggregateFoldResults(splits) {
    if (!splits || splits.length === 0) {
      return null;
    }

    const trainReturns = [];
    const testReturns = [];
    const trainSharpes = [];
    const testSharpes = [];
    const trainDrawdowns = [];
    const testDrawdowns = [];
    const overfittingScores = [];

    for (const split of splits) {
      trainReturns.push(split.trainPerformance.annualizedReturn);
      testReturns.push(split.testPerformance.annualizedReturn);
      trainSharpes.push(split.trainPerformance.sharpeRatio);
      testSharpes.push(split.testPerformance.sharpeRatio);
      trainDrawdowns.push(split.trainPerformance.maxDrawdown);
      testDrawdowns.push(split.testPerformance.maxDrawdown);
      overfittingScores.push(split.overfittingAnalysis.overfittingScore);
    }

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = arr => {
      const mean = avg(arr);
      return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length);
    };

    return {
      folds: splits.length,
      train: {
        avgReturn: avg(trainReturns),
        stdReturn: std(trainReturns),
        avgSharpe: avg(trainSharpes),
        stdSharpe: std(trainSharpes),
        avgDrawdown: avg(trainDrawdowns)
      },
      test: {
        avgReturn: avg(testReturns),
        stdReturn: std(testReturns),
        avgSharpe: avg(testSharpes),
        stdSharpe: std(testSharpes),
        avgDrawdown: avg(testDrawdowns)
      },
      overfitting: {
        avgScore: avg(overfittingScores),
        consistency: 1 - std(overfittingScores)
      }
    };
  }

  /**
   * 生成最终报告
   * @param {Object} analysisResults - 分析结果
   * @returns {Object} 最终报告
   */
  generateFinalReport(analysisResults) {
    const timestamp = new Date().toISOString();

    return {
      timestamp,
      config: {
        splitStrategy: this.config.splitStrategy,
        trainRatio: this.config.trainRatio,
        testRatio: this.config.testRatio,
        overfittingThreshold: this.config.overfittingThreshold
      },
      results: analysisResults,
      conclusion: this.generateConclusion(analysisResults)
    };
  }

  /**
   * 生成结论
   * @param {Object} results - 分析结果
   * @returns {Object} 结论
   */
  generateConclusion(results) {
    const aggregated = results.aggregatedMetrics || this.aggregateFoldResults([results]);

    if (!aggregated) {
      return {
        isValid: false,
        message: '无法生成结论，缺少分析数据'
      };
    }

    const avgOverfittingScore = aggregated.overfitting.avgScore;
    const returnDegradation = (aggregated.train.avgReturn - aggregated.test.avgReturn) / Math.abs(aggregated.train.avgReturn || 1);

    let recommendation;
    let isValid;

    if (avgOverfittingScore > 0.6) {
      recommendation = '不推荐使用该策略。存在严重过拟合风险，建议重新设计策略或调整参数范围';
      isValid = false;
    } else if (avgOverfittingScore > 0.3 || returnDegradation > 0.5) {
      recommendation = '谨慎使用。存在一定过拟合风险，建议进行更多样本外验证或减小仓位';
      isValid = true;
    } else {
      recommendation = '策略表现稳定，可以投入使用。建议持续监控实盘表现与回测表现的差异';
      isValid = true;
    }

    return {
      isValid,
      overfittingScore: avgOverfittingScore,
      returnDegradation,
      sharpeDegradation: (aggregated.train.avgSharpe - aggregated.test.avgSharpe) / Math.abs(aggregated.train.avgSharpe || 1),
      recommendation,
      summary: `训练集年化收益: ${(aggregated.train.avgReturn * 100).toFixed(2)}%，测试集年化收益: ${(aggregated.test.avgReturn * 100).toFixed(2)}%，过拟合得分: ${avgOverfittingScore.toFixed(2)}`
    };
  }

  /**
   * 生成 Markdown 报告
   * @returns {string} Markdown 格式报告
   */
  generateMarkdownReport() {
    if (!this.results) {
      return '# Walk-Forward 分析报告\n\n尚未执行分析。';
    }

    const r = this.results;
    const agg = r.results.aggregatedMetrics || this.aggregateFoldResults([r.results]);

    let md = `# Walk-Forward 分析报告

**生成时间**: ${r.timestamp}

## 分析配置

| 项目 | 值 |
|------|-----|
| 分割策略 | ${r.config.splitStrategy} |
| 训练集比例 | ${(r.config.trainRatio * 100).toFixed(0)}% |
| 测试集比例 | ${(r.config.testRatio * 100).toFixed(0)}% |
| 过拟合阈值 | ${(r.config.overfittingThreshold * 100).toFixed(0)}% |

`;

    // 如果是多折分析
    if (r.results.splits && r.results.splits.length > 0) {
      md += `## 各折分析结果\n\n`;
      md += `| Fold | 训练集收益 | 测试集收益 | 夏普比率(训练) | 夏普比率(测试) | 过拟合得分 |\n`;
      md += `|------|-----------|-----------|---------------|---------------|----------|\n`;

      for (const split of r.results.splits) {
        md += `| ${split.fold} | ${(split.trainPerformance.annualizedReturn * 100).toFixed(2)}% | ${(split.testPerformance.annualizedReturn * 100).toFixed(2)}% | ${split.trainPerformance.sharpeRatio.toFixed(2)} | ${split.testPerformance.sharpeRatio.toFixed(2)} | ${split.overfittingAnalysis.overfittingScore.toFixed(2)} |\n`;
      }

      md += `\n### 聚合指标\n\n`;
      md += `| 指标 | 训练集 | 测试集 |\n`;
      md += `|------|--------|--------|\n`;
      md += `| 平均年化收益 | ${(agg.train.avgReturn * 100).toFixed(2)}% | ${(agg.test.avgReturn * 100).toFixed(2)}% |\n`;
      md += `| 平均夏普比率 | ${agg.train.avgSharpe.toFixed(2)} | ${agg.test.avgSharpe.toFixed(2)} |\n`;
      md += `| 平均最大回撤 | ${(agg.train.avgDrawdown * 100).toFixed(2)}% | ${(agg.test.avgDrawdown * 100).toFixed(2)}% |\n`;

    } else {
      // 单次分割
      const split = r.results;
      md += `## 数据分割\n\n`;
      md += `| 数据集 | 开始日期 | 结束日期 | 交易日数 |\n`;
      md += `|--------|----------|----------|----------|\n`;
      md += `| 训练集 | ${split.trainPeriod.startDate} | ${split.trainPeriod.endDate} | ${split.trainPeriod.tradingDays} |\n`;
      md += `| 测试集 | ${split.testPeriod.startDate} | ${split.testPeriod.endDate} | ${split.testPeriod.tradingDays} |\n`;

      md += `\n## 最优参数\n\n`;
      md += `| 参数 | 值 |\n`;
      md += `|------|-----|\n`;
      for (const [key, value] of Object.entries(split.bestParams || {})) {
        md += `| ${key} | ${value} |\n`;
      }

      md += `\n## 绩效对比\n\n`;
      md += `| 指标 | 训练集 | 测试集 | 差异 |\n`;
      md += `|------|--------|--------|------|\n`;

      const metrics = ['totalReturn', 'annualizedReturn', 'sharpeRatio', 'maxDrawdown', 'winRate'];
      const metricNames = {
        totalReturn: '总收益',
        annualizedReturn: '年化收益',
        sharpeRatio: '夏普比率',
        maxDrawdown: '最大回撤',
        winRate: '胜率'
      };

      for (const m of metrics) {
        const trainV = split.trainPerformance[m];
        const testV = split.testPerformance[m];
        const diff = this.calculateRelativeDifference(trainV, testV);
        const format = m === 'winRate' || m === 'maxDrawdown' || m === 'totalReturn' || m === 'annualizedReturn'
          ? v => (v * 100).toFixed(2) + '%'
          : v => v.toFixed(2);

        md += `| ${metricNames[m]} | ${format(trainV)} | ${format(testV)} | ${(diff * 100).toFixed(1)}% |\n`;
      }
    }

    // 过拟合分析
    md += `\n## 过拟合分析\n\n`;

    const overfittingAnalysis = r.results.splits
      ? { overfittingScore: agg.overfitting.avgScore, warnings: [] }
      : r.results.overfittingAnalysis;

    if (overfittingAnalysis.warnings && overfittingAnalysis.warnings.length > 0) {
      md += `### 告警信息\n\n`;
      for (const w of overfittingAnalysis.warnings) {
        md += `- **[${w.severity}]** ${w.message}\n`;
      }
    } else {
      md += `未检测到明显过拟合风险。\n`;
    }

    md += `\n**过拟合得分**: ${overfittingAnalysis.overfittingScore.toFixed(2)}\n`;

    // 结论
    md += `\n## 结论\n\n`;
    md += `**有效性**: ${r.conclusion.isValid ? '✅ 通过' : '❌ 未通过'}\n\n`;
    md += `**建议**: ${r.conclusion.recommendation}\n\n`;
    md += `**摘要**: ${r.conclusion.summary}\n`;

    return md;
  }
}

module.exports = {
  WalkForwardAnalyzer,
  SPLIT_STRATEGY,
  OVERFITTING_THRESHOLD
};