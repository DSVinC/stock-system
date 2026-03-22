/**
 * 时间衰减函数模块
 * 
 * 实现差异化时间衰减策略
 * 新闻：12 小时半衰期
 * 公告：5 天半衰期
 * 财报：30 天半衰期
 */

// 默认衰减配置（小时）
const DEFAULT_DECAY_CONFIG = {
  news: 12,           // 新闻快讯：12 小时
  announcement: 120,  // 公司公告：5 天（120 小时）
  earnings: 720,      // 财报数据：30 天（720 小时）
  major_event: 48,    // 重大事件：2 天
  default: 24,        // 默认：1 天
};

// 衰减曲线类型
const DECAY_CURVE_TYPES = {
  EXPONENTIAL: 'exponential',  // 指数衰减
  LINEAR: 'linear',           // 线性衰减
  STEP: 'step',               // 分段衰减
};

/**
 * 计算时间衰减因子
 * @param {number} timestamp - 时间戳（毫秒）
 * @param {string} itemType - 项目类型
 * @param {Object} options - 配置选项
 * @returns {number} 衰减因子（0.0 ~ 1.0）
 */
function calculateDecayFactor(timestamp, itemType = 'news', options = {}) {
  const {
    curve = DECAY_CURVE_TYPES.EXPONENTIAL,
    customHalfLife = null,
    minFactor = 0.1,
  } = options;

  // 获取半衰期（小时）
  const halfLife = customHalfLife || getHalfLife(itemType);
  
  // 计算经过的时间（小时）
  const elapsed = (Date.now() - timestamp) / (1000 * 60 * 60);
  
  // 如果时间为负或为 0，返回 1.0（无衰减）
  if (elapsed <= 0) return 1.0;

  let factor;
  
  switch (curve) {
    case DECAY_CURVE_TYPES.EXPONENTIAL:
      factor = calculateExponentialDecay(elapsed, halfLife);
      break;
    case DECAY_CURVE_TYPES.LINEAR:
      factor = calculateLinearDecay(elapsed, halfLife);
      break;
    case DECAY_CURVE_TYPES.STEP:
      factor = calculateStepDecay(elapsed, halfLife);
      break;
    default:
      factor = calculateExponentialDecay(elapsed, halfLife);
  }

  // 限制最小衰减因子
  return Math.max(factor, minFactor);
}

/**
 * 指数衰减：factor = e^(-λt)
 * λ = ln(2) / halfLife
 */
function calculateExponentialDecay(elapsed, halfLife) {
  const lambda = Math.log(2) / halfLife;
  return Math.exp(-lambda * elapsed);
}

/**
 * 线性衰减：factor = 1 - (elapsed / (2 * halfLife))
 * 2 个半衰期后衰减到 0
 */
function calculateLinearDecay(elapsed, halfLife) {
  const factor = 1 - (elapsed / (2 * halfLife));
  return Math.max(factor, 0);
}

/**
 * 分段衰减：
 * - 半衰期内：1.0
 * - 1-2 个半衰期：0.5
 * - 2-3 个半衰期：0.25
 * - 3 个以上：0.1
 */
function calculateStepDecay(elapsed, halfLife) {
  const periods = elapsed / halfLife;
  
  if (periods <= 1) return 1.0;
  if (periods <= 2) return 0.5;
  if (periods <= 3) return 0.25;
  return 0.1;
}

/**
 * 获取项目类型的半衰期
 * @param {string} itemType - 项目类型
 * @returns {number} 半衰期（小时）
 */
function getHalfLife(itemType) {
  return DEFAULT_DECAY_CONFIG[itemType] || DEFAULT_DECAY_CONFIG.default;
}

/**
 * 创建自定义衰减曲线
 * @param {Object} config - 配置
 * @returns {Object} 衰减计算器
 */
function createDecayCurve(config = {}) {
  const {
    curve = DECAY_CURVE_TYPES.EXPONENTIAL,
    halfLife = 24,
    minFactor = 0.1,
  } = config;

  return {
    /**
     * 计算衰减因子
     * @param {number} timestamp - 时间戳
     * @returns {number} 衰减因子
     */
    calculate(timestamp) {
      const elapsed = (Date.now() - timestamp) / (1000 * 60 * 60);
      if (elapsed <= 0) return 1.0;

      let factor;
      switch (curve) {
        case DECAY_CURVE_TYPES.EXPONENTIAL:
          factor = calculateExponentialDecay(elapsed, halfLife);
          break;
        case DECAY_CURVE_TYPES.LINEAR:
          factor = calculateLinearDecay(elapsed, halfLife);
          break;
        case DECAY_CURVE_TYPES.STEP:
          factor = calculateStepDecay(elapsed, halfLife);
          break;
        default:
          factor = calculateExponentialDecay(elapsed, halfLife);
      }

      return Math.max(factor, minFactor);
    },

    /**
     * 获取配置信息
     */
    getConfig() {
      return { curve, halfLife, minFactor };
    },
  };
}

/**
 * 批量计算衰减因子
 * @param {Array<{timestamp: number, itemType: string}>} items - 项目列表
 * @returns {Array} 衰减因子列表
 */
function calculateDecayFactorBatch(items) {
  return items.map(item => ({
    ...item,
    decayFactor: calculateDecayFactor(item.timestamp, item.itemType),
  }));
}

/**
 * 获取衰减配置统计
 * @returns {Object} 统计信息
 */
function getDecayStats() {
  return {
    config: { ...DEFAULT_DECAY_CONFIG },
    curveTypes: Object.values(DECAY_CURVE_TYPES),
    defaultCurve: DECAY_CURVE_TYPES.EXPONENTIAL,
  };
}

/**
 * 更新衰减配置
 * @param {Object} newConfig - 新配置
 */
function updateDecayConfig(newConfig) {
  Object.assign(DEFAULT_DECAY_CONFIG, newConfig);
}

/**
 * 重置衰减配置为默认值
 */
function resetDecayConfig() {
  Object.assign(DEFAULT_DECAY_CONFIG, {
    news: 12,
    announcement: 120,
    earnings: 720,
    major_event: 48,
    default: 24,
  });
}

/**
 * 计算有效时间窗口
 * @param {string} itemType - 项目类型
 * @param {number} minFactor - 最小衰减因子
 * @returns {number} 有效时间窗口（小时）
 */
function getEffectiveTimeWindow(itemType, minFactor = 0.1) {
  const halfLife = getHalfLife(itemType);
  // 指数衰减：factor = e^(-λt) = minFactor
  // t = -ln(minFactor) / λ = -ln(minFactor) * halfLife / ln(2)
  return -Math.log(minFactor) * halfLife / Math.log(2);
}

module.exports = {
  calculateDecayFactor,
  calculateDecayFactorBatch,
  getHalfLife,
  createDecayCurve,
  getDecayStats,
  updateDecayConfig,
  resetDecayConfig,
  getEffectiveTimeWindow,
  DECAY_CURVE_TYPES,
};
