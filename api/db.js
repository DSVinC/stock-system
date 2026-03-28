/**
 * 数据库连接模块
 *
 * 优化配置：
 * - WAL 模式：允许读写并发
 * - busy_timeout：5000ms 等待锁释放
 * - SQLITE_BUSY 重试机制：3次重试
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// 数据库路径：优先使用 .env 配置，回退到 SSD 主数据库路径
const DB_PATH = process.env.DB_PATH || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

// SQLITE_BUSY 错误码
const SQLITE_BUSY = 5;

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 100 // ms
};

let db = null;

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的数据库操作包装器
 */
async function withRetry(operation, operationName = 'db operation') {
  let lastError;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      // 只对 SQLITE_BUSY 错误重试
      if (err.code === 'SQLITE_BUSY' || err.errno === SQLITE_BUSY) {
        console.warn(`[DB] ${operationName} 遇到 SQLITE_BUSY，尝试 ${attempt}/${RETRY_CONFIG.maxRetries}`);

        if (attempt < RETRY_CONFIG.maxRetries) {
          // 指数退避延迟
          await delay(RETRY_CONFIG.retryDelay * attempt);
          continue;
        }
      }

      // 非 SQLITE_BUSY 错误或最后一次尝试失败，抛出错误
      throw err;
    }
  }

  throw lastError;
}

function getDatabase() {
  if (db) return db;

  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('数据库连接失败:', err.message);
    } else {
      console.log('数据库已连接:', DB_PATH);
    }
  });

  // 配置数据库优化参数
  db.serialize(() => {
    // 启用 WAL 模式（允许读写并发）
    db.run('PRAGMA journal_mode = WAL;', (err) => {
      if (err) {
        console.error('[DB] 设置 WAL 模式失败:', err.message);
      } else {
        console.log('[DB] WAL 模式已启用');
      }
    });

    // 设置 busy_timeout 为 5000ms
    db.run('PRAGMA busy_timeout = 5000;', (err) => {
      if (err) {
        console.error('[DB] 设置 busy_timeout 失败:', err.message);
      } else {
        console.log('[DB] busy_timeout 已设置为 5000ms');
      }
    });

    // 其他优化设置
    db.run('PRAGMA synchronous = NORMAL;'); // 平衡性能和安全
    db.run('PRAGMA cache_size = -64000;');   // 64MB 缓存
  });

  // 启用Promise风格方法（带重试）
  db.allPromise = function(sql, params = []) {
    return withRetry(
      () => new Promise((resolve, reject) => {
        this.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }),
      `all: ${sql.substring(0, 50)}...`
    );
  };

  db.getPromise = function(sql, params = []) {
    return withRetry(
      () => new Promise((resolve, reject) => {
        this.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      `get: ${sql.substring(0, 50)}...`
    );
  };

  db.runPromise = function(sql, params = []) {
    return withRetry(
      () => new Promise((resolve, reject) => {
        this.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }),
      `run: ${sql.substring(0, 50)}...`
    );
  };

  return db;
}

module.exports = {
  getDatabase,
  DB_PATH
};