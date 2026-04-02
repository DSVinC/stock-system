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
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');

const execFileAsync = promisify(execFile);

const ANN_IMPORT_LOOKBACK_DAYS = 30;
const ANN_MAJOR_LOOKBACK_DAYS = 3;
const AKSHARE_SCRIPT = '/Users/vvc/.openclaw/workspace/stock-system/scripts/fetch_announcements_akshare.py';
const SINA_MCP_CALL_TOOL = '/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/scripts/call-tool.cjs';

const ANN_RISK_KEYWORDS = [
  { keyword: '立案调查', eventType: 'regulatory_investigation', signalType: 'SELL', signalLevel: 'HIGH', riskTag: 'high' },
  { keyword: '行政处罚', eventType: 'regulatory_penalty', signalType: 'SELL', signalLevel: 'HIGH', riskTag: 'high' },
  { keyword: '终止上市', eventType: 'delisting', signalType: 'SELL', signalLevel: 'HIGH', riskTag: 'high' },
  { keyword: '退市风险', eventType: 'delisting_risk', signalType: 'SELL', signalLevel: 'HIGH', riskTag: 'high' },
  { keyword: '财务造假', eventType: 'financial_fraud', signalType: 'SELL', signalLevel: 'HIGH', riskTag: 'high' },
  { keyword: '业绩预亏', eventType: 'earnings_warning', signalType: 'WARNING', signalLevel: 'MEDIUM', riskTag: 'medium' },
  { keyword: '减持', eventType: 'shareholder_reduction', signalType: 'WARNING', signalLevel: 'MEDIUM', riskTag: 'medium' },
  { keyword: '重大合同', eventType: 'major_contract', signalType: 'WARNING', signalLevel: 'LOW', riskTag: 'low' },
  { keyword: '中标', eventType: 'major_contract', signalType: 'WARNING', signalLevel: 'LOW', riskTag: 'low' },
  { keyword: '回购', eventType: 'buyback', signalType: 'WARNING', signalLevel: 'LOW', riskTag: 'low' },
  { keyword: '业绩预增', eventType: 'earnings_positive', signalType: 'WARNING', signalLevel: 'LOW', riskTag: 'low' }
];

