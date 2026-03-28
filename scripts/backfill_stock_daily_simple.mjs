#!/usr/bin/env node
/**
 * stock_daily 表历史数据回填脚本
 * 
 * 用途：从 Tushare Pro 获取历史日线数据，回填到 stock_daily 表
 * 执行：node scripts/backfill_stock_daily_simple.mjs [--auto]
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CONFIG = {
    DB_PATH: process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db',
    TUSHARE_TOKEN: process.env.TUSHARE_TOKEN || '',
    TUSHARE_URL: 'http://api.tushare.pro',
    RATE_LIMIT_MS: 150,
};

function log(msg, data = {}) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${msg}`, Object.keys(data).length ? JSON.stringify(data) : '');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function callTushare(api, params = {}) {
    const res = await fetch(CONFIG.TUSHARE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_name: api, token: CONFIG.TUSHARE_TOKEN, params })
    });
    const result = await res.json();
    if (result.code !== 0) throw new Error(result.msg);
    return result.data;
}

async function main() {
    log('开始 stock_daily 回填...');
    
    if (!CONFIG.TUSHARE_TOKEN) {
        log('❌ TUSHARE_TOKEN 未配置');
        return;
    }
    
    const db = await open({ filename: CONFIG.DB_PATH, driver: sqlite3.Database });
    
    // 创建进度表（用于断点续传）
    await db.exec(`CREATE TABLE IF NOT EXISTS _backfill_progress (
        task_name TEXT,
        trade_date TEXT,
        status TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_name, trade_date)
    )`);
    
    // 获取需要回填的日期
    const factorDates = await db.all('SELECT DISTINCT trade_date FROM stock_factor_snapshot ORDER BY trade_date');
    
    // 检查已完成的日期（stock_daily 中已有 + 进度表标记完成）
    const existingInTable = await db.all('SELECT DISTINCT trade_date FROM stock_daily');
    const existingInProgress = await db.all("SELECT trade_date FROM _backfill_progress WHERE task_name='stock_daily' AND status='done'");
    
    const completedSet = new Set([
        ...existingInTable.map(r => r.trade_date),
        ...existingInProgress.map(r => r.trade_date)
    ]);
    
    const missingDates = factorDates.filter(d => !completedSet.has(d.trade_date)).map(d => d.trade_date);
    
    // 检查是否有进行中的任务（断点续传）
    const inProgress = await db.all("SELECT trade_date FROM _backfill_progress WHERE task_name='stock_daily' AND status='running' ORDER BY updated_at DESC LIMIT 1");
    if (inProgress.length > 0) {
        log(`⚠️  发现未完成的任务，上次处理到：${inProgress[0].trade_date}`);
        log('   将从该日期继续执行（断点续传）');
    }
    
    log(`stock_factor_snapshot: ${factorDates.length} 天`);
    log(`stock_daily 已有：${existingInTable.length} 天`);
    log(`进度表已完成：${existingInProgress.length} 天`);
    log(`需要回填：${missingDates.length} 天`);
    
    if (missingDates.length === 0) {
        log('✅ 数据已完整');
        await db.exec("DELETE FROM _backfill_progress WHERE task_name='stock_daily'");  // 清理进度表
        await db.close();
        return;
    }
    
    // 获取股票列表
    log('获取股票列表...');
    const stockData = await callTushare('stock_basic', { list_status: 'L' });
    const stocks = stockData.items || [];
    const stockMap = new Map(stocks.map(s => [s[0], s[2]]));  // ts_code -> name
    
    // 准备插入
    const insert = db.prepare('INSERT OR REPLACE INTO stock_daily (trade_date,ts_code,stock_name,open,high,low,close,volume,amount,pe,pb,market_cap) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    const updateProgress = db.prepare("INSERT OR REPLACE INTO _backfill_progress (task_name,trade_date,status) VALUES ('stock_daily',?,'done')");
    const updateRunning = db.prepare("INSERT OR REPLACE INTO _backfill_progress (task_name,trade_date,status) VALUES ('stock_daily',?,'running')");
    
    let total = 0, success = 0, failed = 0;
    
    // 按日期回填
    for (let i = 0; i < missingDates.length; i++) {
        const date = missingDates[i];
        const pct = ((i + 1) / missingDates.length * 100).toFixed(1);
        
        // 标记为进行中
        updateRunning.run(date);
        
        try {
            const data = await callTushare('daily_basic', { trade_date: date });
            const items = data.items || [];
            
            if (items.length === 0) {
                log(`⚠️  ${date} 无数据`);
                updateProgress.run(date);  // 标记为完成（无数据也算完成）
                failed++;
                continue;
            }
            
            // 转换格式
            const rows = items.map(item => {
                const [ts_code, trade_date, close, , , , , pe_ttm, pb, , , , , , , , total_mv, , open, high, low, , amount, volume] = item;
                return [
                    trade_date,
                    ts_code,
                    stockMap.get(ts_code) || ts_code,
                    open || 0,
                    high || 0,
                    low || 0,
                    close || 0,
                    volume || 0,
                    amount || 0,
                    pe_ttm || 0,
                    pb || 0,
                    total_mv || 0
                ];
            });
            
            // 批量插入（使用 exec）
            const values = rows.map(r => `(${r.map(v => typeof v === 'string' ? `'${v}'` : v).join(',')})`).join(',');
            await db.exec(`INSERT OR REPLACE INTO stock_daily (trade_date,ts_code,stock_name,open,high,low,close,volume,amount,pe,pb,market_cap) VALUES ${values}`);
            
            // 标记为完成
            updateProgress.run(date);
            
            success += rows.length;
            total += rows.length;
            
            if ((i + 1) % 50 === 0) log(`进度：${i + 1}/${missingDates.length} (${pct}%), 已插入 ${success} 条`);
            
            await sleep(CONFIG.RATE_LIMIT_MS);
        } catch (err) {
            log(`❌ ${date} 失败：${err.message}`);
            failed++;
            // 不标记进度，下次重试
        }
    }
    
    // 统计
    const result = await db.get('SELECT COUNT(*) as c, COUNT(DISTINCT trade_date) as d FROM stock_daily');
    log(`\n✅ 完成！成功 ${success} 条，失败 ${failed} 条`);
    log(`stock_daily 总计：${result.c} 条，${result.d} 天`);
    
    // 清理进度表
    await db.exec("DELETE FROM _backfill_progress WHERE task_name='stock_daily'");
    log('进度表已清理');
    
    await db.close();
}

main().catch(err => { log(`❌ 错误：${err.message}`); process.exit(1); });
