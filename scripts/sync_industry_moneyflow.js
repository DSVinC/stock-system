#!/usr/bin/env node
/**
 * 数据同步脚本 - 行业资金流缓存
 * 
 * 功能：
 * 1. 同步行业指数列表（每周一次）
 * 2. 同步行业成分股（每周一次）
 * 3. 同步个股资金流（每天盘后）
 * 4. 聚合行业资金流（每天盘后）
 * 
 * 使用：
 *   node scripts/sync_industry_moneyflow.js --full    # 全量同步
 *   node scripts/sync_industry_moneyflow.js --moneyflow  # 只同步资金流
 *   node scripts/sync_industry_moneyflow.js --members    # 只同步成分股
 */

const Database = require('better-sqlite3');
const path = require('path');
const { tushareRequest, formatDate } = require('../api/market-data');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
const db = new Database(DB_PATH);

// ============================================
// 工具函数
// ============================================

function log(...args) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${timestamp}]`, ...args);
}

async function getTradeDate() {
  // 获取最近一个交易日（通过 Tushare 交易日历）
  const today = new Date();
  const endDate = formatDate(today);
  const startDate = formatDate(new Date(today - 10 * 24 * 60 * 60 * 1000)); // 10 天前
  
  try {
    const calendar = await tushareRequest('trade_cal', {
      exchange: 'SSE',
      start_date: startDate,
      end_date: endDate,
      fields: 'cal_date,is_open'
    });
    
    // 找到最近一个开盘日
    const openDays = calendar.filter(d => d.is_open === '1');
    if (openDays.length > 0) {
      return openDays[openDays.length - 1].cal_date;
    }
  } catch (error) {
    console.warn('获取交易日历失败，使用日期推算:', error.message);
  }
  
  // 回退方案：日期推算
  const day = today.getDay();
  if (day === 0) { // 周日
    today.setDate(today.getDate() - 2);
  } else if (day === 6) { // 周六
    today.setDate(today.getDate() - 1);
  }
  return formatDate(today);
}

function syncLog(type, status, records, error = null) {
  const stmt = db.prepare(`
    INSERT INTO sync_log (sync_type, status, records_synced, error_message, started_at, finished_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  stmt.run(type, status, records, error);
}

// ============================================
// 1. 同步行业指数列表
// ============================================

async function syncIndustryIndex() {
  log('开始同步行业指数列表...');
  const startTime = Date.now();
  
  try {
    // 获取所有行业指数
    const indices = await tushareRequest('ths_index', {}, [
      'ts_code', 'name', 'type', 'count'
    ]);
    
    log(`获取到 ${indices.length} 个指数`);
    
    // 分类统计
    const typeCount = {};
    indices.forEach(idx => {
      typeCount[idx.type] = (typeCount[idx.type] || 0) + 1;
    });
    log('类型分布:', typeCount);
    
    // 插入数据库
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO industry_index (ts_code, name, type, count, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    
    const insertMany = db.transaction((rows) => {
      rows.forEach(row => {
        stmt.run(row.ts_code, row.name, row.type, row.count);
      });
    });
    
    insertMany(indices);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ 行业指数同步完成，${indices.length} 条记录，耗时 ${duration}s`);
    
    syncLog('industry_index', 'success', indices.length);
    return indices.length;
  } catch (error) {
    log('❌ 行业指数同步失败:', error.message);
    syncLog('industry_index', 'failed', 0, error.message);
    throw error;
  }
}

// ============================================
// 2. 同步行业成分股
// ============================================

async function syncIndustryMembers(industryType = 'I') {
  log(`开始同步${industryType === 'I' ? '行业' : '概念'}成分股...`);
  const startTime = Date.now();
  
  try {
    // 获取指定类型的行业指数
    const indices = db.prepare(`
      SELECT ts_code, name, type FROM industry_index WHERE type = ?
    `).all(industryType);
    
    log(`获取到 ${indices.length} 个${industryType === 'I' ? '行业' : '概念'}指数`);
    
    let totalMembers = 0;
    let successCount = 0;
    let failCount = 0;
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO industry_member (industry_code, industry_name, industry_type, ts_code, stock_name, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    
    const insertMany = db.transaction((rows) => {
      rows.forEach(row => stmt.run(...row));
    });
    
    // 并行处理，但限制并发数
    const BATCH_SIZE = 10;
    for (let i = 0; i < indices.length; i += BATCH_SIZE) {
      const batch = indices.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (industry) => {
        try {
          const members = await tushareRequest('ths_member', {
            ts_code: industry.ts_code
          }, ['ts_code', 'con_code', 'con_name']);
          
          if (members && members.length > 0) {
            const rows = members.map(m => [
              industry.ts_code,
              industry.name,
              industry.type,
              m.con_code,
              m.con_name
            ]);
            insertMany(rows);
            return { success: true, count: members.length };
          }
          return { success: true, count: 0 };
        } catch (error) {
          log(`  ⚠️ ${industry.name} 同步失败:`, error.message);
          return { success: false, error: error.message };
        }
      });
      
      const results = await Promise.all(promises);
      results.forEach(r => {
        if (r.success) {
          successCount++;
          totalMembers += r.count;
        } else {
          failCount++;
        }
      });
      
      log(`  进度：${Math.min(i + BATCH_SIZE, indices.length)}/${indices.length}`);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ 成分股同步完成：成功${successCount}个，失败${failCount}个，共${totalMembers}条关系，耗时 ${duration}s`);
    
    syncLog('industry_member', failCount > 0 ? 'partial' : 'success', totalMembers);
    return { success: successCount, fail: failCount, total: totalMembers };
  } catch (error) {
    log('❌ 成分股同步失败:', error.message);
    syncLog('industry_member', 'failed', 0, error.message);
    throw error;
  }
}

