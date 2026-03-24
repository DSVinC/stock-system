/**
 * 回测结果缓存模块
 * TASK_V3_103: 实现回测结果的缓存机制
 *
 * 功能：
 * - 使用 MD5 哈希生成缓存键
 * - 缓存命中检查
 * - 缓存过期策略（默认 7 天）
 * - 缓存清理
 */

const crypto = require('crypto');
const { getDatabase } = require('./db');

// 默认缓存过期天数
const DEFAULT_EXPIRE_DAYS = 7;

/**
 * 生成缓存键
 * @param {Object} strategyConfig - 策略配置
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 * @returns {string} 缓存键
 */
function generateCacheKey(strategyConfig, startDate, endDate) {
  // 标准化策略配置，确保相同配置生成相同键
  const normalizedConfig = normalizeConfig(strategyConfig);

  const hash = crypto.createHash('md5')
    .update(JSON.stringify(normalizedConfig))
    .update(startDate)
    .update(endDate)
    .digest('hex');

  return `backtest:${hash}`;
}

/**
 * 标准化策略配置
 * @param {Object} config - 原始配置
 * @returns {Object} 标准化后的配置
 */
function normalizeConfig(config) {
  // 移除不影响回测结果的字段，按字母排序键
  const sorted = {};
  Object.keys(config).sort().forEach(key => {
    const value = config[key];
    if (value !== undefined && value !== null) {
      sorted[key] = value;
    }
  });
  return sorted;
}

/**
 * 计算过期时间
 * @param {number} days - 过期天数
 * @returns {string} ISO 格式的过期时间
 */
function calculateExpireTime(days = DEFAULT_EXPIRE_DAYS) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/**
 * 检查缓存是否存在且未过期
 * @param {string} cacheKey - 缓存键
 * @returns {Promise<Object|null>} 缓存结果或 null
 */
