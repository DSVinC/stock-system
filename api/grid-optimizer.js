/**
 * 网格交易参数优化模块
 * TASK_V3_204
 *
 * 功能：
 * - 支持网格步长优化（范围 0.5%-2.0%，步长 0.1%）
 * - 支持仓位比例优化（范围 10%-50%，步长 5%）
 * - 支持多目标优化（收益率、夏普比率、最大回撤）
 * - 支持参数扫描（全组合回测）
 * - 支持并行计算（4 核并行）
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const path = require('path');
const MinuteBacktest = require('./backtest-minute');
const { runWithCache } = require('./backtest-cache');

// 参数空间定义
const GRID_PARAMETER_SPACE = {
  // 网格步长（百分比）
  gridStep: {
    min: 0.5,
    max: 2.0,
    step: 0.1,
    label: '网格步长'
  },
  // 仓位比例（百分比）
  positionRatio: {
    min: 10,
    max: 50,
    step: 5,
    label: '仓位比例'
  },
  // 网格数量
  gridCount: {
    min: 5,
    max: 20,
    step: 1,
    label: '网格数量'
  }
};

/**
 * 生成参数范围数组
 * @param {Object} paramDef - 参数定义 {min, max, step}
 * @returns {Array} 参数值数组
 */
function generateParamRange(paramDef) {
  const values = [];
  const precision = (paramDef.step.toString().split('.')[1] || '').length;

  for (let v = paramDef.min; v <= paramDef.max + 0.0001; v += paramDef.step) {
    values.push(parseFloat(v.toFixed(precision)));
  }

  return values;
}

/**
 * 生成所有参数组合
 * @param {Object} paramRanges - 参数范围定义
 * @returns {Array} 参数组合数组
 */
function generateAllCombinations(paramRanges) {
  const keys = Object.keys(paramRanges);
  if (keys.length === 0) return [{}];

  const result = [];
  const firstKey = keys[0];
  const firstValues = generateParamRange(paramRanges[firstKey]);

  if (keys.length === 1) {
    return firstValues.map(v => ({ [firstKey]: v }));
  }

  const restKeys = keys.slice(1);
  const restRanges = {};
  restKeys.forEach(k => {
    restRanges[k] = paramRanges[k];
  });

  const restCombinations = generateAllCombinations(restRanges);

  for (const v of firstValues) {
    for (const rest of restCombinations) {
      result.push({ [firstKey]: v, ...rest });
    }
  }

  return result;
}

/**
 * 网格交易回测执行器
 */
