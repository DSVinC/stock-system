#!/usr/bin/env node
/**
 * 数据库迁移脚本：添加七因子原始数据列
 * 
 * 用途：扩展 stock_factor_snapshot 表结构，支持动态权重计算
 * 执行：node scripts/migrate_add_factor_columns.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

// 需要添加的列定义
const COLUMNS = [
  // 七因子原始数据
  { name: 'trend_score', type: 'REAL', default: 0, comment: '趋势因子 (RSI/MACD/均线)' },
  { name: 'momentum_score', type: 'REAL', default: 0, comment: '动量因子 (涨跌幅/量比)' },
  { name: 'valuation_score', type: 'REAL', default: 0, comment: '估值因子 (PE/PB/PEG)' },
  { name: 'earnings_score', type: 'REAL', default: 0, comment: '业绩因子 (ROE/营收增长/净利润增长)' },
  { name: 'capital_score_raw', type: 'REAL', default: 0, comment: '资金因子 (主力流入)' },
  { name: 'volatility_score', type: 'REAL', default: 0, comment: '波动率因子 (换手率/振幅)' },
  { name: 'sentiment_score_raw', type: 'REAL', default: 0, comment: '舆情因子 (新闻/热度)' },
  
  // 四维度原始数据（用于行业评分）
  { name: 'social_score', type: 'REAL', default: 0, comment: '社会价值维度' },
  { name: 'policy_score_raw', type: 'REAL', default: 0, comment: '政策方向维度' },
  { name: 'public_score', type: 'REAL', default: 0, comment: '舆论热度维度' },
  { name: 'business_score', type: 'REAL', default: 0, comment: '商业变现维度' }
];

function migrate() {
  console.log('🔧 开始数据库迁移...');
  console.log(`📁 数据库路径：${DB_PATH}`);
  
  const db = new Database(DB_PATH);
  
  // 启用 WAL 模式
  db.exec('PRAGMA journal_mode = WAL;');
  
  // 检查当前表结构
  const existingColumns = db.prepare("PRAGMA table_info(stock_factor_snapshot)").all();
  const existingColumnNames = existingColumns.map(c => c.name);
  
  console.log(`\n📊 当前表结构：${existingColumnNames.length} 列`);
  console.log(`   现有列：${existingColumnNames.join(', ')}`);
  
  // 添加新列
  let addedCount = 0;
  let skippedCount = 0;
  
  for (const col of COLUMNS) {
    if (existingColumnNames.includes(col.name)) {
      console.log(`⏭️  跳过已存在列：${col.name}`);
      skippedCount++;
      continue;
    }
    
    const sql = `ALTER TABLE stock_factor_snapshot ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default}`;
    console.log(`\n➕  添加列：${col.name} (${col.comment})`);
    console.log(`   SQL: ${sql}`);
    
    try {
      db.exec(sql);
      console.log(`✅  添加成功`);
      addedCount++;
    } catch (error) {
      console.error(`❌  添加失败：${error.message}`);
    }
  }
  
  // 验证迁移结果
  const newColumns = db.prepare("PRAGMA table_info(stock_factor_snapshot)").all();
  console.log(`\n✅ 迁移完成！`);
  console.log(`   新增列数：${addedCount}`);
  console.log(`   跳过列数：${skippedCount}`);
  console.log(`   总列数：${newColumns.length}`);
  
  // 创建索引（优化查询性能）
  console.log(`\n📇 创建索引...`);
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_factor_trade_date ON stock_factor_snapshot(trade_date)',
    'CREATE INDEX IF NOT EXISTS idx_factor_ts_code ON stock_factor_snapshot(ts_code)',
    'CREATE INDEX IF NOT EXISTS idx_factor_trade_ts ON stock_factor_snapshot(trade_date, ts_code)'
  ];
  
  for (const idxSql of indexes) {
    console.log(`   ${idxSql}`);
    db.exec(idxSql);
  }
  
  db.close();
  console.log(`\n🎉 数据库迁移完成！`);
}

// 执行迁移
if (require.main === module) {
  try {
    migrate();
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  }
}

module.exports = { migrate, COLUMNS };