async function getCache(cacheKey) {
  const db = getDatabase();

  const row = await db.getPromise(
    `SELECT id, cache_key, result_json, hit_count, expires_at, created_at
     FROM backtest_cache
     WHERE cache_key = ?`,
    [cacheKey]
  );

  if (!row) {
    return null;
  }

  // 检查是否过期
  if (row.expires_at) {
    const expireTime = new Date(row.expires_at);
    if (expireTime < new Date()) {
      // 缓存已过期，删除
      await deleteCache(cacheKey);
      return null;
    }
  }

  // 更新命中次数
  await db.runPromise(
    `UPDATE backtest_cache SET hit_count = hit_count + 1 WHERE cache_key = ?`,
    [cacheKey]
  );

  // 记录命中统计
  await db.runPromise(
    `INSERT INTO backtest_cache_stats (cache_key) VALUES (?)`,
    [cacheKey]
  ).catch(() => {}); // 忽略统计记录失败

  return {
    id: row.id,
    cacheKey: row.cache_key,
    result: JSON.parse(row.result_json),
    hitCount: row.hit_count + 1,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

/**
 * 设置缓存
 * @param {string} cacheKey - 缓存键
 * @param {Object} strategyConfig - 策略配置
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 * @param {Object} result - 回测结果
 * @param {number} expireDays - 过期天数
 * @returns {Promise<void>}
 */
async function setCache(cacheKey, strategyConfig, startDate, endDate, result, expireDays = DEFAULT_EXPIRE_DAYS) {
  const db = getDatabase();
  const expiresAt = calculateExpireTime(expireDays);

  await db.runPromise(
    `INSERT OR REPLACE INTO backtest_cache
     (cache_key, strategy_config, start_date, end_date, result_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      cacheKey,
      JSON.stringify(strategyConfig),
      startDate,
      endDate,
      JSON.stringify(result),
      expiresAt
    ]
  );
}

/**
 * 删除缓存
 * @param {string} cacheKey - 缓存键
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteCache(cacheKey) {
  const db = getDatabase();

  const result = await db.runPromise(
    `DELETE FROM backtest_cache WHERE cache_key = ?`,
    [cacheKey]
  );

  // 同时删除相关统计记录
  await db.runPromise(
    `DELETE FROM backtest_cache_stats WHERE cache_key = ?`,
    [cacheKey]
  ).catch(() => {});

  return result.changes > 0;
}

/**
 * 清理过期缓存
 * @returns {Promise<number>} 清理的缓存数量
 */
async function cleanupExpiredCache() {
  const db = getDatabase();
  const now = new Date().toISOString();

  // 先删除过期缓存的统计记录
  await db.runPromise(
    `DELETE FROM backtest_cache_stats
     WHERE cache_key IN (
       SELECT cache_key FROM backtest_cache WHERE expires_at < ?
     )`,
    [now]
  ).catch(() => {});

  // 删除过期缓存
  const result = await db.runPromise(
    `DELETE FROM backtest_cache WHERE expires_at < ?`,
    [now]
  );

  return result.changes;
}

/**
 * 清理所有缓存
 * @returns {Promise<number>} 清理的缓存数量
 */
async function clearAllCache() {
  const db = getDatabase();

  // 先获取数量
  const countRow = await db.getPromise(`SELECT COUNT(*) as count FROM backtest_cache`);
  const count = countRow ? countRow.count : 0;

  // 删除所有缓存
  await db.runPromise(`DELETE FROM backtest_cache`);
  await db.runPromise(`DELETE FROM backtest_cache_stats`);

  return count;
}

/**
 * 获取缓存统计信息
 * @returns {Promise<Object>} 统计信息
 */
async function getCacheStats() {
  const db = getDatabase();

  const stats = await db.getPromise(`
    SELECT
      COUNT(*) as total_count,
      SUM(hit_count) as total_hits,
      AVG(hit_count) as avg_hits
    FROM backtest_cache
  `);

  const expiredCount = await db.getPromise(`
    SELECT COUNT(*) as count FROM backtest_cache
    WHERE expires_at < datetime('now')
  `);

  const recentHits = await db.allPromise(`
    SELECT cache_key, hit_count, created_at, expires_at
    FROM backtest_cache
    ORDER BY hit_count DESC
    LIMIT 10
  `);

  return {
    totalCaches: stats.total_count || 0,
    totalHits: stats.total_hits || 0,
    averageHits: stats.avg_hits || 0,
    expiredCount: expiredCount.count || 0,
    topCaches: recentHits.map(row => ({
      cacheKey: row.cache_key,
      hitCount: row.hit_count,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    }))
  };
}

/**
 * 获取缓存列表
 * @param {Object} options - 查询选项
 * @returns {Promise<Array>} 缓存列表
 */
async function getCacheList(options = {}) {
  const db = getDatabase();
  const { limit = 50, offset = 0, includeExpired = false } = options;

  let whereClause = '';
  if (!includeExpired) {
    whereClause = "WHERE expires_at IS NULL OR expires_at >= datetime('now')";
  }

  const rows = await db.allPromise(
    `SELECT
      id, cache_key, start_date, end_date,
      hit_count, created_at, expires_at,
      LENGTH(result_json) as result_size
    FROM backtest_cache
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  return rows.map(row => ({
    id: row.id,
    cacheKey: row.cache_key,
    startDate: row.start_date,
    endDate: row.end_date,
    hitCount: row.hit_count,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resultSize: row.result_size
  }));
}

/**
 * 带缓存的回测执行
 * @param {Function} backtestFn - 回测函数
 * @param {Object} params - 回测参数
 * @returns {Promise<Object>} 回测结果
 */
async function runWithCache(backtestFn, params) {
  const { startDate, endDate, strategyConfig = {} } = params;

  // 生成缓存键
  const cacheKey = generateCacheKey(strategyConfig, startDate, endDate);

  // 尝试从缓存获取
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`[缓存] 命中: ${cacheKey}`);
    return {
      ...cached.result,
      _cached: true,
      _cacheKey: cacheKey,
      _hitCount: cached.hitCount
    };
  }

  // 执行回测
  console.log(`[缓存] 未命中，执行回测: ${cacheKey}`);
  const result = await backtestFn(params);

  // 存储结果到缓存
  await setCache(cacheKey, strategyConfig, startDate, endDate, result);

  return {
    ...result,
    _cached: false,
    _cacheKey: cacheKey
  };
}

// ==================== API 处理函数 ====================

/**
 * 查询缓存 API
 */
async function handleGetCache(req, res) {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: '缺少缓存键'
      });
    }

    const cacheKey = key.startsWith('backtest:') ? key : `backtest:${key}`;
    const cached = await getCache(cacheKey);

    if (!cached) {
      return res.json({
        success: false,
        error: '缓存不存在或已过期'
      });
    }

    res.json({
      success: true,
      data: cached
    });
  } catch (error) {
    console.error('[缓存API] 查询失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 删除缓存 API
 */
async function handleDeleteCache(req, res) {
  try {
    const { key } = req.params;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: '缺少缓存键'
      });
    }

    const cacheKey = key.startsWith('backtest:') ? key : `backtest:${key}`;
    const deleted = await deleteCache(cacheKey);

    res.json({
      success: true,
      deleted,
      message: deleted ? '缓存已删除' : '缓存不存在'
    });
  } catch (error) {
    console.error('[缓存API] 删除失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 清理过期缓存 API
 */
async function handleCleanupCache(req, res) {
  try {
    const count = await cleanupExpiredCache();

    res.json({
      success: true,
      cleanedCount: count,
      message: `已清理 ${count} 个过期缓存`
    });
  } catch (error) {
    console.error('[缓存API] 清理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取缓存统计 API
 */
async function handleGetStats(req, res) {
  try {
    const stats = await getCacheStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[缓存API] 获取统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取缓存列表 API
 */
async function handleGetList(req, res) {
  try {
    const { limit, offset, includeExpired } = req.query;

    const list = await getCacheList({
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      includeExpired: includeExpired === 'true'
    });

    res.json({
      success: true,
      data: list
    });
  } catch (error) {
    console.error('[缓存API] 获取列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 清空所有缓存 API
 */
async function handleClearAll(req, res) {
  try {
    const count = await clearAllCache();

    res.json({
      success: true,
      clearedCount: count,
      message: `已清空 ${count} 个缓存`
    });
  } catch (error) {
    console.error('[缓存API] 清空失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  // 核心函数
  generateCacheKey,
  getCache,
  setCache,
  deleteCache,
  cleanupExpiredCache,
  clearAllCache,
  getCacheStats,
  getCacheList,
  runWithCache,

  // API 处理函数
  handleGetCache,
  handleDeleteCache,
  handleCleanupCache,
  handleGetStats,
  handleGetList,
  handleClearAll
};