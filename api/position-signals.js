/**
 * Position Signals Module
 * Task: TASK_POSITION_MONITOR_002
 *
 * Generates trading signals based on:
 * - 7-factor score changes (↓30% = SELL/HIGH, ↓15% = WARNING/MEDIUM)
 * - Negative news count (≥3 = SELL/HIGH)
 * - Black swan events (any = SELL/HIGH)
 */

const { getDatabase } = require('./db');

/**
 * Generate signals for a holding
 * @param {Object} holding - Position data
 * @param {Object} currentFactors - Current 7-factor scores
 * @param {Object} historicalFactors - Previous 7-factor scores
 * @param {Object} news - News data (negativeCount, blackSwanEvents)
 * @returns {Array} Array of signals
 */
function generateSignals(holding, currentFactors, historicalFactors, news) {
  const signals = [];
  
  // Rule 1: 7-factor score drop
  if (historicalFactors.total > 0) {
    const scoreDrop = (historicalFactors.total - currentFactors.total) / historicalFactors.total;
    
    if (scoreDrop > 0.3) {
      signals.push({
        type: 'SELL',
        level: 'HIGH',
        reason: `7 因子评分大幅下降 ${(scoreDrop * 100).toFixed(1)}%`,
        factor_score_before: historicalFactors.total,
        factor_score_after: currentFactors.total,
        score_drop_rate: scoreDrop
      });
    } else if (scoreDrop > 0.15) {
      signals.push({
        type: 'WARNING',
        level: 'MEDIUM',
        reason: `7 因子评分下降 ${(scoreDrop * 100).toFixed(1)}%`,
        factor_score_before: historicalFactors.total,
        factor_score_after: currentFactors.total,
        score_drop_rate: scoreDrop
      });
    }
  }
  
  // Rule 2: Black swan events
  if (news.blackSwanEvents && news.blackSwanEvents.length > 0) {
    signals.push({
      type: 'SELL',
      level: 'HIGH',
      reason: `黑天鹅事件：${news.blackSwanEvents.join(', ')}`,
      black_swan_events: JSON.stringify(news.blackSwanEvents)
    });
  }
  
  // Rule 3: Negative news count
  if (news.negativeCount >= 3) {
    signals.push({
      type: 'SELL',
      level: 'HIGH',
      reason: `负面新闻过多 (${news.negativeCount}条)`,
      negative_news_count: news.negativeCount
    });
  } else if (news.negativeCount >= 1) {
    signals.push({
      type: 'WARNING',
      level: 'LOW',
      reason: `负面新闻 (${news.negativeCount}条)`,
      negative_news_count: news.negativeCount
    });
  }
  
  // Add holding info to all signals
  signals.forEach(signal => {
    signal.account_id = holding.account_id;
    signal.ts_code = holding.ts_code;
    signal.stock_name = holding.stock_name;
  });
  
  return signals;
}

/**
 * Save signals to database
 * @param {Array} signals - Array of signals
 */
