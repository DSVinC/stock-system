#!/usr/bin/env node
/**
 * 测试资金流同步（只同步前 20 只股票）
 */

const Database = require('better-sqlite3');
const { tushareRequest, formatDate } = require('../api/market-data');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
const db = new Database(DB_PATH);

async function testMoneyflow() {
  const tradeDate = formatDate(new Date());
  console.log(`测试日期：${tradeDate}`);
  
  // 获取前 20 只股票
  const stocks = db.prepare(`
    SELECT ts_code, stock_name FROM stocks LIMIT 20
  `).all();
  
  console.log(`测试 ${stocks.length} 只股票...`);
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO stock_moneyflow 
    (trade_date, ts_code, stock_name, net_mf_amount, buy_lg_amount, sell_lg_amount, pct_change, volume, amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const stock of stocks) {
    try {
      const flows = await tushareRequest('moneyflow', {
        ts_code: stock.ts_code,
        start_date: tradeDate,
        end_date: tradeDate
      }, ['ts_code', 'trade_date', 'buy_lg_amount', 'sell_lg_amount', 'net_mf_amount', 'pct_change', 'volume', 'amount']);
      
      if (flows && flows.length > 0) {
        const f = flows[0];
        stmt.run(
          tradeDate,
          stock.ts_code,
          stock.stock_name,
          f.net_mf_amount,
          f.buy_lg_amount,
          f.sell_lg_amount,
          f.pct_change,
          f.volume,
          f.amount
        );
        console.log(`  ✅ ${stock.stock_name}: 净流入 ${(f.net_mf_amount/10000).toFixed(2)}万`);
      } else {
        console.log(`  ⚠️ ${stock.stock_name}: 无数据`);
      }
    } catch (error) {
      console.log(`  ❌ ${stock.stock_name}: ${error.message}`);
    }
  }
  
  const count = db.prepare(`SELECT COUNT(*) as c FROM stock_moneyflow WHERE trade_date = ?`).get(tradeDate).c;
  console.log(`\n✅ 测试完成，同步 ${count} 条记录`);
  
  // 测试聚合
  console.log('\n测试行业资金流聚合...');
  db.prepare(`DELETE FROM industry_moneyflow WHERE trade_date = ?`).run(tradeDate);
  
  const sql = `
    INSERT INTO industry_moneyflow 
    (trade_date, industry_code, industry_name, industry_type, net_mf_amount, avg_pct_change, stock_count)
    SELECT 
      ? as trade_date,
      im.industry_code,
      im.industry_name,
      im.industry_type,
      SUM(smf.net_mf_amount) as net_mf_amount,
      AVG(smf.pct_change) as avg_pct_change,
      COUNT(*) as stock_count
    FROM industry_member im
    LEFT JOIN stock_moneyflow smf ON im.ts_code = smf.ts_code AND smf.trade_date = ?
    WHERE smf.ts_code IS NOT NULL
    GROUP BY im.industry_code, im.industry_name, im.industry_type
    HAVING COUNT(*) > 0
  `;
  
  db.prepare(sql).run(tradeDate, tradeDate);
  
  const industries = db.prepare(`
    SELECT industry_name, net_mf_amount, stock_count
    FROM industry_moneyflow 
    WHERE trade_date = ?
    ORDER BY net_mf_amount DESC
    LIMIT 10
  `).all(tradeDate);
  
  console.log('\n📊 行业资金流排名 (Top 10):');
  industries.forEach((r, i) => {
    console.log(`  ${i+1}. ${r.industry_name}: 净流入${(r.net_mf_amount/10000).toFixed(2)}万，${r.stock_count}只股票`);
  });
  
  db.close();
}

testMoneyflow().catch(console.error);
