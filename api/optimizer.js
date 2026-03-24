/**
 * 贝叶斯优化模块
 * TASK_V3_102
 *
 * 使用高斯过程作为代理模型，通过 Expected Improvement 采集函数
 * 优化选股参数（4 维度行业权重 + 7 因子阈值）
 *
 * 目标：最大化夏普比率
 * 约束：最大回撤 < 20%
 */

const FactorSnapshotBacktest = require('./backtest-engine');
const { getDatabase } = require('./db');
const { runWithCache } = require('./backtest-cache');
const path = require('node:path');
const fs = require('node:fs');

// 参数空间定义
const PARAMETER_SPACE = {
  // 4 维度行业权重（总和=1）
  industry_weights: {
    policy_weight: { min: 0, max: 1 },
    business_weight: { min: 0, max: 1 },
    opinion_weight: { min: 0, max: 1 },
    capital_weight: { min: 0, max: 1 }
  },
  // 7 因子阈值
  factor_thresholds: {
    roe_threshold: { min: 5, max: 20 },
    revenue_growth: { min: 10, max: 50 },
    profit_growth: { min: 10, max: 50 },
    pe_percentile: { min: 20, max: 80 },
    pb_percentile: { min: 20, max: 80 },
    rsi_threshold: { min: 30, max: 70 },
    macd_threshold: { min: 0, max: 1 }
  }
};

/**
 * 高斯过程回归（简化实现）
 */
class GaussianProcess {
  constructor(kernelParams = { lengthScale: 0.5, noise: 0.01 }) {
    this.kernelParams = kernelParams;
    this.X = [];  // 训练输入
    this.y = [];  // 训练输出
    this.K = null; // 协方差矩阵
    this.KInv = null; // 逆协方差矩阵
  }

  /**
   * RBF 核函数
   */
  rbfKernel(x1, x2) {
    const sqDist = x1.reduce((sum, xi, i) => {
      const diff = xi - x2[i];
      return sum + diff * diff;
    }, 0);
    return Math.exp(-sqDist / (2 * this.kernelParams.lengthScale * this.kernelParams.lengthScale));
  }

  /**
   * 计算协方差矩阵
   */
  computeCovarianceMatrix() {
    const n = this.X.length;
    this.K = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          this.K[i][j] = this.rbfKernel(this.X[i], this.X[j]) + this.kernelParams.noise;
        } else {
          this.K[i][j] = this.rbfKernel(this.X[i], this.X[j]);
        }
      }
    }
  }

  /**
   * 矩阵求逆（使用高斯-约当消元法）
   */
  matrixInverse(matrix) {
    const n = matrix.length;
    const augmented = matrix.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

    for (let col = 0; col < n; col++) {
      // 找主元
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
          maxRow = row;
        }
      }
      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

      if (Math.abs(augmented[col][col]) < 1e-10) {
        // 奇异矩阵，添加正则化
        augmented[col][col] += 1e-6;
      }

      // 消元
      for (let row = 0; row < n; row++) {
        if (row !== col) {
          const factor = augmented[row][col] / augmented[col][col];
          for (let j = 0; j < 2 * n; j++) {
            augmented[row][j] -= factor * augmented[col][j];
          }
        }
      }

      // 归一化
      const pivot = augmented[col][col];
      for (let j = 0; j < 2 * n; j++) {
        augmented[col][j] /= pivot;
      }
    }

    return augmented.map(row => row.slice(n));
  }

  /**
   * 向量乘矩阵
   */
  vectorMatrixMultiply(v, m) {
    const n = m[0].length;
    const result = Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < v.length; i++) {
        result[j] += v[i] * m[i][j];
      }
    }
    return result;
  }

  /**
   * 添加训练数据
   */
  addData(x, y) {
    this.X.push(x);
    this.y.push(y);
    this.computeCovarianceMatrix();
    this.KInv = this.matrixInverse(this.K);
  }

  /**
   * 批量添加训练数据
   */
  addBatchData(XBatch, yBatch) {
    for (let i = 0; i < XBatch.length; i++) {
      this.X.push(XBatch[i]);
      this.y.push(yBatch[i]);
    }
    this.computeCovarianceMatrix();
    this.KInv = this.matrixInverse(this.K);
  }

  /**
   * 预测均值和方差
   */
  predict(xNew) {
    if (this.X.length === 0) {
      return { mean: 0, variance: 1 };
    }

    // 计算 k* (新点与训练点的协方差)
    const kStar = this.X.map(xi => this.rbfKernel(xi, xNew));

    // 计算均值
    const yMean = this.y.reduce((s, v) => s + v, 0) / this.y.length;
    const yCentered = this.y.map(yi => yi - yMean);
    const mean = yMean + this.vectorMatrixMultiply(kStar, this.KInv).reduce((s, v, i) => s + v * yCentered[i], 0);

    // 计算方差
    const kStarKInv = this.vectorMatrixMultiply(kStar, this.KInv);
    let variance = this.rbfKernel(xNew, xNew);
    for (let i = 0; i < kStar.length; i++) {
      variance -= kStar[i] * kStarKInv[i];
    }
    variance = Math.max(variance, 1e-10);

    return { mean, variance };
  }
}

