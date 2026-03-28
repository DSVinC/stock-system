/**
 * API 模块：选股报告保存 (selection-report.js)
 * 
 * 职责：负责选股报告的保存和查询
 * - 保存选股报告到 stock_selection_reports 表
 * - 查询历史选股报告
 * - 获取选股报告详情
 * 
 * 数据库表：stock_selection_reports
 */

const Database = require('better-sqlite3');
const path = require('node:path');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

/**
 * 保存选股报告到数据库
 * @param {Object} report - 选股报告数据
 */
function saveSelectionReport(report) {
  const db = new Database(DB_PATH);
  try {
    const sql = `
      INSERT OR REPLACE INTO stock_selection_reports (
        report_id, report_type, created_at, trade_date,
        filter_config, selected_stocks, statistics, data_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const stmt = db.prepare(sql);
    stmt.run([
      report.reportId,
      'stock_selection',
      report.createdAt || new Date().toISOString(),
      report.tradeDate,
      JSON.stringify(report.filterConfig),
      JSON.stringify(report.selectedStocks),
      JSON.stringify(report.statistics),
      JSON.stringify(report.dataSnapshot || {
        trade_date: report.tradeDate,
        data_source: 'Tushare + 新浪财经'
      })
    ]);
    
    console.log(`[selection-report.js] 选股报告已保存：${report.reportId}`);
  } catch (error) {
    console.error('[selection-report.js] 保存选股报告失败:', error.message);
    throw error;
  } finally {
    db.close();
  }
}

/**
 * 获取选股报告列表（内部实现）
 * @param {number} limit - 返回数量限制
 * @returns {Array} 选股报告列表
 */
function _getSelectionHistoryInternal(limit = 20) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const limitNum = Number(limit) || 20;
    const sql = `
      SELECT
        report_id,
        trade_date,
        created_at,
        json_extract(statistics, '$.final_selected') as selected_count,
        json_extract(filter_config, '$.industry_filter') as industries
      FROM stock_selection_reports
      ORDER BY created_at DESC
      LIMIT ${limitNum}
    `;

    const stmt = db.prepare(sql);
    return stmt.all();
  } catch (error) {
    console.error('[selection-report.js] 查询选股历史失败:', error.message);
    throw error;
  } finally {
    db.close();
  }
}

/**
 * 获取选股报告列表
 *
 * 兼容两种调用方式：
 * 1. Express handler: getSelectionHistory(req, res) -> 调用 res.json()
 * 2. 直接调用: getSelectionHistory(limit) -> 返回数组
 *
 * @param {object|number} reqOrLimit - Express request 对象 或 数量限制
 * @param {object} [res] - Express response 对象
 * @returns {Array|void} 直接调用时返回数组，Express handler 时返回 void
 */
function getSelectionHistory(reqOrLimit, res) {
  // 判断是否为 Express handler 调用方式
  // Express request 对象有 query 属性，且 res 存在
  const isExpressHandler =
    reqOrLimit !== null &&
    typeof reqOrLimit === 'object' &&
    typeof reqOrLimit.query === 'object' &&
    res !== undefined &&
    typeof res.json === 'function';

  if (isExpressHandler) {
    // Express handler 模式
    try {
      const limit = reqOrLimit.query.limit;
      const result = _getSelectionHistoryInternal(limit);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
    return;
  }

  // 直接调用模式
  return _getSelectionHistoryInternal(reqOrLimit);
}

function _getSelectionReportInternal(reportId) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const sql = `SELECT * FROM stock_selection_reports WHERE report_id = ?`;
    const stmt = db.prepare(sql);
    const row = stmt.get(reportId);
    
    if (row) {
      // 解析 JSON 字段
      row.filter_config = JSON.parse(row.filter_config);
      row.selected_stocks = JSON.parse(row.selected_stocks);
      row.statistics = JSON.parse(row.statistics);
      row.data_snapshot = JSON.parse(row.data_snapshot);
    }
    
    return row;
  } catch (error) {
    console.error('[selection-report.js] 查询选股报告详情失败:', error.message);
    throw error;
  } finally {
    db.close();
  }
}

/**
 * 获取选股报告详情
 *
 * 兼容两种调用方式：
 * 1. Express handler: getSelectionReport(req, res)
 * 2. 直接调用: getSelectionReport(reportId)
 *
 * @param {object|string} reqOrReportId - Express request 对象 或 报告 ID
 * @param {object} [res] - Express response 对象
 * @returns {Object|void}
 */
function getSelectionReport(reqOrReportId, res) {
  const isExpressHandler =
    reqOrReportId !== null &&
    typeof reqOrReportId === 'object' &&
    typeof reqOrReportId.params === 'object' &&
    res !== undefined &&
    typeof res.json === 'function';

  if (isExpressHandler) {
    try {
      const report = _getSelectionReportInternal(reqOrReportId.params.id);
      if (!report) {
        res.status(404).json({ success: false, error: 'report not found' });
        return;
      }
      res.json({ success: true, data: report });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
    return;
  }

  return _getSelectionReportInternal(reqOrReportId);
}

module.exports = {
  saveSelectionReport,
  getSelectionHistory,
  getSelectionReport
};