async function saveSignals(signals) {
  if (signals.length === 0) return;

  const db = await getDatabase();
  const now = new Date().toISOString();

  for (const signal of signals) {
    await db.runPromise(`
      INSERT INTO position_signals
      (account_id, ts_code, stock_name, signal_type, signal_level, reason,
       factor_score_before, factor_score_after, score_drop_rate,
       negative_news_count, black_swan_events, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      signal.account_id,
      signal.ts_code,
      signal.stock_name,
      signal.type,
      signal.level,
      signal.reason,
      signal.factor_score_before || null,
      signal.factor_score_after || null,
      signal.score_drop_rate || null,
      signal.negative_news_count || null,
      signal.black_swan_events || null,
      now
    ]);
  }
}

/**
 * Get unread signals for an account
 */
async function getUnreadSignals(accountId) {
  const db = await getDatabase();
  return await db.allPromise(`
    SELECT * FROM position_signals
    WHERE account_id = ? AND is_read = 0
    ORDER BY created_at DESC
  `, [accountId]);
}

/**
 * Get signals with filters
 */
async function getSignals(options = {}) {
  const {
    tsCode,
    accountId,
    signalType,
    signalLevel,
    limit = 50,
    offset = 0,
    startDate,
    endDate,
    unreadOnly
  } = options;

  const db = await getDatabase();

  let sql = 'SELECT * FROM position_signals WHERE 1=1';
  const params = [];

  if (tsCode) {
    sql += ' AND ts_code = ?';
    params.push(tsCode);
  }

  if (accountId) {
    sql += ' AND account_id = ?';
    params.push(accountId);
  }

  if (signalType) {
    sql += ' AND signal_type = ?';
    params.push(signalType);
  }

  if (signalLevel) {
    sql += ' AND signal_level = ?';
    params.push(signalLevel);
  }

  if (startDate) {
    sql += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    sql += ' AND created_at <= ?';
    params.push(endDate);
  }

  if (unreadOnly) {
    sql += ' AND is_read = 0';
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return await db.allPromise(sql, params);
}

/**
 * Get monitor overview
 */
async function getMonitorOverview() {
  const db = await getDatabase();

  // Get today's signal stats
  const todayStats = await db.getPromise(`
    SELECT
      COUNT(*) as total_signals,
      SUM(CASE WHEN signal_type = 'SELL' THEN 1 ELSE 0 END) as sell_signals,
      SUM(CASE WHEN signal_type = 'WARNING' THEN 1 ELSE 0 END) as warning_signals,
      SUM(CASE WHEN signal_type = 'BUY' THEN 1 ELSE 0 END) as buy_signals,
      SUM(CASE WHEN signal_level = 'HIGH' THEN 1 ELSE 0 END) as high_risk_count
    FROM position_signals
    WHERE date(created_at) = date('now')
  `);

  // Get position count
  const positionCount = await db.getPromise(`
    SELECT COUNT(DISTINCT ts_code) as count
    FROM portfolio_position
    WHERE quantity > 0
  `);

  // Get unread count
  const unreadCount = await db.getPromise(`
    SELECT COUNT(*) as count
    FROM position_signals
    WHERE is_read = 0
  `);

  return {
    positionCount: positionCount?.count || 0,
    todaySignals: todayStats?.total_signals || 0,
    sellSignals: todayStats?.sell_signals || 0,
    warningSignals: todayStats?.warning_signals || 0,
    buySignals: todayStats?.buy_signals || 0,
    highRiskCount: todayStats?.high_risk_count || 0,
    unreadCount: unreadCount?.count || 0
  };
}

/**
 * Mark signals as read
 */
async function markAsRead(signalIds) {
  if (!signalIds || signalIds.length === 0) return;

  const db = await getDatabase();
  const placeholders = signalIds.map(() => '?').join(',');
  await db.runPromise(
    `UPDATE position_signals SET is_read = 1 WHERE id IN (${placeholders})`,
    signalIds
  );
}

/**
 * Mark a single signal as read
 */
async function markSignalRead(signalId) {
  const db = await getDatabase();
  await db.runPromise(`UPDATE position_signals SET is_read = 1 WHERE id = ?`, [signalId]);
}

// ========== Express API Handlers ==========

async function handleGetSignals(req, res) {
  try {
    const {
      ts_code,
      account_id,
      signal_type,
      signal_level,
      limit,
      offset,
      start_date,
      end_date,
      unread_only
    } = req.query;

    const signals = await getSignals({
      tsCode: ts_code,
      accountId: account_id,
      signalType: signal_type,
      signalLevel: signal_level,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      startDate: start_date,
      endDate: end_date,
      unreadOnly: unread_only === 'true'
    });

    res.json({ success: true, data: signals });
  } catch (error) {
    console.error('获取信号失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function handleGetOverview(req, res) {
  try {
    const overview = await getMonitorOverview();
    res.json({ success: true, data: overview });
  } catch (error) {
    console.error('获取概览失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function handleMarkRead(req, res) {
  try {
    const { id } = req.params;
    await markSignalRead(parseInt(id));
    res.json({ success: true, message: '已标记为已读' });
  } catch (error) {
    console.error('标记已读失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  generateSignals,
  saveSignals,
  getUnreadSignals,
  getSignals,
  getMonitorOverview,
  markAsRead,
  markSignalRead,
  handleGetSignals,
  handleGetOverview,
  handleMarkRead
};