function toTradeDateString(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function toSinaSymbol(tsCode) {
  const code = String(tsCode || '').trim().toUpperCase();
  if (!code) return '';
  if (/^(SH|SZ)\d{6}$/.test(code)) return code.toLowerCase();
  const normalized = code.replace('.', '');
  if (/^(SH|SZ)\d{6}$/.test(normalized)) return normalized.toLowerCase();
  const [digits, market] = code.split('.');
  if (!digits || !/^\d{6}$/.test(digits)) return '';
  if (market === 'SH') return `sh${digits}`;
  if (market === 'SZ') return `sz${digits}`;
  if (digits.startsWith('6') || digits.startsWith('9')) return `sh${digits}`;
  return `sz${digits}`;
}

function normalizeEventDate(dateText, timeText) {
  const d = String(dateText || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return null;
  }
  const t = /^\d{2}:\d{2}:\d{2}$/.test(String(timeText || '').trim()) ? String(timeText).trim() : '00:00:00';
  return `${d}T${t}+08:00`;
}

function parseSinaMajorEventsPayload(payload) {
  const grouped = payload?.structuredContent?.result?.data;
  if (!Array.isArray(grouped)) return [];
  const flattened = [];
  for (const group of grouped) {
    if (!Array.isArray(group?.value)) continue;
    for (const event of group.value) {
      flattened.push(event);
    }
  }
  return flattened;
}

async function fetchSinaMajorEvents(sinaSymbol, pageSize = 50) {
  const { stdout } = await execFileAsync(
    'node',
    [
      SINA_MCP_CALL_TOOL,
      'globalStockMajorEvents',
      JSON.stringify({
        market: '0',
        symbols: sinaSymbol,
        pageSize: String(pageSize)
      })
    ],
    {
      timeout: 20000,
      maxBuffer: 1024 * 1024 * 4
    }
  );
  const parsed = JSON.parse(String(stdout || '{}'));
  return parseSinaMajorEventsPayload(parsed);
}

function isSinaMcpToolAvailable() {
  return fs.existsSync(SINA_MCP_CALL_TOOL);
}

/**
 * 使用 AkShare 获取公司公告（免费数据源 - 主数据源）
 */
async function fetchAkshareAnnouncements(tsCode, limit = 100) {
  const { stdout } = await execFileAsync(
    'python3',
    [AKSHARE_SCRIPT, tsCode.replace('.', '').replace('SH', '').replace('SZ', ''), String(limit)],
    {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 4,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    }
  );
  
  const result = JSON.parse(String(stdout || '{}'));
  
  if (!result.success || !result.data) {
    console.warn(`[position-signals] AkShare 公告获取失败 ${tsCode}: ${result.error}`);
    return [];
  }
  
  return (result.data || []).map(item => ({
    ts_code: tsCode,
    name: item.stock_name || null,
    ann_date: String(item.ann_date || ''),
    ann_time: String(item.pub_time || '').split(' ')[1] || null,
    title: String(item.title || '').trim(),
    content: String(item.content || '').trim(),
    symbol: tsCode,
    event_type: null,
    source: 'akshare'
  }));
}

function classifyAnnouncementTitle(title) {
  const text = String(title || '');
  for (const rule of ANN_RISK_KEYWORDS) {
    if (text.includes(rule.keyword)) {
      return rule;
    }
  }
  return {
    keyword: null,
    eventType: 'general_announcement',
    signalType: 'WARNING',
    signalLevel: 'LOW',
    riskTag: 'low'
  };
}

async function syncCompanyAnnouncements(db, holdings, options = {}) {
  const tsCodes = [...new Set((holdings || []).map(item => String(item.ts_code || '').trim()).filter(Boolean))];
  if (tsCodes.length === 0) {
    return { synced: 0, inserted: 0 };
  }

  const nowDate = options.now instanceof Date ? options.now : new Date();
  const endDate = nowDate;
  const startDate = new Date(nowDate.getTime() - ANN_IMPORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const startDateStr = toTradeDateString(startDate); // yyyyMMdd for fast compare
  const endDateStr = toTradeDateString(endDate); // yyyyMMdd
  const stockNameByCode = new Map((holdings || []).map(item => [item.ts_code, item.stock_name || null]));
  // 优先使用 AkShare（免费），Sina MCP 作为备用
  let synced = 0;
  let inserted = 0;
  const insertedItems = [];
  
  for (const tsCode of tsCodes) {
    let rows = [];
    const sinaSymbol = toSinaSymbol(tsCode);
    if (!sinaSymbol) {
      continue;
    }

    // 1. 优先使用 AkShare（免费数据源）
    try {
      const akEvents = await fetchAkshareAnnouncements(tsCode, 100);
      rows = (akEvents || [])
        .map((item) => {
          const dateStr = String(item.ann_date || '').replace(/-/g, '');
          if (!dateStr || dateStr < startDateStr || dateStr > endDateStr) {
            return null;
          }
          return {
            ts_code: tsCode,
            name: item.name || stockNameByCode.get(tsCode) || null,
            ann_date: dateStr,
            ann_time: item.ann_time || null,
            title: String(item.title || '').trim(),
            content: String(item.content || '').trim(),
            symbol: item.symbol || tsCode,
            event_type: item.event_type || null,
            source: 'akshare'
          };
        })
        .filter(Boolean);
      
      if (rows.length > 0) {
        console.log(`[position-signals] AkShare 获取成功 ${tsCode}: ${rows.length} 条公告`);
      }
    } catch (error) {
      console.warn(`[position-signals] AkShare 公告同步失败 ${tsCode}: ${error.message}`);
    }

    // 2. 回退到 Sina MCP（备用数据源）
    if (rows.length === 0 && isSinaMcpToolAvailable()) {
      console.log(`[position-signals] AkShare 无数据，尝试 Sina MCP ${tsCode} (${startDateStr}-${endDateStr})`);
      try {
        const events = await fetchSinaMajorEvents(sinaSymbol, 100);
        rows = (events || [])
          .map((item) => {
            const dateStr = String(item.date || '').replace(/-/g, '');
            if (!dateStr || dateStr < startDateStr || dateStr > endDateStr) {
              return null;
            }
            return {
              ts_code: tsCode,
              name: item.name || stockNameByCode.get(tsCode) || null,
              ann_date: dateStr,
              ann_time: item.time || null,
              title: String(item.title || '').trim(),
              content: String(item.content || '').trim(),
              symbol: item.symbol || sinaSymbol,
              event_type: item.event_type || null,
              source: 'sina_mcp_major_events'
            };
          })
          .filter(Boolean);
        
        if (rows.length > 0) {
          console.log(`[position-signals] Sina MCP 获取成功 ${tsCode}: ${rows.length} 条公告`);
        }
      } catch (error) {
        console.warn(`[position-signals] Sina MCP 公告同步失败 ${tsCode}: ${error.message}`);
      }
    }

    if (rows.length === 0) {
      console.log(`[position-signals] 无公告数据 ${tsCode} (${startDateStr}-${endDateStr})`);
      continue;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      continue;
    }

    synced += rows.length;
    for (const row of rows) {
      const title = String(row.title || '').trim();
      if (!title) continue;
      const annDate = String(row.ann_date || '').trim().replace(/-/g, '');
      const eventTime = annDate && annDate.length === 8
        ? normalizeEventDate(`${annDate.slice(0, 4)}-${annDate.slice(4, 6)}-${annDate.slice(6, 8)}`, row.ann_time) || new Date().toISOString()
        : new Date().toISOString();
      const classify = classifyAnnouncementTitle(title);
      const contentText = String(row.content || '').trim();
      const content = contentText || `新浪重大事项（${row.symbol || tsCode}）`;

      const exists = await db.getPromise(
        `SELECT id FROM company_events WHERE ts_code = ? AND event_time = ? AND title = ? LIMIT 1`,
        [tsCode, eventTime, title]
      );
      if (exists) continue;

      await db.runPromise(
        `INSERT INTO company_events (ts_code, stock_name, event_type, event_time, title, content, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          tsCode,
          row.name || stockNameByCode.get(tsCode) || null,
          classify.eventType,
          eventTime,
          title,
          content,
          row.source || 'sina_mcp_major_events'
        ]
      );
      inserted += 1;
      insertedItems.push({
        ts_code: tsCode,
        stock_name: row.name || stockNameByCode.get(tsCode) || null,
        title,
        event_time: eventTime,
        source: row.source || 'sina_mcp_major_events'
      });
    }
  }

  return { synced, inserted, insertedItems };
}

async function getRecentMajorAnnouncements(db, tsCode, days = ANN_MAJOR_LOOKBACK_DAYS) {
  const rows = await db.allPromise(
    `SELECT event_type, event_time, title, content, source
       FROM company_events
      WHERE ts_code = ?
        AND event_time >= datetime('now', ?)
      ORDER BY event_time DESC
      LIMIT 20`,
    [tsCode, `-${days} days`]
  );
  return (rows || []).map((row) => {
    const classify = classifyAnnouncementTitle(row.title);
    return {
      title: row.title,
      content: row.content || '',
      eventType: row.event_type || classify.eventType,
      signalType: classify.signalType,
      signalLevel: classify.signalLevel,
      riskTag: classify.riskTag,
      eventTime: row.event_time,
      source: row.source
    };
  });
}

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

  // Rule 4: Major company announcements (Sina MCP major events -> company_events)
  if (Array.isArray(news.majorAnnouncements) && news.majorAnnouncements.length > 0) {
    const highRiskAnnouncements = news.majorAnnouncements.filter(item => item.riskTag === 'high');
    const mediumRiskAnnouncements = news.majorAnnouncements.filter(item => item.riskTag === 'medium');
    if (highRiskAnnouncements.length > 0) {
      signals.push({
        type: 'SELL',
        level: 'HIGH',
        reason: `重大公告风险：${highRiskAnnouncements.slice(0, 2).map(item => item.title).join('；')}`,
        announcement_count: highRiskAnnouncements.length
      });
    } else if (mediumRiskAnnouncements.length > 0) {
      signals.push({
        type: 'WARNING',
        level: 'MEDIUM',
        reason: `公告需关注：${mediumRiskAnnouncements.slice(0, 2).map(item => item.title).join('；')}`,
        announcement_count: mediumRiskAnnouncements.length
      });
    }
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

/**
 * Run full monitoring cycle for all positions
 */
async function runFullMonitoring() {
  const { getDatabase } = require('./db');
  const db = await getDatabase();
  
  // Get all holdings
  const holdings = await db.allPromise(`
    SELECT DISTINCT account_id, ts_code, stock_name, quantity, avg_price
    FROM portfolio_position 
    WHERE quantity > 0
  `);
  
  if (holdings.length === 0) {
    return { success: true, message: '无持仓，跳过监控', signals: [] };
  }

  let annSyncSummary = { synced: 0, inserted: 0 };

  // 先同步持仓股重大事项：公司公告走新浪 MCP，不依赖行业新闻库。
  try {
    const annSync = await syncCompanyAnnouncements(db, holdings);
    annSyncSummary = {
      synced: Number(annSync?.synced || 0),
      inserted: Number(annSync?.inserted || 0),
      insertedItems: Array.isArray(annSync?.insertedItems) ? annSync.insertedItems : []
    };
    if (annSync.inserted > 0) {
      console.log(`[Monitor] 公告同步完成，拉取 ${annSync.synced} 条，新增 ${annSync.inserted} 条`);
    }
  } catch (error) {
    console.warn('[Monitor] 公告同步失败，继续执行监控:', error.message);
  }
  
  const allSignals = [];
  const { buildReportPayload } = require('./analyze');
  const { querySnapshot } = require('./factor-snapshot');
  const { checkBlackSwan } = require('./black-swan-check');
  
  for (const holding of holdings) {
    try {
      console.log(`[Monitor] 正在分析 ${holding.stock_name}(${holding.ts_code})...`);
      
      // 1. 获取当前数据和评分
      const currentData = await buildReportPayload(holding.ts_code);
      const currentFactors = {
        total: currentData.reportScore,
        // 其他因子详情可以从 currentData.scoreFactors.factors 获取
      };
      
      // 2. 获取历史快照（昨天的）
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const historicalSnapshot = await querySnapshot(holding.ts_code, yesterdayStr);
      
      const historicalFactors = {
        total: historicalSnapshot ? historicalSnapshot.weightedScore : 3.0 // 默认中性分
      };
      
      // 3. 获取舆情和黑天鹅数据
      const majorAnnouncements = await getRecentMajorAnnouncements(db, holding.ts_code);
      const news = {
        negativeCount: currentData.scoreFactors.factors.sentiment.details.negativeCount || 0,
        blackSwanEvents: currentData.scoreFactors.blackSwanEvent ? [currentData.scoreFactors.blackSwanEvent.title] : [],
        majorAnnouncements
      };
      
      // 4. 生成信号
      const signals = generateSignals(holding, currentFactors, historicalFactors, news);
      
      if (signals.length > 0) {
        allSignals.push(...signals);
      }
    } catch (error) {
      console.error(`[Monitor] 分析 ${holding.ts_code} 失败:`, error.message);
    }
  }
  
  // 收集所有公告（用于推送摘要）
  const allAnnouncements = [];
  for (const holding of holdings) {
    try {
      const announcements = await getRecentMajorAnnouncements(db, holding.ts_code, 3);
      if (announcements && announcements.length > 0) {
        allAnnouncements.push({
          ts_code: holding.ts_code,
          stock_name: holding.stock_name,
          announcements
        });
      }
    } catch (e) {
      // 忽略单个股票公告获取失败
    }
  }
  
  // 保存并返回
  if (allSignals.length > 0) {
    await saveSignals(allSignals);
  }
  
  return {
    success: true,
    count: holdings.length,
    signals: allSignals,
    announcements: allAnnouncements,
    announcementSync: annSyncSummary
  };
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
  runFullMonitoring,
  markAsRead,
  markSignalRead,
  handleGetSignals,
  handleGetOverview,
  handleMarkRead,
  _internal: {
    toSinaSymbol,
    classifyAnnouncementTitle,
    parseSinaMajorEventsPayload,
    fetchSinaMajorEvents,
    isSinaMcpToolAvailable,
    syncCompanyAnnouncements
  }
};
