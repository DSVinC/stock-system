/**
 * 分钟线数据获取 API
 * 提供分钟线数据的获取、状态查询和数据查询功能
 * 
 * 接口：
 * 1. POST /api/minute/fetch     - 触发分钟线数据获取
 * 2. GET  /api/minute/status    - 查询获取状态
 * 3. GET  /api/minute/data      - 查询分钟线数据
 * 4. GET  /api/minute/integrity - 检查数据完整性
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const execAsync = promisify(exec);

// 数据库路径（优先使用 .env 配置）
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'stock_system.db');

// 日志目录
const LOG_DIR = path.join(__dirname, '..', 'logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志函数
function log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console[level === 'error' ? 'error' : 'log'](logMessage, Object.keys(data).length > 0 ? JSON.stringify(data) : '');
    
    // 写入日志文件
    const logFile = path.join(LOG_DIR, `minute_api_${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = `${logMessage}${Object.keys(data).length > 0 ? ' ' + JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(logFile, logEntry);
}

// 数据库连接池
let dbInstance = null;

async function getDb() {
    if (!dbInstance) {
        try {
            dbInstance = await open({
                filename: DB_PATH,
                driver: sqlite3.Database
            });
            log('info', '数据库连接成功');
        } catch (error) {
            log('error', '数据库连接失败', { error: error.message });
            throw error;
        }
    }
    return dbInstance;
}

// 生成任务ID
function generateTaskId() {
    return `minute_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 验证股票代码格式
function validateTsCode(tsCode) {
    if (!tsCode) {
        return { valid: false, error: '股票代码不能为空' };
    }
    
    // 基本格式验证：XXXXXX.XX
    const pattern = /^[0-9]{6}\.(SH|SZ|BJ)$/;
    if (!pattern.test(tsCode)) {
        return { valid: false, error: '股票代码格式不正确，应为 000000.SH/SZ/BJ 格式' };
    }
    
    return { valid: true };
}

// 验证日期格式
function validateDate(dateStr, fieldName = '日期') {
    if (!dateStr) {
        return { valid: true }; // 允许为空
    }
    
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(dateStr)) {
        return { valid: false, error: `${fieldName}格式不正确，应为 YYYY-MM-DD 格式` };
    }
    
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return { valid: false, error: `${fieldName}无效` };
        }
        
        // 检查是否为未来日期
        if (date > new Date()) {
            return { valid: false, error: `${fieldName}不能是未来日期` };
        }
        
        return { valid: true };
    } catch (error) {
        return { valid: false, error: `${fieldName}解析失败: ${error.message}` };
    }
}

// 1. POST /api/minute/fetch - 触发分钟线数据获取
async function handleMinuteFetch(req, res) {
    try {
        const { ts_code, start_date, end_date, force_refresh, stocks, range, granularity } = req.body;

        // 支持两种请求格式：
        // 格式1: { ts_code, start_date, end_date } - 单只股票
        // 格式2: { stocks: [...], range, granularity } - Top10 股票列表

        let stockList = [];
        let dateRange = { start: start_date, end: end_date };

        // 处理 stocks 数组格式
        if (stocks && Array.isArray(stocks) && stocks.length > 0) {
            stockList = stocks;

            // 根据 range 参数设置日期范围
            const rangeMap = {
                '1y': 365,
                '6m': 180,
                '3m': 90,
                '1m': 30
            };
            const days = rangeMap[range] || 365; // 默认1年
            const endDate = new Date();
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - days);

            dateRange = {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            };
        } else if (ts_code) {
            // 单只股票格式
            const tsCodeValidation = validateTsCode(ts_code);
            if (!tsCodeValidation.valid) {
                return res.status(400).json({
                    success: false,
                    error: tsCodeValidation.error
                });
            }
            stockList = [ts_code];
        } else {
            return res.status(400).json({
                success: false,
                error: '请提供 ts_code 或 stocks 数组'
            });
        }

        // 验证日期
        const startDateValidation = validateDate(dateRange.start, '开始日期');
        if (!startDateValidation.valid) {
            return res.status(400).json({
                success: false,
                error: startDateValidation.error
            });
        }

        const endDateValidation = validateDate(dateRange.end, '结束日期');
        if (!endDateValidation.valid) {
            return res.status(400).json({
                success: false,
                error: endDateValidation.error
            });
        }

        // 生成任务ID
        const taskId = generateTaskId();

        // 记录任务开始
        const db = await getDb();

        // 为每只股票创建任务记录
        const taskRecords = [];
        for (const code of stockList) {
            const codeValidation = validateTsCode(code);
            if (!codeValidation.valid) {
                log('warn', `跳过无效股票代码: ${code}`, { error: codeValidation.error });
                continue;
            }

            await db.run(`
                INSERT INTO minute_fetch_tasks (
                    task_id, ts_code, start_date, end_date, status,
                    started_at, created_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [taskId, code, dateRange.start, dateRange.end, 'running']);

            taskRecords.push({
                ts_code: code,
                start_date: dateRange.start,
                end_date: dateRange.end
            });
        }

        log('info', '开始分钟线数据获取任务', {
            taskId,
            stock_count: stockList.length,
            stocks: stockList.slice(0, 10),
            dateRange,
            force_refresh
        });

        // 构建命令行参数
        const scriptPath = path.join(__dirname, '..', 'scripts', 'fetch_minute_data.mjs');

        // 异步执行数据获取（不阻塞API响应）
        // 支持批量获取：将股票列表传入脚本
        const stocksArg = stockList.join(',');
        const args = [
            'batch',
            stocksArg,
            dateRange.start || '',
            dateRange.end || ''
        ];

        if (force_refresh) {
            args.push('--force');
        }

        execAsync(`node ${scriptPath} ${args.join(' ')}`, {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, NODE_ENV: 'production' }
        }).then(async ({ stdout, stderr }) => {
            try {
                const db = await getDb();

                if (stderr) {
                    log('error', '分钟线获取脚本执行错误', { taskId, stderr });

                    await db.run(`
                        UPDATE minute_fetch_tasks
                        SET status = 'failed',
                            error_count = error_count + 1,
                            last_error = ?,
                            completed_at = CURRENT_TIMESTAMP
                        WHERE task_id = ?
                    `, [stderr.substring(0, 500), taskId]);

                    return;
                }

                // 解析输出结果
                let result;
                try {
                    result = JSON.parse(stdout);
                } catch (parseError) {
                    result = { success: true, message: '执行完成，但无法解析输出' };
                }

                if (result.success) {
                    // 更新整体任务状态
                    await db.run(`
                        UPDATE minute_fetch_tasks
                        SET status = 'success',
                            processed_days = ?,
                            processed_records = ?,
                            total_records = ?,
                            completed_at = CURRENT_TIMESTAMP
                        WHERE task_id = ?
                    `, [
                        result.data?.integrity?.totalDates || 0,
                        result.data?.saved || 0,
                        (result.data?.saved || 0) + (result.data?.skipped || 0),
                        taskId
                    ]);

                    log('info', '分钟线数据获取成功', {
                        taskId,
                        saved: result.data?.saved,
                        skipped: result.data?.skipped,
                        stock_count: stockList.length
                    });
                } else {
                    await db.run(`
                        UPDATE minute_fetch_tasks
                        SET status = 'failed',
                            error_count = error_count + 1,
                            last_error = ?,
                            completed_at = CURRENT_TIMESTAMP
                        WHERE task_id = ?
                    `, [result.error || '未知错误', taskId]);

                    log('error', '分钟线数据获取失败', { taskId, error: result.error });
                }
            } catch (dbError) {
                log('error', '更新任务状态失败', { taskId, error: dbError.message });
            }
        }).catch(async (execError) => {
            try {
                const db = await getDb();
                await db.run(`
                    UPDATE minute_fetch_tasks
                    SET status = 'failed',
                        error_count = error_count + 1,
                        last_error = ?,
                        completed_at = CURRENT_TIMESTAMP
                    WHERE task_id = ?
                `, [execError.message.substring(0, 500), taskId]);

                log('error', '执行分钟线获取脚本失败', { taskId, error: execError.message });
            } catch (dbError) {
                log('error', '更新失败任务状态失败', { taskId, error: dbError.message });
            }
        });

        // 立即返回任务ID
        res.json({
            success: true,
            message: stockList.length > 1 ?
                `分钟线数据获取任务已开始，共 ${stockList.length} 只股票` :
                '分钟线数据获取任务已开始',
            task_id: taskId,
            stocks: taskRecords,
            range: range || '1y',
            granularity: granularity || '5m',
            status: 'running',
            check_status_url: `/api/minute/status`
        });

    } catch (error) {
        log('error', '处理分钟线获取请求失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// 2. GET /api/minute/status - 查询获取状态概览（不带参数）
// 或者 GET /api/minute/status/:taskId/:tsCode - 查询特定任务状态
async function handleMinuteStatus(req, res) {
    try {
        const { taskId, tsCode } = req.params;

        // 如果没有提供 taskId 和 tsCode，返回最近任务的状态概览
        if (!taskId && !tsCode) {
            return await handleMinuteStatusOverview(req, res);
        }

        // 有参数时查询特定任务
        if (!taskId || !tsCode) {
            return res.status(400).json({
                success: false,
                error: '任务ID和股票代码不能为空'
            });
        }

        const db = await getDb();
        const task = await db.get(`
            SELECT * FROM minute_fetch_tasks
            WHERE task_id = ? AND ts_code = ?
        `, [taskId, tsCode]);

        if (!task) {
            return res.status(404).json({
                success: false,
                error: '任务不存在'
            });
        }

        // 计算进度
        let progress = 0;
        if (task.status === 'success') {
            progress = 100;
        } else if (task.status === 'running' && task.total_days > 0) {
            progress = Math.round((task.processed_days / task.total_days) * 100);
        }

        // 获取详细统计信息（如果任务已完成）
        let stats = null;
        if (task.status === 'success') {
            const statsData = await db.all(`
                SELECT * FROM stock_minute_stats
                WHERE ts_code = ? AND trade_date BETWEEN ? AND ?
                ORDER BY trade_date DESC
                LIMIT 10
            `, [tsCode, task.start_date?.replace(/-/g, '') || '20250101', task.end_date?.replace(/-/g, '') || '20261231']);

            if (statsData.length > 0) {
                const totalRecords = statsData.reduce((sum, s) => sum + s.total_records, 0);
                const missingRecords = statsData.reduce((sum, s) => sum + s.missing_records, 0);
                const completeDates = statsData.filter(s => s.data_quality === 'complete').length;

                stats = {
                    sample_dates: statsData.length,
                    total_records: totalRecords,
                    missing_records: missingRecords,
                    complete_dates: completeDates,
                    data_quality_summary: {
                        complete: completeDates,
                        partial: statsData.filter(s => s.data_quality === 'partial').length,
                        missing: statsData.filter(s => s.data_quality === 'missing').length
                    },
                    recent_dates: statsData.slice(0, 5).map(s => ({
                        trade_date: s.trade_date,
                        records: s.total_records,
                        quality: s.data_quality
                    }))
                };
            }
        }

        res.json({
            success: true,
            task: {
                task_id: task.task_id,
                ts_code: task.ts_code,
                start_date: task.start_date,
                end_date: task.end_date,
                status: task.status,
                progress: progress + '%',

                // 任务统计
                total_days: task.total_days,
                processed_days: task.processed_days,
                total_records: task.total_records,
                processed_records: task.processed_records,
                error_count: task.error_count,

                // 时间信息
                created_at: task.created_at,
                started_at: task.started_at,
                completed_at: task.completed_at,
                duration_seconds: task.started_at && task.completed_at ?
                    Math.round((new Date(task.completed_at) - new Date(task.started_at)) / 1000) : null,

                // 错误信息
                last_error: task.last_error
            },
            stats
        });

    } catch (error) {
        log('error', '查询任务状态失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// 2.1 GET /api/minute/status - 状态概览（不带参数）
async function handleMinuteStatusOverview(req, res) {
    try {
        const db = await getDb();

        // 获取最近的任务列表（按 task_id 分组）
        const recentTasks = await db.all(`
            SELECT
                task_id,
                COUNT(*) as stock_count,
                GROUP_CONCAT(ts_code) as stock_codes,
                MIN(start_date) as start_date,
                MAX(end_date) as end_date,
                MIN(created_at) as created_at,
                MAX(completed_at) as completed_at,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
            FROM minute_fetch_tasks
            GROUP BY task_id
            ORDER BY created_at DESC
            LIMIT 10
        `);

        // 计算总体状态
        const statusSummary = await db.get(`
            SELECT
                COUNT(*) as total_tasks,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
            FROM minute_fetch_tasks
        `);

        // 获取正在运行的任务
        const runningTasks = await db.all(`
            SELECT task_id, ts_code, status, created_at, started_at
            FROM minute_fetch_tasks
            WHERE status = 'running'
            ORDER BY started_at DESC
            LIMIT 5
        `);

        // 获取数据统计
        const dataStats = await db.get(`
            SELECT
                COUNT(DISTINCT ts_code) as total_stocks,
                COUNT(DISTINCT trade_date) as total_dates,
                COUNT(*) as total_records,
                MIN(trade_date) as earliest_date,
                MAX(trade_date) as latest_date
            FROM stock_minute
        `);

        // 格式化最近任务列表
        const formattedTasks = recentTasks.map(task => {
            let overallStatus = 'pending';
            if (task.running_count > 0) {
                overallStatus = 'running';
            } else if (task.failed_count > 0 && task.success_count === 0) {
                overallStatus = 'failed';
            } else if (task.success_count === task.stock_count) {
                overallStatus = 'success';
            } else if (task.success_count > 0) {
                overallStatus = 'partial';
            }

            return {
                task_id: task.task_id,
                stock_count: task.stock_count,
                stock_codes: task.stock_codes ? task.stock_codes.split(',').slice(0, 5) : [],
                date_range: {
                    start: task.start_date,
                    end: task.end_date
                },
                status: overallStatus,
                summary: {
                    success: task.success_count,
                    running: task.running_count,
                    failed: task.failed_count,
                    pending: task.pending_count
                },
                created_at: task.created_at,
                completed_at: task.completed_at
            };
        });

        res.json({
            success: true,
            overview: {
                total_tasks: statusSummary.total_tasks || 0,
                status_summary: {
                    success: statusSummary.success_count || 0,
                    running: statusSummary.running_count || 0,
                    failed: statusSummary.failed_count || 0,
                    pending: statusSummary.pending_count || 0
                },
                data_stats: {
                    total_stocks: dataStats.total_stocks || 0,
                    total_dates: dataStats.total_dates || 0,
                    total_records: dataStats.total_records || 0,
                    date_range: {
                        earliest: dataStats.earliest_date,
                        latest: dataStats.latest_date
                    }
                }
            },
            running_tasks: runningTasks,
            recent_tasks: formattedTasks
        });

    } catch (error) {
        log('error', '查询状态概览失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// 3. GET /api/minute/data - 查询分钟线数据
async function handleMinuteData(req, res) {
    try {
        const { ts_code, trade_date, start_time, end_time, limit = 100, page = 1 } = req.query;
        
        // 验证股票代码
        if (!ts_code) {
            return res.status(400).json({
                success: false,
                error: '股票代码不能为空'
            });
        }
        
        const tsCodeValidation = validateTsCode(ts_code);
        if (!tsCodeValidation.valid) {
            return res.status(400).json({
                success: false,
                error: tsCodeValidation.error
            });
        }
        
        // 验证日期
        if (trade_date) {
            const dateValidation = validateDate(trade_date, '交易日');
            if (!dateValidation.valid) {
                return res.status(400).json({
                    success: false,
                    error: dateValidation.error
                });
            }
        }
        
        // 验证分页参数
        const limitNum = parseInt(limit, 10);
        const pageNum = Math.max(1, parseInt(page, 10));
        const offset = (pageNum - 1) * limitNum;
        
        if (isNaN(limitNum) || limitNum <= 0 || limitNum > 1000) {
            return res.status(400).json({
                success: false,
                error: 'limit 参数必须为 1-1000 之间的整数'
            });
        }
        
        // 构建查询条件
        const conditions = [];
        const params = [];
        
        conditions.push('ts_code = ?');
        params.push(ts_code);
        
        if (trade_date) {
            conditions.push('trade_date = ?');
            params.push(trade_date.replace(/-/g, ''));
        }
        
        if (start_time) {
            conditions.push('trade_time >= ?');
            params.push(start_time);
        }
        
        if (end_time) {
            conditions.push('trade_time <= ?');
            params.push(end_time);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const db = await getDb();
        
        // 获取总数
        const countResult = await db.get(`
            SELECT COUNT(*) as total FROM stock_minute ${whereClause}
        `, params);
        
        // 获取数据
        const data = await db.all(`
            SELECT 
                id,
                ts_code,
                trade_date,
                trade_time,
                open,
                high,
                low,
                close,
                pre_close,
                change,
                pct_change,
                vol,
                amount,
                adj_factor,
                data_source,
                fetch_status,
                created_at,
                updated_at
            FROM stock_minute 
            ${whereClause}
            ORDER BY trade_date DESC, trade_time DESC
            LIMIT ? OFFSET ?
        `, [...params, limitNum, offset]);
        
        // 格式化数据
        const formattedData = data.map(row => ({
            id: row.id,
            ts_code: row.ts_code,
            trade_date: row.trade_date,
            trade_time: row.trade_time,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            pre_close: row.pre_close,
            change: row.change,
            pct_change: row.pct_change,
            vol: row.vol,
            amount: row.amount,
            adj_factor: row.adj_factor,
            data_source: row.data_source,
            fetch_status: row.fetch_status,
            created_at: row.created_at,
            updated_at: row.updated_at,
            
            // 计算技术指标
            avg_price: ((row.open + row.high + row.low + row.close) / 4).toFixed(2),
            amplitude: row.pre_close ? 
                (((row.high - row.low) / row.pre_close) * 100).toFixed(2) + '%' : 'N/A',
            turnover: row.amount > 0 && row.pre_close > 0 ? 
                (row.vol * 100 / (row.amount / row.pre_close)).toFixed(2) : 0
        }));
        
        // 获取统计信息
        const stats = await db.get(`
            SELECT 
                MIN(trade_date) as earliest_date,
                MAX(trade_date) as latest_date,
                COUNT(DISTINCT trade_date) as total_days,
                COUNT(*) as total_records
            FROM stock_minute 
            WHERE ts_code = ?
        `, [ts_code]);
        
        res.json({
            success: true,
            data: formattedData,
            pagination: {
                total: countResult.total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(countResult.total / limitNum)
            },
            stats: {
                ts_code,
                earliest_date: stats.earliest_date,
                latest_date: stats.latest_date,
                total_days: stats.total_days,
                total_records: stats.total_records,
                avg_records_per_day: stats.total_days > 0 ? 
                    Math.round(stats.total_records / stats.total_days) : 0
            },
            query: {
                ts_code,
                trade_date,
                start_time,
                end_time
            }
        });
        
    } catch (error) {
        log('error', '查询分钟线数据失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// 4. GET /api/minute/integrity/:tsCode - 检查数据完整性
async function handleMinuteIntegrity(req, res) {
    try {
        const { tsCode } = req.params;
        const { start_date, end_date } = req.query;
        
        if (!tsCode) {
            return res.status(400).json({
                success: false,
                error: '股票代码不能为空'
            });
        }
        
        const tsCodeValidation = validateTsCode(tsCode);
        if (!tsCodeValidation.valid) {
            return res.status(400).json({
                success: false,
                error: tsCodeValidation.error
            });
        }
        
        // 构建日期范围
        const startDate = start_date || '2025-01-01';
        const endDate = end_date || new Date().toISOString().split('T')[0];
        
        const startDateStr = startDate.replace(/-/g, '');
        const endDateStr = endDate.replace(/-/g, '');
        
        const db = await getDb();
        
        // 获取统计数据
        const stats = await db.all(`
            SELECT * FROM stock_minute_stats 
            WHERE ts_code = ? AND trade_date BETWEEN ? AND ?
            ORDER BY trade_date DESC
        `, [tsCode, startDateStr, endDateStr]);
        
        if (stats.length === 0) {
            return res.json({
                success: true,
                message: '未找到该股票的数据',
                ts_code: tsCode,
                date_range: `${startDate} ~ ${endDate}`,
                has_data: false
            });
        }
        
        // 计算完整性指标
        const totalDates = stats.length;
        const completeDates = stats.filter(s => s.data_quality === 'complete').length;
        const partialDates = stats.filter(s => s.data_quality === 'partial').length;
        const missingDates = stats.filter(s => s.data_quality === 'missing').length;
        
        const totalRecords = stats.reduce((sum, s) => sum + s.total_records, 0);
        const missingRecords = stats.reduce((sum, s) => sum + s.missing_records, 0);
        const expectedRecords = totalDates * 48; // 每天48条5分钟线
        
        const completenessRate = totalDates > 0 ? 
            (completeDates / totalDates * 100).toFixed(2) + '%' : '0%';
        const coverageRate = expectedRecords > 0 ? 
            (totalRecords / expectedRecords * 100).toFixed(2) + '%' : '0%';
        
        // 获取时间范围
        const dateRange = stats.length > 0 ? {
            earliest: stats[stats.length - 1].trade_date,
            latest: stats[0].trade_date
        } : null;
        
        // 获取数据质量趋势（最近10天）
        const recentStats = stats.slice(0, 10);
        const qualityTrend = recentStats.map(s => ({
            trade_date: s.trade_date,
            quality: s.data_quality,
            records: s.total_records,
            missing: s.missing_records
        }));
        
        // 检查是否存在连续缺失
        const missingDatesList = stats
            .filter(s => s.data_quality === 'missing')
            .map(s => s.trade_date);
        
        const continuousMissing = findContinuousMissing(missingDatesList);
        
        res.json({
            success: true,
            ts_code: tsCode,
            date_range: `${startDate} ~ ${endDate}`,
            has_data: true,
            
            summary: {
                total_dates: totalDates,
                complete_dates: completeDates,
                partial_dates: partialDates,
                missing_dates: missingDates,
                
                total_records: totalRecords,
                missing_records: missingRecords,
                expected_records: expectedRecords,
                
                completeness_rate: completenessRate,
                coverage_rate: coverageRate,
                data_quality: completenessRate >= '90%' ? 'good' : 
                            completenessRate >= '70%' ? 'fair' : 'poor'
            },
            
            details: {
                date_range: dateRange,
                quality_trend: qualityTrend,
                continuous_missing: continuousMissing,
                
                // 按质量分类的日期
                complete_dates_list: stats
                    .filter(s => s.data_quality === 'complete')
                    .slice(0, 5)
                    .map(s => s.trade_date),
                
                partial_dates_list: stats
                    .filter(s => s.data_quality === 'partial')
                    .slice(0, 5)
                    .map(s => ({ 
                        date: s.trade_date, 
                        records: s.total_records,
                        expected: 48 
                    })),
                
                missing_dates_list: missingDatesList.slice(0, 10)
            },
            
            recommendations: generateRecommendations({
                completenessRate,
                missingDates,
                continuousMissing
            })
        });
        
    } catch (error) {
        log('error', '检查数据完整性失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// 辅助函数：查找连续缺失的日期
function findContinuousMissing(dates) {
    if (dates.length < 2) return [];
    
    const sortedDates = dates.sort();
    const continuousRanges = [];
    let currentRange = [sortedDates[0]];
    
    for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i - 1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
        const currDate = new Date(sortedDates[i].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
        
        const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            currentRange.push(sortedDates[i]);
        } else {
            if (currentRange.length > 1) {
                continuousRanges.push({
                    start: currentRange[0],
                    end: currentRange[currentRange.length - 1],
                    length: currentRange.length
                });
            }
            currentRange = [sortedDates[i]];
        }
    }
    
    if (currentRange.length > 1) {
        continuousRanges.push({
            start: currentRange[0],
            end: currentRange[currentRange.length - 1],
            length: currentRange.length
        });
    }
    
    return continuousRanges;
}

// 辅助函数：生成建议
function generateRecommendations(metrics) {
    const recommendations = [];
    
    const completeness = parseFloat(metrics.completenessRate);
    
    if (completeness < 70) {
        recommendations.push({
            priority: 'high',
            action: 'fetch_missing',
            message: '数据完整性严重不足，建议立即补全缺失数据',
            command: '使用 --force 参数重新获取数据'
        });
    } else if (completeness < 90) {
        recommendations.push({
            priority: 'medium',
            action: 'check_partial',
            message: '数据完整性一般，建议检查部分缺失的数据',
            command: '使用 integrity 命令查看详细缺失日期'
        });
    } else if (completeness < 100) {
        recommendations.push({
            priority: 'low',
            action: 'verify_complete',
            message: '数据完整性良好，但仍有少量缺失',
            command: '可选择性补全缺失数据'
        });
    }
    
    if (metrics.missingDates > 0) {
        recommendations.push({
            priority: 'medium',
            action: 'identify_missing',
            message: `发现 ${metrics.missingDates} 天数据完全缺失`,
            command: '查看 missing_dates_list 获取具体日期'
        });
    }
    
    if (metrics.continuousMissing && metrics.continuousMissing.length > 0) {
        const longest = metrics.continuousMissing.sort((a, b) => b.length - a.length)[0];
        recommendations.push({
            priority: 'high',
            action: 'fix_continuous',
            message: `发现连续 ${longest.length} 天数据缺失 (${longest.start} ~ ${longest.end})`,
            command: '需要立即补全该时间段数据'
        });
    }
    
    return recommendations;
}

// 5. GET /api/minute/tasks - 获取任务列表
async function handleMinuteTasks(req, res) {
    try {
        const { status, ts_code, limit = 20, page = 1 } = req.query;
        
        const limitNum = parseInt(limit, 10);
        const pageNum = Math.max(1, parseInt(page, 10));
        const offset = (pageNum - 1) * limitNum;
        
        // 构建查询条件
        const conditions = [];
        const params = [];
        
        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        
        if (ts_code) {
            conditions.push('ts_code = ?');
            params.push(ts_code);
        }
        
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const db = await getDb();
        
        // 获取总数
        const countResult = await db.get(`
            SELECT COUNT(*) as total FROM minute_fetch_tasks ${whereClause}
        `, params);
        
        // 获取任务列表
        const tasks = await db.all(`
            SELECT 
                task_id,
                ts_code,
                start_date,
                end_date,
                status,
                total_days,
                processed_days,
                total_records,
                processed_records,
                error_count,
                last_error,
                created_at,
                started_at,
                completed_at
            FROM minute_fetch_tasks 
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limitNum, offset]);
        
        // 格式化任务列表
        const formattedTasks = tasks.map(task => {
            let progress = 0;
            if (task.status === 'success') {
                progress = 100;
            } else if (task.status === 'running' && task.total_days > 0) {
                progress = Math.round((task.processed_days / task.total_days) * 100);
            }
            
            return {
                ...task,
                progress: progress + '%',
                duration_seconds: task.started_at && task.completed_at ? 
                    Math.round((new Date(task.completed_at) - new Date(task.started_at)) / 1000) : null
            };
        });
        
        // 统计各状态任务数量
        const statusStats = await db.all(`
            SELECT status, COUNT(*) as count 
            FROM minute_fetch_tasks 
            GROUP BY status
        `);
        
        res.json({
            success: true,
            tasks: formattedTasks,
            pagination: {
                total: countResult.total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(countResult.total / limitNum)
            },
            stats: {
                by_status: statusStats.reduce((acc, stat) => {
                    acc[stat.status] = stat.count;
                    return acc;
                }, {}),
                total_tasks: countResult.total
            }
        });
        
    } catch (error) {
        log('error', '获取任务列表失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: '服务器内部错误',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// 导出路由处理器
module.exports = {
    handleMinuteFetch,
    handleMinuteStatus,
    handleMinuteData,
    handleMinuteIntegrity,
    handleMinuteTasks
};