class GridBacktestExecutor {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 1000000,
      commissionRate: config.commissionRate || 0.00025,
      minCommission: config.minCommission || 5,
      slippageRate: config.slippageRate || 0.001,
      ...config
    };
  }

  /**
   * 执行单次网格策略回测
   * @param {Object} params - 回测参数
   * @returns {Promise<Object>} 回测结果
   */
  async executeBacktest(params) {
    const {
      startDate,
      endDate,
      tsCode,
      gridStep,
      positionRatio,
      gridCount = 10,
      strategyConfig = {}
    } = params;

    // 创建网格策略配置
    const gridStrategyConfig = {
      ...strategyConfig,
      gridStep,
      positionRatio: positionRatio / 100, // 转换为比例
      gridCount,
      closePositionAtEOD: false // 网格交易不强制平仓
    };

    // 使用分钟回测引擎
    const backtest = new MinuteBacktest({
      ...this.config,
      allowIntradayTrade: true
    });

    try {
      // 注入网格交易策略
      backtest.generateTradeSignal = (stock, indicators, config) => {
        return this.generateGridSignal(stock, indicators, config, backtest.positions);
      };

      const result = await backtest.run({
        startDate,
        endDate,
        strategyConfig: gridStrategyConfig,
        symbols: tsCode ? [tsCode] : []
      });

      return {
        success: true,
        params: { gridStep, positionRatio, gridCount },
        metrics: {
          totalReturn: result.summary.totalReturn,
          annualizedReturn: result.summary.annualizedReturn,
          sharpeRatio: result.summary.sharpeRatio,
          maxDrawdown: result.summary.maxDrawdown,
          winRate: result.summary.winRate,
          totalTrades: result.summary.totalTrades
        },
        details: result
      };
    } catch (error) {
      console.error(`[网格回测] 执行失败:`, error.message);
      return {
        success: false,
        params: { gridStep, positionRatio, gridCount },
        error: error.message,
        metrics: null
      };
    }
  }

  /**
   * 生成网格交易信号
   * @param {Object} stock - 股票数据
   * @param {Object} indicators - 技术指标
   * @param {Object} config - 策略配置
   * @param {Map} positions - 当前持仓
   * @returns {string} 交易信号
   */
  generateGridSignal(stock, indicators, config, positions) {
    const { gridStep = 1.0, positionRatio = 0.3, gridCount = 10 } = config;
    const position = positions.get(stock.ts_code);

    // 获取或初始化网格参考价格
    if (!this.gridReferencePrice) {
      this.gridReferencePrice = stock.close;
    }

    // 计算价格变动百分比
    const priceChange = (stock.close - this.gridReferencePrice) / this.gridReferencePrice * 100;

    // 网格交易逻辑
    const gridTrigger = gridStep;

    if (!position) {
      // 无持仓，价格下跌超过网格步长则买入
      if (priceChange <= -gridTrigger) {
        // 更新参考价格
        this.gridReferencePrice = stock.close;
        return 'buy';
      }
    } else {
      // 有持仓
      const entryPrice = position.entryPrice;
      const holdingReturn = (stock.close - entryPrice) / entryPrice * 100;

      // 价格上涨超过网格步长则卖出
      if (holdingReturn >= gridTrigger) {
        return 'sell';
      }

      // 价格继续下跌，加仓（检查仓位限制）
      if (priceChange <= -gridTrigger * 2 && position.shares < this.config.initialCapital * positionRatio / stock.close) {
        this.gridReferencePrice = stock.close;
        return 'buy';
      }
    }

    return 'hold';
  }
}

/**
 * 网格参数优化器
 */
class GridOptimizer {
  constructor(config = {}) {
    this.config = {
      // 并行工作线程数（默认使用 CPU 核心数）
      parallelWorkers: config.parallelWorkers || Math.min(4, os.cpus().length),
      // 参数空间
      parameterSpace: config.parameterSpace || GRID_PARAMETER_SPACE,
      // 优化目标权重
      objectiveWeights: config.objectiveWeights || {
        totalReturn: 0.4,
        sharpeRatio: 0.4,
        maxDrawdown: -0.2 // 负权重表示越小越好
      },
      // 初始资金
      initialCapital: config.initialCapital || 1000000,
      ...config
    };

    this.executor = new GridBacktestExecutor(this.config);
    this.results = [];
    this.bestResult = null;
    this.status = 'initialized';
    this.progress = { completed: 0, total: 0 };
  }

  /**
   * 运行参数扫描优化
   * @param {Object} params - 优化参数
   * @returns {Promise<Object>} 优化结果
   */
  async optimize(params) {
    const {
      startDate,
      endDate,
      tsCode,
      customParamSpace = null
    } = params;

    console.log(`[网格优化器] 开始参数扫描优化`);
    console.log(`[网格优化器] 回测区间: ${startDate} ~ ${endDate}`);
    console.log(`[网格优化器] 股票代码: ${tsCode || '全市场'}`);
    console.log(`[网格优化器] 并行线程数: ${this.config.parallelWorkers}`);

    this.status = 'running';
    const startTime = Date.now();

    // 使用自定义参数空间或默认空间
    const paramSpace = customParamSpace || this.config.parameterSpace;

    // 生成所有参数组合
    const combinations = generateAllCombinations(paramSpace);
    this.progress.total = combinations.length;

    console.log(`[网格优化器] 共 ${combinations.length} 个参数组合`);

    // 并行执行回测
    this.results = await this.runParallelBacktests(
      combinations,
      { startDate, endDate, tsCode }
    );

    // 排序结果
    this.rankResults();

    // 获取最佳结果
    this.bestResult = this.results[0];

    const elapsed = Date.now() - startTime;
    this.status = 'completed';

    console.log(`[网格优化器] 优化完成，耗时: ${(elapsed / 1000).toFixed(1)}秒`);
    console.log(`[网格优化器] 最佳参数:`, this.bestResult?.params);

    return {
      status: this.status,
      elapsed_ms: elapsed,
      totalCombinations: combinations.length,
      successCount: this.results.filter(r => r.success).length,
      bestParams: this.bestResult?.params || null,
      bestMetrics: this.bestResult?.metrics || null,
      allResults: this.results.slice(0, 20), // 返回前 20 个结果
      paretoFront: this.getParetoFront()
    };
  }

