/**
 * 估值数据服务
 * 管理行业PE/PB中位数、历史PE分位数等估值数据
 */

const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_DB_PATH = path.join(CACHE_DIR, 'valuation_cache.db');

// 确保数据目录存在
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// 初始化数据库
function initDatabase() {
  const db = new sqlite3.Database(CACHE_DB_PATH);

  db.serialize(() => {
    // 行业估值数据表
    db.run(`
      CREATE TABLE IF NOT EXISTS industry_valuation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        industry_name TEXT NOT NULL,
        pe_median REAL,
        pb_median REAL,
        ps_median REAL,
        stock_count INTEGER,
        trade_date TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(industry_name, trade_date)
      )
    `);

    // 个股历史PE分位数表
    db.run(`
      CREATE TABLE IF NOT EXISTS stock_pe_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_code TEXT NOT NULL,
        pe_percentile_5y REAL,
        pe_percentile_3y REAL,
        pe_percentile_1y REAL,
        pe_min_5y REAL,
        pe_max_5y REAL,
        pe_avg_5y REAL,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ts_code)
      )
    `);

    // ATR数据表
    db.run(`
      CREATE TABLE IF NOT EXISTS stock_atr (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_code TEXT NOT NULL,
        atr_14 REAL,
        atr_20 REAL,
        trade_date TEXT NOT NULL,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ts_code, trade_date)
      )
    `);

    // 数据更新日志表
    db.run(`
      CREATE TABLE IF NOT EXISTS update_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        record_count INTEGER,
        status TEXT,
        message TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  db.close();
  console.log('[ValuationService] Database initialized');
}

// 获取数据库连接
function getDb() {
  return new sqlite3.Database(CACHE_DB_PATH);
}

// 保存行业估值数据
async function saveIndustryValuation(industryData) {
  const db = getDb();
  const { industry_name, pe_median, pb_median, ps_median, stock_count, trade_date } = industryData;

  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO industry_valuation
      (industry_name, pe_median, pb_median, ps_median, stock_count, trade_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.run(sql, [industry_name, pe_median, pb_median, ps_median, stock_count, trade_date], (err) => {
      db.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

// 批量保存行业估值数据
async function batchSaveIndustryValuation(industryList) {
  const db = getDb();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO industry_valuation
        (industry_name, pe_median, pb_median, ps_median, stock_count, trade_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      industryList.forEach(item => {
        stmt.run([
          item.industry_name,
          item.pe_median,
          item.pb_median,
          item.ps_median,
          item.stock_count,
          item.trade_date
        ]);
      });

      stmt.finalize((err) => {
        db.close();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// 获取行业估值数据
async function getIndustryValuation(industryName, tradeDate) {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM industry_valuation
      WHERE industry_name = ? AND trade_date = ?
      ORDER BY updated_at DESC LIMIT 1
    `;
    db.get(sql, [industryName, tradeDate], (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 获取最新行业估值数据（不指定日期）
async function getLatestIndustryValuation(industryName) {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM industry_valuation
      WHERE industry_name = ?
      ORDER BY trade_date DESC LIMIT 1
    `;
    db.get(sql, [industryName], (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 保存个股历史PE分位数
async function saveStockPeHistory(peData) {
  const db = getDb();
  const {
    ts_code,
    pe_percentile_5y,
    pe_percentile_3y,
    pe_percentile_1y,
    pe_min_5y,
    pe_max_5y,
    pe_avg_5y
  } = peData;

  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO stock_pe_history
      (ts_code, pe_percentile_5y, pe_percentile_3y, pe_percentile_1y,
       pe_min_5y, pe_max_5y, pe_avg_5y, calculated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    db.run(sql, [
      ts_code,
      pe_percentile_5y,
      pe_percentile_3y,
      pe_percentile_1y,
      pe_min_5y,
      pe_max_5y,
      pe_avg_5y
    ], (err) => {
      db.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

// 获取个股历史PE分位数
async function getStockPeHistory(tsCode) {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `SELECT * FROM stock_pe_history WHERE ts_code = ?`;
    db.get(sql, [tsCode], (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 保存ATR数据
async function saveStockAtr(atrData) {
  const db = getDb();
  const { ts_code, atr_14, atr_20, trade_date } = atrData;

  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO stock_atr
      (ts_code, atr_14, atr_20, trade_date, calculated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    db.run(sql, [ts_code, atr_14, atr_20, trade_date], (err) => {
      db.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

// 获取ATR数据
async function getStockAtr(tsCode, tradeDate) {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM stock_atr
      WHERE ts_code = ? AND trade_date = ?
      ORDER BY calculated_at DESC LIMIT 1
    `;
    db.get(sql, [tsCode, tradeDate], (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 获取最新ATR数据
async function getLatestStockAtr(tsCode) {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM stock_atr
      WHERE ts_code = ?
      ORDER BY trade_date DESC LIMIT 1
    `;
    db.get(sql, [tsCode], (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// 记录更新日志
async function logUpdate(dataType, tradeDate, recordCount, status, message = '') {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO update_log (data_type, trade_date, record_count, status, message)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(sql, [dataType, tradeDate, recordCount, status, message], (err) => {
      db.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

// 获取最近更新日志
async function getRecentUpdateLog(dataType, limit = 10) {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM update_log
      WHERE data_type = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `;
    db.all(sql, [dataType, limit], (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// 初始化
initDatabase();

module.exports = {
  // 行业估值
  saveIndustryValuation,
  batchSaveIndustryValuation,
  getIndustryValuation,
  getLatestIndustryValuation,

  // 历史PE
  saveStockPeHistory,
  getStockPeHistory,

  // ATR
  saveStockAtr,
  getStockAtr,
  getLatestStockAtr,

  // 日志
  logUpdate,
  getRecentUpdateLog,

  // 工具
  initDatabase,
  CACHE_DB_PATH
};