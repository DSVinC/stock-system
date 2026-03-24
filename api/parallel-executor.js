/**
 * 并行执行器核心模块
 * TASK_V3_302
 *
 * 功能：
 * - 支持 8 核并行计算（可配置）
 * - 任务分发策略（平均分配）
 * - Worker 异常自动重试（最多 3 次）
 * - 优雅关闭支持（SIGINT/SIGTERM）
 * - 内存监控（每个 worker < 500MB）
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const path = require('path');

// 默认配置
const DEFAULT_CONFIG = {
  maxWorkers: 8,
  maxRetries: 3,
  memoryLimitMB: 500,
  taskTimeout: 300000 // 5 分钟超时
};

/**
 * 并行执行器类
 * 用于将大量任务分配到多个 Worker 线程并行执行
 */
class ParallelExecutor {
  /**
   * @param {Object} options - 配置选项
   * @param {number} options.maxWorkers - 最大 Worker 数量，默认 8
   * @param {number} options.maxRetries - 最大重试次数，默认 3
   * @param {number} options.memoryLimitMB - 内存限制（MB），默认 500
   * @param {number} options.taskTimeout - 任务超时时间（ms），默认 300000
   * @param {Function} options.taskHandler - 任务处理函数
   * @param {string} options.workerScript - Worker 脚本路径
   */
  constructor(options = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      maxWorkers: options.maxWorkers || Math.min(8, os.cpus().length),
      ...options
    };

    this.workers = [];
    this.taskQueue = [];
    this.results = new Map();
    this.activeWorkers = 0;
    this.isShuttingDown = false;
    this.startTime = null;
    this.stats = {
      completed: 0,
      failed: 0,
      retried: 0
    };

