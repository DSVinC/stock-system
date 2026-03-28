#!/usr/bin/env node
/**
 * 资金流批量回填脚本（优化版）
 *
 * 功能：
 * 1. 批量获取全市场资金流数据（每个交易日 1 次请求）
 * 2. 回填 stock_moneyflow_snapshot 表
 * 3. 聚合生成 industry_moneyflow_snapshot 表
 * 4. 支持断点续传
 *
 * 使用：
 *   node scripts/backfill/backfill_moneyflow_batch.js              # 从断点继续
 *   node scripts/backfill/backfill_moneyflow_batch.js --full       # 全量回填
 *   node scripts/backfill/backfill_moneyflow_batch.js --start 20210101 --end 20260324  # 指定范围
 *   node scripts/backfill/backfill_moneyflow_batch.js --dry-run    # 试运行
 *
 * 优化：
 * - 批量模式：每个交易日 1 次请求获取全市场 5000+ 只股票
 * - 速度提升：从 10 天缩短到 2-3 小时（80 倍加速）
 * - 8000 积分限流：500 次/分钟（120ms 间隔）
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// 从 Keychain 加载 TUSHARE_TOKEN
try {
  const keychainOutput = execSync(
    'echo \'{"ids": ["skills/tushare/token"]}\' | /Users/vvc/.openclaw/bin/openclaw-keychain-secrets',
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
  );
  const parsed = JSON.parse(keychainOutput);
  if (parsed.values && parsed.values['skills/tushare/token']) {
    process.env.TUSHARE_TOKEN = parsed.values['skills/tushare/token'];
  } else {
    throw new Error('Keychain 中未找到 skills/tushare/token');
  }
} catch (error) {
  console.error('⚠️ 从 Keychain 加载 TUSHARE_TOKEN 失败:', error.message);
  process.exit(1);
}

const { tushareRequest, formatDate } = require('../../api/market-data');

// 配置
const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
const PROGRESS_FILE = path.join(__dirname, '.backfill_moneyflow_batch_progress.json');

// 8000 积分 = 500 次/分钟
const RATE_LIMIT_PER_MINUTE = 500;
const REQUEST_INTERVAL_MS = Math.ceil(60000 / RATE_LIMIT_PER_MINUTE); // 120ms

// 全局状态
let DRY_RUN = false;
let db = null;

function log(...args) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${timestamp}]`, ...args);
}

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

// ============================================
// 进度管理
// ============================================

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (error) {
    log('⚠️ 读取进度文件失败');
  }
  return { completedDates: [], stats: { totalDays: 0, successDays: 0, failedDays: 0, totalRecords: 0 } };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ============================================
// 交易日历
// ============================================

async function getTradeCalendar(startDate, endDate) {
  log(`获取交易日历：${startDate} - ${endDate}`);
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT trade_date FROM stock_factor_snapshot 
     WHERE trade_date >= ? AND trade_date <= ? 
     ORDER BY trade_date`
  ).all(startDate, endDate);
  const tradeDates = rows.map(row => row.trade_date);
  log(`获取到 ${tradeDates.length} 个交易日`);
  return tradeDates;
}

// ============================================
// 股票列表
// ============================================

function getStockList() {
  const db = getDb();
  const stocks = db.prepare(`
    SELECT ts_code, stock_name, industry_code_l1, industry_name_l1, list_date
    FROM stocks
    WHERE list_status = 'L'
    ORDER BY ts_code
  `).all();
  log(`获取到 ${stocks.length} 只股票`);
  return stocks;
}

// ============================================
// 日期工具
// ============================================

function isDateAfter(date1, date2) {
  return String(date1).localeCompare(String(date2)) > 0;
}

// ============================================
// 1. 回填个股资金流（批量模式）
// ============================================

async function backfillStockMoneyflow(tradeDate, stockList) {
  const db = getDb();
  let successCount = 0;
  let skipCount = 0;

  // 构建股票索引
  const stockIndex = new Map();
  for (const stock of stockList) {
    stockIndex.set(stock.ts_code, stock);
  }

  log(`  批量获取 ${tradeDate} 全市场资金流...`);

  // 批量获取全市场数据
  let allFlows = [];
  try {
    allFlows = await tushareRequest('moneyflow', { trade_date: tradeDate });
    log(`  获取到 ${allFlows.length} 只股票数据`);
  } catch (error) {
    log(`  ❌ 获取失败：`, error.message);
    return { successCount: 0, skipCount: 0, error: true };
  }

  // 准备插入
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO stock_moneyflow_snapshot
    (trade_date, ts_code, stock_name, net_mf_amount, buy_lg_amount, sell_lg_amount,
     buy_elg_amount, sell_elg_amount, pct_change, close_price, volume, amount,
     industry_code, industry_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const rowsToInsert = [];
  for (const flow of allFlows) {
    const stock = stockIndex.get(flow.ts_code);
    
    // 跳过未上市的股票
    if (stock && stock.list_date && !isDateAfter(tradeDate, stock.list_date)) {
      skipCount++;
      continue;
    }

    rowsToInsert.push([
      flow.trade_date,
      flow.ts_code,
      stock ? stock.stock_name : flow.ts_code,
      flow.net_mf_amount,
      flow.buy_lg_amount,
      flow.sell_lg_amount,
      flow.buy_elg_amount,
      flow.sell_elg_amount,
      flow.pct_change,
      flow.close_price,
      flow.volume,
      flow.amount,
      stock ? stock.industry_code_l1 : '',
      stock ? stock.industry_name_l1 : ''
    ]);
    successCount++;
  }

  // 批量插入
  if (!DRY_RUN && rowsToInsert.length > 0) {
    const insertMany = db.transaction((rows) => {
      for (const row of rows) stmt.run(...row);
    });
    insertMany(rowsToInsert);
    log(`  ✅ 插入 ${rowsToInsert.length} 条记录`);
  } else if (DRY_RUN) {
    log(`  [DRY-RUN] 模拟插入 ${rowsToInsert.length} 条`);
  }

  return { successCount, skipCount, error: false };
}

// ============================================
// 2. 聚合行业资金流
// ============================================

async function aggregateIndustryMoneyflow(tradeDate) {
  const db = getDb();

  log(`  聚合 ${tradeDate} 行业资金流...`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO industry_moneyflow_snapshot
    (trade_date, industry_code, industry_name, net_mf_amount, buy_lg_amount, 
     sell_lg_amount, buy_elg_amount, sell_elg_amount, avg_pct_change, 
     stock_count, inflow_stock_count, outflow_stock_count, 
     rank_by_net_mf, rank_by_avg_pct_change)
    SELECT 
      ? as trade_date,
      industry_code,
      industry_name,
      SUM(net_mf_amount) as net_mf_amount,
      SUM(buy_lg_amount) as buy_lg_amount,
      SUM(sell_lg_amount) as sell_lg_amount,
      SUM(buy_elg_amount) as buy_elg_amount,
      SUM(sell_elg_amount) as sell_elg_amount,
      AVG(pct_change) as avg_pct_change,
      COUNT(*) as stock_count,
      SUM(CASE WHEN net_mf_amount > 0 THEN 1 ELSE 0 END) as inflow_stock_count,
      SUM(CASE WHEN net_mf_amount < 0 THEN 1 ELSE 0 END) as outflow_stock_count,
      RANK() OVER (ORDER BY SUM(net_mf_amount) DESC) as rank_by_net_mf,
      RANK() OVER (ORDER BY AVG(pct_change) DESC) as rank_by_avg_pct_change
    FROM stock_moneyflow_snapshot
    WHERE trade_date = ? AND industry_code != '' AND industry_name != ''
    GROUP BY industry_code, industry_name
  `);

  if (!DRY_RUN) {
    stmt.run(tradeDate, tradeDate);
    const result = db.prepare('SELECT changes() as changes').get();
    log(`  ✅ 聚合 ${result.changes} 个行业`);
  } else {
    log(`  [DRY-RUN] 模拟聚合行业数据`);
  }
}

// ============================================
// 主流程
// ============================================

async function main() {
  const args = process.argv.slice(2);
  DRY_RUN = args.includes('--dry-run');
  const isFull = args.includes('--full');

  // 解析日期范围
  let startDate = '20210101';
  let endDate = formatDate(new Date());

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' && args[i + 1]) startDate = args[i + 1];
    if (args[i] === '--end' && args[i + 1]) endDate = args[i + 1];
  }

  log('🚀 资金流批量回填启动');
  log(`参数：${startDate} - ${endDate}, 干跑=${DRY_RUN}, 全量=${isFull}`);

  // 加载进度
  let progress = loadProgress();
  if (isFull) {
    progress = { completedDates: [], stats: { totalDays: 0, successDays: 0, failedDays: 0, totalRecords: 0 } };
    log('🔄 全量模式：清空进度');
  }

  // 获取交易日历
  const tradeDates = await getTradeCalendar(startDate, endDate);
  const pendingDates = tradeDates.filter(d => !progress.completedDates.includes(d));

  log(`待回填：${pendingDates.length} 个交易日`);
  log(`已完成：${progress.completedDates.length} 天`);
  log(`预计时间：${(pendingDates.length * REQUEST_INTERVAL_MS / 1000 / 60).toFixed(1)} 分钟（纯 API）`);

  // 获取股票列表
  const stockList = getStockList();

  // 主循环
  const startTime = Date.now();
  for (let i = 0; i < pendingDates.length; i++) {
    const tradeDate = pendingDates[i];
    const stepStart = Date.now();

    log(`\n进度：${i + 1}/${pendingDates.length} (${((i + 1) / pendingDates.length * 100).toFixed(1)}%)`);

    // 1. 回填个股资金流
    const result = await backfillStockMoneyflow(tradeDate, stockList);
    
    if (result.error) {
      progress.stats.failedDays++;
    } else {
      // 2. 聚合行业资金流
      await aggregateIndustryMoneyflow(tradeDate);
      progress.completedDates.push(tradeDate);
      progress.stats.successDays++;
      progress.stats.totalRecords += result.successCount;
    }

    // 保存进度
    saveProgress(progress);

    // 限流
    const elapsed = Date.now() - stepStart;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS - elapsed));
    }

    // 每 10 天输出统计
    if ((i + 1) % 10 === 0) {
      const eta = ((pendingDates.length - i - 1) * REQUEST_INTERVAL_MS / 1000 / 60).toFixed(1);
      log(`📊 进度：${i + 1}/${pendingDates.length}, 剩余约 ${eta} 分钟`);
    }
  }

  const totalElapsed = (Date.now() - startTime) / 1000 / 60;
  log(`\n✅ 回填完成！`);
  log(`总耗时：${totalElapsed.toFixed(1)} 分钟`);
  log(`成功：${progress.stats.successDays} 天，失败：${progress.stats.failedDays} 天`);
  log(`总记录：${progress.stats.totalRecords.toLocaleString()} 条`);
}

main().catch(error => {
  log('❌ 错误:', error.message);
  console.error(error);
  process.exit(1);
});
