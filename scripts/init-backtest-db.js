/**
 * 回测模块数据库初始化
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.STOCK_DB_PATH || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  }
  console.log('数据库已连接:', DB_PATH);
});

// 创建回测报告表
const createBacktestTable = `
CREATE TABLE IF NOT EXISTS backtest_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  initial_cash REAL NOT NULL,
  final_value REAL NOT NULL,
  total_return REAL NOT NULL,
  return_rate REAL NOT NULL,
  max_drawdown REAL NOT NULL,
  sharpe_ratio REAL,
  win_rate REAL NOT NULL,
  trade_count INTEGER NOT NULL,
  report_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

// 创建回测交易记录表
const createBacktestTradesTable = `
CREATE TABLE IF NOT EXISTS backtest_trade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id INTEGER NOT NULL,
  trade_date TEXT NOT NULL,
  ts_code TEXT NOT NULL,
  stock_name TEXT,
  action TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  amount REAL NOT NULL,
  profit REAL,
  profit_rate REAL,
  FOREIGN KEY (backtest_id) REFERENCES backtest_report(id)
);
`;

// 创建回测每日净值表
const createBacktestDailyTable = `
CREATE TABLE IF NOT EXISTS backtest_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backtest_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  cash REAL NOT NULL,
  stock_value REAL NOT NULL,
  total_value REAL NOT NULL,
  return_rate REAL NOT NULL,
  FOREIGN KEY (backtest_id) REFERENCES backtest_report(id)
);
`;

db.serialize(() => {
  console.log('创建回测报告表...');
  db.run(createBacktestTable, (err) => {
    if (err) console.error('创建回测报告表失败:', err.message);
    else console.log('✅ 回测报告表已创建');
  });
  
  console.log('创建回测交易记录表...');
  db.run(createBacktestTradesTable, (err) => {
    if (err) console.error('创建回测交易记录表失败:', err.message);
    else console.log('✅ 回测交易记录表已创建');
  });
  
  console.log('创建回测每日净值表...');
  db.run(createBacktestDailyTable, (err) => {
    if (err) console.error('创建回测每日净值表失败:', err.message);
    else console.log('✅ 回测每日净值表已创建');
  });
});

db.close((err) => {
  if (err) {
    console.error('关闭数据库失败:', err.message);
  } else {
    console.log('\n数据库初始化完成');
  }
});