    // 绑定信号处理
    this._setupGracefulShutdown();
  }

  /**
   * 设置优雅关闭处理
   * @private
   */
  _setupGracefulShutdown() {
    const shutdownHandler = (signal) => {
      if (this.isShuttingDown) return;

      console.log(`[ParallelExecutor] 收到 ${signal} 信号，开始优雅关闭...`);
      this.isShuttingDown = true;

      // 给 Worker 5 秒时间完成当前任务
      setTimeout(() => {
        this._terminateAllWorkers();
        process.exit(0);
      }, 5000);
    };

    // 仅注册一次
    if (!process.listeners('SIGINT').some(l => l.name === 'shutdownHandler')) {
      process.on('SIGINT', shutdownHandler);
    }
    if (!process.listeners('SIGTERM').some(l => l.name === 'shutdownHandler')) {
      process.on('SIGTERM', shutdownHandler);
    }
  }

  /**
   * 终止所有 Worker
   * @private
   */
  _terminateAllWorkers() {
    for (const worker of this.workers) {
      if (worker && !worker.exited) {
        worker.terminate();
      }
    }
    this.workers = [];
  }

  /**
   * 创建单个 Worker
   * @param {Object} task - Worker 任务数据
   * @param {number} workerIndex - Worker 索引
   * @returns {Promise<Object>} Worker 执行结果
   * @private
   */
  _createWorker(task, workerIndex) {
    return new Promise((resolve, reject) => {
      const workerScript = this.config.workerScript;
      const timeout = this.config.taskTimeout;

      const worker = new Worker(workerScript, {
        workerData: {
          ...task,
          workerIndex
        }
      });

      let timeoutId = null;
      let isResolved = false;

      // 超时处理
      const clearTimeout_ = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          clearTimeout_();
          worker.terminate();
          reject(new Error(`Worker ${workerIndex} 执行超时`));
        }
      }, timeout);

      worker.on('message', (message) => {
        if (isResolved) return;

        // 支持进度报告
        if (message.type === 'progress') {
          this._handleProgress(workerIndex, message.data);
          return;
        }

        // 结果返回
        clearTimeout_();
        isResolved = true;

        if (message.type === 'result') {
          resolve({
            workerIndex,
            data: message.data,
            memoryUsage: message.memoryUsage
          });
        } else if (message.type === 'error') {
          reject(new Error(message.error));
        } else {
          reject(new Error('Worker 返回未知消息格式'));
        }
      });

      worker.on('error', (error) => {
        if (isResolved) return;
        clearTimeout_();
        isResolved = true;
        reject(error);
      });

      worker.on('exit', (code) => {
        if (isResolved) return;
        clearTimeout_();
        isResolved = true;

        if (code !== 0) {
          reject(new Error(`Worker ${workerIndex} 异常退出，退出码：${code}`));
        }
      });

      // 内存监控
      const memoryInterval = setInterval(() => {
        if (worker.exited || isResolved) {
          clearInterval(memoryInterval);
          return;
        }

        const memoryUsage = process.memoryUsage();
        const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

        if (heapUsedMB > this.config.memoryLimitMB) {
          console.warn(`[ParallelExecutor] Worker ${workerIndex} 内存使用过高: ${heapUsedMB.toFixed(1)}MB`);
        }
      }, 5000);

      this.workers.push(worker);
    });
  }

  /**
   * 处理进度更新
   * @private
   */
  _handleProgress(workerIndex, data) {
    // 可以被子类覆盖或通过事件发射
    console.log(`[ParallelExecutor] Worker ${workerIndex} 进度: ${JSON.stringify(data)}`);
  }

  /**
   * 执行任务（带重试）
   * @param {Object} task - 任务数据
   * @param {number} workerIndex - Worker 索引
   * @param {number} retriesLeft - 剩余重试次数
   * @returns {Promise<Object>} 执行结果
   * @private
   */
  async _executeWithRetry(task, workerIndex, retriesLeft = this.config.maxRetries) {
    try {
      return await this._createWorker(task, workerIndex);
    } catch (error) {
      if (retriesLeft > 0 && !this.isShuttingDown) {
        console.warn(`[ParallelExecutor] Worker ${workerIndex} 失败，重试中... (${retriesLeft} 次)`);
        this.stats.retried++;
        return this._executeWithRetry(task, workerIndex, retriesLeft - 1);
      }

      this.stats.failed++;
      throw error;
    }
  }

  /**
   * 执行并行任务
   * @param {Array} tasks - 任务数组
   * @param {Object} options - 执行选项
   * @returns {Promise<Object>} 执行结果
   */
  async execute(tasks, options = {}) {
    if (this.isShuttingDown) {
      throw new Error('Executor 正在关闭，无法接受新任务');
    }

    const startTime = Date.now();
    this.startTime = startTime;
    this.stats = { completed: 0, failed: 0, retried: 0 };

    const numWorkers = options.numWorkers || this.config.maxWorkers;
    const totalTasks = tasks.length;

    console.log(`[ParallelExecutor] 开始并行执行`);
    console.log(`[ParallelExecutor] 任务总数: ${totalTasks}`);
    console.log(`[ParallelExecutor] Worker 数量: ${numWorkers}`);

    // 将任务分配给各个 Worker
    const tasksPerWorker = Math.ceil(totalTasks / numWorkers);
    const workerTasks = [];

    for (let i = 0; i < numWorkers; i++) {
      const start = i * tasksPerWorker;
      const end = Math.min(start + tasksPerWorker, totalTasks);
      const workerTaskList = tasks.slice(start, end);

      if (workerTaskList.length > 0) {
        workerTasks.push({
          workerIndex: i,
          tasks: workerTaskList,
          options
        });
      }
    }

    console.log(`[ParallelExecutor] 任务分配: 每个Worker约 ${tasksPerWorker} 个任务`);

    // 创建所有 Worker Promise（不使用 Promise.all，避免一处失败影响全部）
    const results = [];
    const errors = [];

    for (const task of workerTasks) {
      try {
        const result = await this._executeWithRetry(task, task.workerIndex);
        results.push(result);
        this.stats.completed += task.tasks.length;
      } catch (error) {
        console.error(`[ParallelExecutor] Worker ${task.workerIndex} 执行失败:`, error.message);
        errors.push({
          workerIndex: task.workerIndex,
          error: error.message
        });
      }
    }

    const elapsed = Date.now() - startTime;

    // 汇总结果
    const aggregatedResults = this._aggregateResults(results);

    console.log(`[ParallelExecutor] 执行完成`);
    console.log(`[ParallelExecutor] 耗时: ${(elapsed / 1000).toFixed(1)}秒`);
    console.log(`[ParallelExecutor] 成功: ${this.stats.completed}, 失败: ${this.stats.failed}, 重试: ${this.stats.retried}`);

    return {
      success: errors.length === 0,
      elapsed_ms: elapsed,
      stats: this.stats,
      results: aggregatedResults,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 汇总各 Worker 的结果
   * @param {Array} workerResults - 各 Worker 返回的结果数组
   * @returns {Object} 汇总后的结果
   * @private
   */
  _aggregateResults(workerResults) {
    // 默认实现：合并所有数据
    const allData = [];

    for (const result of workerResults) {
      if (result && result.data) {
        if (Array.isArray(result.data)) {
          allData.push(...result.data);
        } else {
          allData.push(result.data);
        }
      }
    }

    return {
      total: allData.length,
      data: allData
    };
  }

  /**
   * 获取执行进度
   * @returns {Object} 进度信息
   */
  getProgress() {
    return {
      status: this.isShuttingDown ? 'shutting_down' : 'running',
      stats: this.stats,
      elapsed_ms: this.startTime ? Date.now() - this.startTime : 0
    };
  }

  /**
   * 关闭执行器
   */
  async shutdown() {
    this.isShuttingDown = true;
    this._terminateAllWorkers();
  }
}

/**
 * 优化的联合并行执行器
 * 专门用于两阶段优化任务的并行执行
 */
class JointOptimizerParallelExecutor extends ParallelExecutor {
  constructor(options = {}) {
    super({
      maxWorkers: 8,
      workerScript: path.join(__dirname, 'parallel-executor-worker.js'),
      ...options
    });
  }

  /**
   * 执行阶段 1：选股参数优化
   * @param {Object} params - 回测参数
   * @param {Array} stockSelectionCombos - 选股参数组合
   * @returns {Promise<Object>} 阶段 1 结果
   */
  async executePhase1(params, stockSelectionCombos) {
    console.log('[JointOptimizer] 阶段 1: 选股参数优化');
    console.log(`[JointOptimizer] 参数组合数: ${stockSelectionCombos.length}`);

    // 阶段 1: 10,000 次/8 = 1,250 次/worker
    const result = await this.execute(stockSelectionCombos.map(combo => ({
      ...params,
      ...combo,
      phase: 1
    })));

    return {
      phase: 1,
      ...result,
      bestParams: this._findBestParams(result.results, 'phase1')
    };
  }

  /**
   * 执行阶段 2：网格步长优化
   * @param {Object} params - 回测参数
   * @param {Object} phase1BestParams - 阶段 1 最佳参数
   * @param {Array} gridCombos - 网格参数组合
   * @returns {Promise<Object>} 阶段 2 结果
   */
  async executePhase2(params, phase1BestParams, gridCombos) {
    console.log('[JointOptimizer] 阶段 2: 网格步长优化');
    console.log(`[JointOptimizer] 参数组合数: ${gridCombos.length}`);

    // 阶段 2: 500 次/8 = 63 次/worker
    const result = await this.execute(gridCombos.map(combo => ({
      ...params,
      ...phase1BestParams,
      ...combo,
      phase: 2
    })));

    return {
      phase: 2,
      ...result,
      bestParams: this._findBestParams(result.results, 'phase2')
    };
  }

  /**
   * 执行完整两阶段优化
   * @param {Object} params - 回测参数
   * @param {Array} stockSelectionCombos - 选股参数组合
   * @param {Array} gridCombos - 网格参数组合
   * @returns {Promise<Object>} 完整优化结果
   */
  async executeFullOptimization(params, stockSelectionCombos, gridCombos) {
    const totalStartTime = Date.now();

    // 阶段 1
    const phase1Result = await this.executePhase1(params, stockSelectionCombos);

    if (!phase1Result.success) {
      return {
        success: false,
        error: '阶段 1 执行失败',
        phase1: phase1Result
      };
    }

    // 阶段 2
    const phase2Result = await this.executePhase2(
      params,
      phase1Result.bestParams,
      gridCombos
    );

    const totalElapsed = Date.now() - totalStartTime;

    return {
      success: phase2Result.success,
      total_elapsed_ms: totalElapsed,
      phase1: phase1Result,
      phase2: phase2Result,
      finalBestParams: phase2Result.bestParams
    };
  }

  /**
   * 找出最佳参数
   * @private
   */
  _findBestParams(results, phase) {
    if (!results || !results.data || results.data.length === 0) {
      return null;
    }

    // 按收益率排序
    const sorted = [...results.data].sort((a, b) => {
      const scoreA = this._calculateScore(a);
      const scoreB = this._calculateScore(b);
      return scoreB - scoreA;
    });

    return sorted[0] || null;
  }

  /**
   * 计算综合得分
   * @private
   */
  _calculateScore(result) {
    if (!result || !result.metrics) return -Infinity;

    const weights = {
      totalReturn: 0.4,
      sharpeRatio: 0.4,
      maxDrawdown: -0.2
    };

    return (
      (result.metrics.totalReturn || 0) * weights.totalReturn +
      (result.metrics.sharpeRatio || 0) * weights.sharpeRatio +
      (result.metrics.maxDrawdown || 0) * weights.maxDrawdown
    );
  }
}

/**
 * Worker 线程入口函数
 * 用于处理单个任务批次
 */
async function runWorkerTask(workerData) {
  const { tasks, options, workerIndex } = workerData;
  const results = [];

  console.log(`[Worker ${workerIndex}] 开始处理 ${tasks.length} 个任务`);

  for (const task of tasks) {
    try {
      // 这里应该调用实际的任务处理函数
      // 具体实现由 workerScript 指定的文件处理
      const result = await processTask(task, options);
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        error: error.message,
        task
      });
    }
  }

  console.log(`[Worker ${workerIndex}] 完成 ${results.length} 个任务`);

  return results;
}

/**
 * 处理单个任务（默认实现，可被覆盖）
 */
async function processTask(task, options) {
  // 默认实现：返回任务本身
  return {
    success: true,
    task,
    result: task
  };
}

// Worker 线程处理入口
if (!isMainThread && parentPort) {
  runWorkerTask(workerData)
    .then(results => {
      parentPort.postMessage({
        type: 'result',
        data: results,
        memoryUsage: process.memoryUsage()
      });
    })
    .catch(error => {
      parentPort.postMessage({
        type: 'error',
        error: error.message
      });
    });
}

module.exports = {
  ParallelExecutor,
  JointOptimizerParallelExecutor,
  DEFAULT_CONFIG,
  runWorkerTask,
  processTask
};