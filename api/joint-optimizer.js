/**
 * 联合优化器（数学组合）
 * TASK_V3_301
 *
 * 功能：
 * - 读取选股基础净值曲线和网格超额收益曲线
 * - 实现 20 种仓位比例组合计算
 * - 向量加权计算联合净值曲线
 * - 输出最优仓位配比
 *
 * 核心公式：
 * - 联合净值 = 核心仓比例 × 基础净值 + 卫星仓比例 × (基础净值 + 网格超额)
 * - 目标：最大化夏普比率
 * - 约束：最大回撤 ≤ 20%
 *
 * 仓位比例组合：
 * - 核心仓比例：50% ~ 95%，步长 5%（10 个值）
 * - 卫星仓比例：5% ~ 50%，步长 5%（10 个值）
 * - 共 10 种有效组合（互补）
 */

const fs = require('fs');
const path = require('path');

// 默认仓位比例范围
const DEFAULT_WEIGHT_RANGE = {
  min: 0.50,   // 核心仓最小比例 50%
  max: 0.95,   // 核心仓最大比例 95%
  step: 0.05   // 步长 5%
};

// 约束条件
const CONSTRAINTS = {
  maxDrawdown: 0.20  // 最大回撤 ≤ 20%
};

/**
 * 生成仓位比例组合
 * @param {Object} range - 比例范围 {min, max, step}
 * @returns {Array} 仓位比例组合数组
 */
function generateWeightCombinations(range = DEFAULT_WEIGHT_RANGE) {
  const combinations = [];
  const precision = (range.step.toString().split('.')[1] || '').length;

  for (let coreWeight = range.min; coreWeight <= range.max + 0.0001; coreWeight += range.step) {
    const core = parseFloat(coreWeight.toFixed(precision));
    const satellite = parseFloat((1 - core).toFixed(precision));

    combinations.push({
      coreWeight: core,
      satelliteWeight: satellite
    });
  }

  return combinations;
}

/**
 * 计算净值曲线的收益率序列
 * @param {Array} equityCurve - 净值曲线数组
 * @returns {Array} 收益率序列
 */
function calculateReturns(equityCurve) {
  if (!equityCurve || equityCurve.length < 2) return [];

  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i - 1] !== 0) {
      returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
    } else {
      returns.push(0);
    }
  }
  return returns;
}

/**
 * 计算夏普比率
 * @param {Array} returns - 收益率序列
 * @param {number} riskFreeRate - 无风险利率（年化，默认 2%）
 * @param {number} periodsPerYear - 年化周期数（默认 252 个交易日）
 * @returns {number} 夏普比率
 */
function calculateSharpeRatio(returns, riskFreeRate = 0.02, periodsPerYear = 252) {
  if (!returns || returns.length === 0) return 0;

  // 计算平均收益率
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // 计算收益率标准差
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // 年化
  const annualizedMean = meanReturn * periodsPerYear;
  const annualizedStd = stdDev * Math.sqrt(periodsPerYear);

  // 夏普比率
  return (annualizedMean - riskFreeRate) / annualizedStd;
}

/**
 * 计算最大回撤
 * @param {Array} equityCurve - 净值曲线数组
 * @returns {number} 最大回撤（正数表示）
 */
function calculateMaxDrawdown(equityCurve) {
  if (!equityCurve || equityCurve.length < 2) return 0;

  let maxDrawdown = 0;
  let peak = equityCurve[0];

  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) {
      peak = equityCurve[i];
    }

    const drawdown = (peak - equityCurve[i]) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

/**
 * 计算年化收益率
 * @param {Array} equityCurve - 净值曲线数组
 * @param {number} periodsPerYear - 年化周期数
 * @returns {number} 年化收益率
 */
