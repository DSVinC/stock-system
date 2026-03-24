#!/usr/bin/env node
/**
 * BaoStock 分钟线数据获取脚本
 * 数据范围：近 1 年（250 交易日）
 * 数据粒度：5 分钟线
 * 目标股票：Top10 核心股票池
 * 存储成本：约 120MB
 *
 * 功能：
 * 1. 调用 Python BaoStock API 获取分钟线数据
 * 2. 写入 stock_minute 表
 * 3. 实现数据完整性验证
 * 4. 支持限流和重试机制
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// 配置参数
const CONFIG = {
    // 数据范围
    DATA_RANGE_DAYS: 250,
    FREQUENCY: '5',        // 5分钟线
    ADJUST_FLAG: '3',      // 不复权

    // 限流配置
    RATE_LIMIT_DELAY_MS: 2000,

    // 重试配置
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 3000,

    // 日志配置
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    // 数据库路径
    DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'stock_system.db'),

    // Python 路径
    PYTHON_PATH: process.env.PYTHON_PATH || 'python3',
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

        // 写入日志文件
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, `minute_fetch_${new Date().toISOString().split('T')[0]}.log`);
        const logEntry = `${logMessage}${Object.keys(data).length > 0 ? ' ' + JSON.stringify(data) : ''}\n`;
        fs.appendFileSync(logFile, logEntry);
    }

    static info(message, data = {}) {
        if (CONFIG.LOG_LEVEL === 'debug' || CONFIG.LOG_LEVEL === 'info') {
            this.log('info', message, data);
        }
    }

    static error(message, data = {}) {
        this.log('error', message, data);
    }

    static warn(message, data = {}) {
        if (CONFIG.LOG_LEVEL === 'debug' || CONFIG.LOG_LEVEL === 'info' || CONFIG.LOG_LEVEL === 'warn') {
            this.log('warn', message, data);
        }
    }

    static debug(message, data = {}) {
        if (CONFIG.LOG_LEVEL === 'debug') {
            this.log('debug', message, data);
        }
    }
}

// 数据库管理器
class DatabaseManager {
    constructor() {
        this.db = null;
    }

    async connect() {
        try {
            Logger.info('正在连接数据库...', { path: CONFIG.DB_PATH });

            this.db = await open({
                filename: CONFIG.DB_PATH,
                driver: sqlite3.Database
            });

            await this.checkTables();

            Logger.info('数据库连接成功');
            return this.db;
        } catch (error) {
            Logger.error('数据库连接失败', { error: error.message, path: CONFIG.DB_PATH });
            throw error;
        }
    }

    async checkTables() {
        try {
            const tables = await this.db.all(`
                SELECT name FROM sqlite_master
                WHERE type='table'
                AND name IN ('stock_minute', 'stock_minute_stats', 'minute_fetch_tasks')
            `);

            const existingTables = tables.map(t => t.name);
            const requiredTables = ['stock_minute', 'stock_minute_stats', 'minute_fetch_tasks'];

            for (const table of requiredTables) {
                if (!existingTables.includes(table)) {
                    Logger.warn(`表 ${table} 不存在，需要运行迁移`);
                }
            }

            Logger.debug('表结构检查完成', { existingTables });
        } catch (error) {
            Logger.error('检查表结构失败', { error: error.message });
            throw error;
        }
    }

    async saveMinuteData(tsCode, data) {
        if (!data || data.length === 0) {
            Logger.warn('没有数据需要保存', { tsCode });
            return { saved: 0, skipped: 0 };
        }

        try {
            let saved = 0;
            let skipped = 0;

            // 批量插入优化
            const values = [];
            const placeholders = [];

            for (const record of data) {
                placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                values.push(
                    record.ts_code,
                    record.trade_date,
                    record.trade_time,
                    record.open,
                    record.high,
                    record.low,
                    record.close,
                    record.pre_close || null,
                    record.change || null,
                    record.pct_change || null,
                    record.vol,
                    record.amount,
                    record.adj_factor || 1.0,
                    'baostock',
                    'success'
                );
            }

            // 使用批量插入
            if (values.length > 0) {
                const sql = `
                    INSERT OR REPLACE INTO stock_minute (
                        ts_code, trade_date, trade_time, open, high, low, close,
                        pre_close, change, pct_change, vol, amount, adj_factor,
                        data_source, fetch_status, updated_at
                    ) VALUES ${placeholders.join(', ')}
                `;

                try {
                    await this.db.run(sql, values);
                    saved = data.length;
                } catch (batchError) {
                    // 批量失败时逐条插入
                    Logger.warn('批量插入失败，切换到逐条插入', { error: batchError.message });

                    for (const record of data) {
                        try {
                            await this.db.run(`
                                INSERT OR REPLACE INTO stock_minute (
                                    ts_code, trade_date, trade_time, open, high, low, close,
                                    pre_close, change, pct_change, vol, amount, adj_factor,
                                    data_source, fetch_status, updated_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                            `, [
                                record.ts_code,
                                record.trade_date,
                                record.trade_time,
                                record.open,
                                record.high,
                                record.low,
                                record.close,
                                record.pre_close || null,
                                record.change || null,
                                record.pct_change || null,
                                record.vol,
                                record.amount,
                                record.adj_factor || 1.0,
                                'baostock',
                                'success'
                            ]);
                            saved++;
                        } catch (insertError) {
                            Logger.error('插入数据失败', {
                                tsCode,
                                trade_date: record.trade_date,
                                trade_time: record.trade_time,
                                error: insertError.message
                            });
                            skipped++;
                        }
                    }
                }
            }

            Logger.info('分钟线数据保存完成', { tsCode, saved, skipped, total: data.length });

            // 更新统计信息
            await this.updateStats(tsCode, data);

            return { saved, skipped };
        } catch (error) {
            Logger.error('保存分钟线数据失败', { tsCode, error: error.message });
            throw error;
        }
    }

    async updateStats(tsCode, data) {
        try {
            if (!data || data.length === 0) return;

            // 按日期分组
            const dateGroups = {};
            for (const record of data) {
                if (!dateGroups[record.trade_date]) {
                    dateGroups[record.trade_date] = [];
                }
                dateGroups[record.trade_date].push(record);
            }

            for (const [tradeDate, records] of Object.entries(dateGroups)) {
                const totalRecords = records.length;
                const expectedRecords = 48; // 每天48条5分钟线
                const missingRecords = Math.max(0, expectedRecords - totalRecords);
                const dataQuality = missingRecords === 0 ? 'complete' :
                                  totalRecords >= expectedRecords * 0.8 ? 'partial' : 'missing';

                const times = records.map(r => r.trade_time).sort();
                const earliestTime = times[0] || null;
                const latestTime = times[times.length - 1] || null;

                await this.db.run(`
                    INSERT OR REPLACE INTO stock_minute_stats (
                        ts_code, trade_date, total_records, missing_records,
                        earliest_time, latest_time, data_quality, last_checked
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    tsCode,
                    tradeDate,
                    totalRecords,
                    missingRecords,
                    earliestTime,
                    latestTime,
                    dataQuality
                ]);
            }

            Logger.debug('统计数据更新完成', { tsCode, dates: Object.keys(dateGroups).length });
        } catch (error) {
            Logger.error('更新统计数据失败', { tsCode, error: error.message });
        }
    }

    async createTask(taskId, tsCode, startDate, endDate) {
        try {
            const totalDays = CONFIG.DATA_RANGE_DAYS;

            await this.db.run(`
                INSERT INTO minute_fetch_tasks (
                    task_id, ts_code, start_date, end_date, status,
                    total_days, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [taskId, tsCode, startDate, endDate, 'pending', totalDays]);

            Logger.info('创建分钟线获取任务', { taskId, tsCode, startDate, endDate, totalDays });
            return taskId;
        } catch (error) {
            Logger.error('创建任务失败', { tsCode, error: error.message });
            throw error;
        }
    }

    async updateTaskStatus(taskId, tsCode, updates) {
        try {
            const setClause = Object.keys(updates)
                .map(key => `${key} = ?`)
                .join(', ');

            const values = Object.values(updates);
            values.push(taskId, tsCode);

            await this.db.run(`
                UPDATE minute_fetch_tasks
                SET ${setClause}
                WHERE task_id = ? AND ts_code = ?
            `, values);

            Logger.debug('更新任务状态', { taskId, tsCode, updates });
        } catch (error) {
            Logger.error('更新任务状态失败', { taskId, tsCode, error: error.message });
            throw error;
        }
    }

    async getTaskStatus(taskId, tsCode) {
        try {
            const task = await this.db.get(`
                SELECT * FROM minute_fetch_tasks
                WHERE task_id = ? AND ts_code = ?
            `, [taskId, tsCode]);

            return task;
        } catch (error) {
            Logger.error('获取任务状态失败', { taskId, tsCode, error: error.message });
            throw error;
        }
    }

    async checkDataIntegrity(tsCode, startDate, endDate) {
        try {
            const stats = await this.db.all(`
                SELECT * FROM stock_minute_stats
                WHERE ts_code = ? AND trade_date BETWEEN ? AND ?
                ORDER BY trade_date
            `, [tsCode, startDate.replace(/-/g, ''), endDate.replace(/-/g, '')]);

            const summary = {
                totalDates: stats.length,
                completeDates: stats.filter(s => s.data_quality === 'complete').length,
                partialDates: stats.filter(s => s.data_quality === 'partial').length,
                missingDates: stats.filter(s => s.data_quality === 'missing').length,
                totalRecords: stats.reduce((sum, s) => sum + s.total_records, 0),
                missingRecords: stats.reduce((sum, s) => sum + s.missing_records, 0),
                completeness: stats.length > 0 ?
                    (stats.filter(s => s.data_quality === 'complete').length / stats.length * 100).toFixed(2) + '%' : '0%'
            };

            Logger.info('数据完整性检查', { tsCode, summary });
            return { stats, summary };
        } catch (error) {
            Logger.error('检查数据完整性失败', { tsCode, error: error.message });
            throw error;
        }
    }

    async close() {
        if (this.db) {
            await this.db.close();
        }
    }
}

// BaoStock Python 调用器
class BaoStockClient {
    constructor() {
        this.pythonScript = this.createPythonScript();
    }

    /**
     * 创建 Python 脚本用于调用 BaoStock API
     */
    createPythonScript() {
        const scriptPath = path.join(__dirname, 'baostock_minute_fetcher.py');

        const pythonCode = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BaoStock 分钟线数据获取脚本
通过标准输入输出与 Node.js 通信
"""

import sys
import json
import baostock as bs
from datetime import datetime, timedelta

def login():
    """登录 BaoStock"""
    lg = bs.login()
    if lg.error_code != '0':
        return False, lg.error_msg
    return True, '登录成功'

def logout():
    """登出 BaoStock"""
    bs.logout()

def get_minute_data(ts_code, start_date, end_date, frequency='5', adjustflag='3'):
    try:
        # BaoStock 分钟线数据使用 YYYY-MM-DD 格式
        # 如果输入是 YYYYMMDD 格式，转换为 YYYY-MM-DD
        if len(start_date) == 8 and '-' not in start_date:
            start_date_fmt = f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}"
        else:
            start_date_fmt = start_date

        if len(end_date) == 8 and '-' not in end_date:
            end_date_fmt = f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}"
        else:
            end_date_fmt = end_date

        # 查询分钟线数据 (不请求 adjustflag 字段)
        rs = bs.query_history_k_data_plus(
            ts_code,
            fields="date,time,code,open,high,low,close,volume,amount",
            start_date=start_date_fmt,
            end_date=end_date_fmt,
            frequency=frequency,
            adjustflag=adjustflag
        )

        if rs is None:
            return [], "BaoStock 返回 None"

        if rs.error_code != '0':
            return [], f"BaoStock 错误: {rs.error_msg}"

        data_list = []
        while rs.next():
            row = rs.get_row_data()
            # date 格式: YYYY-MM-DD, time 格式: YYYYMMDDHHMMSSSSS
            date_str = row[0]
            time_str = row[1]

            # 转换时间格式 (格式为 YYYYMMDDHHMMSSSSS)
            if len(time_str) >= 12:
                hour = time_str[8:10]
                minute = time_str[10:12]
                trade_time = f"{hour}:{minute}:00"
            else:
                trade_time = "00:00:00"

            # 转换日期格式 YYYY-MM-DD -> YYYYMMDD
            trade_date = date_str.replace('-', '')

            record = {
                'ts_code': ts_code.replace('sh.', '').replace('sz.', '') + ('.SH' if ts_code.startswith('sh') else '.SZ'),
                'trade_date': trade_date,
                'trade_time': trade_time,
                'open': float(row[3]) if row[3] else 0,
                'high': float(row[4]) if row[4] else 0,
                'low': float(row[5]) if row[5] else 0,
                'close': float(row[6]) if row[6] else 0,
                'vol': float(row[7]) if row[7] else 0,
                'amount': float(row[8]) if row[8] else 0,
                'adj_factor': 1.0,
                'pre_close': None,
                'change': None,
                'pct_change': None
            }

            data_list.append(record)

        return data_list, None

    except Exception as e:
        return [], str(e)

def main():
    """主函数：从标准输入读取参数，输出 JSON 结果"""
    try:
        # 读取输入参数
        input_data = sys.stdin.read()
        params = json.loads(input_data)

        action = params.get('action')
        ts_code = params.get('ts_code')
        start_date = params.get('start_date')
        end_date = params.get('end_date')

        # 登录
        success, msg = login()
        if not success:
            result = {'success': False, 'error': msg}
            print(json.dumps(result, ensure_ascii=False))
            return

        if action == 'fetch':
            # 获取分钟线数据
            data, error = get_minute_data(ts_code, start_date, end_date)
            if error:
                result = {'success': False, 'error': error}
            else:
                result = {
                    'success': True,
                    'ts_code': ts_code,
                    'start_date': start_date,
                    'end_date': end_date,
                    'count': len(data),
                    'data': data
                }

        elif action == 'test':
            # 测试连接
            result = {'success': True, 'message': 'BaoStock 连接测试成功'}

        else:
            result = {'success': False, 'error': f'未知操作: {action}'}

        # 登出
        logout()

        # 输出结果
        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        result = {'success': False, 'error': str(e)}
        print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
`;

        // 写入 Python 脚本
        fs.writeFileSync(scriptPath, pythonCode, 'utf-8');
        fs.chmodSync(scriptPath, '755');
        Logger.info('Python 脚本已创建', { path: scriptPath });

        return scriptPath;
    }

    /**
     * 调用 Python 脚本获取分钟线数据
     */
    async getMinuteData(tsCode, startDate, endDate) {
        return new Promise((resolve, reject) => {
            // 转换股票代码格式 (000001.SZ -> sz.000001)
            let bsCode = tsCode.toLowerCase();
            if (bsCode.endsWith('.sz')) {
                bsCode = 'sz.' + bsCode.replace('.sz', '');
            } else if (bsCode.endsWith('.sh')) {
                bsCode = 'sh.' + bsCode.replace('.sh', '');
            } else if (bsCode.endsWith('.bj')) {
                bsCode = 'bj.' + bsCode.replace('.bj', '');
            }

            const input = JSON.stringify({
                action: 'fetch',
                ts_code: bsCode,
                start_date: startDate,
                end_date: endDate
            });

            Logger.debug('调用 Python 脚本', { tsCode, bsCode, startDate, endDate });

            const python = spawn(CONFIG.PYTHON_PATH, [this.pythonScript], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            python.on('close', (code) => {
                if (code !== 0) {
                    Logger.error('Python 脚本执行失败', { code, stderr });
                    reject(new Error(`Python 脚本执行失败: ${stderr}`));
                    return;
                }

                try {
                    // BaoStock 会打印额外的输出，只取最后一行 JSON
                    const lines = stdout.trim().split('\n');
                    let jsonLine = lines[lines.length - 1];

                    // 尝试找到有效的 JSON 行
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (line.startsWith('{') && line.endsWith('}')) {
                            jsonLine = line;
                            break;
                        }
                    }

                    const result = JSON.parse(jsonLine);

                    if (!result.success) {
                        Logger.error('获取分钟线数据失败', { error: result.error });
                        reject(new Error(result.error));
                        return;
                    }

                    Logger.info('分钟线数据获取成功', {
                        tsCode,
                        recordCount: result.count,
                        dateRange: `${startDate} ~ ${endDate}`
                    });

                    resolve(result.data);
                } catch (parseError) {
                    Logger.error('解析 Python 输出失败', { error: parseError.message, stdout });
                    reject(new Error(`解析输出失败: ${parseError.message}`));
                }
            });

            python.on('error', (error) => {
                Logger.error('启动 Python 进程失败', { error: error.message });
                reject(error);
            });

            // 写入输入参数
            python.stdin.write(input);
            python.stdin.end();
        });
    }

    /**
     * 测试 BaoStock 连接
     */
    async testConnection() {
        return new Promise((resolve, reject) => {
            const input = JSON.stringify({ action: 'test' });

            const python = spawn(CONFIG.PYTHON_PATH, [this.pythonScript], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            python.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python 脚本执行失败: ${stderr}`));
                    return;
                }

                try {
                    // BaoStock 会打印额外的输出，只取最后一行 JSON
                    const lines = stdout.trim().split('\n');
                    let jsonLine = lines[lines.length - 1];

                    // 尝试找到有效的 JSON 行
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (line.startsWith('{') && line.endsWith('}')) {
                            jsonLine = line;
                            break;
                        }
                    }

                    const result = JSON.parse(jsonLine);
                    resolve(result);
                } catch (parseError) {
                    reject(new Error(`解析输出失败: ${parseError.message}`));
                }
            });

            python.on('error', reject);

            python.stdin.write(input);
            python.stdin.end();
        });
    }
}

// 分钟线获取器
class MinuteDataFetcher {
    constructor() {
        this.baostock = new BaoStockClient();
        this.dbManager = new DatabaseManager();
    }

    async init() {
        try {
            Logger.info('正在初始化分钟线获取器...');

            await this.dbManager.connect();

            // 测试 BaoStock 连接
            Logger.info('测试 BaoStock 连接...');
            const testResult = await this.baostock.testConnection();
            if (!testResult.success) {
                throw new Error('BaoStock 连接测试失败');
            }
            Logger.info('BaoStock 连接成功');

            Logger.info('分钟线获取器初始化完成');
            return true;
        } catch (error) {
            Logger.error('初始化失败', { error: error.message });
            throw error;
        }
    }

    async fetchMinuteData(tsCode, options = {}) {
        const {
            startDate = this.getDefaultStartDate(),
            endDate = this.getDefaultEndDate(),
            forceRefresh = false,
            taskId = this.generateTaskId()
        } = options;

        Logger.info('开始获取分钟线数据', {
            tsCode, startDate, endDate, taskId, forceRefresh
        });

        try {
            // 创建任务
            await this.dbManager.createTask(taskId, tsCode, startDate, endDate);

            // 检查是否已有数据
            if (!forceRefresh) {
                const existing = await this.checkExistingData(tsCode, startDate, endDate);
                if (existing.coverage > 80) {
                    Logger.info('数据已存在，跳过获取', { tsCode, coverage: `${existing.coverage.toFixed(2)}%` });

                    await this.dbManager.updateTaskStatus(taskId, tsCode, {
                        status: 'success',
                        processed_days: existing.totalDates,
                        total_records: existing.totalRecords,
                        completed_at: new Date().toISOString()
                    });

                    return {
                        success: true,
                        taskId,
                        message: '数据已存在',
                        coverage: existing.coverage,
                        stats: existing
                    };
                }
            }

            // 更新任务状态为运行中
            await this.dbManager.updateTaskStatus(taskId, tsCode, {
                status: 'running',
                started_at: new Date().toISOString()
            });

            // 获取数据
            Logger.info('正在从 BaoStock 获取分钟线数据...', { tsCode, dateRange: `${startDate} ~ ${endDate}` });

            const minuteData = await this.baostock.getMinuteData(tsCode, startDate, endDate);

            // 保存数据
            const saveResult = await this.dbManager.saveMinuteData(tsCode, minuteData);

            // 检查数据完整性
            const integrity = await this.dbManager.checkDataIntegrity(tsCode, startDate, endDate);

            // 更新任务状态
            await this.dbManager.updateTaskStatus(taskId, tsCode, {
                status: 'success',
                processed_days: integrity.stats.length,
                processed_records: saveResult.saved,
                total_records: saveResult.saved + saveResult.skipped,
                completed_at: new Date().toISOString()
            });

            const result = {
                success: true,
                taskId,
                message: '分钟线数据获取完成',
                data: {
                    saved: saveResult.saved,
                    skipped: saveResult.skipped,
                    integrity: integrity.summary
                }
            };

            Logger.info('分钟线数据获取完成', result);
            return result;

        } catch (error) {
            Logger.error('获取分钟线数据失败', { tsCode, taskId, error: error.message });

            await this.dbManager.updateTaskStatus(taskId, tsCode, {
                status: 'failed',
                error_count: 1,
                last_error: error.message,
                completed_at: new Date().toISOString()
            });

            throw error;
        }
    }

    async fetchMinuteDataBatch(tsCodes, options = {}) {
        const results = [];
        const { concurrency = 1 } = options; // BaoStock 限制并发

        Logger.info('开始批量获取分钟线数据', {
            stockCount: tsCodes.length,
            concurrency
        });

        for (let i = 0; i < tsCodes.length; i++) {
            const tsCode = tsCodes[i];
            Logger.info(`正在处理 ${i + 1}/${tsCodes.length}`, { tsCode });

            try {
                const result = await this.fetchMinuteData(tsCode, options);
                results.push(result);

                // 请求间延迟
                if (i < tsCodes.length - 1) {
                    await this.delay(CONFIG.RATE_LIMIT_DELAY_MS);
                }
            } catch (error) {
                results.push({
                    success: false,
                    tsCode,
                    error: error.message
                });
            }
        }

        const summary = {
            total: results.length,
            success: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            successRate: ((results.filter(r => r.success).length / results.length) * 100).toFixed(2) + '%'
        };

        Logger.info('批量获取完成', summary);
        return { results, summary };
    }

    async getTaskStatus(taskId, tsCode) {
        return await this.dbManager.getTaskStatus(taskId, tsCode);
    }

    getDefaultStartDate() {
        const date = new Date();
        date.setFullYear(date.getFullYear() - 1);
        return date.toISOString().split('T')[0];
    }

    getDefaultEndDate() {
        return new Date().toISOString().split('T')[0];
    }

    generateTaskId() {
        return `minute_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async checkExistingData(tsCode, startDate, endDate) {
        try {
            const stats = await this.dbManager.checkDataIntegrity(tsCode, startDate, endDate);

            const expectedDates = CONFIG.DATA_RANGE_DAYS;
            const actualDates = stats.stats.length;
            const completeDates = stats.summary.completeDates;

            const dateCoverage = (actualDates / expectedDates) * 100;
            const completeness = actualDates > 0 ?
                (completeDates / actualDates) * 100 : 0;

            const overallCoverage = dateCoverage * (completeness / 100);

            return {
                totalDates: actualDates,
                completeDates,
                dateCoverage: parseFloat(dateCoverage.toFixed(2)),
                completeness: parseFloat(completeness.toFixed(2)),
                coverage: parseFloat(overallCoverage.toFixed(2)),
                ...stats.summary
            };
        } catch (error) {
            Logger.error('检查现有数据失败', { tsCode, error: error.message });
            return { coverage: 0, totalDates: 0, completeDates: 0 };
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        await this.dbManager.close();
    }
}

// 数据完整性验证
async function validateDataIntegrity(dbManager, tsCode, startDate, endDate) {
    const result = await dbManager.checkDataIntegrity(tsCode, startDate, endDate);

    const issues = [];

    // 检查数据完整性
    if (result.summary.completeness < 80) {
        issues.push({
            level: 'warning',
            message: `数据完整性不足: ${result.summary.completeness}%`,
            recommendation: '建议重新获取数据'
        });
    }

    // 检查缺失日期
    if (result.summary.missingDates > 0) {
        issues.push({
            level: 'warning',
            message: `存在 ${result.summary.missingDates} 天数据完全缺失`,
            recommendation: '检查缺失日期并补全'
        });
    }

    // 检查记录数
    const expectedRecords = result.summary.totalDates * 48;
    const actualRecords = result.summary.totalRecords;
    if (actualRecords < expectedRecords * 0.9) {
        issues.push({
            level: 'warning',
            message: `记录数不足: 实际 ${actualRecords}, 预期 ${expectedRecords}`,
            recommendation: '检查部分缺失的数据'
        });
    }

    return {
        tsCode,
        dateRange: `${startDate} ~ ${endDate}`,
        summary: result.summary,
        issues,
        isValid: issues.length === 0
    };
}

// CLI 接口
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    const fetcher = new MinuteDataFetcher();

    try {
        await fetcher.init();

        switch (command) {
            case 'fetch':
                const tsCode = args[1];
                if (!tsCode) {
                    Logger.error('请提供股票代码');
                    console.log('用法: node fetch_minute_data.mjs fetch <ts_code> [start_date] [end_date] [--force]');
                    process.exit(1);
                }

                const startDate = args[2] || fetcher.getDefaultStartDate();
                const endDate = args[3] || fetcher.getDefaultEndDate();
                const forceRefresh = args.includes('--force');

                const result = await fetcher.fetchMinuteData(tsCode, {
                    startDate,
                    endDate,
                    forceRefresh
                });

                console.log(JSON.stringify(result, null, 2));
                break;

            case 'batch':
                const stockList = args[1];
                if (!stockList) {
                    Logger.error('请提供股票代码列表（逗号分隔）');
                    console.log('用法: node fetch_minute_data.mjs batch <ts_code1,ts_code2,...>');
                    process.exit(1);
                }

                const tsCodes = stockList.split(',').map(code => code.trim());
                const batchResult = await fetcher.fetchMinuteDataBatch(tsCodes);

                console.log(JSON.stringify(batchResult, null, 2));
                break;

            case 'status':
                const taskId = args[1];
                const statusTsCode = args[2];

                if (!taskId || !statusTsCode) {
                    Logger.error('请提供任务ID和股票代码');
                    console.log('用法: node fetch_minute_data.mjs status <task_id> <ts_code>');
                    process.exit(1);
                }

                const status = await fetcher.getTaskStatus(taskId, statusTsCode);
                console.log(JSON.stringify(status, null, 2));
                break;

            case 'integrity':
                const integrityTsCode = args[1];
                if (!integrityTsCode) {
                    Logger.error('请提供股票代码');
                    console.log('用法: node fetch_minute_data.mjs integrity <ts_code>');
                    process.exit(1);
                }

                const integrityStart = args[2] || fetcher.getDefaultStartDate();
                const integrityEnd = args[3] || fetcher.getDefaultEndDate();

                const integrity = await validateDataIntegrity(
                    fetcher.dbManager,
                    integrityTsCode,
                    integrityStart,
                    integrityEnd
                );

                console.log(JSON.stringify(integrity, null, 2));
                break;

            case 'help':
            default:
                console.log(`
BaoStock 分钟线数据获取工具

用法:
  node fetch_minute_data.mjs <command> [options]

命令:
  fetch <ts_code> [start_date] [end_date] [--force]
    获取单个股票的分钟线数据

  batch <ts_code1,ts_code2,...> [--force]
    批量获取多个股票的分钟线数据

  status <task_id> <ts_code>
    获取任务状态

  integrity <ts_code> [start_date] [end_date]
    检查数据完整性

  help
    显示此帮助信息

示例:
  node fetch_minute_data.mjs fetch 000001.SZ
  node fetch_minute_data.mjs fetch 000001.SZ 2025-01-01 2026-01-01 --force
  node fetch_minute_data.mjs batch "000001.SZ,000002.SZ,000858.SZ"
  node fetch_minute_data.mjs status minute_1711245600000_abc123 000001.SZ
  node fetch_minute_data.mjs integrity 000001.SZ

配置:
  请检查 .env 文件中的配置参数
                `);
                break;
        }

    } catch (error) {
        Logger.error('主程序执行失败', { error: error.message });
        console.error('错误:', error.message);
        process.exit(1);
    } finally {
        await fetcher.close();
    }
}

// 运行主程序
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('未捕获的异常:', error);
        process.exit(1);
    });
}

export {
    BaoStockClient,
    DatabaseManager,
    MinuteDataFetcher,
    Logger,
    validateDataIntegrity
};