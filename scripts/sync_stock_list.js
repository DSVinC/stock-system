#!/usr/bin/env node
/**
 * 同步股票列表到 stocks 表
 */

const Database = require('better-sqlite3');
const { tushareRequest } = require('../api/market-data');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
const db = new Database(DB_PATH);

async function syncStockList() {
  console.log('开始同步股票列表...');
  
  // 获取所有 A 股股票
  const stocks = await tushareRequest('stock_basic', {
    exchange: '',
    list_status: 'L',
    fields: 'ts_code,symbol,name,area,industry,market,list_date'
  });
  
  console.log(`获取到 ${stocks.length} 只股票`);
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO stocks 
    (ts_code, stock_name, list_status, industry_code_l1, industry_name_l1, list_date, updated_at)
    VALUES (?, ?, 'L', ?, ?, ?, datetime('now'))
  `);
  
  const insertMany = db.transaction((rows) => {
    rows.forEach(row => stmt.run(...row));
  });
  
  const rows = stocks.map(s => [
    s.ts_code,
    s.name,
    s.industry || '',
    s.industry || '',
    s.list_date
  ]);
  
  insertMany(rows);
  
  const count = db.prepare('SELECT COUNT(*) as c FROM stocks').get().c;
  console.log(`✅ 股票列表同步完成，共 ${count} 只股票`);
  
  db.close();
}

syncStockList().catch(console.error);
