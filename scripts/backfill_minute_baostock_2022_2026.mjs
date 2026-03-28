#!/usr/bin/env node
/**
 * BaoStock 分钟线历史数据回填脚本
 * 回填 2022-2026 年 Top10 核心股票池分钟线数据
 *
 * 用法: node scripts/backfill_minute_baostock_2022_2026.mjs [--dry-run] [--year=2022]
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

// 配置
const CONFIG = {
    DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'stock_system.db'),
    PYTHON_PATH: process.env.PYTHON_PATH || 'python3',
    RATE_LIMIT_DELAY_MS: 3000,  // 请求间延迟
    BATCH_SIZE: 100,            // 每批次插入记录数
    RETRY_MAX: 3,               // 最大重试次数
    RETRY_DELAY_MS: 5000,       // 重试延迟

    // 回填年份范围
    YEARS: [2022, 2023, 2024, 2025, 2026],

    // Top10 核心股票池（11只）
    STOCKS: [
        '601012.SH',  // 隆基绿能
        '601877.SH',  // 正泰电器
        '600956.SH',  // 新天绿能
        '688599.SH',  // 天合光能
        '002459.SZ',  // 晶澳科技
        '600563.SH',  // 法拉电子
        '600869.SH',  // 远东股份
        '600089.SH',  // 特变电工
        '601868.SH',  // 中国能建
        '000070.SZ',  // 特发信息
        '000001.SZ',  // 平安银行
    ],
};

// 日志工具
class Logger {
    static log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level}]`;
        const output = Object.keys(data).length > 0
            ? `${prefix} ${message} ${JSON.stringify(data)}`
            : `${prefix} ${message}`;

        console.log(output);

        // 写入日志文件
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, `backfill_minute_${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, output + '\n');
    }

    static info(msg, data = {}) { this.log('INFO', msg, data); }
    static warn(msg, data = {}) { this.log('WARN', msg, data); }
    static error(msg, data = {}) { this.log('ERROR', msg, data); }
    static success(msg, data = {}) { this.log('SUCCESS', msg, data); }
}

// 数据库管理
class DatabaseManager {
    constructor() {
        this.db = null;
    }

    async connect() {
        this.db = await open({
            filename: CONFIG.DB_PATH,
            driver: sqlite3.Database
        });
        Logger.info('数据库连接成功', { path: CONFIG.DB_PATH });
        return this.db;
    }

    async getExistingDataRange(tsCode) {
        const result = await this.db.get(`
            SELECT MIN(trade_date) as min_date, MAX(trade_date) as max_date, COUNT(*) as count
            FROM stock_minute WHERE ts_code = ?
        `, [tsCode]);
        return result || { min_date: null, max_date: null, count: 0 };
    }

    async getMissingYears(tsCode) {
        const existing = await this.getExistingDataRange(tsCode);
        const missingYears = [];

        for (const year of CONFIG.YEARS) {
            const yearStart = `${year}0101`;
            const yearEnd = `${year}1231`;

            const count = await this.db.get(`
                SELECT COUNT(*) as count FROM stock_minute
                WHERE ts_code = ? AND trade_date >= ? AND trade_date <= ?
            `, [tsCode, yearStart, yearEnd]);

            // 每年约 240 交易日 * 48 条/天 = 11520 条
            const expectedRecords = 11520;
            if (count.count < expectedRecords * 0.5) {
                missingYears.push(year);
            }
        }

        return missingYears;
    }

    async saveMinuteData(tsCode, data) {
        if (!data || data.length === 0) {
            return { saved: 0, skipped: 0 };
        }

        let saved = 0;
        let skipped = 0;

        // 批量插入
        const batchSize = CONFIG.BATCH_SIZE;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);

            for (const record of batch) {
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
                } catch (err) {
                    skipped++;
                }
            }

            // 每 1000 条打印进度
            if (saved % 1000 === 0) {
                Logger.info(`  插入进度: ${saved}/${data.length}`);
            }
        }

        return { saved, skipped };
    }

    async close() {
        if (this.db) {
            await this.db.close();
        }
    }
}

// BaoStock Python 客户端
class BaoStockClient {
    constructor() {
        this.scriptPath = this.ensurePythonScript();
    }

    ensurePythonScript() {
        const scriptPath = path.join(__dirname, 'baostock_minute_fetcher.py');

        // 检查现有脚本是否存在
        if (fs.existsSync(scriptPath)) {
            return scriptPath;
        }

        // 创建脚本（复用 fetch_minute_data.mjs 中的脚本）
        const pythonCode = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import json
import baostock as bs

def login():
    lg = bs.login()
    return lg.error_code == '0', lg.error_msg

def logout():
    bs.logout()

def get_minute_data(ts_code, start_date, end_date, frequency='5', adjustflag='3'):
    try:
        # 格式转换
        if len(start_date) == 8:
            start_date = f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}"
        if len(end_date) == 8:
            end_date = f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}"

        rs = bs.query_history_k_data_plus(
            ts_code,
            "date,time,code,open,high,low,close,volume,amount",
            start_date=start_date,
            end_date=end_date,
            frequency=frequency,
            adjustflag=adjustflag
        )

        if rs is None or rs.error_code != '0':
            return [], rs.error_msg if rs else "BaoStock 返回 None"

        data_list = []
        while rs.next():
            row = rs.get_row_data()
            date_str = row[0]
            time_str = row[1]

            if len(time_str) >= 12:
                hour = time_str[8:10]
                minute = time_str[10:12]
                trade_time = f"{hour}:{minute}:00"
            else:
                trade_time = "00:00:00"

            trade_date = date_str.replace('-', '')

            record = {
                'ts_code': ts_code.replace('sh.', '').replace('sz.', '').replace('bj.', '') + ('.SH' if ts_code.startswith('sh') else '.SZ' if ts_code.startswith('sz') else '.BJ'),
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
    try:
        input_data = sys.stdin.read()
        params = json.loads(input_data)

        success, msg = login()
        if not success:
            print(json.dumps({'success': False, 'error': msg}))
            return

        if params.get('action') == 'fetch':
            data, error = get_minute_data(
                params['ts_code'],
                params['start_date'],
                params['end_date'],
                params.get('frequency', '5')
            )
            result = {'success': not error, 'error': error, 'data': data, 'count': len(data)} if data or error else {'success': True, 'data': [], 'count': 0}
        else:
            result = {'success': True, 'message': 'Test OK'}

        logout()
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))

if __name__ == '__main__':
    main()
`;

        fs.writeFileSync(scriptPath, pythonCode, 'utf-8');
        fs.chmodSync(scriptPath, '755');
        Logger.info('Python 脚本已创建', { path: scriptPath });
        return scriptPath;
    }

    async fetchMinuteData(tsCode, startDate, endDate, frequency = '5') {
        return new Promise((resolve, reject) => {
            // 转换股票代码格式
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
                end_date: endDate,
                frequency: frequency
            });

            const python = spawn(CONFIG.PYTHON_PATH, [this.scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => { stdout += data.toString(); });
            python.stderr.on('data', (data) => { stderr += data.toString(); });

            python.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Python 执行失败: ${stderr}`));
                    return;
                }

                try {
                    const lines = stdout.trim().split('\n');
                    let jsonLine = lines[lines.length - 1];

                    for (let i = lines.length - 1; i >= 0; i--) {
                        const line = lines[i].trim();
                        if (line.startsWith('{') && line.endsWith('}')) {
                            jsonLine = line;
                            break;
                        }
                    }

                    const result = JSON.parse(jsonLine);
                    if (!result.success) {
                        reject(new Error(result.error || 'BaoStock 错误'));
                        return;
                    }

                    resolve(result.data || []);
                } catch (err) {
                    reject(new Error(`解析输出失败: ${err.message}`));
                }
            });

            python.on('error', reject);
            python.stdin.write(input);
            python.stdin.end();
        });
    }
}

// 回填执行器
class BackfillExecutor {
    constructor() {
        this.db = new DatabaseManager();
        this.baostock = new BaoStockClient();
        this.stats = {
            totalRecords: 0,
            totalSaved: 0,
            totalSkipped: 0,
            errors: [],
            startTime: null,
            endTime: null
        };
    }

    async init() {
        await this.db.connect();
        Logger.info('初始化完成');
    }

    async backfillYear(tsCode, year, dryRun = false) {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        Logger.info(`开始回填 ${tsCode} ${year} 年数据`);

        if (dryRun) {
            Logger.info(`[DRY-RUN] 将获取 ${tsCode} ${startDate} 至 ${endDate} 的数据`);
            return { saved: 0, skipped: 0 };
        }

        // 获取数据
        const data = await this.baostock.fetchMinuteData(tsCode, startDate, endDate);

        if (!data || data.length === 0) {
            Logger.warn(`${tsCode} ${year} 年无数据`);
            return { saved: 0, skipped: 0 };
        }

        Logger.info(`获取到 ${data.length} 条记录`);

        // 保存数据
        const result = await this.db.saveMinuteData(tsCode, data);
        Logger.success(`${tsCode} ${year} 年保存完成`, result);

        return result;
    }

    async backfillStock(tsCode, options = {}) {
        const { dryRun = false, specificYear = null } = options;

        Logger.info(`\n${'='.repeat(60)}`);
        Logger.info(`开始处理股票: ${tsCode}`);
        Logger.info(`${'='.repeat(60)}`);

        // 检查缺失年份
        const missingYears = specificYear ? [specificYear] : await this.db.getMissingYears(tsCode);
        Logger.info(`缺失年份: ${missingYears.join(', ') || '无'}`);

        if (missingYears.length === 0) {
            Logger.info(`${tsCode} 数据已完整，跳过`);
            return { tsCode, years: [], totalSaved: 0, totalSkipped: 0 };
        }

        const results = [];

        for (const year of missingYears) {
            try {
                const result = await this.backfillYear(tsCode, year, dryRun);
                results.push({ year, ...result });

                // 延迟避免限流
                await this.delay(CONFIG.RATE_LIMIT_DELAY_MS);
            } catch (error) {
                Logger.error(`${tsCode} ${year} 年回填失败`, { error: error.message });
                results.push({ year, error: error.message });
                this.stats.errors.push({ tsCode, year, error: error.message });
            }
        }

        const totalSaved = results.reduce((sum, r) => sum + (r.saved || 0), 0);
        const totalSkipped = results.reduce((sum, r) => sum + (r.skipped || 0), 0);

        return { tsCode, years: results, totalSaved, totalSkipped };
    }

    async run(options = {}) {
        const { dryRun = false, specificYear = null, specificStock = null } = options;

        this.stats.startTime = new Date();
        Logger.info('开始分钟线历史数据回填');
        Logger.info(`模式: ${dryRun ? 'DRY-RUN' : '实际执行'}`);
        Logger.info(`目标股票: ${CONFIG.STOCKS.length} 只`);

        const stocks = specificStock ? [specificStock] : CONFIG.STOCKS;

        for (const stock of stocks) {
            const result = await this.backfillStock(stock, { dryRun, specificYear });
            this.stats.totalSaved += result.totalSaved;
            this.stats.totalSkipped += result.totalSkipped;
            this.stats.totalRecords += result.totalSaved + result.totalSkipped;
        }

        this.stats.endTime = new Date();
        this.printSummary();
    }

    printSummary() {
        const duration = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(1);

        Logger.info('\n' + '='.repeat(60));
        Logger.success('回填完成！');
        Logger.info('='.repeat(60));
        Logger.info(`总耗时: ${duration} 秒`);
        Logger.info(`总记录: ${this.stats.totalRecords}`);
        Logger.info(`成功保存: ${this.stats.totalSaved}`);
        Logger.info(`跳过: ${this.stats.totalSkipped}`);
        Logger.info(`错误: ${this.stats.errors.length}`);

        if (this.stats.errors.length > 0) {
            Logger.warn('错误详情:');
            for (const err of this.stats.errors) {
                Logger.warn(`  ${err.tsCode} ${err.year}: ${err.error}`);
            }
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        await this.db.close();
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    let specificYear = null;
    let specificStock = null;

    for (const arg of args) {
        if (arg.startsWith('--year=')) {
            specificYear = parseInt(arg.split('=')[1]);
        }
        if (arg.startsWith('--stock=')) {
            specificStock = arg.split('=')[1].toUpperCase();
        }
    }

    const executor = new BackfillExecutor();

    try {
        await executor.init();
        await executor.run({ dryRun, specificYear, specificStock });
    } catch (error) {
        Logger.error('执行失败', { error: error.message });
        process.exit(1);
    } finally {
        await executor.close();
    }
}

main();