function calculateAnnualizedReturn(equityCurve, periodsPerYear = 252) {
  if (!equityCurve || equityCurve.length < 2) return 0;

  const totalReturn = equityCurve[equityCurve.length - 1] / equityCurve[0] - 1;
  const years = equityCurve.length / periodsPerYear;

  if (years <= 0) return 0;

  // 复利年化
  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

/**
 * 计算卡玛比率
 * @param {number} annualizedReturn - 年化收益率
 * @param {number} maxDrawdown - 最大回撤
 * @returns {number} 卡玛比率
 */
function calculateCalmarRatio(annualizedReturn, maxDrawdown) {
  if (maxDrawdown === 0) return 0;
  return annualizedReturn / maxDrawdown;
}

/**
 * 向量加权计算联合净值曲线
 * @param {Array} baseEquity - 基础净值曲线
 * @param {Array} gridExcess - 网格超额收益曲线
 * @param {number} coreWeight - 核心仓比例
 * @param {number} satelliteWeight - 卫星仓比例
 * @returns {Array} 联合净值曲线
 */
function calculateJointEquity(baseEquity, gridExcess, coreWeight, satelliteWeight) {
  if (!baseEquity || baseEquity.length === 0) {
    throw new Error('基础净值曲线不能为空');
  }

  // 网格超额收益曲线可能为空或长度不同
  const excessCurve = gridExcess && gridExcess.length > 0
    ? gridExcess
    : new Array(baseEquity.length).fill(0);

  // 确保长度一致
  const len = Math.min(baseEquity.length, excessCurve.length);

  const jointEquity = [];
  for (let i = 0; i < len; i++) {
    // 联合净值 = 核心仓比例 × 基础净值 + 卫星仓比例 × (基础净值 + 网格超额)
    const jointValue = coreWeight * baseEquity[i] + satelliteWeight * (baseEquity[i] + excessCurve[i]);
    jointEquity.push(jointValue);
  }

  return jointEquity;
}

/**
 * 联合优化器类
 */
class JointOptimizer {
  constructor(config = {}) {
    this.config = {
      weightRange: config.weightRange || DEFAULT_WEIGHT_RANGE,
      constraints: config.constraints || CONSTRAINTS,
      riskFreeRate: config.riskFreeRate || 0.02,
      periodsPerYear: config.periodsPerYear || 252,
      ...config
    };

    this.baseEquity = null;
    this.gridExcess = null;
    this.results = [];
    this.bestResult = null;
    this.status = 'initialized';
  }

  /**
   * 加载基础净值曲线
   * @param {string|Array} source - 文件路径或数据数组
   */
  loadBaseEquity(source) {
    if (Array.isArray(source)) {
      this.baseEquity = source;
    } else if (typeof source === 'string') {
      try {
        const content = fs.readFileSync(source, 'utf-8');
        const data = JSON.parse(content);
        // 支持两种格式：直接数组或 {equityCurve: [...]}
        this.baseEquity = Array.isArray(data) ? data : (data.equityCurve || data.values || data);
      } catch (error) {
        throw new Error(`加载基础净值曲线失败: ${error.message}`);
      }
    }

    if (!this.baseEquity || this.baseEquity.length === 0) {
      throw new Error('基础净值曲线不能为空');
    }

    console.log(`[联合优化器] 加载基础净值曲线: ${this.baseEquity.length} 个数据点`);
    return this;
  }

  /**
   * 加载网格超额收益曲线
   * @param {string|Array} source - 文件路径或数据数组
   */
  loadGridExcess(source) {
    if (Array.isArray(source)) {
      this.gridExcess = source;
    } else if (typeof source === 'string') {
      try {
        const content = fs.readFileSync(source, 'utf-8');
        const data = JSON.parse(content);
        // 支持两种格式：直接数组或 {excessReturn: [...]}
        this.gridExcess = Array.isArray(data) ? data : (data.excessReturn || data.gridAlpha || data.values || data);
      } catch (error) {
        console.warn(`[联合优化器] 加载网格超额收益曲线失败: ${error.message}，使用空数据`);
        this.gridExcess = null;
      }
    }

    if (this.gridExcess && this.gridExcess.length > 0) {
      console.log(`[联合优化器] 加载网格超额收益曲线: ${this.gridExcess.length} 个数据点`);
    } else {
      console.log(`[联合优化器] 未加载网格超额收益曲线，将使用纯基础净值策略`);
      this.gridExcess = null;
    }

    return this;
  }

  /**
   * 设置净值曲线数据（直接传入）
   * @param {Array} baseEquity - 基础净值曲线
   * @param {Array} gridExcess - 网格超额收益曲线
   */
  setData(baseEquity, gridExcess = null) {
    this.baseEquity = baseEquity;
    this.gridExcess = gridExcess;
    return this;
  }

  /**
   * 运行联合优化
   * @returns {Object} 优化结果
   */
  optimize() {
    if (!this.baseEquity || this.baseEquity.length === 0) {
      throw new Error('请先加载基础净值曲线');
    }

    console.log('[联合优化器] 开始数学组合优化');
    this.status = 'running';
    const startTime = Date.now();

    // 生成仓位比例组合
    const combinations = generateWeightCombinations(this.config.weightRange);
    console.log(`[联合优化器] 共 ${combinations.length} 种仓位比例组合`);

    // 遍历所有组合
    this.results = [];
    let validCount = 0;

    for (const combo of combinations) {
      try {
        // 计算联合净值曲线
        const jointEquity = calculateJointEquity(
          this.baseEquity,
          this.gridExcess,
          combo.coreWeight,
          combo.satelliteWeight
        );

        // 计算绩效指标
        const returns = calculateReturns(jointEquity);
        const sharpeRatio = calculateSharpeRatio(returns, this.config.riskFreeRate, this.config.periodsPerYear);
        const maxDrawdown = calculateMaxDrawdown(jointEquity);
        const annualizedReturn = calculateAnnualizedReturn(jointEquity, this.config.periodsPerYear);
        const calmarRatio = calculateCalmarRatio(annualizedReturn, maxDrawdown);

        const result = {
          coreWeight: combo.coreWeight,
          satelliteWeight: combo.satelliteWeight,
          metrics: {
            sharpeRatio,
            maxDrawdown,
            annualizedReturn,
            calmarRatio,
            totalReturn: jointEquity[jointEquity.length - 1] / jointEquity[0] - 1
          },
          jointEquity,
          valid: maxDrawdown <= this.config.constraints.maxDrawdown
        };

        if (result.valid) {
          validCount++;
        }

        this.results.push(result);
      } catch (error) {
        console.warn(`[联合优化器] 计算组合失败: ${error.message}`);
        this.results.push({
          coreWeight: combo.coreWeight,
          satelliteWeight: combo.satelliteWeight,
          valid: false,
          error: error.message
        });
      }
    }

    // 筛选有效结果并排序
    const validResults = this.results.filter(r => r.valid);
    validResults.sort((a, b) => b.metrics.sharpeRatio - a.metrics.sharpeRatio);

    // 获取最佳结果
    if (validResults.length > 0) {
      this.bestResult = validResults[0];
    } else {
      // 如果没有满足约束的结果，取回撤最小的
      const sortedByDrawdown = [...this.results].sort((a, b) => a.metrics?.maxDrawdown - b.metrics?.maxDrawdown);
      this.bestResult = sortedByDrawdown[0];
      console.warn('[联合优化器] 没有满足约束的组合，选择回撤最小的组合');
    }

    const elapsed = Date.now() - startTime;
    this.status = 'completed';

    console.log(`[联合优化器] 优化完成，耗时: ${elapsed}ms`);
    console.log(`[联合优化器] 有效组合: ${validCount}/${combinations.length}`);
    console.log(`[联合优化器] 最佳核心仓比例: ${(this.bestResult.coreWeight * 100).toFixed(0)}%`);

    return this.generateOutput(elapsed);
  }

  /**
   * 生成输出结果
   * @param {number} elapsedMs - 耗时（毫秒）
   * @returns {Object} 输出结果
   */
  generateOutput(elapsedMs) {
    return {
      status: this.status,
      elapsed_ms: elapsedMs,
      totalCombinations: this.results.length,
      validCombinations: this.results.filter(r => r.valid).length,
      bestAllocation: {
        coreWeight: this.bestResult.coreWeight,
        satelliteWeight: this.bestResult.satelliteWeight,
        coreWeightPercent: `${(this.bestResult.coreWeight * 100).toFixed(0)}%`,
        satelliteWeightPercent: `${(this.bestResult.satelliteWeight * 100).toFixed(0)}%`
      },
      bestMetrics: this.bestResult.metrics,
      allResults: this.results.map(r => ({
        coreWeight: r.coreWeight,
        satelliteWeight: r.satelliteWeight,
        metrics: r.metrics,
        valid: r.valid
      })),
      constraints: this.config.constraints,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取优化进度
   * @returns {Object} 进度信息
   */
  getProgress() {
    return {
      status: this.status,
      totalCombinations: generateWeightCombinations(this.config.weightRange).length
    };
  }

  /**
   * 获取最佳配置
   * @returns {Object|null} 最佳配置
   */
  getBestAllocation() {
    return this.bestResult ? {
      coreWeight: this.bestResult.coreWeight,
      satelliteWeight: this.bestResult.satelliteWeight,
      metrics: this.bestResult.metrics
    } : null;
  }
}

/**
 * 保存优化结果到文件
 * @param {Object} result - 优化结果
 * @param {string} outputPath - 输出路径
 */
function saveResult(result, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`[联合优化器] 结果已保存到: ${outputPath}`);
}

/**
 * 生成优化报告（Markdown 格式）
 * @param {Object} result - 优化结果
 * @returns {string} Markdown 报告
 */
function generateReport(result) {
  const { bestAllocation, bestMetrics, allResults, elapsed_ms, totalCombinations, validCombinations, constraints } = result;

  let md = `# 联合优化器结果

## 最优仓位配比

| 配置项 | 值 |
|--------|------|
| 核心仓比例 | ${bestAllocation.coreWeightPercent} |
| 卫星仓比例 | ${bestAllocation.satelliteWeightPercent} |

## 绩效指标

| 指标 | 数值 |
|------|------|
| 夏普比率 | ${bestMetrics.sharpeRatio.toFixed(4)} |
| 最大回撤 | ${(bestMetrics.maxDrawdown * 100).toFixed(2)}% |
| 年化收益率 | ${(bestMetrics.annualizedReturn * 100).toFixed(2)}% |
| 卡玛比率 | ${bestMetrics.calmarRatio.toFixed(4)} |
| 总收益率 | ${(bestMetrics.totalReturn * 100).toFixed(2)}% |

## 优化统计

- **计算耗时**: ${elapsed_ms}ms
- **组合总数**: ${totalCombinations}
- **有效组合**: ${validCombinations}
- **约束条件**: 最大回撤 ≤ ${(constraints.maxDrawdown * 100).toFixed(0)}%

## 所有组合结果

| 核心仓 | 卫星仓 | 夏普比率 | 最大回撤 | 年化收益 | 有效 |
|--------|--------|----------|----------|----------|------|
`;

  for (const r of allResults) {
    const valid = r.valid ? '✅' : '❌';
    md += `| ${(r.coreWeight * 100).toFixed(0)}% | ${(r.satelliteWeight * 100).toFixed(0)}% | ${r.metrics?.sharpeRatio?.toFixed(4) || 'N/A'} | ${((r.metrics?.maxDrawdown || 0) * 100).toFixed(2)}% | ${((r.metrics?.annualizedReturn || 0) * 100).toFixed(2)}% | ${valid} |\n`;
  }

  md += `
---
*生成时间: ${new Date().toLocaleString('zh-CN')}*
*任务: TASK_V3_301*
`;

  return md;
}

// ==================== API 处理函数 ====================

/**
 * 运行联合优化 API
 */
async function runJointOptimizerAPI(req, res) {
  try {
    const {
      baseEquityPath,
      gridExcessPath,
      baseEquityData,
      gridExcessData,
      weightRange,
      constraints
    } = req.body;

    const optimizer = new JointOptimizer({
      weightRange: weightRange || DEFAULT_WEIGHT_RANGE,
      constraints: constraints || CONSTRAINTS
    });

    // 加载数据
    if (baseEquityData) {
      optimizer.setData(baseEquityData, gridExcessData);
    } else if (baseEquityPath) {
      optimizer.loadBaseEquity(baseEquityPath);
      if (gridExcessPath) {
        optimizer.loadGridExcess(gridExcessPath);
      }
    } else {
      return res.status(400).json({
        success: false,
        error: '必须提供 baseEquityData 或 baseEquityPath 参数'
      });
    }

    // 运行优化
    const result = optimizer.optimize();

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[联合优化器] 运行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取仓位比例范围 API
 */
async function getWeightRangeAPI(req, res) {
  try {
    const combinations = generateWeightCombinations();
    res.json({
      success: true,
      data: {
        default: DEFAULT_WEIGHT_RANGE,
        combinations: combinations.length,
        allCombinations: combinations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 创建 Express Router
 */
function createRouter(express) {
  const router = express.Router();

  router.post('/run', runJointOptimizerAPI);
  router.get('/weights', getWeightRangeAPI);

  return router;
}

module.exports = {
  // 主要类
  JointOptimizer,

  // 工具函数
  generateWeightCombinations,
  calculateReturns,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateAnnualizedReturn,
  calculateCalmarRatio,
  calculateJointEquity,

  // 文件操作
  saveResult,
  generateReport,

  // 默认配置
  DEFAULT_WEIGHT_RANGE,
  CONSTRAINTS,

  // API 函数
  runJointOptimizerAPI,
  getWeightRangeAPI,
  createRouter
};