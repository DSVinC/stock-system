/**
 * V4 回测决策引擎
 *
 * 功能：
 * - 历史价格批量预加载
 * - 技术指标实时计算（MA、布林带）
 * - 决策单生成
 * - 三层缓存策略
 * - 三级错误处理
 *
 * @version 1.0.0
 * @created 2026-03-26
 */

const { getDatabase } = require('./db');

// ============================================================================
// 自定义错误类型
// ============================================================================

/**
 * 数据不足错误（Level 1: 跳过）
 */
class DataInsufficientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataInsufficientError';
    this.level = 1; // Level 1: 跳过
  }
}

/**
 * 股票停牌错误（Level 1: 跳过）
 */
class StockSuspendedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StockSuspendedError';
    this.level = 1; // Level 1: 跳过
  }
}

/**
 * 系统严重错误（Level 3: 终止）
 */
class CriticalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CriticalError';
    this.level = 3; // Level 3: 终止
  }
}

// ============================================================================
// 策略配置
// ============================================================================

/**
 * 策略类型配置映射
 * - short_term: 短线策略，有效期1天，每日调仓
 * - mid_term: 中线策略，有效期5天，每周调仓
 * - long_term: 长线策略，有效期20天，每月调仓
 */
const STRATEGY_CONFIG = {
  short_term: {
    holding_period: 'short',
    target_price_key: 'target_short',
    valid_days: 1,
    rebalance_frequency: 'daily'
  },
  mid_term: {
    holding_period: 'mid',
    target_price_key: 'target_mid',
    valid_days: 5,
    rebalance_frequency: 'weekly'
  },
  long_term: {
    holding_period: 'long',
    target_price_key: 'target_long',
    valid_days: 20,
    rebalance_frequency: 'monthly'
  }
};

// ============================================================================
// 决策引擎核心类
// ============================================================================

/**
 * 历史决策引擎
 *
 * 用于回测系统中生成历史时点的决策单，避免未来函数问题。
 */