/**
 * 贝叶斯优化器
 */
class BayesianOptimizer {
  constructor(config = {}) {
    this.config = {
      nInitial: config.nInitial || 5,          // 初始随机采样数
      nIterations: config.nIterations || 50,    // 优化迭代次数
      nParallel: config.nParallel || 3,         // 并行评估数
      explorationWeight: config.explorationWeight || 0.01, // 探索权重
      maxDrawdownConstraint: config.maxDrawdownConstraint || 0.20, // 最大回撤约束
      ...config
    };

    this.gp = new GaussianProcess();
    this.history = []; // 优化历史
    this.bestResult = null;
    this.optimizerId = `opt_${Date.now()}`;
    this.status = 'initialized';
    this.progress = 0;
  }

  /**
   * 归一化参数到 [0, 1] 空间
   */
  normalizeParams(params) {
    const normalized = [];

    // 行业权重（4 个，总和=1，用 3 个独立参数表示）
    const weights = params.industry_weights;
    normalized.push(weights.policy_weight);
    normalized.push(weights.business_weight);
    normalized.push(weights.opinion_weight);
    // capital_weight = 1 - sum(other weights)

    // 因子阈值（7 个）
    const thresholds = params.factor_thresholds;
    for (const key of Object.keys(PARAMETER_SPACE.factor_thresholds)) {
      const { min, max } = PARAMETER_SPACE.factor_thresholds[key];
      normalized.push((thresholds[key] - min) / (max - min));
    }

    return normalized;
  }

  /**
   * 从归一化空间反归一化参数
   */
  denormalizeParams(normalized) {
    const params = {
      industry_weights: {},
      factor_thresholds: {}
    };

    // 行业权重
    let sum = 0;
    const w1 = Math.max(0, Math.min(1, normalized[0]));
    const w2 = Math.max(0, Math.min(1, normalized[1]));
    const w3 = Math.max(0, Math.min(1, normalized[2]));

    // 归一化权重使其总和为 1
    const rawSum = w1 + w2 + w3 + (1 - w1 - w2 - w3); // 包含 capital
    params.industry_weights.policy_weight = w1 / Math.max(rawSum, 0.01);
    params.industry_weights.business_weight = w2 / Math.max(rawSum, 0.01);
    params.industry_weights.opinion_weight = w3 / Math.max(rawSum, 0.01);
    params.industry_weights.capital_weight = Math.max(0, 1 - params.industry_weights.policy_weight - params.industry_weights.business_weight - params.industry_weights.opinion_weight);

    // 因子阈值
    const thresholdKeys = Object.keys(PARAMETER_SPACE.factor_thresholds);
    for (let i = 0; i < thresholdKeys.length; i++) {
      const key = thresholdKeys[i];
      const { min, max } = PARAMETER_SPACE.factor_thresholds[key];
      const normVal = Math.max(0, Math.min(1, normalized[3 + i]));
      params.factor_thresholds[key] = min + normVal * (max - min);
    }

    return params;
  }

  /**
   * 生成随机参数
   */
  generateRandomParams() {
    const normalized = [];
    for (let i = 0; i < 10; i++) { // 3 weights + 7 thresholds
      normalized.push(Math.random());
    }
    return this.denormalizeParams(normalized);
  }

  /**
   * Expected Improvement 采集函数
   */
  expectedImprovement(x, yBest) {
    const { mean, variance } = this.gp.predict(x);
    const std = Math.sqrt(variance);

    if (std < 1e-10) return 0;

    const z = (mean - yBest - this.config.explorationWeight) / std;
    const ei = (mean - yBest - this.config.explorationWeight) * this.normalCdf(z) + std * this.normalPdf(z);

    return Math.max(0, ei);
  }

