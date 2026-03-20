'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'stock_system.db');

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function toSqlValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }

  return `'${escapeSqlString(value)}'`;
}

async function runSql(sql, options = {}) {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const args = [];
  if (options.json) {
    args.push('-json');
  }

  args.push(DB_PATH, sql);

  const { stdout, stderr } = await execFileAsync('/usr/bin/sqlite3', args, {
    maxBuffer: 1024 * 1024
  });

  if (stderr && stderr.trim()) {
    throw new Error(stderr.trim());
  }

  const result = stdout.trim();
  
  // 处理JSON解析
  if (options.json && result) {
    try {
      return JSON.parse(result);
    } catch (error) {
      // 如果JSON解析失败，可能是空结果
      if (result === '') {
        return [];
      }
      throw error;
    }
  }
  
  return result;
}

async function ensureDatabase() {
  // 1. 创建或更新monitor_pool表
  const checkTableSql = `
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='monitor_pool';
  `;
  
  const existingTable = await runSql(checkTableSql);
  
  if (!existingTable) {
    // 表不存在，创建新表
    const createTableSql = `
      CREATE TABLE monitor_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_code TEXT NOT NULL,
        stock_name TEXT NOT NULL,
        
        -- 行业信息（申万2021版）
        industry_code_l1 TEXT,      -- 一级行业代码（如 270000）
        industry_name_l1 TEXT,      -- 一级行业名称（如 电子）
        industry_code_l2 TEXT,      -- 二级行业代码（如 270100）
        industry_name_l2 TEXT,      -- 二级行业名称（如 半导体）
        industry_code_l3 TEXT,      -- 三级行业代码（如 270104）
        industry_name_l3 TEXT,      -- 三级行业名称（如 数字芯片设计）
        industry_keywords TEXT,     -- JSON数组：行业关键词
        
        report_path TEXT,
        added_at DATETIME NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX idx_monitor_industry_l3 ON monitor_pool(industry_code_l3);
      CREATE INDEX idx_monitor_industry_l2 ON monitor_pool(industry_code_l2);
      CREATE INDEX idx_monitor_industry_l1 ON monitor_pool(industry_code_l1);
    `;
    
    await runSql(createTableSql);
  } else {
    // 表已存在，检查是否需要添加列
    const checkColumnsSql = `
      PRAGMA table_info(monitor_pool);
    `;
    
    const columns = await runSql(checkColumnsSql, { json: true });
    const columnNames = Array.isArray(columns) ? columns.map(col => col.name) : [];
    
    // 添加缺失的列
    const missingColumns = [];
    
    if (!columnNames.includes('industry_code_l1')) missingColumns.push('industry_code_l1 TEXT');
    if (!columnNames.includes('industry_name_l1')) missingColumns.push('industry_name_l1 TEXT');
    if (!columnNames.includes('industry_code_l2')) missingColumns.push('industry_code_l2 TEXT');
    if (!columnNames.includes('industry_name_l2')) missingColumns.push('industry_name_l2 TEXT');
    if (!columnNames.includes('industry_code_l3')) missingColumns.push('industry_code_l3 TEXT');
    if (!columnNames.includes('industry_name_l3')) missingColumns.push('industry_name_l3 TEXT');
    if (!columnNames.includes('industry_keywords')) missingColumns.push('industry_keywords TEXT');
    if (!columnNames.includes('updated_at')) missingColumns.push('updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    
    if (missingColumns.length > 0) {
      for (const columnDef of missingColumns) {
        const alterSql = `ALTER TABLE monitor_pool ADD COLUMN ${columnDef};`;
        try {
          await runSql(alterSql);
        } catch (error) {
          console.warn(`添加列失败: ${columnDef}, 可能已存在`);
        }
      }
    }
  }
  
  // 2. 创建industry_news_factor表
  const createNewsFactorTable = `
    CREATE TABLE IF NOT EXISTS industry_news_factor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      news_id TEXT NOT NULL,
      industry_code TEXT NOT NULL,
      industry_name TEXT NOT NULL,
      news_title TEXT NOT NULL,
      news_url TEXT,
      publish_time DATETIME,
      sentiment TEXT,  -- strong_positive/positive/neutral/negative/strong_negative
      confidence REAL DEFAULT 0.5,  -- 置信度 0-1
      keywords_matched TEXT,  -- JSON数组
      impact_level TEXT,      -- high/medium/low
      is_notified BOOLEAN DEFAULT 0,
      notified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(news_id, industry_code)
    );
  `;
  
  await runSql(createNewsFactorTable);
  
  // 3. 创建shenwan_industry_def表
  const createIndustryDefTable = `
    CREATE TABLE IF NOT EXISTS shenwan_industry_def (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      industry_code TEXT UNIQUE NOT NULL,
      industry_name TEXT NOT NULL,
      parent_code TEXT,
      level INTEGER DEFAULT 1,  -- 1:一级, 2:二级, 3:三级
      keywords TEXT,  -- JSON数组：行业关键词
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  await runSql(createIndustryDefTable);
  
  // 4. 创建索引
  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_industry_factor_news_id ON industry_news_factor(news_id);
    CREATE INDEX IF NOT EXISTS idx_industry_factor_industry_code ON industry_news_factor(industry_code);
    CREATE INDEX IF NOT EXISTS idx_industry_factor_created_at ON industry_news_factor(created_at);
    CREATE INDEX IF NOT EXISTS idx_shenwan_industry_level ON shenwan_industry_def(level);
    CREATE INDEX IF NOT EXISTS idx_shenwan_industry_active ON shenwan_industry_def(is_active);
  `;
  
  await runSql(createIndexes);
}

function validateAddPayload(body = {}) {
  const stockCode = typeof body.stock_code === 'string' ? body.stock_code.trim().toUpperCase() : '';
  const stockName = typeof body.stock_name === 'string' ? body.stock_name.trim() : '';
  const reportPath = typeof body.report_path === 'string' ? body.report_path.trim() : '';
  
  // 行业信息（可选）
  const industryCodeL1 = typeof body.industry_code_l1 === 'string' ? body.industry_code_l1.trim() : null;
  const industryNameL1 = typeof body.industry_name_l1 === 'string' ? body.industry_name_l1.trim() : null;
  const industryCodeL2 = typeof body.industry_code_l2 === 'string' ? body.industry_code_l2.trim() : null;
  const industryNameL2 = typeof body.industry_name_l2 === 'string' ? body.industry_name_l2.trim() : null;
  const industryCodeL3 = typeof body.industry_code_l3 === 'string' ? body.industry_code_l3.trim() : null;
  const industryNameL3 = typeof body.industry_name_l3 === 'string' ? body.industry_name_l3.trim() : null;
  const industryKeywords = typeof body.industry_keywords === 'string' ? body.industry_keywords.trim() : null;

  if (!stockCode || !stockName) {
    const error = new Error('`stock_code` 和 `stock_name` 为必填项');
    error.statusCode = 400;
    throw error;
  }

  return {
    stockCode,
    stockName,
    reportPath: reportPath || null,
    // 行业信息
    industryCodeL1,
    industryNameL1,
    industryCodeL2,
    industryNameL2,
    industryCodeL3,
    industryNameL3,
    industryKeywords,
    
    addedAt: new Date().toISOString()
  };
}

function validateRemovePayload(body = {}) {
  const id = Number(body.id);
  const stockCode = typeof body.stock_code === 'string' ? body.stock_code.trim() : '';

  if (Number.isInteger(id) && id > 0) {
    return { id };
  }

  if (stockCode) {
    return { stockCode };
  }

  const error = new Error('请提供有效的 `id` 或 `stock_code`');
  error.statusCode = 400;
  throw error;
}

async function listMonitorPool() {
  const sql = `
    SELECT
      id,
      stock_code,
      stock_name,
      industry_code_l1,
      industry_name_l1,
      industry_code_l2,
      industry_name_l2,
      industry_code_l3,
      industry_name_l3,
      industry_keywords,
      report_path,
      added_at
    FROM monitor_pool
    ORDER BY datetime(added_at) DESC, id DESC;
  `;
  const result = await runSql(sql, { json: true });
  return Array.isArray(result) ? result : [];
}

async function addMonitorStock(body) {
  const payload = validateAddPayload(body);

  const duplicateCheckSql = `
    SELECT id
    FROM monitor_pool
    WHERE stock_code = ${toSqlValue(payload.stockCode)}
    LIMIT 1;
  `;

  const duplicate = await runSql(duplicateCheckSql, { json: true });
  if (duplicate && Array.isArray(duplicate) && duplicate.length > 0) {
    const error = new Error(`股票 ${payload.stockCode} 已在监控池中`);
    error.statusCode = 409;
    throw error;
  }

  const insertSql = `
    INSERT INTO monitor_pool (
      stock_code, stock_name, report_path,
      industry_code_l1, industry_name_l1,
      industry_code_l2, industry_name_l2,
      industry_code_l3, industry_name_l3,
      industry_keywords,
      added_at
    )
    VALUES (
      ${toSqlValue(payload.stockCode)},
      ${toSqlValue(payload.stockName)},
      ${toSqlValue(payload.reportPath)},
      ${toSqlValue(payload.industryCodeL1)},
      ${toSqlValue(payload.industryNameL1)},
      ${toSqlValue(payload.industryCodeL2)},
      ${toSqlValue(payload.industryNameL2)},
      ${toSqlValue(payload.industryCodeL3)},
      ${toSqlValue(payload.industryNameL3)},
      ${toSqlValue(payload.industryKeywords)},
      ${toSqlValue(payload.addedAt)}
    );
  `;

  await runSql(insertSql);

  const rows = await runSql(`
    SELECT
      id,
      stock_code,
      stock_name,
      industry_code_l1,
      industry_name_l1,
      industry_code_l2,
      industry_name_l2,
      industry_code_l3,
      industry_name_l3,
      industry_keywords,
      report_path,
      added_at
    FROM monitor_pool
    WHERE stock_code = ${toSqlValue(payload.stockCode)}
      AND added_at = ${toSqlValue(payload.addedAt)}
    ORDER BY id DESC
    LIMIT 1;
  `, { json: true });
  const parsed = Array.isArray(rows) ? rows : [];
  return parsed[0] || {
    id: null,
    stock_code: payload.stockCode,
    stock_name: payload.stockName,
    report_path: payload.reportPath || null,
    added_at: payload.addedAt
  };
}

async function removeMonitorStock(body) {
  const payload = validateRemovePayload(body);
  const whereClause = payload.id
    ? `id = ${payload.id}`
    : `stock_code = ${toSqlValue(payload.stockCode)}`;

  const countSql = `
    SELECT COUNT(*) AS count
    FROM monitor_pool
    WHERE ${whereClause};
  `;
  const countRows = await runSql(countSql, { json: true });
  const existingCount = Array.isArray(countRows) && countRows.length > 0 ? countRows[0].count : 0;

  if (!existingCount) {
    const error = new Error('未找到要移除的监控记录');
    error.statusCode = 404;
    throw error;
  }

  await runSql(`DELETE FROM monitor_pool WHERE ${whereClause};`);
  return { removed: existingCount };
}

async function createMonitorRouter(express) {
  await ensureDatabase();

  const router = express.Router();

  router.get('/list', async (req, res) => {
    try {
      const rows = await listMonitorPool();
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  router.post('/add', async (req, res) => {
    try {
      const created = await addMonitorStock(req.body);
      res.status(201).json({ success: true, data: created });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  });

  router.post('/remove', async (req, res) => {
    try {
      const result = await removeMonitorStock(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  });

  // 新增：获取已监控股票代码列表（TASK_OPT_003）
  router.get('/stock-list', async (req, res) => {
    try {
      const rows = await listMonitorPool();
      const stockCodes = rows.map(row => row.stock_code);
      res.json({ success: true, stocks: stockCodes });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = {
  DB_PATH,
  addMonitorStock,
  listMonitorPool,
  removeMonitorStock,
  ensureDatabase,
  createMonitorRouter
};
