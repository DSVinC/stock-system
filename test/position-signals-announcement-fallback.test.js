#!/usr/bin/env node

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { _internal } = require('../api/position-signals');

function createDb() {
  const db = new sqlite3.Database(':memory:');
  db.getPromise = function getPromise(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  };
  db.runPromise = function runPromise(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };
  db.allPromise = function allPromise(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  };
  return db;
}

async function bootstrap(db) {
  await db.runPromise(`
    CREATE TABLE company_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts_code TEXT NOT NULL,
      stock_name TEXT,
      event_type TEXT,
      event_time DATETIME NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function main() {
  const db = createDb();
  await bootstrap(db);

  const holdings = [
    { ts_code: '601012.SH', stock_name: '隆基绿能' }
  ];

  const result = await _internal.syncCompanyAnnouncements(db, holdings, {
    now: new Date('2026-03-29T12:00:00+08:00'),
    canUseSinaMcp: false,
    fetchTushareAnnouncements: async () => ([
      {
        ts_code: '601012.SH',
        name: '隆基绿能',
        ann_date: '20260328',
        title: '关于股份回购进展的公告',
        content: '',
        source: 'tushare_anns_d'
      }
    ])
  });

  assert.equal(result.synced, 1);
  assert.equal(result.inserted, 1);

  const rows = await db.allPromise('SELECT ts_code, title, source FROM company_events');
  assert.equal(rows.length, 1, '应插入一条公告事件');
  assert.equal(rows[0].ts_code, '601012.SH');
  assert.equal(rows[0].source, 'tushare_anns_d');
  assert.equal(rows[0].title, '关于股份回购进展的公告');

  console.log('✅ position-signals announcement fallback test passed');
}

main().catch((error) => {
  console.error(`❌ position-signals announcement fallback test failed: ${error.message}`);
  process.exitCode = 1;
});
