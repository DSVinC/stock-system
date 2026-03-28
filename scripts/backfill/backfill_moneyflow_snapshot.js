#!/usr/bin/env node
/**
 * 资金流数据回填脚本
 *
 * 功能：
 * 1. 回填 stock_moneyflow_snapshot 表（2020-2026年历史数据）
 * 2. 聚合生成 industry_moneyflow_snapshot 表数据
 * 3. 支持断点续传
 * 4. 分批处理避免 API 限流（Tushare 限制每分钟 400 次）
 *
 * 使用：
 *   node scripts/backfill/backfill_moneyflow_snapshot.js              # 从断点继续
 *   node scripts/backfill/backfill_moneyflow_snapshot.js --full       # 全量回填（忽略进度）
 *   node scripts/backfill/backfill_moneyflow_snapshot.js --date 20250101  # 回填单个日期
 *   node scripts/backfill/backfill_moneyflow_snapshot.js --start 20240101 --end 20241231  # 指定日期范围
 *   node scripts/backfill/backfill_moneyflow_snapshot.js --dry-run    # 试运行（不写入数据库）
 *
 * 注意：
 * - 首次运行前确保已同步股票列表：node scripts/sync_stock_list.js
 * - 数据库表需要先创建：运行 db/migrations/009_create_factor_moneyflow_tables.sql
 * - Tushare API 限制每分钟 400 次请求，脚本已内置限流控制
 * - 断点续传进度保存在 scripts/backfill/.backfill_moneyflow_progress.json
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
  console.error('请确保已运行：security add-generic-password -a "value" -s "openclaw/skills/tushare/token" -w "<token>" -U');
  process.exit(1);
}

const { tushareRequest, formatDate } = require('../../api/market-data');

// 配置
const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
const PROGRESS_FILE = path.join(__dirname, '.backfill_moneyflow_progress.json');
const START_DATE = '20200101';
const END_DATE = formatDate(new Date());

// Tushare API 限制：每分钟最多 500 次请求（8000 积分）
// 批量模式：每个交易日 1 次请求获取全市场数据
const RATE_LIMIT_PER_MINUTE = 500;
const REQUEST_INTERVAL_MS = Math.ceil(60000 / RATE_LIMIT_PER_MINUTE); // 120ms

// 全局状态
let DRY_RUN = false;

// 日志
function log(...args) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${timestamp}]`, ...args);
}

// 数据库连接
let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

// ============================================
// 进度管理（断点续传）
// ============================================

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const raw = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (error) {
    log('⚠️ 读取进度文件失败，将从头开始:', error.message);
  }
  return {
    lastDate: START_DATE,
    processedDates: [],
    stats: { totalDays: 0, successDays: 0, failedDays: 0, totalRecords: 0 }
  };
}

function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    log('⚠️ 保存进度文件失败:', error.message);
  }
}

function clearProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
  } catch (error) {
    // ignore
  }
}

// ============================================
// 交易日历
// ============================================

async function getTradeCalendar(startDate, endDate) {
  log(`获取交易日历：${startDate} - ${endDate}`);
  const db = getDb();
  const stmt = db.prepare(`SELECT DISTINCT trade_date FROM stock_factor_snapshot WHERE trade_date >= ? AND trade_date <= ? ORDER BY trade_date`);
  const rows = stmt.all(startDate, endDate);
  const tradeDates = rows.map(row => row.trade_date);
  log(`获取到 ${tradeDates.length} 个交易日`);
  return tradeDates;
}
// ============================================

function getStockList() {
  const database = getDb();

  // 检查 stocks 表是否存在
  const tableExists = database.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='stocks'
  `).get();

  if (!tableExists) {
    throw new Error('stocks 表不存在，请先运行 node scripts/sync_stock_list.js');
  }

  const stocks = database.prepare(`
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

function compareDate(a, b) {
  return String(a).localeCompare(String(b));
}

function isDateAfter(date1, date2) {
  return compareDate(date1, date2) > 0;
}

// ============================================
// 1. 回填个股资金流快照
// ============================================

async function backfillStockMoneyflow(tradeDate, stockList) {
  const database = getDb();
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let noDataCount = 0; // 停牌或无交易数据

  // dry-run 模式：只统计，不写入
  if (DRY_RUN) {
    log(`  [DRY-RUN] 模拟处理 ${tradeDate}，共 ${stockList.length} 只股票`);

    // 只处理前 10 只股票作为样本
    const sampleSize = Math.min(10, stockList.length);
    for (let i = 0; i < sampleSize; i++) {
      const stock = stockList[i];
      try {
        const flows = await tushareRequest('moneyflow', {
          ts_code: stock.ts_code,
          start_date: tradeDate,
          end_date: tradeDate
        }, ['ts_code', 'trade_date', 'net_mf_amount']);

        if (flows && flows.length > 0) {
          successCount++;
        } else {
          noDataCount++;
        }
        await sleep(REQUEST_INTERVAL_MS);
      } catch (error) {
        errorCount++;
      }
    }

    log(`  [DRY-RUN] 样本结果: 成功 ${successCount}，无数据 ${noDataCount}，错误 ${errorCount}`);
    return { successCount, skipCount: stockList.length - sampleSize, errorCount };
  }

  // 准备插入语句
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO stock_moneyflow_snapshot
    (trade_date, ts_code, stock_name, net_mf_amount, buy_lg_amount, sell_lg_amount,
     buy_elg_amount, sell_elg_amount, pct_change, close_price, volume, amount,
     industry_code, industry_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = database.transaction((rows) => {
    for (const row of rows) {
      try {
        stmt.run(...row);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }
  });

  log(`  开始处理 ${tradeDate}，共 ${stockList.length} 只股票`);

  // 分批处理，每批 50 只股票
  const BATCH_SIZE = 50;
  const batches = [];

  for (let i = 0; i < stockList.length; i += BATCH_SIZE) {
    batches.push(stockList.slice(i, i + BATCH_SIZE));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const rowsToInsert = [];

    for (const stock of batch) {
      try {
        // 检查上市日期，跳过未上市的股票
        if (stock.list_date && !isDateAfter(tradeDate, stock.list_date)) {
          skipCount++;
          continue;
        }

        // 调用 Tushare moneyflow 接口
        const flows = await tushareRequest('moneyflow', {
          ts_code: stock.ts_code,
          start_date: tradeDate,
          end_date: tradeDate
        }, [
          'ts_code', 'trade_date', 'buy_lg_amount', 'sell_lg_amount',
          'buy_elg_amount', 'sell_elg_amount', 'net_mf_amount',
          'pct_change', 'close', 'vol', 'amount'
        ]);

        if (flows && flows.length > 0) {
          const f = flows[0];
          rowsToInsert.push([
            tradeDate,
            stock.ts_code,
            stock.stock_name || stock.ts_code,
            f.net_mf_amount || 0,
            f.buy_lg_amount || 0,
            f.sell_lg_amount || 0,
            f.buy_elg_amount || 0,
            f.sell_elg_amount || 0,
            f.pct_change || 0,
            f.close || 0,
            f.vol || 0,
            f.amount || 0,
            stock.industry_code_l1 || '',
            stock.industry_name_l1 || ''
          ]);
        } else {
          // 无数据（停牌或未交易）
          noDataCount++;
        }

        // 限流等待
        await sleep(REQUEST_INTERVAL_MS);

      } catch (error) {
        // 处理错误
        if (error.message && (
          error.message.includes('每分钟最多') ||
          error.message.includes('limit') ||
          error.message.includes('超过')
        )) {
          log(`  ⚠️ 触发频率限制，等待 30 秒...`);
          await sleep(30000);
          // 重试当前批次
          batchIndex--;
          break;
        } else {
          errorCount++;
          if (errorCount <= 5) {
            log(`  ⚠️ ${stock.ts_code} 处理失败:`, error.message);
          }
        }
      }
    }

    // 批量插入
    if (rowsToInsert.length > 0) {
      insertMany(rowsToInsert);
    }

    // 进度显示
    const progress = Math.min((batchIndex + 1) * BATCH_SIZE, stockList.length);
    if ((batchIndex + 1) % 5 === 0 || batchIndex === batches.length - 1) {
      log(`  进度: ${progress}/${stockList.length}，成功 ${successCount}，跳过/无数据 ${skipCount + noDataCount}，错误 ${errorCount}`);
    }
  }

  return { successCount, skipCount: skipCount + noDataCount, errorCount };
}

// ============================================
// 2. 聚合行业资金流快照
// ============================================

function aggregateIndustryMoneyflow(tradeDate) {
  const database = getDb();

  // dry-run 模式：只统计，不写入
  if (DRY_RUN) {
    log(`  [DRY-RUN] 模拟聚合 ${tradeDate} 行业资金流...`);

    const stats = database.prepare(`
      SELECT COUNT(DISTINCT industry_name) as count
      FROM stock_moneyflow_snapshot
      WHERE trade_date = ? AND industry_name IS NOT NULL AND industry_name != ''
    `).get(tradeDate);

    log(`  [DRY-RUN] 聚合结果: 约 ${stats.count || 0} 个行业`);
    return { count: stats.count || 0, total_stocks: 0 };
  }

  log(`  开始聚合 ${tradeDate} 行业资金流...`);

  // 删除当天的旧数据
  database.prepare(`DELETE FROM industry_moneyflow_snapshot WHERE trade_date = ?`).run(tradeDate);

  // 按 industry_name_l1 分组聚合（使用 industry_name_l1 作为行业标识）
  const sql = `
    INSERT INTO industry_moneyflow_snapshot
    (trade_date, industry_code, industry_name, net_mf_amount, buy_lg_amount, sell_lg_amount,
     buy_elg_amount, sell_elg_amount, avg_pct_change, stock_count, inflow_stock_count, outflow_stock_count)
    SELECT
      ? as trade_date,
      COALESCE(industry_code, 'UNKNOWN') as industry_code,
      COALESCE(industry_name, '未知行业') as industry_name,
      SUM(net_mf_amount) as net_mf_amount,
      SUM(buy_lg_amount) as buy_lg_amount,
      SUM(sell_lg_amount) as sell_lg_amount,
      SUM(buy_elg_amount) as buy_elg_amount,
      SUM(sell_elg_amount) as sell_elg_amount,
      AVG(pct_change) as avg_pct_change,
      COUNT(*) as stock_count,
      SUM(CASE WHEN net_mf_amount > 0 THEN 1 ELSE 0 END) as inflow_stock_count,
      SUM(CASE WHEN net_mf_amount < 0 THEN 1 ELSE 0 END) as outflow_stock_count
    FROM stock_moneyflow_snapshot
    WHERE trade_date = ?
    GROUP BY industry_code, industry_name
  `;

  database.prepare(sql).run(tradeDate, tradeDate);

  // 更新排名
  // 按净流入排名
  database.prepare(`
    UPDATE industry_moneyflow_snapshot
    SET rank_by_net_mf = (
      SELECT COUNT(*) + 1
      FROM industry_moneyflow_snapshot im2
      WHERE im2.trade_date = industry_moneyflow_snapshot.trade_date
      AND im2.net_mf_amount > industry_moneyflow_snapshot.net_mf_amount
    )
    WHERE trade_date = ?
  `).run(tradeDate);

  // 按平均涨跌幅排名
  database.prepare(`
    UPDATE industry_moneyflow_snapshot
    SET rank_by_avg_pct_change = (
      SELECT COUNT(*) + 1
      FROM industry_moneyflow_snapshot im2
      WHERE im2.trade_date = industry_moneyflow_snapshot.trade_date
      AND im2.avg_pct_change > industry_moneyflow_snapshot.avg_pct_change
    )
    WHERE trade_date = ?
  `).run(tradeDate);

  // 获取结果统计
  const stats = database.prepare(`
    SELECT COUNT(*) as count, SUM(stock_count) as total_stocks
    FROM industry_moneyflow_snapshot
    WHERE trade_date = ?
  `).get(tradeDate);

  log(`  聚合完成: ${stats.count} 个行业，覆盖 ${stats.total_stocks || 0} 只股票`);

  return stats;
}

// ============================================
// 主回填流程
// ============================================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBackfill(options = {}) {
  const { forceFull = false, singleDate = null, startDate = null, endDate = null } = options;

  log('========================================');
  log('资金流数据回填脚本');
  log('========================================');

  // 加载进度
  let progress = forceFull ? {
    lastDate: START_DATE,
    processedDates: [],
    stats: { totalDays: 0, successDays: 0, failedDays: 0, totalRecords: 0 }
  } : loadProgress();

  // 确定回填日期范围
  let targetStartDate = singleDate || startDate || progress.lastDate;
  let targetEndDate = singleDate || endDate || END_DATE;

  log(`回填范围: ${targetStartDate} - ${targetEndDate}`);

  // 获取交易日历
  const tradeDates = await getTradeCalendar(START_DATE, END_DATE);

  // 过滤出需要处理的日期
  const datesToProcess = tradeDates.filter(d => {
    if (singleDate) return d === singleDate;
    return compareDate(d, targetStartDate) >= 0 && compareDate(d, targetEndDate) <= 0;
  });

  // 排除已处理的日期
  const datesToBackfill = datesToProcess.filter(d => !progress.processedDates.includes(d));

  log(`需要回填 ${datesToBackfill.length} 个交易日`);

  if (datesToBackfill.length === 0) {
    log('✅ 没有需要回填的数据');
    return;
  }

  // 获取股票列表
  const stockList = getStockList();

  // 开始回填
  progress.stats.totalDays = datesToBackfill.length;

  for (let i = 0; i < datesToBackfill.length; i++) {
    const tradeDate = datesToBackfill[i];
    log(`\n[${i + 1}/${datesToBackfill.length}] 处理 ${tradeDate}`);

    try {
      // 1. 回填个股资金流
      const stockResult = await backfillStockMoneyflow(tradeDate, stockList);

      // 2. 聚合行业资金流
      const industryResult = aggregateIndustryMoneyflow(tradeDate);

      // 更新进度
      progress.processedDates.push(tradeDate);
      progress.lastDate = tradeDate;
      progress.stats.successDays++;
      progress.stats.totalRecords += stockResult.successCount;

      log(`  ✅ ${tradeDate} 完成: 股票 ${stockResult.successCount} 条，行业 ${industryResult.count} 个`);

    } catch (error) {
      progress.stats.failedDays++;
      log(`  ❌ ${tradeDate} 失败:`, error.message);

      // 如果是网络错误，等待后重试
      if (error.message && error.message.includes('network')) {
        log('  等待 60 秒后重试...');
        await sleep(60000);
        i--; // 重试当前日期
        continue;
      }
    }

    // 保存进度
    saveProgress(progress);

    // 每 10 个日期显示一次统计
    if ((i + 1) % 10 === 0) {
      log(`\n📊 进度统计:`);
      log(`   - 已完成: ${progress.stats.successDays}/${progress.stats.totalDays}`);
      log(`   - 失败: ${progress.stats.failedDays}`);
      log(`   - 累计记录: ${progress.stats.totalRecords}`);
    }
  }

  // 完成
  log('\n========================================');
  log('✅ 回填完成！');
  log('========================================');
  log(`📊 最终统计:`);
  log(`   - 成功天数: ${progress.stats.successDays}`);
  log(`   - 失败天数: ${progress.stats.failedDays}`);
  log(`   - 总记录数: ${progress.stats.totalRecords}`);

  // 清理进度文件
  clearProgress();

  // 关闭数据库
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================
// CLI 入口
// ============================================

async function main() {
  const args = process.argv.slice(2);

  const options = {
    forceFull: args.includes('--full'),
    singleDate: null,
    startDate: null,
    endDate: null
  };

  // 解析参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      options.singleDate = args[i + 1];
      i++;
    } else if (args[i] === '--start' && args[i + 1]) {
      options.startDate = args[i + 1];
      i++;
    } else if (args[i] === '--end' && args[i + 1]) {
      options.endDate = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      DRY_RUN = true;
    }
  }

  // 显示配置
  if (DRY_RUN) {
    log('⚠️ DRY-RUN 模式：只统计，不写入数据库');
  }

  try {
    await runBackfill(options);
  } catch (error) {
    log('❌ 回填失败:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// 导出
module.exports = {
  backfillStockMoneyflow,
  aggregateIndustryMoneyflow,
  runBackfill
};

// 运行
if (require.main === module) {
  main().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}