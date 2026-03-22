#!/usr/bin/env node

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { executeConditionalOrder } = require('../api/conditional-executor');

function createTestDb() {
  const db = new sqlite3.Database(':memory:');

  db.getPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  db.allPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
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
    CREATE TABLE portfolio_position (
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

  await db.runPromise(`
    CREATE TABLE portfolio_trade (
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
    )
  `);
}

async function seedAccount(db, { cash = 100000, positions = [] } = {}) {
  const now = '2026-03-22 10:00:00';
  const accountResult = await db.runPromise(`
    INSERT INTO portfolio_account (
      account_name, initial_cash, current_cash, total_value, total_return, return_rate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['测试账户', cash, cash, cash, 0, 0, now, now]);

  for (const item of positions) {
    await db.runPromise(`
      INSERT INTO portfolio_position (
        account_id, ts_code, stock_name, quantity, avg_price, cost_amount,
        current_price, market_value, unrealized_pnl, unrealized_pnl_rate, position_date, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      accountResult.lastID,
      item.ts_code,
      item.stock_name,
      item.quantity,
      item.avg_price,
      item.cost_amount,
      item.current_price ?? item.avg_price,
      item.market_value ?? item.quantity * (item.current_price ?? item.avg_price),
      item.unrealized_pnl ?? 0,
      item.unrealized_pnl_rate ?? 0,
      '2026-03-22',
      now
    ]);
  }

  return accountResult.lastID;
}