// ============================================
// 3. 同步个股资金流
// ============================================

async function syncStockMoneyflow(tradeDate = null, limit = null) {
  tradeDate = tradeDate || await getTradeDate();
  log(`开始同步 ${tradeDate} 个股资金流...`);
  const startTime = Date.now();
  
  try {
    // 获取所有股票列表
    let sql = `SELECT ts_code, stock_name FROM stocks WHERE list_status = 'L'`;
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    const stocks = db.prepare(sql).all();
    
    if (stocks.length === 0) {
      log('⚠️ stocks 表为空，先同步股票列表');
      throw new Error('stocks 表为空，请先同步股票列表');
    }
    
    log(`获取到 ${stocks.length} 只股票`);
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO stock_moneyflow 
      (trade_date, ts_code, stock_name, net_mf_amount, buy_lg_amount, sell_lg_amount, buy_elg_amount, sell_elg_amount, pct_change, volume, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertMany = db.transaction((rows) => {
      rows.forEach(row => stmt.run(...row));
    });
    
    // 串行处理，避免频率限制
    let totalSynced = 0;
    let failCount = 0;
    let noDataCount = 0;
    
    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];
      try {
        const flows = await tushareRequest('moneyflow', {
          ts_code: stock.ts_code,
          start_date: tradeDate,
          end_date: tradeDate
        }, ['ts_code', 'trade_date', 'buy_lg_amount', 'sell_lg_amount', 'buy_elg_amount', 'sell_elg_amount', 'net_mf_amount', 'pct_change', 'volume', 'amount']);
        
        if (flows && flows.length > 0) {
          const f = flows[0];
          stmt.run(
            tradeDate,
            stock.ts_code,
            stock.stock_name || stock.ts_code,
            f.net_mf_amount,
            f.buy_lg_amount,
            f.sell_lg_amount,
            f.buy_elg_amount,
            f.sell_elg_amount,
            f.pct_change,
            f.volume,
            f.amount
          );
          totalSynced++;
        } else {
          noDataCount++; // 当天无交易数据（停牌等）
        }
      } catch (error) {
        failCount++;
        // 如果是频率限制错误，增加延迟
        if (error.message.includes('每分钟最多') || error.message.includes('limit')) {
          log(`  ⚠️ 触发频率限制，等待 10 秒...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      
      // 每只股票等待 150ms，确保不超过 400 次/分钟（留余量）
      await new Promise(resolve => setTimeout(resolve, 150));
      
      if ((i + 1) % 100 === 0) {
        log(`  进度：${i + 1}/${stocks.length}，已同步 ${totalSynced} 条，无数据 ${noDataCount} 条，失败 ${failCount} 条`);
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ 个股资金流同步完成：成功${totalSynced}条，失败${failCount}条，耗时 ${duration}s`);
    
    syncLog('stock_moneyflow', failCount > stocks.length * 0.1 ? 'partial' : 'success', totalSynced);
    return { success: totalSynced, fail: failCount };
  } catch (error) {
    log('❌ 个股资金流同步失败:', error.message);
    syncLog('stock_moneyflow', 'failed', 0, error.message);
    throw error;
  }
}

// ============================================
// 4. 聚合行业资金流
// ============================================

function aggregateIndustryMoneyflow(tradeDate = null) {
  tradeDate = tradeDate || getTradeDate();
  log(`开始聚合 ${tradeDate} 行业资金流...`);
  const startTime = Date.now();
  
  try {
    // 删除当天的旧数据
    db.prepare(`DELETE FROM industry_moneyflow WHERE trade_date = ?`).run(tradeDate);
    
    // SQL 聚合：按行业分组，计算资金流总和、平均涨跌幅、成分股数量
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
      JOIN stock_moneyflow smf ON im.ts_code = smf.ts_code
      WHERE smf.trade_date = ?
      GROUP BY im.industry_code, im.industry_name, im.industry_type
    `;
    
    db.prepare(sql).run(tradeDate, tradeDate);
    
    // 更新排名
    db.prepare(`
      UPDATE industry_moneyflow 
      SET rank_by_net_mf = (
        SELECT COUNT(*) + 1 
        FROM industry_moneyflow im2 
        WHERE im2.trade_date = industry_moneyflow.trade_date 
        AND im2.net_mf_amount > industry_moneyflow.net_mf_amount
      )
      WHERE trade_date = ?
    `).run(tradeDate);
    
    // 统计结果
    const stats = db.prepare(`
      SELECT COUNT(*) as count, SUM(stock_count) as total_stocks
      FROM industry_moneyflow 
      WHERE trade_date = ?
    `).get(tradeDate);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ 行业资金流聚合完成：${stats.count}个行业，覆盖${stats.total_stocks}只股票，耗时 ${duration}s`);
    
    syncLog('industry_moneyflow', 'success', stats.count);
    return stats;
  } catch (error) {
    log('❌ 行业资金流聚合失败:', error.message);
    syncLog('industry_moneyflow', 'failed', 0, error.message);
    throw error;
  }
}

// ============================================
// 主函数
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find(a => a.startsWith('--')) || '--full';
  
  log('='.repeat(50));
  log('行业资金流数据同步脚本');
  log('='.repeat(50));
  
  try {
    if (mode === '--full' || mode === '--index') {
      await syncIndustryIndex();
    }
    
    if (mode === '--full' || mode === '--members') {
      await syncIndustryMembers('I');  // 行业
      // await syncIndustryMembers('N');  // 概念（可选）
    }
    
    if (mode === '--full' || mode === '--moneyflow') {
      await syncStockMoneyflow();
      await aggregateIndustryMoneyflow();
    }
    
    log('='.repeat(50));
    log('✅ 全部同步完成！');
    log('='.repeat(50));
    
    // 显示最新排名
    const top10 = db.prepare(`
      SELECT industry_name, net_mf_amount, avg_pct_change, stock_count, rank_by_net_mf
      FROM industry_moneyflow 
      WHERE trade_date = (SELECT MAX(trade_date) FROM industry_moneyflow)
      ORDER BY rank_by_net_mf 
      LIMIT 10
    `).all();
    
    log('\n📊 最新行业资金流排名 (Top 10):');
    top10.forEach((r, i) => {
      log(`  ${i+1}. ${r.industry_name}: 净流入${(r.net_mf_amount/10000).toFixed(2)}万，涨幅${r.avg_pct_change?.toFixed(2) || 0}%`);
    });
    
  } catch (error) {
    log('❌ 同步过程中断:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 导出函数供其他模块使用
module.exports = {
  syncIndustryIndex,
  syncIndustryMembers,
  syncStockMoneyflow,
  aggregateIndustryMoneyflow,
  getTradeDate
};

// 运行主函数
if (require.main === module) {
  main();
}
