/**
 * 异步流水线模块
 * 
 * 实现异步并发流水线，提升批量处理性能
 * 支持并发度配置、进度追踪、错误处理
 */

// 进度记录存储（内存）
const progressStore = new Map();

/**
 * 运行异步流水线
 * @param {Array} items - 处理项列表
 * @param {Function} processor - 处理函数 (item) => Promise<result>
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 处理结果
 */
async function runPipeline(items, processor, options = {}) {
  const {
    concurrency = 5,
    maxRetries = 3,
    retryDelay = 1000,
    onProgress = null,
    pipelineId = generatePipelineId(),
  } = options;

  // 初始化进度记录
  const progress = {
    pipelineId,
    total: items.length,
    completed: 0,
    failed: 0,
    pending: items.length,
    results: new Array(items.length),
    errors: [],
    startTime: Date.now(),
    estimatedEndTime: null,
  };

  progressStore.set(pipelineId, progress);

  // 创建信号量控制并发
  const semaphore = new Semaphore(concurrency);

  // 处理单个任务
  const processTask = async (item, index) => {
    await semaphore.acquire();
    
    try {
      let result;
      let attempts = 0;
      
      while (attempts < maxRetries) {
        try {
          result = await processor(item);
          break;
        } catch (error) {
          attempts++;
          if (attempts < maxRetries) {
            // 指数退避
            const delay = retryDelay * Math.pow(2, attempts - 1);
            await sleep(delay);
          }
        }
      }

      if (result !== undefined) {
        progress.completed++;
        progress.results[index] = { success: true, data: result };
      } else {
        progress.failed++;
        progress.results[index] = { 
          success: false, 
          error: '处理返回 undefined',
          attempts,
        };
      }
    } catch (error) {
      progress.failed++;
      progress.results[index] = { 
        success: false, 
        error: error.message,
        attempts,
      };
      progress.errors.push({ index, error: error.message });
    } finally {
      semaphore.release();
      progress.pending--;
      
      // 更新预计完成时间
      updateEstimatedTime(progress);
      
      // 进度回调
      if (onProgress) {
        onProgress({
          pipelineId,
          completed: progress.completed,
          failed: progress.failed,
          pending: progress.pending,
          total: progress.total,
          percent: ((progress.completed + progress.failed) / progress.total * 100).toFixed(2),
          estimatedRemaining: progress.estimatedEndTime,
        });
      }
    }
  };

  // 启动所有任务
  const tasks = items.map((item, index) => processTask(item, index));
  await Promise.all(tasks);

  // 清理进度记录（延迟清理，保留一段时间供查询）
  setTimeout(() => {
    progressStore.delete(pipelineId);
  }, 60000); // 1 分钟后清理

  return {
    pipelineId,
    success: progress.failed === 0,
    total: progress.total,
    completed: progress.completed,
    failed: progress.failed,
    results: progress.results,
    errors: progress.errors,
    duration: Date.now() - progress.startTime,
  };
}

/**
 * 创建批量处理器
 * @param {Object} config - 配置
 * @returns {Function} 批量处理函数
 */
function createBatchProcessor(config = {}) {
  const {
    concurrency = 5,
    maxRetries = 3,
    retryDelay = 1000,
    onProgress = null,
  } = config;

  return async (items, processor) => {
    return runPipeline(items, processor, {
      concurrency,
      maxRetries,
      retryDelay,
      onProgress,
    });
  };
}

/**
 * 获取流水线进度
 * @param {string} pipelineId - 流水线 ID
 * @returns {Object|null} 进度信息
 */
function getPipelineProgress(pipelineId) {
  const progress = progressStore.get(pipelineId);
  if (!progress) return null;

  return {
    pipelineId,
    total: progress.total,
    completed: progress.completed,
    failed: progress.failed,
    pending: progress.pending,
    percent: ((progress.completed + progress.failed) / progress.total * 100).toFixed(2),
    estimatedRemaining: progress.estimatedEndTime,
    duration: Date.now() - progress.startTime,
  };
}

/**
 * 列出所有活跃流水线
 * @returns {Array} 流水线列表
 */
function listActivePipelines() {
  return Array.from(progressStore.values()).map(progress => ({
    pipelineId: progress.pipelineId,
    total: progress.total,
    completed: progress.completed,
    failed: progress.failed,
    pending: progress.pending,
    percent: ((progress.completed + progress.failed) / progress.total * 100).toFixed(2),
  }));
}

/**
 * 清除流水线进度记录
 * @param {string} pipelineId - 流水线 ID
 */
function clearPipelineProgress(pipelineId) {
  progressStore.delete(pipelineId);
}

// ===== 工具函数 =====

/**
 * 信号量类
 */
class Semaphore {
  constructor(limit) {
    this.limit = limit;
    this.count = 0;
    this.queue = [];
  }

  acquire() {
    if (this.count < this.limit) {
      this.count++;
      return Promise.resolve();
    }
    
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.count--;
    if (this.queue.length > 0 && this.count < this.limit) {
      this.count++;
      const next = this.queue.shift();
      next();
    }
  }
}

/**
 * 生成流水线 ID
 */
function generatePipelineId() {
  return `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 睡眠
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 更新预计完成时间
 */
function updateEstimatedTime(progress) {
  const processed = progress.completed + progress.failed;
  if (processed === 0) return;

  const elapsed = Date.now() - progress.startTime;
  const avgTimePerItem = elapsed / processed;
  const remaining = progress.pending;
  const estimatedRemaining = Math.round(avgTimePerItem * remaining);
  
  progress.estimatedEndTime = estimatedRemaining;
}

/**
 * 获取流水线统计
 */
function getPipelineStats() {
  return {
    activePipelines: progressStore.size,
    concurrencyLimit: 5,
    maxRetries: 3,
  };
}

module.exports = {
  runPipeline,
  createBatchProcessor,
  getPipelineProgress,
  listActivePipelines,
  clearPipelineProgress,
  getPipelineStats,
  Semaphore,
};