async function createOrder(db, payload) {
  const now = '2026-03-22 10:00:00';
  const base = {
    stock_name: '平安银行',
    order_type: 'price',
    conditions: JSON.stringify([{ type: 'price', operator: '>=', value: 10 }]),
    condition_logic: 'AND',
    start_date: '2026-03-01',
    end_date: '2026-03-31',
    status: 'enabled',
    trigger_count: 0,
    max_trigger_count: 1
  };
  const order = { ...base, ...payload };

  const result = await db.runPromise(`
    INSERT INTO conditional_order (
      account_id, ts_code, stock_name, order_type, action, quantity, amount, position_pct,
      conditions, condition_logic, start_date, end_date, status, trigger_count, max_trigger_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    order.account_id,
    order.ts_code,
    order.stock_name,
    order.order_type,
    order.action,
    order.quantity ?? null,
    order.amount ?? null,
    order.position_pct ?? null,
    order.conditions,
    order.condition_logic,
    order.start_date,
    order.end_date,
    order.status,
    order.trigger_count,
    order.max_trigger_count,
    now,
    now
  ]);

  return result.lastID;
}

async function getOne(db, sql, params) {
  const row = await db.getPromise(sql, params);
  assert(row, `未找到记录: ${sql}`);
  return row;
}

async function runScenario(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  await runScenario('数量买入执行成功并写入历史', async () => {
    const db = createTestDb();
    await bootstrap(db);
    const accountId = await seedAccount(db, { cash: 20000 });
    const orderId = await createOrder(db, {
      account_id: accountId,
      ts_code: '000001.SZ',
      action: 'buy',
      quantity: 200
    });

    const result = await executeConditionalOrder(orderId, { price: 10.5 }, {}, { db });
    assert.equal(result.success, true);
    assert.equal(result.quantity, 200);
    assert.equal(result.execution_mode, 'quantity');

    const trade = await getOne(db, 'SELECT * FROM portfolio_trade WHERE conditional_order_id = ?', [orderId]);
    const order = await getOne(db, 'SELECT * FROM conditional_order WHERE id = ?', [orderId]);
    const position = await getOne(db, 'SELECT * FROM portfolio_position WHERE account_id = ? AND ts_code = ?', [accountId, '000001.SZ']);

    assert.equal(trade.quantity, 200);
    assert.equal(order.trigger_count, 1);
    assert.equal(order.status, 'expired');
    assert.equal(position.quantity, 200);
  });

  await runScenario('金额买入按整手成交', async () => {
    const db = createTestDb();
    await bootstrap(db);
    const accountId = await seedAccount(db, { cash: 50000 });
    const orderId = await createOrder(db, {
      account_id: accountId,
      ts_code: '600000.SH',
      stock_name: '浦发银行',
      action: 'buy',
      amount: 5600,
      max_trigger_count: 2
    });

    const result = await executeConditionalOrder(orderId, { price: 11.2 }, {}, { db });
    assert.equal(result.success, true);
    assert.equal(result.quantity, 500);
    assert.equal(result.status, 'enabled');
  });

  await runScenario('仓位百分比买入按可用资金计算', async () => {
    const db = createTestDb();
    await bootstrap(db);
    const accountId = await seedAccount(db, { cash: 100000 });
    const orderId = await createOrder(db, {
      account_id: accountId,
      ts_code: '300750.SZ',
      stock_name: '宁德时代',
      action: 'buy',
      position_pct: 25,
      max_trigger_count: 2
    });

    const result = await executeConditionalOrder(orderId, { price: 50 }, {}, { db });
    assert.equal(result.success, true);
    assert.equal(result.quantity, 500);
    assert.equal(result.execution_mode, 'position_pct');
  });

  await runScenario('卖出执行成功并减少持仓', async () => {
    const db = createTestDb();
    await bootstrap(db);
    const accountId = await seedAccount(db, {
      cash: 10000,
      positions: [{
        ts_code: '000001.SZ',
        stock_name: '平安银行',
        quantity: 600,
        avg_price: 9.5,
        cost_amount: 5700
      }]
    });
    const orderId = await createOrder(db, {
      account_id: accountId,
      ts_code: '000001.SZ',
      action: 'sell',
      position_pct: 50
    });

    const result = await executeConditionalOrder(orderId, { price: 10 }, {}, { db });
    assert.equal(result.success, true);
    assert.equal(result.quantity, 300);

    const position = await getOne(db, 'SELECT * FROM portfolio_position WHERE account_id = ? AND ts_code = ?', [accountId, '000001.SZ']);
    assert.equal(position.quantity, 300);
  });

  await runScenario('资金不足时不更新状态', async () => {
    const db = createTestDb();
    await bootstrap(db);
    const accountId = await seedAccount(db, { cash: 1000 });
    const orderId = await createOrder(db, {
      account_id: accountId,
      ts_code: '000001.SZ',
      action: 'buy',
      quantity: 200
    });

    const result = await executeConditionalOrder(orderId, { price: 10 }, {}, { db });
    assert.equal(result.success, false);
    assert.equal(result.code, 'INSUFFICIENT_FUNDS');

    const order = await getOne(db, 'SELECT * FROM conditional_order WHERE id = ?', [orderId]);
    const count = await getOne(db, 'SELECT COUNT(*) AS total FROM portfolio_trade WHERE conditional_order_id = ?', [orderId]);
    assert.equal(order.trigger_count, 0);
    assert.equal(count.total, 0);
  });

  await runScenario('持仓不足时返回错误', async () => {
    const db = createTestDb();
    await bootstrap(db);
    const accountId = await seedAccount(db, {
      cash: 10000,
      positions: [{
        ts_code: '000001.SZ',
        stock_name: '平安银行',
        quantity: 100,
        avg_price: 9.5,
        cost_amount: 950
      }]
    });
    const orderId = await createOrder(db, {
      account_id: accountId,
      ts_code: '000001.SZ',
      action: 'sell',
      quantity: 200
    });

    const result = await executeConditionalOrder(orderId, { price: 10 }, {}, { db });
    assert.equal(result.success, false);
    assert.equal(result.code, 'INSUFFICIENT_POSITION');
  });

  await runScenario('停牌时返回错误', async () => {
    const db = createTestDb();
    await bootstrap(db);
    const accountId = await seedAccount(db, { cash: 20000 });
    const orderId = await createOrder(db, {
      account_id: accountId,
      ts_code: '000001.SZ',
      action: 'buy',
      quantity: 200
    });

    const result = await executeConditionalOrder(orderId, { price: 10, suspended: true }, {}, { db });
    assert.equal(result.success, false);
    assert.equal(result.code, 'SECURITY_SUSPENDED');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