  /**
   * 并行执行回测
   * @param {Array} combinations - 参数组合数组
   * @param {Object} baseParams - 基础参数
   * @returns {Promise<Array>} 回测结果数组
   */
  async runParallelBacktests(combinations, baseParams) {
    const results = [];
    const batchSize = this.config.parallelWorkers;

    console.log('[网格优化器] 启动 ' + batchSize + ' 个 Worker 线程执行并行回测');

    // 分批执行，每批创建 worker 线程
    for (let i = 0; i < combinations.length; i += batchSize) {
      const batch = combinations.slice(i, i + batchSize);

      if (batch.length === 1) {
        // 单任务直接执行，不创建 worker
        const combo = batch[0];
        try {
          const result = await this.executor.executeBacktest({
            ...baseParams,
            ...combo
          });
          this.progress.completed++;

          if (result.success && result.metrics) {
            result.score = this.calculateScore(result.metrics);
          }

          results.push(result);
        } catch (error) {
          console.error('[网格优化器] 回测失败:', error.message);
          results.push({
            success: false,
            params: combo,
            error: error.message,
            score: -Infinity
          });
        }
      } else {
        // 多任务使用 Worker 线程
        const workerPromises = [];

        // 将批次任务平均分配给 worker
        const tasksPerWorker = Math.ceil(batch.length / batchSize);

        for (let w = 0; w < batchSize; w++) {
          const workerTasks = batch.slice(
            w * tasksPerWorker,
            (w + 1) * tasksPerWorker
          );

          if (workerTasks.length === 0) continue;

          const worker = new Worker(__filename, {
            workerData: {
              combinations: workerTasks,
              baseParams,
              config: this.config
            }
          });

          workerPromises.push(new Promise((resolve, reject) => {
            worker.on('message', (message) => {
              // 解包 Worker 消息：{ type: 'results', data: [...] }
              if (message.type === 'results' && Array.isArray(message.data)) {
                const workerResults = message.data;
                // 计算每个结果的得分
                workerResults.forEach(result => {
                  if (result.success && result.metrics) {
                    result.score = this.calculateScore(result.metrics);
                  }
                });
                resolve(workerResults);
              } else if (message.type === 'error') {
                reject(new Error(message.error));
              } else {
                reject(new Error('Worker 返回未知消息格式'));
              }
            });

            worker.on('error', reject);
            worker.on('exit', (code) => {
              if (code !== 0) {
                reject(new Error('Worker 异常退出，退出码：' + code));
              }
            });
          }));
        }

        // 等待所有 worker 完成
        const batchResultsArrays = await Promise.all(workerPromises);
        const batchResults = batchResultsArrays.flat();

        // 更新进度
        this.progress.completed += batchResults.length;
        results.push(...batchResults);
      }

      // 输出进度
      const progress = ((this.progress.completed / this.progress.total) * 100).toFixed(1);
      console.log('[网格优化器] 进度：' + progress + '% (' + this.progress.completed + '/' + this.progress.total + ')');
    }

    return results;
  }

  /**
   * 计算综合得分
   * @param {Object} metrics - 绩效指标
   * @returns {number} 综合得分
   */
  calculateScore(metrics) {
    const weights = this.config.objectiveWeights;

    let score = 0;
    score += (metrics.totalReturn || 0) * weights.totalReturn;
    score += (metrics.sharpeRatio || 0) * weights.sharpeRatio;
    score += (metrics.maxDrawdown || 0) * weights.maxDrawdown; // maxDrawdown 是正数，权重为负

    return score;
  }

  /**
   * 对结果排序
   */
  rankResults() {
    this.results.sort((a, b) => {
      // 成功的排前面
      if (a.success !== b.success) return a.success ? -1 : 1;
      // 按得分降序
      return (b.score || -Infinity) - (a.score || -Infinity);
    });
  }

