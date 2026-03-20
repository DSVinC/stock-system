/**
 * 数据库连接模块
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

let db = null;

function getDatabase() {
  if (db) return db;
  
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('数据库连接失败:', err.message);
    } else {
      console.log('数据库已连接:', DB_PATH);
    }
  });
  
  // 启用Promise风格方法
  db.allPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };
  
  db.getPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };
  
  db.runPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };
  
  return db;
}

module.exports = {
  getDatabase,
  DB_PATH
};