/**
 * API 模块：决策引擎 (decision.js)
 *
 * TASK_API_002: 实现决策 API
 *
 * 职责：基于因子快照和技术指标生成投资决策单
 * - 生成建仓区间
 * - 计算止损价
 * - 计算止盈目标
 * - 建议仓位比例
 * - 有效期管理
 *
 * 主要接口：
 * - POST /api/decision/generate - 生成决策单
 * - GET /api/decision/config - 获取决策配置
 *
 * 依赖：backtest-decision.js (HistoricalDecisionEngine)
 */

const express = require('express');
const { getDatabase } = require('./db');
const { HistoricalDecisionEngine, STRATEGY_CONFIG } = require('./backtest-decision');

const router = express.Router();

// ============================================================================
// POST /api/decision/generate - 生成决策单
// ============================================================================

/**
 * 生成投资决策单
 *
 * 请求体:
 * {
 *   "ts_codes": ["000001.SZ", "000002.SZ"],
 *   "date": "2024-01-15",
 *   "strategy_type": "short_term"  // 可选：short_term|mid_term|long_term
 * }
 *
 * 返回:
 * {
 *   "decisions": [
 *     {
 *       "ts_code": "000001.SZ",
 *       "tradeDate": "2024-01-15",
 *       "decision": "buy",
 *       "entry_zone": [12.50, 12.30],
 *       "stop_loss": 11.80,
 *       "target_prices": { short: 13.50, mid: 14.20, long: 15.00 },
 *       "position_suggest": 0.25,
 *       "valid_until": "2024-01-16",
 *       "technical_snapshot": { ma10: 12.80, ma20: 12.50, ma60: 11.90 }
 *     }
 *   ]
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    const { ts_codes, date, strategy_type = 'short_term' } = req.body;

    // 参数验证
    if (!ts_codes || !Array.isArray(ts_codes) || ts_codes.length === 0) {
      return res.status(400).json({
        success: false,
        error: '必须提供 ts_codes 数组参数'
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        error: '必须提供 date 参数'
      });
    }

    // 验证日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        error: '日期格式必须为 YYYY-MM-DD'
      });
    }

    // 验证策略类型
    const validStrategyTypes = ['short_term', 'mid_term', 'long_term'];
    if (!validStrategyTypes.includes(strategy_type)) {
      return res.status(400).json({
        success: false,
        error: `strategy_type 必须是: ${validStrategyTypes.join(', ')}`
      });
    }

    console.log(`[决策API] 生成决策单: ${ts_codes.length} 只股票, 日期: ${date}, 策略: ${strategy_type}`);

    const db = getDatabase();
    const decisionEngine = new HistoricalDecisionEngine({ strategyType: strategy_type });

    // 预加载价格数据（用于计算技术指标）
    const dateDb = date.replace(/-/g, '');
    const startDate = getDateBefore(date, 70); // 预加载70天数据用于MA60

    // 转换股票代码格式
    const dbCodes = ts_codes.map(code => convertToDbCode(code));

    await decisionEngine.preloadPrices(dbCodes, startDate, date);

    // 获取股票基本信息
    const stockNames = await getStockNames(db, dbCodes);

    // 获取快照数据
    const snapshots = await getSnapshots(db, dbCodes, dateDb);

    // 生成决策单
    const decisions = [];

    for (let i = 0; i < ts_codes.length; i++) {
      const ts_code = ts_codes[i];
      const dbCode = dbCodes[i];
      const snapshot = snapshots[dbCode] || {};

      try {
        const decision = await decisionEngine.generateDecision(
          ts_code,
          date,
          {
            seven_factor_score: snapshot.seven_factor_score || 0.5,
            pe_ttm: snapshot.pe_ttm,
            pb: snapshot.pb,
            peg: snapshot.peg
          }
        );

        if (decision) {
          decisions.push({
            ...decision,
            name: stockNames[dbCode] || ts_code
          });
        } else {
          // 决策引擎返回 null（数据不足或停牌）
          decisions.push({
            ts_code,
            name: stockNames[dbCode] || ts_code,
            tradeDate: date,
            decision: 'skip',
            reason: '数据不足或停牌',
            seven_factor_score: snapshot.seven_factor_score || null
          });
        }
      } catch (error) {
        console.warn(`[决策API] 生成决策失败: ${ts_code}`, error.message);
        decisions.push({
          ts_code,
          name: stockNames[dbCode] || ts_code,
          tradeDate: date,
          decision: 'error',
          reason: error.message
        });
      }
    }

    // 获取缓存统计
    const cacheStats = decisionEngine.getCacheStats();

    console.log(`[决策API] 生成完成: ${decisions.length} 个决策, 缓存命中率: ${cacheStats.cacheHitRate}`);

    res.json({
      success: true,
      data: {
        tradeDate: date,
        strategyType: strategy_type,
        decisions,
        cacheStats
      }
    });

  } catch (error) {
    console.error('[决策API] 生成失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET /api/decision/config - 获取决策配置
// ============================================================================

/**
 * 获取决策引擎配置信息
 */
