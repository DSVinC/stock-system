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

  return stdout.trim();
}

async function ensureDatabase() {
  const sql = `
    CREATE TABLE IF NOT EXISTS monitor_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      report_path TEXT,
      added_at DATETIME NOT NULL
    );
  `;

  await runSql(sql);
}

function validateAddPayload(body = {}) {
  const stockCode = typeof body.stock_code === 'string' ? body.stock_code.trim() : '';
  const stockName = typeof body.stock_name === 'string' ? body.stock_name.trim() : '';
  const reportPath = typeof body.report_path === 'string' ? body.report_path.trim() : '';

  if (!stockCode || !stockName) {
    const error = new Error('`stock_code` 和 `stock_name` 为必填项');
    error.statusCode = 400;
    throw error;
  }

  return {
    stockCode,
    stockName,
    reportPath,
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
      report_path,
      added_at
    FROM monitor_pool
    ORDER BY datetime(added_at) DESC, id DESC;
  `;
  const stdout = await runSql(sql, { json: true });
  return stdout ? JSON.parse(stdout) : [];
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
  if (duplicate && JSON.parse(duplicate).length > 0) {
    const error = new Error(`股票 ${payload.stockCode} 已在监控池中`);
    error.statusCode = 409;
    throw error;
  }

  const insertSql = `
    INSERT INTO monitor_pool (stock_code, stock_name, report_path, added_at)
    VALUES (
      ${toSqlValue(payload.stockCode)},
      ${toSqlValue(payload.stockName)},
      ${toSqlValue(payload.reportPath)},
      ${toSqlValue(payload.addedAt)}
    );
  `;

  await runSql(insertSql);

  const rows = await runSql(`
    SELECT
      id,
      stock_code,
      stock_name,
      report_path,
      added_at
    FROM monitor_pool
    WHERE stock_code = ${toSqlValue(payload.stockCode)}
      AND added_at = ${toSqlValue(payload.addedAt)}
    ORDER BY id DESC
    LIMIT 1;
  `, { json: true });
  const parsed = rows ? JSON.parse(rows) : [];
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
  const existingCount = countRows ? JSON.parse(countRows)[0].count : 0;

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
