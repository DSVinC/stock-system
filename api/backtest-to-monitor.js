/**
 * 回测转监控池 API
 * TASK_V3_402
 *
 * 功能：
 * - 读取回测结果
 * - 自动添加到监控池
 * - 标记为"回测推荐"来源
 * - 记录推荐原因（夏普比率、回撤等）
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('./db');

// 缓存文件路径
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const JOINT_OPTIMIZATION_FILE = path.join(CACHE_DIR, 'joint_optimization.json');
const GRID_EXCESS_FILE = path.join(CACHE_DIR, 'grid_excess_return.json');

// 推荐阈值配置
const RECOMMENDATION_THRESHOLDS = {
  minSharpeRatio: 1.0,      // 最低夏普比率
  maxDrawdown: 0.25,        // 最大回撤阈值
  minAnnualizedReturn: 0.10 // 最低年化收益
};

/**
 * 读取联合优化结果
 * @returns {Object|null} 优化结果
 */
function readJointOptimization() {
  try {
    if (!fs.existsSync(JOINT_OPTIMIZATION_FILE)) {
      return null;
    }
    const content = fs.readFileSync(JOINT_OPTIMIZATION_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[backtest-to-monitor] 读取联合优化结果失败:', error.message);
    return null;
  }
}

/**
 * 读取网格超额收益配置
 * @returns {Object|null} 网格配置
 */
function readGridExcessConfig() {
  try {
    if (!fs.existsSync(GRID_EXCESS_FILE)) {
      return null;
    }
    const content = fs.readFileSync(GRID_EXCESS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[backtest-to-monitor] 读取网格配置失败:', error.message);
    return null;
  }
}

/**
 * 评估是否值得推荐到监控池
 * @param {Object} metrics - 绩效指标
 * @returns {Object} 评估结果 { recommend: boolean, reasons: string[] }
 */
function evaluateRecommendation(metrics) {
  const reasons = [];
  let score = 0;

  // 夏普比率评估
  if (metrics.sharpeRatio >= RECOMMENDATION_THRESHOLDS.minSharpeRatio) {
    reasons.push(`夏普比率优秀 (${metrics.sharpeRatio.toFixed(2)})`);
    score += 30;
  } else if (metrics.sharpeRatio >= 0.5) {
    reasons.push(`夏普比率良好 (${metrics.sharpeRatio.toFixed(2)})`);
    score += 15;
  }

  // 最大回撤评估
  if (metrics.maxDrawdown <= RECOMMENDATION_THRESHOLDS.maxDrawdown) {
    reasons.push(`回撤控制良好 (${(metrics.maxDrawdown * 100).toFixed(2)}%)`);
    score += 25;
  }

  // 年化收益评估
  if (metrics.annualizedReturn >= RECOMMENDATION_THRESHOLDS.minAnnualizedReturn) {
    reasons.push(`年化收益达标 (${(metrics.annualizedReturn * 100).toFixed(2)}%)`);
    score += 25;
  }

  // 卡玛比率评估
  if (metrics.calmarRatio >= 3) {
    reasons.push(`卡玛比率优秀 (${metrics.calmarRatio.toFixed(2)})`);
    score += 20;
  }

  return {
    recommend: score >= 40,
    score,
    reasons
  };
}

/**
 * 生成推荐原因描述
 * @param {Object} optimizationResult - 优化结果
 * @param {Object} gridConfig - 网格配置
 * @returns {string} 推荐原因
 */
function generateRecommendationReason(optimizationResult, gridConfig) {
  const { bestAllocation, bestMetrics } = optimizationResult;
  const parts = [];

  parts.push(`联合优化推荐`);
  parts.push(`核心仓${bestAllocation.coreWeightPercent}/卫星仓${bestAllocation.satelliteWeightPercent}`);
  parts.push(`夏普比率${bestMetrics.sharpeRatio.toFixed(2)}`);
  parts.push(`最大回撤${(bestMetrics.maxDrawdown * 100).toFixed(2)}%`);
  parts.push(`年化收益${(bestMetrics.annualizedReturn * 100).toFixed(2)}%`);

  if (gridConfig && gridConfig.grid_config) {
    parts.push(`网格步长${((gridConfig.grid_config.grid_step || 0.012) * 100).toFixed(1)}%`);
  }

  return parts.join(' | ');
}

/**
 * 添加股票到监控池
 * @param {Object} stockData - 股票数据
 * @returns {Promise<Object>} 添加结果
 */
async function addToMonitorPool(stockData) {
  const db = getDatabase();

  // 检查是否已存在
  const existing = await db.getPromise(
    'SELECT id FROM monitor_pool WHERE stock_code = ?',
    [stockData.stock_code]
  );

  if (existing) {
    // 更新推荐信息
    await db.runPromise(`
      UPDATE monitor_pool SET
        updated_at = ?,
        industry_keywords = ?
      WHERE stock_code = ?
    `, [
      new Date().toISOString(),
      JSON.stringify({
        source: 'backtest_recommendation',
        reason: stockData.reason,
        metrics: stockData.metrics,
        allocation: stockData.allocation
      }),
      stockData.stock_code
    ]);

    return { updated: true, stock_code: stockData.stock_code };
  }

  // 插入新记录
  const now = new Date().toISOString();
  await db.runPromise(`
    INSERT INTO monitor_pool (
      stock_code, stock_name, industry_keywords, added_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `, [
    stockData.stock_code,
    stockData.stock_name,
    JSON.stringify({
      source: 'backtest_recommendation',
      reason: stockData.reason,
      metrics: stockData.metrics,
      allocation: stockData.allocation
    }),
    now,
    now
  ]);

  return { added: true, stock_code: stockData.stock_code };
}

// ==================== API 处理函数 ====================

/**
 * 获取回测推荐评估
 * GET /api/backtest-to-monitor/evaluate
 */
async function getBacktestEvaluation(req, res) {
  try {
    const optimization = readJointOptimization();
    const gridConfig = readGridExcessConfig();

    if (!optimization) {
      return res.json({
        success: false,
        error: '未找到回测优化结果'
      });
    }

    const evaluation = evaluateRecommendation(optimization.bestMetrics);

    res.json({
      success: true,
      data: {
        optimization: {
          status: optimization.status,
          bestAllocation: optimization.bestAllocation,
          bestMetrics: optimization.bestMetrics
        },
        gridConfig: gridConfig?.grid_config || null,
        evaluation,
        thresholds: RECOMMENDATION_THRESHOLDS
      }
    });
  } catch (error) {
    console.error('[backtest-to-monitor] 获取评估失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 预览推荐到监控池（不实际添加）
 * POST /api/backtest-to-monitor/preview
 */
async function previewMonitorRecommendation(req, res) {
  try {
    const { stocks } = req.body;

    const optimization = readJointOptimization();
    const gridConfig = readGridExcessConfig();

    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: '未找到回测优化结果'
      });
    }

    const evaluation = evaluateRecommendation(optimization.bestMetrics);
    const reason = generateRecommendationReason(optimization, gridConfig);

    const recommendations = (stocks || []).map(stock => ({
      stock_code: stock.ts_code || stock.stock_code,
      stock_name: stock.stock_name,
      reason,
      metrics: optimization.bestMetrics,
      allocation: optimization.bestAllocation,
      recommend: evaluation.recommend,
      score: evaluation.score
    }));

    res.json({
      success: true,
      data: {
        evaluation,
        recommendations,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[backtest-to-monitor] 预览失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 推荐到监控池
 * POST /api/backtest-to-monitor/recommend
 */
async function recommendToMonitor(req, res) {
  try {
    const { stocks } = req.body;

    if (!Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少股票列表参数'
      });
    }

    const optimization = readJointOptimization();
    const gridConfig = readGridExcessConfig();

    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: '未找到回测优化结果'
      });
    }

    const evaluation = evaluateRecommendation(optimization.bestMetrics);
    const reason = generateRecommendationReason(optimization, gridConfig);

    const results = {
      total: stocks.length,
      added: 0,
      updated: 0,
      failed: 0,
      details: []
    };

    for (const stock of stocks) {
      const stock_code = stock.ts_code || stock.stock_code;
      const stock_name = stock.stock_name;

      try {
        const result = await addToMonitorPool({
          stock_code,
          stock_name,
          reason,
          metrics: optimization.bestMetrics,
          allocation: optimization.bestAllocation
        });

        if (result.added) {
          results.added++;
        } else if (result.updated) {
          results.updated++;
        }

        results.details.push({
          stock_code,
          stock_name,
          status: 'success',
          ...result
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          stock_code,
          stock_name,
          status: 'failed',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        ...results,
        evaluation,
        reason,
        optimizedAt: optimization.timestamp
      }
    });
  } catch (error) {
    console.error('[backtest-to-monitor] 推荐失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取回测推荐的监控池股票
 * GET /api/backtest-to-monitor/recommended
 */
async function getRecommendedStocks(req, res) {
  try {
    const db = getDatabase();

    const stocks = await db.allPromise(`
      SELECT * FROM monitor_pool
      WHERE industry_keywords LIKE '%backtest_recommendation%'
      ORDER BY added_at DESC
    `);

    // 解析推荐信息
    const parsedStocks = stocks.map(stock => {
      let recommendationInfo = {};
      try {
        recommendationInfo = JSON.parse(stock.industry_keywords || '{}');
      } catch (e) {
        // ignore
      }

      return {
        ...stock,
        recommendation_source: recommendationInfo.source,
        recommendation_reason: recommendationInfo.reason,
        recommendation_metrics: recommendationInfo.metrics,
        recommendation_allocation: recommendationInfo.allocation
      };
    });

    res.json({
      success: true,
      data: parsedStocks
    });
  } catch (error) {
    console.error('[backtest-to-monitor] 获取推荐股票失败:', error);
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

  router.get('/evaluate', getBacktestEvaluation);
  router.post('/preview', previewMonitorRecommendation);
  router.post('/recommend', recommendToMonitor);
  router.get('/recommended', getRecommendedStocks);

  return router;
}

module.exports = {
  // 核心函数
  readJointOptimization,
  readGridExcessConfig,
  evaluateRecommendation,
  generateRecommendationReason,
  addToMonitorPool,

  // API 处理函数
  getBacktestEvaluation,
  previewMonitorRecommendation,
  recommendToMonitor,
  getRecommendedStocks,

  // 配置
  RECOMMENDATION_THRESHOLDS,

  // Router
  createRouter
};