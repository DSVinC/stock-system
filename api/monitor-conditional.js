/**
 * 条件单监控模块
 * 负责拉取实时行情、评估触发条件、调用执行器并输出监控日志
 */

const { execFileSync } = require('child_process');
const { getDatabase } = require('./db');
const { checkCondition } = require('./conditional-order');
const { executeConditionalOrder } = require('./conditional-executor');
const {
  MarketDataError,
  calculateTechnicalIndicators,
  findLatestTradeDate,
  getDailyHistory,
  getLatestDailyBasic,
  getMoneyflowRows,
  getRealtimeQuote: fetchRealtimeQuoteFromMarketData,
  getStockPePercentile,
} = require('./market-data');

const FEISHU_OPEN_ID = process.env.FEISHU_OPEN_ID || 'ou_a21807011c59304bedfaf2f7440f5361';
const LOCAL_TIMEZONE = process.env.MONITOR_TIMEZONE || 'Asia/Shanghai';
const ACTIVE_ORDER_STATUSES = ['enabled', 'pending'];
const TECHNICAL_TRIGGER_TYPES = new Set([
  'ma_golden_cross',
  'ma_death_cross',
  'rsi_overbought',
  'rsi_oversold',
  'macd_bullish',
  'macd_bearish',
]);
const FUNDAMENTAL_TRIGGER_TYPES = new Set(['pe_low', 'pe_high', 'volume_ratio_above']);
const MONEYFLOW_TRIGGER_TYPES = new Set(['main_force_net_inflow', 'main_force_net_outflow']);
const TECHNICAL_CONDITION_TYPES = new Set(['rsi', 'macd_cross']);
const FUNDAMENTAL_CONDITION_TYPES = new Set(['volume_ratio', 'pe_percentile']);
const MONEYFLOW_CONDITION_TYPES = new Set(['main_force_net']);

function createLogger(logger = console) {
  return {
    info: typeof logger.info === 'function' ? logger.info.bind(logger) : console.log.bind(console),
    warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : console.warn.bind(console),
    error: typeof logger.error === 'function' ? logger.error.bind(logger) : console.error.bind(console),
  };
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleString('zh-CN', { timeZone: LOCAL_TIMEZONE, hour12: false });
}

function formatDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((item) => item.type === 'year')?.value;
  const month = parts.find((item) => item.type === 'month')?.value;
  const day = parts.find((item) => item.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function safeJsonParse(raw, fallback = []) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw !== 'string' || raw.trim() === '') {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTsCode(tsCode) {
  const value = String(tsCode || '').trim().toUpperCase();
  if (!/^\d{6}\.(SZ|SH|BJ)$/.test(value)) {
    throw new Error(`非法股票代码格式: ${tsCode}`);
  }
  return value;
}

function normalizeRealtimeQuote(tsCode, rawQuote = {}) {
  const normalizedTsCode = normalizeTsCode(tsCode);
  const price = toNumber(
    rawQuote.price
    ?? rawQuote.currentPrice
    ?? rawQuote.current_price
    ?? rawQuote.lastPrice
    ?? rawQuote.last_price
  );

  if (!price || price <= 0) {
    throw new Error(`实时行情缺少有效价格: ${normalizedTsCode}`);
  }

  const pctChange = toNumber(rawQuote.percent ?? rawQuote.pctChange ?? rawQuote.pct_chg, 0);
  const prevClose = toNumber(
    rawQuote.preClose
    ?? rawQuote.prevClose
    ?? rawQuote.previousPrice
    ?? rawQuote.prevPrice,
    pctChange !== null && pctChange !== -100
      ? Number((price / (1 + (pctChange / 100))).toFixed(4))
      : null
  );

  return {
    ts_code: normalizedTsCode,
    price,
    pctChange,
    volume: toNumber(rawQuote.volume ?? rawQuote.totalVolume ?? rawQuote.vol, 0),
    turnover: toNumber(rawQuote.amount ?? rawQuote.turnover ?? rawQuote.totalAmount, 0),
    open: toNumber(rawQuote.openPrice ?? rawQuote.open, 0),
    high: toNumber(rawQuote.high, 0),
    low: toNumber(rawQuote.low, 0),
    prevClose,
    status: rawQuote.status || rawQuote.tradeStatus || rawQuote.trade_status || '',
    timestamp: rawQuote.hqTime || rawQuote.uptime || rawQuote.updateTime || formatTimestamp(),
    raw: rawQuote,
  };
}

function getOrderConditions(order) {
  const conditions = safeJsonParse(order.conditions, []);
  if (!Array.isArray(conditions) || conditions.length === 0) {
    throw new Error(`条件单 ${order.id} 缺少有效条件配置`);
  }
  return conditions;
}

function resolveConditionRequirements(order) {
  const conditions = getOrderConditions(order);
  const requirements = {
    conditions,
    needsTechnical: false,
    needsDailyBasic: false,
    needsMoneyflow: false,
  };

  for (const condition of conditions) {
    if (condition && typeof condition === 'object') {
      if (condition.trigger_type) {
        if (TECHNICAL_TRIGGER_TYPES.has(condition.trigger_type)) {
          requirements.needsTechnical = true;
        }
        if (FUNDAMENTAL_TRIGGER_TYPES.has(condition.trigger_type)) {
          requirements.needsDailyBasic = true;
        }
        if (MONEYFLOW_TRIGGER_TYPES.has(condition.trigger_type)) {
          requirements.needsMoneyflow = true;
        }
        continue;
      }

      if (TECHNICAL_CONDITION_TYPES.has(condition.type)) {
        requirements.needsTechnical = true;
      }
      if (FUNDAMENTAL_CONDITION_TYPES.has(condition.type)) {
        requirements.needsDailyBasic = true;
      }
      if (MONEYFLOW_CONDITION_TYPES.has(condition.type)) {
        requirements.needsMoneyflow = true;
      }
    }
  }

  return requirements;
}

function getSymbolCacheEntry(cache, tsCode) {
  const key = normalizeTsCode(tsCode);
  if (!cache.has(key)) {
    cache.set(key, {});
  }
  return cache.get(key);
}

async function getCachedRealtimeQuote(tsCode, dependencies, cache) {
  const entry = getSymbolCacheEntry(cache, tsCode);
  if (!entry.realtimeQuotePromise) {
    entry.realtimeQuotePromise = dependencies.quoteProvider(tsCode);
  }
  const response = await entry.realtimeQuotePromise;
  // 处理 { code: 0, data: {...} } 格式的响应
  const rawQuote = response && response.data ? response.data : response;
  if (!entry.normalizedQuote) {
    entry.normalizedQuote = normalizeRealtimeQuote(tsCode, rawQuote);
  }
  return entry.normalizedQuote;
}

async function getCachedIndicatorRows(tsCode, dependencies, cache) {
  const entry = getSymbolCacheEntry(cache, tsCode);
  if (!entry.indicatorRowsPromise) {
    entry.indicatorRowsPromise = dependencies.dailyHistoryProvider(tsCode).then((rows) => {
      if (!Array.isArray(rows) || rows.length < 2) {
        throw new Error(`历史行情不足，无法计算技术指标: ${tsCode}`);
      }
      return calculateTechnicalIndicators(rows);
    });
  }
  return entry.indicatorRowsPromise;
}

async function getCachedDailyBasic(tsCode, dependencies, cache) {
  const entry = getSymbolCacheEntry(cache, tsCode);
  if (!entry.dailyBasicPromise) {
    entry.dailyBasicPromise = dependencies.dailyBasicProvider(tsCode);
  }
  return entry.dailyBasicPromise;
}

async function getCachedPePercentile(tsCode, dependencies, cache) {
  const entry = getSymbolCacheEntry(cache, tsCode);
  if (!entry.pePercentilePromise) {
    entry.pePercentilePromise = dependencies.pePercentileProvider(tsCode);
  }
  return entry.pePercentilePromise;
}

async function getCachedTradeDate(dependencies, cache) {
  if (!cache.tradeDatePromise) {
    cache.tradeDatePromise = dependencies.tradeDateProvider();
  }
  return cache.tradeDatePromise;
}

async function getCachedMoneyflow(tsCode, dependencies, cache) {
  const entry = getSymbolCacheEntry(cache, tsCode);
  if (!entry.moneyflowPromise) {
    entry.moneyflowPromise = getCachedTradeDate(dependencies, cache).then((tradeDate) =>
      dependencies.moneyflowProvider(tsCode, tradeDate)
    );
  }
  return entry.moneyflowPromise;
}

function buildTechnicalData(indicatorRows) {
  const latest = indicatorRows[indicatorRows.length - 1];
  const previous = indicatorRows[indicatorRows.length - 2] || latest;
  const macdSignalValue = toNumber(latest.macd_dif, 0) - toNumber(latest.macd_dea, 0);

  return {
    rsi: toNumber(latest.rsi),
    macdSignalValue,
    macdSignal: macdSignalValue,
    macdDiff: toNumber(latest.macd_dif),
    macdDea: toNumber(latest.macd_dea),
    macdBar: toNumber(latest.macd_bar),
    ma: {
      5: toNumber(latest.ma5),
      10: toNumber(latest.ma10),
      20: toNumber(latest.ma20),
      60: toNumber(latest.ma60),
    },
    prevMa: {
      5: toNumber(previous.ma5),
      10: toNumber(previous.ma10),
      20: toNumber(previous.ma20),
      60: toNumber(previous.ma60),
    },
    trade_date: latest.trade_date,
  };
}

function summarizeContext(marketData, technicalData) {
  return {
    price: marketData.price,
    pctChange: marketData.pctChange,
    prevClose: marketData.prevClose,
    volumeRatio: marketData.volumeRatio ?? null,
    pe: marketData.pe ?? marketData.pe_ttm ?? null,
    pePercentile: marketData.pePercentile ?? null,
    mainForceNet: marketData.mainForceNet ?? null,
    rsi: technicalData?.rsi ?? null,
    macdSignalValue: technicalData?.macdSignalValue ?? null,
  };
}

async function buildOrderContext(order, dependencies, cache) {
  const requirements = resolveConditionRequirements(order);
  const marketData = await getCachedRealtimeQuote(order.ts_code, dependencies, cache);
  const technicalData = {};

  if (requirements.needsTechnical) {
    const indicatorRows = await getCachedIndicatorRows(order.ts_code, dependencies, cache);
    Object.assign(technicalData, buildTechnicalData(indicatorRows));
  }

  if (requirements.needsDailyBasic) {
    const dailyBasic = await getCachedDailyBasic(order.ts_code, dependencies, cache);
    if (!dailyBasic) {
      throw new Error(`未获取到 ${order.ts_code} 的日频基础指标`);
    }
    marketData.volumeRatio = toNumber(dailyBasic.volume_ratio);
    marketData.pe = toNumber(dailyBasic.pe);
    marketData.pe_ttm = toNumber(dailyBasic.pe_ttm);

    const pePercentileData = await getCachedPePercentile(order.ts_code, dependencies, cache);
    const pePercentile = toNumber(
      pePercentileData?.percentile5y
      ?? pePercentileData?.percentile3y
      ?? pePercentileData?.percentile1y,
      null
    );

    if (pePercentile !== null) {
      marketData.pePercentile = pePercentile;
    }
  }

  if (requirements.needsMoneyflow) {
    const rows = await getCachedMoneyflow(order.ts_code, dependencies, cache);
    const latest = Array.isArray(rows) && rows.length > 0 ? rows[rows.length - 1] : null;
    if (!latest) {
      throw new Error(`未获取到 ${order.ts_code} 的主力资金数据`);
    }
    marketData.mainForceNet = toNumber(latest.net_mf_amount);
  }

  return {
    conditions: requirements.conditions,
    marketData,
    technicalData,
  };
}

async function executeConditionalTrade(order, marketData, technicalData, dependencies, logger) {
  const result = await dependencies.executor(order.id, marketData, technicalData, {
    skipConditionCheck: true,
  });

  if (result.success) {
    logger.info(
      `[条件单执行] orderId=${order.id} ts_code=${order.ts_code} action=${order.action} quantity=${result.quantity} price=${result.price}`
    );
  } else {
    logger.warn(
      `[条件单执行失败] orderId=${order.id} ts_code=${order.ts_code} code=${result.code || 'UNKNOWN'} error=${result.error || 'unknown'}`
    );
  }

  return result;
}

async function sendFeishuNotification(order, tradeResult) {
  const emoji = tradeResult.success ? '🎉' : '⚠️';
  const actionText = order.action === 'buy' ? '买入' : '卖出';
  const actionEmoji = order.action === 'buy' ? '🔴' : '🟢';

  let message = `${emoji} 【条件单触发】${order.stock_name} (${order.ts_code})\n\n`;
  message += `${actionEmoji} 交易动作：${actionText}\n`;

  if (tradeResult.success) {
    message += `📊 成交数量：${tradeResult.quantity}股\n`;
    message += `💰 成交价格：¥${tradeResult.price?.toFixed(2) || 'N/A'}\n`;
    message += `💵 成交金额：¥${tradeResult.amount?.toFixed(2) || 'N/A'}\n`;
    message += `⏰ 触发时间：${formatTimestamp()}\n\n`;
    message += '✅ 状态：执行成功\n';
    message += '💡 建议：请登录系统查看持仓变化';
  } else {
    message += `⏰ 触发时间：${formatTimestamp()}\n\n`;
    message += '❌ 状态：执行失败\n';
    message += `⚠️ 原因：${tradeResult.error || '未知错误'}`;
  }

  try {
    execFileSync('openclaw', [
      'message',
      'send',
      '--channel',
      'feishu',
      '--target',
      `user:${FEISHU_OPEN_ID}`,
      '--message',
      message,
    ], {
      encoding: 'utf-8',
      timeout: 15000,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function checkAllConditionalOrders(options = {}) {
  const logger = createLogger(options.logger);
  const db = options.db || await getDatabase();
  const dependencies = {
    quoteProvider: options.quoteProvider || fetchRealtimeQuoteFromMarketData,
    dailyHistoryProvider: options.dailyHistoryProvider || getDailyHistory,
    dailyBasicProvider: options.dailyBasicProvider || getLatestDailyBasic,
    pePercentileProvider: options.pePercentileProvider || getStockPePercentile,
    tradeDateProvider: options.tradeDateProvider || findLatestTradeDate,
    moneyflowProvider: options.moneyflowProvider || getMoneyflowRows,
    executor: options.executor || executeConditionalOrder,
    notifier: options.notifier || sendFeishuNotification,
  };

  const today = formatDate(options.now || new Date());
  const cache = new Map();
  logger.info(`[监控] 开始检查条件单 current_date=${today}`);

  const orders = await db.allPromise(`
    SELECT * FROM conditional_order
    WHERE status IN (${ACTIVE_ORDER_STATUSES.map(() => '?').join(', ')})
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date IS NULL OR end_date >= ?)
    ORDER BY id ASC
  `, [...ACTIVE_ORDER_STATUSES, today, today]);

  logger.info(`[监控] 待检查条件单数量 total=${orders.length}`);

  const results = [];

  for (const order of orders) {
    const logPrefix = `[监控] orderId=${order.id} ts_code=${order.ts_code}`;

    try {
      const { marketData, technicalData } = await buildOrderContext(order, dependencies, cache);
      logger.info(`${logPrefix} 行情上下文 ${JSON.stringify(summarizeContext(marketData, technicalData))}`);

      const triggered = checkCondition(
        {
          ...order,
          conditions: getOrderConditions(order),
        },
        marketData,
        technicalData
      );

      if (!triggered) {
        logger.info(`${logPrefix} 条件未满足`);
        results.push({
          order_id: order.id,
          ts_code: order.ts_code,
          status: 'checked',
          triggered: false,
          market: summarizeContext(marketData, technicalData),
        });
        continue;
      }

      logger.info(`${logPrefix} 条件满足，准备调用执行器`);
      const tradeResult = await executeConditionalTrade(order, marketData, technicalData, dependencies, logger);

      let notification = null;
      if (dependencies.notifier) {
        notification = await dependencies.notifier(order, tradeResult);
        if (notification && notification.success === false) {
          logger.warn(`${logPrefix} 通知发送失败 error=${notification.error || 'unknown'}`);
        }
      }

      results.push({
        order_id: order.id,
        ts_code: order.ts_code,
        status: tradeResult.success ? 'triggered' : 'execution_failed',
        triggered: true,
        market: summarizeContext(marketData, technicalData),
        trade_result: tradeResult,
        notification,
      });
    } catch (error) {
      const errorCode = error instanceof MarketDataError ? error.code : (error.code || 'MONITOR_CHECK_FAILED');
      logger.error(`${logPrefix} 检查失败 code=${errorCode} error=${error.message}`);
      results.push({
        order_id: order.id,
        ts_code: order.ts_code,
        status: 'check_failed',
        triggered: false,
        error: error.message,
        code: errorCode,
      });
    }
  }

  const summary = results.reduce((accumulator, item) => {
    if (item.triggered) {
      accumulator.triggered += 1;
    }
    if (item.status === 'execution_failed') {
      accumulator.execution_failed += 1;
    }
    if (item.status === 'check_failed') {
      accumulator.check_failed += 1;
    }
    return accumulator;
  }, {
    total: results.length,
    triggered: 0,
    execution_failed: 0,
    check_failed: 0,
  });

  logger.info(
    `[监控] 检查完成 total=${summary.total} triggered=${summary.triggered} execution_failed=${summary.execution_failed} check_failed=${summary.check_failed}`
  );

  return {
    success: summary.check_failed === 0 && summary.execution_failed === 0,
    ...summary,
    results,
  };
}

async function runMonitorJob(options = {}) {
  const logger = createLogger(options.logger);
  const startedAt = new Date();
  logger.info(`[定时任务] 条件单监控开始 at=${startedAt.toISOString()}`);

  try {
    const result = await checkAllConditionalOrders(options);
    logger.info(
      `[定时任务] 条件单监控结束 success=${result.success} total=${result.total} triggered=${result.triggered} check_failed=${result.check_failed}`
    );
    return result;
  } catch (error) {
    logger.error(`[定时任务] 执行失败 error=${error.message}`);
    return {
      success: false,
      total: 0,
      triggered: 0,
      check_failed: 1,
      error: error.message,
      results: [],
    };
  }
}

// ========== 报告关联功能 ==========

/**
 * 获取条件单关联的分析报告
 * @param {number} orderId - 条件单 ID
 * @returns {Promise<Object|null>} 分析报告
 */
async function getAssociatedReport(orderId) {
  const db = require('./db');
  const order = await db.getPromise('SELECT report_id FROM conditional_order WHERE id = ?', [orderId]);
  
  if (!order || !order.report_id) {
    return null;
  }
  
  const report = await db.getPromise(
    'SELECT * FROM stock_analysis_reports WHERE report_id = ?',
    [order.report_id]
  );
  
  return report;
}

/**
 * 检查报告决策是否与触发条件一致
 * @param {Object} order - 条件单
 * @param {Object} report - 分析报告
 * @returns {boolean} 是否一致
 */
function checkReportDecision(order, report) {
  if (!report || !report.report_json) {
    return true; // 没有报告时默认通过
  }
  
  try {
    const decisions = JSON.parse(report.report_json).decisions || {};
    
    // 检查止损单是否与报告止损价一致
    if (order.order_type === 'stop_loss' && decisions.stop_loss) {
      const conditions = JSON.parse(order.conditions);
      const reportStopLoss = decisions.stop_loss;
      const orderStopLoss = conditions.find(c => c.field === 'price')?.value;
      return Math.abs(reportStopLoss - orderStopLoss) < 0.01;
    }
    
    // 检查止盈单是否与报告止盈价一致
    if (order.order_type === 'take_profit' && decisions.stop_profit) {
      const conditions = JSON.parse(order.conditions);
      const reportStopProfits = Array.isArray(decisions.stop_profit) 
        ? decisions.stop_profit 
        : [decisions.stop_profit];
      const orderStopProfit = conditions.find(c => c.field === 'price')?.value;
      return reportStopProfits.some(p => Math.abs(p - orderStopProfit) < 0.01);
    }
    
    return true;
  } catch (e) {
    console.error('[checkReportDecision] 解析报告失败:', e.message);
    return true;
  }
}

/**
 * 更新报告状态
 * @param {string} reportId - 报告 ID
 * @param {string} status - 状态 (triggered/cancelled/expired)
 */
async function updateReportStatus(reportId, status) {
  const db = require('./db');
  await db.runPromise(
    'UPDATE stock_analysis_reports SET report_status = ?, updated_at = CURRENT_TIMESTAMP WHERE report_id = ?',
    [status, reportId]
  );
}

module.exports = {
  buildOrderContext,
  checkAllConditionalOrders,
  executeConditionalTrade,
  formatDate,
  getAssociatedReport,
  getOrderConditions,
  normalizeRealtimeQuote,
  runMonitorJob,
  sendFeishuNotification,
  checkReportDecision,
  updateReportStatus,
};
