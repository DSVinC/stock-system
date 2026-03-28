/**
 * 交易日工具函数
 * 处理非交易日日期调整问题
 */

const Database = require('better-sqlite3');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
let dbCache = null;

function getDb() {
  if (!dbCache) {
    dbCache = new Database(DB_PATH, { readonly: true });
  }
  return dbCache;
}

/**
 * 将日期调整到最近的交易日
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @param {'forward' | 'backward'} direction - 调整方向：forward=向后找下一个交易日，backward=向前找上一个交易日
 * @returns {string} 调整后的交易日日期
 */
function adjustToTradingDay(dateStr, direction = 'forward') {
  const db = getDb();
  const dateStamp = dateStr.replace(/-/g, '');
  
  if (direction === 'forward') {
    // 向后找下一个交易日（起始日期：如果非交易日，找之后第一个交易日）
    const result = db.prepare(`
      SELECT trade_date 
      FROM stock_factor_snapshot 
      WHERE trade_date >= ? 
      ORDER BY trade_date ASC 
      LIMIT 1
    `).get(dateStamp);
    
    if (!result) return dateStr;
    const tradeDate = String(result.trade_date);
    return tradeDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  } else {
    // 向前找上一个交易日（结束日期：如果非交易日，找之前最后一个交易日）
    const result = db.prepare(`
      SELECT trade_date 
      FROM stock_factor_snapshot 
      WHERE trade_date <= ? 
      ORDER BY trade_date DESC 
      LIMIT 1
    `).get(dateStamp);
    
    if (!result) return dateStr;
    const tradeDate = String(result.trade_date);
    return tradeDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  }
}

/**
 * 调整回测日期范围
 * @param {Object} params - 日期参数
 * @param {string} params.startDate - 起始日期
 * @param {string} params.endDate - 结束日期
 * @returns {Object} 调整后的日期范围
 */
function adjustBacktestDateRange({ startDate, endDate }) {
  const adjustedStart = adjustToTradingDay(startDate, 'forward');
  const adjustedEnd = adjustToTradingDay(endDate, 'backward');
  
  // 检查调整后的日期范围是否有效
  if (adjustedStart > adjustedEnd) {
    throw new Error(`调整后的日期范围无效：${adjustedStart} > ${adjustedEnd}，请选择更宽的时间范围`);
  }
  
  return {
    startDate: adjustedStart,
    endDate: adjustedEnd,
    originalStartDate: startDate,
    originalEndDate: endDate,
    adjusted: adjustedStart !== startDate || adjustedEnd !== endDate
  };
}

/**
 * 检查日期是否为交易日
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @returns {boolean} 是否为交易日
 */
function isTradingDay(dateStr) {
  const db = getDatabase();
  const dateStamp = dateStr.replace(/-/g, '');
  const result = db.prepare(`
    SELECT 1 
    FROM stock_factor_snapshot 
    WHERE trade_date = ? 
    LIMIT 1
  `).get(dateStamp);
  
  return !!result;
}

module.exports = {
  adjustToTradingDay,
  adjustBacktestDateRange,
  isTradingDay
};
