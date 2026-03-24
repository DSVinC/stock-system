#!/usr/bin/env node

/**
 * 创建回测相关数据库表
 */

const { getDatabase } = require('../api/db');

function createBacktestTables() {
  const db = getDatabase();
  
  console.log('开始创建回测相关数据库表...');
  
  // 创建回测历史表
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      strategy_config TEXT NOT NULL,
      result_summary TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建索引
  db.exec('CREATE INDEX IF NOT EXISTS idx_backtest_history_date ON backtest_history(start_date, end_date)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_backtest_history_created ON backtest_history(created_at DESC)');
  
  // 创建回测详情表（用于存储更详细的结果）
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backtest_id INTEGER NOT NULL,
      equity_curve TEXT, -- JSON数组
      daily_returns TEXT, -- JSON数组
      trades TEXT, -- JSON数组
      positions TEXT, -- JSON数组
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (backtest_id) REFERENCES backtest_history(id) ON DELETE CASCADE
    )
  `);
  
  // 创建回测参数扫描表
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_parameter_scan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_name TEXT NOT NULL,
      base_strategy TEXT NOT NULL,
      param_ranges TEXT NOT NULL,
      results TEXT NOT NULL,
      best_result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('回测相关数据库表创建完成！');
  console.log('已创建的表:');
  console.log('  - backtest_history: 回测历史记录');
  console.log('  - backtest_detail: 回测详细结果');
  console.log('  - backtest_parameter_scan: 参数扫描结果');
}

// 执行
try {
  createBacktestTables();
  console.log('数据库表初始化成功！');
} catch (error) {
  console.error('数据库表初始化失败:', error);
  process.exit(1);
}