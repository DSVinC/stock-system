#!/usr/bin/env node

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { checkAllConditionalOrders } = require('../api/monitor-conditional');

function createTestDb() {
  const db = new sqlite3.Database(':memory:');

  db.getPromise = function getPromise(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  };

  db.allPromise = function allPromise(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  };

  db.runPromise = function runPromise(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function onRun(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };

  return db;
}

async function bootstrap(db) {
  await db.runPromise(`
    CREATE TABLE portfolio_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_name TEXT NOT NULL,
      initial_cash REAL NOT NULL,
      current_cash REAL NOT NULL,
      total_value REAL NOT NULL,
      total_return REAL NOT NULL,
      return_rate REAL NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);

  await db.runPromise(`
    CREATE TABLE conditional_order (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      ts_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      order_type TEXT NOT NULL,
      action TEXT NOT NULL,
      quantity INTEGER,
      amount REAL,
      position_pct REAL,
      conditions TEXT NOT NULL,
      condition_logic TEXT DEFAULT 'AND',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      trigger_count INTEGER DEFAULT 0,
      max_trigger_count INTEGER DEFAULT 1,
      last_trigger_time DATETIME,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);
}

async function main() {
  const db = createTestDb();
  await bootstrap(db);

  const now = '2026-03-29 11:00:00';
  const account = await db.runPromise(`
    INSERT INTO portfolio_account (
      account_name, initial_cash, current_cash, total_value, total_return, return_rate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['notif_test', 100000, 100000, 100000, 0, 0, now, now]);

  const order = await db.runPromise(`
    INSERT INTO conditional_order (
      account_id, ts_code, stock_name, order_type, action, quantity,
      conditions, condition_logic, start_date, end_date, status, trigger_count, max_trigger_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AND', ?, ?, 'enabled', 0, 1, ?, ?)
  `, [
    account.lastID,
    '000001.SZ',
    '平安银行',
    'shares',
    'buy',
    100,
    JSON.stringify([{ type: 'price', operator: '>=', value: 10 }]),
    '2026-03-01',
    '2026-04-30',
    now,
    now,
  ]);

  const notifications = [];
  const result = await checkAllConditionalOrders({
    db,
    now: new Date('2026-03-29T11:00:00+08:00'),
    quoteProvider: async () => ({ price: 12.0, percent: 1.2, preClose: 11.86 }),
    executor: async () => ({ success: false, error: 'MOCK_EXECUTION_FAILED', code: 'MOCK_FAIL' }),
    notifier: async (orderItem, tradeResult) => {
      notifications.push({ orderId: orderItem.id, success: tradeResult.success, code: tradeResult.code });
      return { success: true };
    },
  });

  assert.equal(result.total, 1);
  assert.equal(result.triggered, 1);
  assert.equal(result.execution_failed, 1);
  assert.equal(result.check_failed, 0);
  assert.equal(result.success, false, '执行失败应反映为本轮监控 success=false');
  assert.equal(notifications.length, 1, '执行失败也应进入通知分支');
  assert.equal(notifications[0].orderId, order.lastID);
  assert.equal(notifications[0].success, false);

  const first = result.results[0];
  assert.equal(first.status, 'execution_failed');
  assert.equal(first.notification.success, true);

  console.log('✅ conditional monitor notification failure test passed');
}

main().catch((error) => {
  console.error(`❌ conditional monitor notification failure test failed: ${error.message}`);
  process.exitCode = 1;
});