router.get('/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        strategyTypes: Object.keys(STRATEGY_CONFIG).map(key => ({
          type: key,
          ...STRATEGY_CONFIG[key]
        })),
        positionRules: [
          { minScore: 0.85, position: 0.40, description: '高分股票，建议重仓' },
          { minScore: 0.75, position: 0.30, description: '中高评分，建议标准仓' },
          { minScore: 0.65, position: 0.20, description: '中等评分，建议轻仓' },
          { minScore: 0.00, position: 0.10, description: '低评分，建议观察仓' }
        ],
        entryZoneFormula: '建仓价 = min(MA10, close×0.98)',
        stopLossFormula: '止损价 = MA60',
        targetPriceFormula: {
          short: 'max(close×1.05, MA10)',
          mid: 'max(close×1.10, MA20)',
          long: 'max(close×1.18, bollinger_upper)'
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 转换股票代码格式
 * 000001.SZ -> sz.000001
 */
function convertToDbCode(tsCode) {
  if (!tsCode) return tsCode;
  if (tsCode.includes('.')) {
    const [code, market] = tsCode.split('.');
    const marketLower = market.toLowerCase();
    return `${marketLower}.${code}`;
  }
  return tsCode;
}

/**
 * 获取指定日期之前的日期
 */
function getDateBefore(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

/**
 * 批量获取股票名称
 */
async function getStockNames(db, dbCodes) {
  const names = {};
  try {
    const placeholders = dbCodes.map(() => '?').join(',');
    const rows = await db.allPromise(`
      SELECT ts_code, stock_name
      FROM stock_list
      WHERE ts_code IN (${placeholders})
    `, dbCodes);

    for (const row of rows) {
      names[row.ts_code] = row.stock_name;
    }
  } catch (error) {
    console.warn('[决策API] 获取股票名称失败:', error.message);
  }
  return names;
}

/**
 * 批量获取快照数据
 */
async function getSnapshots(db, dbCodes, dateDb) {
  const snapshots = {};
  try {
    const placeholders = dbCodes.map(() => '?').join(',');
    const rows = await db.allPromise(`
      SELECT ts_code, seven_factor_score, pe_ttm, pb
      FROM stock_factor_snapshot
      WHERE ts_code IN (${placeholders}) AND trade_date = ?
    `, [...dbCodes, dateDb]);

    for (const row of rows) {
      snapshots[row.ts_code] = {
        seven_factor_score: row.seven_factor_score,
        pe_ttm: row.pe_ttm,
        pb: row.pb
      };
    }
  } catch (error) {
    console.warn('[决策API] 获取快照数据失败:', error.message);
  }
  return snapshots;
}

// ============================================================================
// 导出
// ============================================================================

module.exports = router;