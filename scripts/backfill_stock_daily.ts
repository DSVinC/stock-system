#!/usr/bin/env node
/**
 * stock_daily 表历史数据回填脚本
 * 
 * 用途：从 Tushare Pro 获取历史日线数据，回填到 stock_daily 表
 * 执行：node scripts/backfill_stock_daily.mjs [--auto] [--date YYYY-MM-DD]
 * 
 * 数据范围：1990-01-01 至 2026-03-24（约 8000 交易日）
 * 预计耗时：30-60 分钟（取决于网络速度和限流）
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// 配置参数
const CONFIG = {
    // 数据库路径
    DB_PATH: process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db',
    
    // Tushare API 配置
    TUSHARE_TOKEN: process.env.TUSHARE_TOKEN || '',
    TUSHARE_URL: 'http://api.tushare.pro',
    
    // 限流配置（Tushare 基础积分 8000，每分钟约 500 次调用）
    RATE_LIMIT_DELAY_MS: 100,  // 100ms 间隔
    
    // 重试配置
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2000,
    
    // 进度显示
    PROGRESS_INTERVAL: 50,  // 每 50 天打印一次进度
    
    // 日志配置
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

// 日志工具
class Logger {
    static log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        if (data && Object.keys(data).length > 0) {
            console.log(logMessage, JSON.stringify(data, null, 2));
        } else {
            console.log(logMessage);
        }
    }
    
    static info(message, data = {}) {
        this.log('info', message, data);
    }
    
    static error(message, data = {}) {
        this.log('error', message, data);
    }
    
    static warn(message, data = {}) {
        this.log('warn', message, data);
    }
    
    static debug(message, data = {}) {
        if (CONFIG.LOG_LEVEL === 'debug') {
            this.log('debug', message, data);
        }
    }
}

// Tushare API 调用
async function callTushare(apiName, params = {}) {
    const payload = {
        api_name: apiName,
        token: CONFIG.TUSHARE_TOKEN,
        params: params,
        fields: ''
    };
    
    try {
        const response = await fetch(CONFIG.TUSHARE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.code !== 0) {
            throw new Error(`Tushare API 错误：${result.msg}`);
        }
        
        return result.data;
    } catch (error) {
        Logger.error(`Tushare API 调用失败：${apiName}`, { error: error.message });
        throw error;
    }
}

// 获取股票列表
async function getStockList() {
    Logger.info('获取股票列表...');
    
    const data = await callTushare('stock_basic', {
        exchange: '',
        list_status: 'L',  // 只取上市状态正常的股票
        fields: 'ts_code,symbol,name,area,industry,list_date'
    });
    
    Logger.info(`获取到 ${data.items?.length || 0} 只股票`);
    return data.items || [];
}

// 获取单个股票的日线数据
async function fetchDailyData(tsCode, startDate, endDate) {
    try {
        const data = await callTushare('daily', {
            ts_code: tsCode,
            start_date: startDate,
            end_date: endDate
        });
        
        return data.items || [];
    } catch (error) {
        Logger.warn(`获取 ${tsCode} 日线数据失败`, { error: error.message });
        return [];
    }
}

// 检查哪些日期需要回填
async function checkMissingDates(db) {
    Logger.info('检查缺失的日期...');
    
    // 获取 stock_factor_snapshot 表的所有日期
    const factorDates = await db.all(`
        SELECT DISTINCT trade_date 
        FROM stock_factor_snapshot 
        ORDER BY trade_date ASC
    `);
    const factorDateList = factorDates.map(r => r.trade_date);
    
    Logger.info(`stock_factor_snapshot 表有 ${factorDateList.length} 个交易日`);
    
    // 获取 stock_daily 表已有的日期
    const existingDates = await db.all(`
        SELECT DISTINCT trade_date 
        FROM stock_daily 
        ORDER BY trade_date ASC
    `);
    const existingDateList = existingDates.map(r => r.trade_date);
    
    Logger.info(`stock_daily 表已有 ${existingDateList.length} 个交易日`);
    
    // 计算缺失的日期
    const existingSet = new Set(existingDateList);
    const missingDates = factorDateList.filter(d => !existingSet.has(d));
    
    Logger.info(`需要回填 ${missingDates.length} 个交易日`);
    
    return { factorDates: factorDateList, existingDates: existingDateList, missingDates };
}

// 回填数据
async function backfill(db, options = {}) {
    const { auto, targetDate } = options;
    
    Logger.info('开始 stock_daily 数据回填...', { db: CONFIG.DB_PATH });
    
    // 检查 Tushare Token
    if (!CONFIG.TUSHARE_TOKEN) {
        Logger.error('TUSHARE_TOKEN 未配置，请设置环境变量后重试');
        return;
    }
    
    // 检查缺失日期
    const { missingDates } = await checkMissingDates(db);
    
    if (missingDates.length === 0) {
        Logger.info('✅ 无需回填，数据已完整');
        return;
    }
    
    // 如果指定了目标日期，只处理该日期
    const datesToProcess = targetDate 
        ? missingDates.filter(d => d === targetDate.replace(/-/g, ''))
        : missingDates;
    
    if (datesToProcess.length === 0) {
        Logger.info('指定日期无需回填');
        return;
    }
    
    Logger.info(`准备回填 ${datesToProcess.length} 个交易日`);
    
    // 获取股票列表
    const stocks = await getStockList();
    const tsCodes = stocks.map(s => s[0]);  // ts_code 是第一列
    
    // 准备插入语句
    const insertSql = `
        INSERT OR REPLACE INTO stock_daily 
        (trade_date, ts_code, stock_name, open, high, low, close, volume, amount, pe, pb, market_cap)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const insertStmt = db.prepare(insertSql);
    const insertMany = db.transaction((rows) => {
        for (const row of rows) {
            insertStmt.run(...row);
        }
    });
    
    let totalRows = 0;
    let successRows = 0;
    let errorRows = 0;
    
    // 按日期处理
    for (let i = 0; i < datesToProcess.length; i++) {
        const tradeDate = datesToProcess[i];
        const progress = ((i + 1) / datesToProcess.length * 100).toFixed(1);
        
        Logger.info(`\n📅 处理日期：${tradeDate} (${progress}%)`);
    
    // 统计结果
    Logger.info('\n📊 回填结果:');
    Logger.info(`   总记录数：${totalRows}`);
    Logger.info(`   成功：${successRows}`);
    Logger.info(`   失败：${errorRows}`);
    
    // 验证结果
    const result = db.prepare(`
        SELECT COUNT(*) as total, COUNT(DISTINCT trade_date) as days
        FROM stock_daily
    `).get();
    
    Logger.info(`\n✅ 验证结果:`);
    Logger.info(`   stock_daily 表总记录：${result.total}`);
    Logger.info(`   覆盖交易日：${result.days}`);
}

// 工具函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 主函数
async function main() {
    const args = process.argv.slice(2);
    const options = {
        auto: args.includes('--auto'),
        targetDate: args.find(a => a.startsWith('--date='))?.split('=')[1]
    };
    
    try {
        // 打开数据库
        const db = await open({
            filename: CONFIG.DB_PATH,
            driver: sqlite3.Database
        });
        
        Logger.info('数据库连接成功');
        
        // 执行回填
        await backfill(db, options);
        
        // 关闭数据库
        await db.close();
        Logger.info('数据库连接关闭');
        
        Logger.info('\n🎉 stock_daily 数据回填完成！');
    } catch (error) {
        Logger.error('回填失败:', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// 运行
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}

export { backfill, callTushare };