  /**
   * 获取帕累托前沿（多目标优化）
   * @returns {Array} 帕累托最优解
   */
  getParetoFront() {
    const successResults = this.results.filter(r => r.success && r.metrics);

    if (successResults.length === 0) return [];

    const paretoFront = [];

    for (const candidate of successResults) {
      let dominated = false;

      for (const other of successResults) {
        if (candidate === other) continue;

        // 检查 candidate 是否被 other 支配
        // 支配条件：收益率 >= 且夏普 >= 且回撤 <=
        if (
          other.metrics.totalReturn >= candidate.metrics.totalReturn &&
          other.metrics.sharpeRatio >= candidate.metrics.sharpeRatio &&
          other.metrics.maxDrawdown <= candidate.metrics.maxDrawdown &&
          (
            other.metrics.totalReturn > candidate.metrics.totalReturn ||
            other.metrics.sharpeRatio > candidate.metrics.sharpeRatio ||
            other.metrics.maxDrawdown < candidate.metrics.maxDrawdown
          )
        ) {
          dominated = true;
          break;
        }
      }

      if (!dominated) {
        paretoFront.push({
          params: candidate.params,
          metrics: candidate.metrics,
          score: candidate.score
        });
      }
    }

    return paretoFront;
  }

  /**
   * 获取优化进度
   * @returns {Object} 进度信息
   */
  getProgress() {
    return {
      status: this.status,
      completed: this.progress.completed,
      total: this.progress.total,
      percentage: this.progress.total > 0
        ? ((this.progress.completed / this.progress.total) * 100).toFixed(1)
        : 0
    };
  }

  /**
   * 获取最佳参数
   * @returns {Object|null} 最佳参数
   */
  getBestParams() {
    return this.bestResult?.params || null;
  }

  /**
   * 获取所有结果
   * @param {number} limit - 限制数量
   * @returns {Array} 结果数组
   */
  getAllResults(limit = 100) {
    return this.results.slice(0, limit);
  }
}

/**
 * Worker 线程执行函数
 */
async function runWorkerBacktest(workerData) {
  const { combinations, baseParams, config } = workerData;
  const executor = new GridBacktestExecutor(config);
  const results = [];

  for (const combo of combinations) {
    try {
      const result = await executor.executeBacktest({
        ...baseParams,
        ...combo
      });
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        params: combo,
        error: error.message
      });
    }
  }

  return results;
}

// Worker 线程处理
if (!isMainThread && parentPort) {
  runWorkerBacktest(workerData)
    .then(results => {
      parentPort.postMessage({ type: 'results', data: results });
    })
    .catch(error => {
      parentPort.postMessage({ type: 'error', error: error.message });
    });
}

// ==================== API 处理函数 ====================

/**
 * 运行网格优化 API
 */
async function runGridOptimizerAPI(req, res) {
  try {
    const {
      startDate,
      endDate,
      tsCode,
      parallelWorkers = 4,
      objectiveWeights,
      customParamSpace
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '必须提供 startDate 和 endDate 参数'
      });
    }

    const optimizer = new GridOptimizer({
      parallelWorkers,
      objectiveWeights,
      initialCapital: 1000000
    });

    // 运行优化
    const result = await optimizer.optimize({
      startDate,
      endDate,
      tsCode,
      customParamSpace
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[网格优化器] 运行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取参数空间 API
 */
async function getParameterSpaceAPI(req, res) {
  try {
    res.json({
      success: true,
      data: {
        default: GRID_PARAMETER_SPACE,
        combinations: generateAllCombinations(GRID_PARAMETER_SPACE).length
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

  router.post('/run', runGridOptimizerAPI);
  router.get('/parameters', getParameterSpaceAPI);

  return router;
}

module.exports = {
  // 主要类
  GridOptimizer,
  GridBacktestExecutor,

  // 工具函数
  generateParamRange,
  generateAllCombinations,

  // 参数空间
  GRID_PARAMETER_SPACE,

  // API 函数
  runGridOptimizerAPI,
  getParameterSpaceAPI,
  createRouter
};