class HistoricalDecisionEngine {
  /**
   * 构造函数
   * @param {Object} config - 配置参数
   * @param {string} config.strategyType - 策略类型：short_term|mid_term|long_term
   */
  constructor(config = {}) {
    this.db = getDatabase();
    this.config = {
      strategyType: config.strategyType || 'short_term',
      ...config
    };

    // 三层缓存
    // L1: 价格缓存 Map<ts_code, Map<tradeDate, close>>
    this.priceCache = new Map();

    // L2: 指标缓存 Map<cacheKey, indicatorValue>
    this.indicatorCache = new Map();

    // L3: 决策缓存 Map<decisionKey, decision>
    this.decisionCache = new Map();

    // 统计信息
    this.stats = {
      preloadCount: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  // ========================================================================
  // TASK_DECISION_002: 价格批量预加载
  // ========================================================================

  /**
   * 批量预加载价格数据
   *
   * 批量查询 stock_daily 表，将价格数据组织为嵌套 Map 结构存入缓存。
   * 这样可以避免回测时对每只股票每个交易日都进行单独查询。
   *
   * @param {string[]} ts_codes - 股票代码数组
   * @param {string} startDate - 开始日期 (YYYY-MM-DD)
   * @param {string} endDate - 结束日期 (YYYY-MM-DD)
   * @returns {Promise<void>}
   */
  async preloadPrices(ts_codes, startDate, endDate) {
    if (!ts_codes || ts_codes.length === 0) {
      console.warn('[决策引擎] 预加载价格数据：股票代码列表为空');
      return;
    }

    const query = `
      SELECT ts_code, trade_date, close
      FROM stock_daily
      WHERE ts_code IN (${ts_codes.map(() => '?').join(',')})
        AND trade_date BETWEEN ? AND ?
      ORDER BY ts_code, trade_date ASC
    `;

    const params = [...ts_codes, startDate, endDate];

    try {
      const rows = await this.db.allPromise(query, params);

      // 组织为 Map<ts_code, Map<tradeDate, close>>
      for (const row of rows) {
        if (!this.priceCache.has(row.ts_code)) {
          this.priceCache.set(row.ts_code, new Map());
        }
        this.priceCache.get(row.ts_code).set(row.trade_date, row.close);
      }

      this.stats.preloadCount += ts_codes.length;
      console.log(`[决策引擎] 预加载完成: ${ts_codes.length} 只股票, ${rows.length} 条价格记录`);

    } catch (error) {
      console.error('[决策引擎] 预加载价格数据失败:', error.message);
      throw new CriticalError(`价格数据预加载失败: ${error.message}`);
    }
  }

  /**
   * 获取历史价格（用于计算技术指标）
   *
   * 优先从缓存获取，缓存未命中则查询数据库。
   *
   * @param {string} ts_code - 股票代码
   * @param {string} tradeDate - 交易日期 (YYYY-MM-DD)
   * @param {number} days - 需要的历史天数
   * @returns {Promise<number[]>} 价格数组（正序，从旧到新）
   */
  async getHistoricalPrices(ts_code, tradeDate, days) {
    // 生成缓存键
    const cacheKey = `prices:${ts_code}:${tradeDate}:${days}`;

    // 检查缓存
    if (this.indicatorCache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.indicatorCache.get(cacheKey);
    }

    this.stats.cacheMisses++;

    // 尝试从预加载的价格缓存获取
    if (this.priceCache.has(ts_code)) {
      const stockPrices = this.priceCache.get(ts_code);
      const prices = [];

      // 获取 tradeDate 之前的所有日期，并排序
      const dates = Array.from(stockPrices.keys())
        .filter(date => date <= tradeDate)
        .sort();

      // 取最近 days 天的数据
      const recentDates = dates.slice(-days);

      if (recentDates.length >= days) {
        for (const date of recentDates) {
          prices.push(stockPrices.get(date));
        }

        // 缓存结果
        this.indicatorCache.set(cacheKey, prices);
        return prices;
      }
    }

    // 缓存未命中，查询数据库
    const query = `
      SELECT close
      FROM stock_daily
      WHERE ts_code = ? AND trade_date <= ?
      ORDER BY trade_date DESC
      LIMIT ?
    `;

    try {
      const rows = await this.db.allPromise(query, [ts_code, tradeDate, days]);
      const prices = rows.map(r => r.close).reverse(); // 转为正序

      // 缓存结果
      this.indicatorCache.set(cacheKey, prices);
      return prices;

    } catch (error) {
      console.error(`[决策引擎] 获取历史价格失败: ${ts_code} @ ${tradeDate}`, error.message);
      throw new CriticalError(`获取历史价格失败: ${error.message}`);
    }
  }

  // ========================================================================
  // TASK_DECISION_003: MA 实时计算
  // ========================================================================

  /**
   * 计算简单移动平均线 (MA)
   *
   * MA = n 日收盘价之和 / n
   *
   * @param {string} ts_code - 股票代码
   * @param {string} tradeDate - 交易日期 (YYYY-MM-DD)
   * @param {number} days - MA 周期
   * @returns {Promise<number>} MA 值
   * @throws {DataInsufficientError} 数据不足时抛出
   */
  async calculateMA(ts_code, tradeDate, days) {
    // 生成缓存键
    const cacheKey = `ma:${ts_code}:${tradeDate}:${days}`;

    // 检查缓存
    if (this.indicatorCache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.indicatorCache.get(cacheKey);
    }

    this.stats.cacheMisses++;

    // 获取历史价格
    const prices = await this.getHistoricalPrices(ts_code, tradeDate, days);

    // 检查数据是否充足
    if (prices.length < days) {
      throw new DataInsufficientError(
        `${ts_code} 在 ${tradeDate} 前只有 ${prices.length} 天数据，需要 ${days} 天`
      );
    }

    // 计算 MA
    const sum = prices.reduce((acc, price) => acc + price, 0);
    const ma = sum / days;

    // 缓存结果
    this.indicatorCache.set(cacheKey, ma);

    return ma;
  }

  /**
   * 批量计算多个周期的 MA
   *
   * @param {string} ts_code - 股票代码
   * @param {string} tradeDate - 交易日期
   * @param {number[]} periods - 周期数组，如 [5, 10, 20, 60]
   * @returns {Promise<Object>} MA 值对象，如 { ma5: 10.5, ma10: 10.2, ... }
   */
  async calculateMAs(ts_code, tradeDate, periods) {
    const result = {};

    for (const period of periods) {
      try {
        result[`ma${period}`] = await this.calculateMA(ts_code, tradeDate, period);
      } catch (error) {
        if (error instanceof DataInsufficientError) {
          console.warn(`[决策引擎] ${error.message}`);
          result[`ma${period}`] = null;
        } else {
          throw error;
        }
      }
    }

    return result;
  }

  // ========================================================================
  // TASK_DECISION_004: 布林带实时计算
  // ========================================================================

  /**
   * 计算布林带 (Bollinger Bands)
   *
   * 布林带由三条轨道线组成：
   * - 中轨 = N 日移动平均线
   * - 上轨 = 中轨 + K × 标准差（默认 K=2）
   * - 下轨 = 中轨 - K × 标准差（默认 K=2）
   *
   * @param {string} ts_code - 股票代码
   * @param {string} tradeDate - 交易日期 (YYYY-MM-DD)
   * @param {number} period - 周期，默认 20
   * @param {number} stdDevMultiplier - 标准差倍数，默认 2
   * @returns {Promise<Object>} 布林带对象 { upper, middle, lower }
   * @throws {DataInsufficientError} 数据不足时抛出
   */
  async calculateBollinger(ts_code, tradeDate, period = 20, stdDevMultiplier = 2) {
    // 生成缓存键
    const cacheKey = `bollinger:${ts_code}:${tradeDate}:${period}`;

    // 检查缓存
    if (this.indicatorCache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.indicatorCache.get(cacheKey);
    }

    this.stats.cacheMisses++;

    // 获取历史价格
    const prices = await this.getHistoricalPrices(ts_code, tradeDate, period);

    // 检查数据是否充足
    if (prices.length < period) {
      throw new DataInsufficientError(
        `${ts_code} 在 ${tradeDate} 前只有 ${prices.length} 天数据，计算布林带需要 ${period} 天`
      );
    }

    // 计算中轨（MA）
    const middle = prices.reduce((acc, price) => acc + price, 0) / period;

    // 计算标准差
    // 公式：σ = √(Σ(xi - μ)² / n)
    const variance = prices.reduce((acc, price) => {
      return acc + Math.pow(price - middle, 2);
    }, 0) / period;
    const stdDev = Math.sqrt(variance);

    // 计算上轨和下轨
    const upper = middle + stdDevMultiplier * stdDev;
    const lower = middle - stdDevMultiplier * stdDev;

    const result = {
      upper: Math.round(upper * 100) / 100,  // 保留两位小数
      middle: Math.round(middle * 100) / 100,
      lower: Math.round(lower * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100
    };

    // 缓存结果
    this.indicatorCache.set(cacheKey, result);

    return result;
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /**
   * 获取指定日期的价格数据
   *
   * @param {string} ts_code - 股票代码
   * @param {string} tradeDate - 交易日期
   * @returns {Promise<Object|null>} 当日数据或 null（停牌）
   */
  async getDayData(ts_code, tradeDate) {
    // 尝试从缓存获取
    if (this.priceCache.has(ts_code)) {
      const stockPrices = this.priceCache.get(ts_code);
      const close = stockPrices.get(tradeDate);
      if (close !== undefined && close > 0) {
        return { ts_code, trade_date: tradeDate, close };
      }
    }

    // 查询数据库
    const query = `
      SELECT ts_code, trade_date, close, open, high, low, volume
      FROM stock_daily
      WHERE ts_code = ? AND trade_date = ?
    `;

    try {
      const row = await this.db.getPromise(query, [ts_code, tradeDate]);
      return row || null;
    } catch (error) {
      console.error(`[决策引擎] 获取日数据失败: ${ts_code} @ ${tradeDate}`, error.message);
      return null;
    }
  }

  /**
   * 获取指定股票的历史价格数量
   *
   * @param {string} ts_code - 股票代码
   * @param {string} tradeDate - 交易日期
   * @returns {Promise<number>} 历史价格数量
   */
  async getPriceCount(ts_code, tradeDate) {
    // 从缓存估算
    if (this.priceCache.has(ts_code)) {
      const stockPrices = this.priceCache.get(ts_code);
      const count = Array.from(stockPrices.keys()).filter(date => date <= tradeDate).length;
      return count;
    }

    // 查询数据库
    const query = `
      SELECT COUNT(*) as count
      FROM stock_daily
      WHERE ts_code = ? AND trade_date <= ?
    `;

    try {
      const row = await this.db.getPromise(query, [ts_code, tradeDate]);
      return row ? row.count : 0;
    } catch (error) {
      console.error(`[决策引擎] 获取价格数量失败: ${ts_code} @ ${tradeDate}`, error.message);
      return 0;
    }
  }

  /**
   * 计算建议仓位
   *
   * 根据七因子评分决定建议仓位比例：
   * - >= 0.85: 40%
   * - >= 0.75: 30%
   * - >= 0.65: 20%
   * - < 0.65: 10%
   *
   * @param {number} sevenFactorScore - 七因子评分 (0-1)
   * @returns {number} 建议仓位 (0-1)
   */
  calculatePosition(sevenFactorScore) {
    if (sevenFactorScore >= 0.85) return 0.40;
    if (sevenFactorScore >= 0.75) return 0.30;
    if (sevenFactorScore >= 0.65) return 0.20;
    return 0.10;
  }

  // ========================================================================
  // TASK_DECISION_005: 决策单生成逻辑
  // ========================================================================

  /**
   * 生成决策单
   *
   * 核心方法：根据股票代码、交易日期和快照数据生成完整的决策单。
   * 决策单包含：建仓区间、止损价、止盈价、建议仓位、有效期等。
   *
   * @param {string} ts_code - 股票代码
   * @param {string} tradeDate - 交易日期 (YYYY-MM-DD)
   * @param {Object} snapshot - 快照数据（七因子评分、估值数据等）
   * @returns {Promise<Object|null>} 决策单对象或 null（跳过时）
   * @throws {CriticalError} 系统严重错误时抛出
   */
  async generateDecision(ts_code, tradeDate, snapshot) {
    // 检查决策缓存
    const cacheKey = this.generateDecisionKey(ts_code, tradeDate);
    if (this.decisionCache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.decisionCache.get(cacheKey);
    }

    this.stats.cacheMisses++;

    try {
      // ============================================================
      // 步骤 1: 检查数据完整性
      // ============================================================
      const priceCount = await this.getPriceCount(ts_code, tradeDate);
      if (priceCount < 60) {
        throw new DataInsufficientError(
          `${ts_code} 在 ${tradeDate} 前只有 ${priceCount} 天数据，需要 60 天`
        );
      }

      // ============================================================
      // 步骤 2: 检查是否停牌
      // ============================================================
      const dayData = await this.getDayData(ts_code, tradeDate);
      if (!dayData || dayData.close === 0) {
        throw new StockSuspendedError(`${ts_code} 在 ${tradeDate} 停牌`);
      }

      const close = dayData.close;

      // ============================================================
      // 步骤 3: 实时计算技术指标（MA10/20/60、布林带）
      // ============================================================
      const ma10 = await this.calculateMA(ts_code, tradeDate, 10);
      const ma20 = await this.calculateMA(ts_code, tradeDate, 20);
      const ma60 = await this.calculateMA(ts_code, tradeDate, 60);
      const bollinger = await this.calculateBollinger(ts_code, tradeDate, 20);

      // ============================================================
      // 步骤 4: 计算决策价格
      // ============================================================
      // 建仓价：在均线和折扣价中取较低值
      const entryPrice1 = Math.min(ma10, close * 0.98);
      const entryPrice2 = Math.min(ma20, close * 0.95);

      // 止损价：MA60 作为支撑位，但不得高于当前价的 92%（确保止损价低于现价）
      const stopLoss = Math.min(ma60, close * 0.92);

      // 止盈价：根据不同持有周期计算
      const targetShort = Math.max(close * 1.05, ma10);
      const targetMid = Math.max(close * 1.10, ma20);
      const targetLong = Math.max(close * 1.18, bollinger.upper);

      // ============================================================
      // 步骤 5: 计算建议仓位（基于七因子评分）
      // ============================================================
      const sevenFactorScore = snapshot?.seven_factor_score ?? 0.5;
      const positionSuggest = this.calculatePosition(sevenFactorScore);

      // ============================================================
      // 步骤 6: 生成决策单 JSON 结构
      // ============================================================
      const decision = {
        ts_code,
        tradeDate,
        decision: sevenFactorScore >= 0.75 ? 'buy' : 'hold',
        entry_zone: [
          Math.round(entryPrice1 * 100) / 100,
          Math.round(entryPrice2 * 100) / 100
        ],
        stop_loss: Math.round(stopLoss * 100) / 100,
        target_prices: {
          short: Math.round(targetShort * 100) / 100,
          mid: Math.round(targetMid * 100) / 100,
          long: Math.round(targetLong * 100) / 100
        },
        position_suggest: positionSuggest,
        valid_until: this.calculateValidUntil(tradeDate),
        seven_factor_score: sevenFactorScore,
        technical_snapshot: {
          ma10: Math.round(ma10 * 100) / 100,
          ma20: Math.round(ma20 * 100) / 100,
          ma60: Math.round(ma60 * 100) / 100,
          bollinger: {
            upper: bollinger.upper,
            middle: bollinger.middle,
            lower: bollinger.lower
          }
        },
        valuation_snapshot: {
          pe: snapshot?.pe_ttm ?? null,
          pb: snapshot?.pb ?? null,
          peg: snapshot?.peg ?? null
        }
      };

      // 缓存决策单
      this.decisionCache.set(cacheKey, decision);
      console.log(`[决策引擎] 生成决策单: ${ts_code} @ ${tradeDate} → ${decision.decision}`);

      return decision;

    } catch (error) {
      // ============================================================
      // 错误处理（三级策略）
      // ============================================================
      if (error.level === 1) {
        // Level 1（数据不足/停牌）：记录警告，返回 null（跳过）
        console.warn(`[决策引擎] ${error.message}`);
        return null;
      } else {
        // Level 3（系统错误）：抛出错误，终止回测
        console.error(`[决策引擎] 严重错误: ${error.message}`);
        throw error;
      }
    }
  }

  // ========================================================================
  // TASK_DECISION_006: 有效期计算
  // ========================================================================

  /**
   * 计算决策单有效期
   *
   * 根据策略类型计算有效期：
   * - short_term: 1 天（每日调仓）
   * - mid_term: 5 天（每周调仓）
   * - long_term: 20 天（每月调仓）
   *
   * @param {string} tradeDate - 交易日期 (YYYY-MM-DD)
   * @returns {string} 有效期截止日期 (YYYY-MM-DD)
   */
  calculateValidUntil(tradeDate) {
    const config = STRATEGY_CONFIG[this.config.strategyType];
    const date = new Date(tradeDate);
    date.setDate(date.getDate() + config.valid_days);
    return date.toISOString().split('T')[0];
  }

  // ========================================================================
  // TASK_DECISION_007: 三层缓存机制
  // ========================================================================

  /**
   * 生成决策缓存键
   *
   * 缓存键格式：decision:ts_code:tradeDate:strategyType
   *
   * @param {string} ts_code - 股票代码
   * @param {string} tradeDate - 交易日期
   * @returns {string} 缓存键
   */
  generateDecisionKey(ts_code, tradeDate) {
    return `decision:${ts_code}:${tradeDate}:${this.config.strategyType}`;
  }

  // ========================================================================
  // 缓存管理
  // ========================================================================

  /**
   * 清空所有缓存
   *
   * 清空三层缓存：
   * - L1: priceCache - 价格缓存
   * - L2: indicatorCache - 指标缓存
   * - L3: decisionCache - 决策缓存
   */
  clearCache() {
    this.priceCache.clear();
    this.indicatorCache.clear();
    this.decisionCache.clear();
    this.stats = {
      preloadCount: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    console.log('[决策引擎] 缓存已清空');
  }

  /**
   * 获取缓存统计信息
   *
   * @returns {Object} 统计信息对象
   * @property {number} preloadCount - 预加载数量
   * @property {number} cacheHits - 缓存命中次数
   * @property {number} cacheMisses - 缓存未命中次数
   * @property {string} cacheHitRate - 缓存命中率
   * @property {number} priceCacheSize - L1 价格缓存大小
   * @property {number} indicatorCacheSize - L2 指标缓存大小
   * @property {number} decisionCacheSize - L3 决策缓存大小
   */
  getCacheStats() {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    return {
      preloadCount: this.stats.preloadCount,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      cacheHitRate: total > 0 ? (this.stats.cacheHits / total).toFixed(2) : 0,
      priceCacheSize: this.priceCache.size,
      indicatorCacheSize: this.indicatorCache.size,
      decisionCacheSize: this.decisionCache.size
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  HistoricalDecisionEngine,
  DataInsufficientError,
  StockSuspendedError,
  CriticalError,
  STRATEGY_CONFIG
};