  /**
   * 标准正态分布 CDF
   */
  normalCdf(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * 标准正态分布 PDF
   */
  normalPdf(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * 使用多起点优化找到下一个评估点
   */
  async suggestNextParams(nPoints = 1) {
    if (this.history.length === 0) {
      return Array(nPoints).fill(null).map(() => this.generateRandomParams());
    }

    const yBest = Math.max(...this.history.map(h => h.sharpeRatio));

    // 随机起点搜索
    const candidates = [];
    const nCandidates = 1000;

    for (let i = 0; i < nCandidates; i++) {
      const normalized = [];
      for (let j = 0; j < 10; j++) {
        normalized.push(Math.random());
      }
      const ei = this.expectedImprovement(normalized, yBest);
      candidates.push({ normalized, ei });
    }

    // 按 EI 排序
    candidates.sort((a, b) => b.ei - a.ei);

    // 返回 top N 个候选点
    return candidates.slice(0, nPoints).map(c => this.denormalizeParams(c.normalized));
  }

  /**
   * 运行单次回测评估
   */
  async evaluateParams(params, backtestConfig) {
    const strategyConfig = {
      industryWeights: params.industry_weights,
      factorThresholds: params.factor_thresholds
    };

    const backtestParams = {
      startDate: backtestConfig.startDate,
      endDate: backtestConfig.endDate,
      initialCapital: backtestConfig.initialCapital || 1000000,
      commissionRate: backtestConfig.commissionRate || 0.00025,
      minCommission: backtestConfig.minCommission || 5,
      positionLimit: backtestConfig.positionLimit || 10,
      strategyConfig
    };

    try {
      // 定义回测执行函数，供 runWithCache 调用
      const executeBacktest = async (p) => {
        const backtest = new FactorSnapshotBacktest({
          initialCapital: p.initialCapital,
          commissionRate: p.commissionRate,
          minCommission: p.minCommission,
          positionLimit: p.positionLimit
        });
        return await backtest.run({
          startDate: p.startDate,
          endDate: p.endDate,
          strategyConfig: p.strategyConfig
        });
      };

      // 使用缓存运行回测
      const result = await runWithCache(executeBacktest, backtestParams);

      return {
        params,
        sharpeRatio: result.summary.sharpeRatio || 0,
        maxDrawdown: result.summary.maxDrawdown || 1,
        totalReturn: result.summary.totalReturn || 0,
        annualizedReturn: result.summary.annualizedReturn || 0,
        valid: true,
        cached: !!result._cached
      };
    } catch (error) {
      console.error(`[评估失败] 参数: ${JSON.stringify(params)}, 错误: ${error.message}`);
      return {
        params,
        sharpeRatio: -Infinity,
        maxDrawdown: 1,
        totalReturn: 0,
        annualizedReturn: 0,
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * 运行优化
   */
  async optimize(backtestConfig) {
    console.log(`[贝叶斯优化] 开始优化，迭代次数: ${this.config.nIterations}`);
    console.log(`[贝叶斯优化] 回测配置: ${backtestConfig.startDate} - ${backtestConfig.endDate}`);

    this.status = 'running';
    const startTime = Date.now();

    // 1. 初始随机采样
    console.log(`[贝叶斯优化] 阶段 1: 初始随机采样 (${this.config.nInitial} 个点)`);
    const initialParams = [];
    for (let i = 0; i < this.config.nInitial; i++) {
      initialParams.push(this.generateRandomParams());
    }

    // 并行评估初始点
    const initialResults = await Promise.all(
      initialParams.map(p => this.evaluateParams(p, backtestConfig))
    );

    // 添加到 GP 和历史
    for (const result of initialResults) {
      if (result.valid) {
        this.gp.addData(this.normalizeParams(result.params), result.sharpeRatio);
      }
      this.history.push(result);

      // 更新最佳结果
      if (result.valid && result.maxDrawdown < this.config.maxDrawdownConstraint) {
        if (!this.bestResult || result.sharpeRatio > this.bestResult.sharpeRatio) {
          this.bestResult = result;
        }
      }
    }

    this.progress = this.config.nInitial;
    console.log(`[贝叶斯优化] 初始采样完成，最佳夏普比率: ${this.bestResult?.sharpeRatio?.toFixed(4) || 'N/A'}`);

    // 2. 贝叶斯优化迭代
    console.log(`[贝叶斯优化] 阶段 2: 迭代优化 (${this.config.nIterations} 次)`);

    for (let iter = 0; iter < this.config.nIterations; iter++) {
      // 建议新参数（支持并行）
      const suggestedParams = await this.suggestNextParams(this.config.nParallel);

      // 并行评估
      const results = await Promise.all(
        suggestedParams.map(p => this.evaluateParams(p, backtestConfig))
      );

      // 更新 GP 和历史
      const validResults = [];
      for (const result of results) {
        if (result.valid) {
          validResults.push(result);
          this.gp.addData(this.normalizeParams(result.params), result.sharpeRatio);
        }
        this.history.push(result);

        // 更新最佳结果
        if (result.valid && result.maxDrawdown < this.config.maxDrawdownConstraint) {
          if (!this.bestResult || result.sharpeRatio > this.bestResult.sharpeRatio) {
            this.bestResult = result;
          }
        }
      }

      this.progress = this.config.nInitial + iter + 1;

      // 输出进度
      const validCount = this.history.filter(h => h.valid).length;
      const constraintMetCount = this.history.filter(h => h.valid && h.maxDrawdown < this.config.maxDrawdownConstraint).length;
      console.log(`[贝叶斯优化] 迭代 ${iter + 1}/${this.config.nIterations} 完成，有效: ${validCount}，满足约束: ${constraintMetCount}，最佳夏普: ${this.bestResult?.sharpeRatio?.toFixed(4) || 'N/A'}`);
    }

    // 3. 生成最终结果
    const elapsed = Date.now() - startTime;
    this.status = 'completed';

    console.log(`[贝叶斯优化] 优化完成，耗时: ${(elapsed / 1000).toFixed(1)}s`);

    return {
      optimizerId: this.optimizerId,
      status: this.status,
      elapsed_ms: elapsed,
      totalEvaluations: this.history.length,
      validEvaluations: this.history.filter(h => h.valid).length,
      constraintMetEvaluations: this.history.filter(h => h.valid && h.maxDrawdown < this.config.maxDrawdownConstraint).length,
      bestParams: this.bestResult ? {
        industry_weights: this.bestResult.params.industry_weights,
        factor_thresholds: this.bestResult.params.factor_thresholds
      } : null,
      bestMetrics: this.bestResult ? {
        sharpeRatio: this.bestResult.sharpeRatio,
        maxDrawdown: this.bestResult.maxDrawdown,
        totalReturn: this.bestResult.totalReturn,
        annualizedReturn: this.bestResult.annualizedReturn
      } : null,
      history: this.history.slice(-20) // 返回最近 20 条历史
    };
  }

  /**
   * 获取优化状态
   */
  getStatus() {
    return {
      optimizerId: this.optimizerId,
      status: this.status,
      progress: this.progress,
      totalIterations: this.config.nInitial + this.config.nIterations,
      bestSharpeRatio: this.bestResult?.sharpeRatio || null,
      bestMaxDrawdown: this.bestResult?.maxDrawdown || null
    };
  }
}

/**
 * 优化器管理器（支持多任务并行）
 */
class OptimizerManager {
  constructor() {
    this.optimizers = new Map();
  }

  createOptimizer(config) {
    const optimizer = new BayesianOptimizer(config);
    this.optimizers.set(optimizer.optimizerId, optimizer);
    return optimizer;
  }

  getOptimizer(optimizerId) {
    return this.optimizers.get(optimizerId);
  }

  removeOptimizer(optimizerId) {
    this.optimizers.delete(optimizerId);
  }
}

// 全局优化器管理器
const optimizerManager = new OptimizerManager();

/**
 * 运行优化 API
 */
async function runOptimizer(req, res) {
  try {
    const {
      startDate,
      endDate,
      initialCapital = 1000000,
      nIterations = 50,
      nInitial = 5,
      nParallel = 3
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '必须提供 startDate 和 endDate 参数'
      });
    }

    const optimizer = optimizerManager.createOptimizer({
      nIterations,
      nInitial,
      nParallel
    });

    // 异步运行优化
    const result = await optimizer.optimize({
      startDate,
      endDate,
      initialCapital
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[优化器] 运行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 查询优化状态 API
 */
async function getOptimizerStatus(req, res) {
  try {
    const { id } = req.params;
    const optimizer = optimizerManager.getOptimizer(id);

    if (!optimizer) {
      return res.status(404).json({
        success: false,
        error: '优化任务不存在'
      });
    }

    res.json({
      success: true,
      data: optimizer.getStatus()
    });

  } catch (error) {
    console.error('[优化器] 查询状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取优化结果 API
 */
async function getOptimizerResult(req, res) {
  try {
    const { id } = req.params;
    const optimizer = optimizerManager.getOptimizer(id);

    if (!optimizer) {
      return res.status(404).json({
        success: false,
        error: '优化任务不存在'
      });
    }

    if (optimizer.status !== 'completed') {
      return res.json({
        success: true,
        data: {
          status: optimizer.status,
          progress: optimizer.getStatus()
        }
      });
    }

    res.json({
      success: true,
      data: {
        status: optimizer.status,
        bestParams: optimizer.bestResult?.params,
        bestMetrics: optimizer.bestResult ? {
          sharpeRatio: optimizer.bestResult.sharpeRatio,
          maxDrawdown: optimizer.bestResult.maxDrawdown,
          totalReturn: optimizer.bestResult.totalReturn,
          annualizedReturn: optimizer.bestResult.annualizedReturn
        } : null,
        history: optimizer.history
      }
    });

  } catch (error) {
    console.error('[优化器] 获取结果失败:', error);
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

  router.post('/run', runOptimizer);
  router.get('/status/:id', getOptimizerStatus);
  router.get('/result/:id', getOptimizerResult);

  return router;
}

module.exports = {
  BayesianOptimizer,
  GaussianProcess,
  OptimizerManager,
  optimizerManager,
  runOptimizer,
  getOptimizerStatus,
  getOptimizerResult,
  createRouter,
  PARAMETER_SPACE
};