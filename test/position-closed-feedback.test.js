#!/usr/bin/env node

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { executeConditionalOrder } = require('../api/conditional-executor');

function createTestDb() {
  const db = new sqlite3.Database(':memory:');
  db.getPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
  };
  db.allPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
  };
  db.runPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function(err) {
        err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };
  return db;
}

async function bootstrap(db) {
  await db.runPromise(`CREATE TABLE portfolio_account (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name TEXT NOT NULL,
    initial_cash REAL NOT NULL,
    current_cash REAL NOT NULL,
    total_value REAL NOT NULL,
    total_return REAL NOT NULL,
    return_rate REAL NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  )`);
  await db.runPromise(`CREATE TABLE portfolio_position (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    ts_code TEXT NOT NULL,
    stock_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    avg_price REAL NOT NULL,
    cost_amount REAL NOT NULL,
    current_price REAL,
    market_value REAL,
    unrealized_pnl REAL,
    unrealized_pnl_rate REAL,
    position_date DATE NOT NULL,
    updated_at DATETIME NOT NULL
  )`);
  await db.runPromise(`CREATE TABLE conditional_order (
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
  )`);
  await db.runPromise(`CREATE TABLE portfolio_trade (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    ts_code TEXT NOT NULL,
    stock_name TEXT NOT NULL,
    action TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    amount REAL NOT NULL,
    trade_date DATETIME NOT NULL,
    order_type TEXT,
    conditional_order_id INTEGER,
    remark TEXT
  )`);
  await db.runPromise(`CREATE TABLE conditional_order_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conditional_order_id INTEGER NOT NULL UNIQUE,
    strategy_source TEXT,
    strategy_config_id INTEGER,
    strategy_config_name TEXT,
    template_id INTEGER,
    template_name TEXT,
    strategy_id TEXT,
    strategy_version TEXT,
    report_id TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);
  await db.runPromise(`CREATE TABLE strategy_versions (version_id TEXT PRIMARY KEY)`);
  await db.runPromise(`CREATE TABLE execution_feedback (
    feedback_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    conditional_order_id INTEGER,
    trade_id INTEGER,
    account_id INTEGER,
    ts_code TEXT NOT NULL,
    strategy_source TEXT,
    strategy_config_id INTEGER,
    strategy_config_name TEXT,
    template_id INTEGER,
    template_name TEXT,
    strategy_id TEXT,
    strategy_version TEXT,
    version_id TEXT,
    report_id TEXT,
    action TEXT,
    quantity INTEGER,
    price REAL,
    amount REAL,
    realized_pnl REAL,
    realized_return REAL,
    holding_days INTEGER,
    payload_json TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
}

async function main() {
  const db = createTestDb();
  await bootstrap(db);

  const now = '2026-03-27 10:00:00';
  const account = await db.runPromise(`
    INSERT INTO portfolio_account (
      account_name, initial_cash, current_cash, total_value, total_return, return_rate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['测试账户', 10000, 10000, 10000, 0, 0, now, now]);

  await db.runPromise(`
    INSERT INTO portfolio_position (
      account_id, ts_code, stock_name, quantity, avg_price, cost_amount,
      current_price, market_value, unrealized_pnl, unrealized_pnl_rate, position_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    account.lastID, '000001.SZ', '平安银行', 300, 10, 3000, 10, 3000, 0, 0, '2026-03-20', now
  ]);

  const order = await db.runPromise(`
    INSERT INTO conditional_order (
      account_id, ts_code, stock_name, order_type, action, position_pct,
      conditions, condition_logic, start_date, end_date, status, trigger_count, max_trigger_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    account.lastID, '000001.SZ', '平安银行', 'price', 'sell', 100,
    JSON.stringify([{ type: 'price', operator: '>=', value: 11 }]), 'AND',
    '2026-03-01', '2026-03-31', 'enabled', 0, 1, now, now
  ]);

  await db.runPromise(`
    INSERT INTO conditional_order_context (
      conditional_order_id, strategy_source, strategy_config_id, strategy_config_name,
      template_id, template_name, strategy_id, strategy_version, report_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    order.lastID, 'strategy_config', 101, '七因子高分策略（执行副本）', 88, '七因子模板', 'STRAT-001', 'ver-001', 'REPORT-001', now, now
  ]);
  await db.runPromise(`INSERT INTO strategy_versions (version_id) VALUES ('ver-001')`);

  const result = await executeConditionalOrder(order.lastID, { price: 12 }, {}, { db });
  assert.equal(result.success, true, '清仓卖出应成功');

  const closedFeedback = await db.getPromise(
    'SELECT * FROM execution_feedback WHERE conditional_order_id = ? AND event_type = ?',
    [order.lastID, 'position_closed']
  );
  assert.ok(closedFeedback, '清仓时应写入 position_closed');
  assert.equal(closedFeedback.trade_id, 1, '应关联本次成交 trade');
  assert.equal(closedFeedback.quantity, 300);
  assert.equal(closedFeedback.price, 12);
  assert.equal(closedFeedback.amount, 3600);
  assert.equal(closedFeedback.realized_pnl, 600);
  assert.equal(closedFeedback.realized_return, 0.2);
  assert.equal(closedFeedback.holding_days, 7);
  assert.equal(closedFeedback.version_id, 'ver-001');

  console.log('✅ position closed feedback test passed');
}

main().catch((error) => {
  console.error(`❌ position closed feedback test failed: ${error.message}`);
  process.exit(1);
});
