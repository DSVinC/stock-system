#!/usr/bin/env node

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { checkAllConditionalOrders } = require('../api/monitor-conditional');
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

async function seedAccount(db, cash = 100000) {
  const now = '2026-03-22 10:00:00';
  const result = await db.runPromise(`
    INSERT INTO portfolio_account (
      account_name, initial_cash, current_cash, total_value, total_return, return_rate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['监控测试账户', cash, cash, cash, 0, 0, now, now]);

  return result.lastID;
}

async function createOrder(db, payload) {
  const now = '2026-03-22 10:00:00';
  const base = {
    stock_name: '测试股票',
    order_type: 'price',
    quantity: 100,
    amount: null,
    position_pct: null,
    conditions: JSON.stringify([{ type: 'price', operator: '>=', value: 10 }]),
    condition_logic: 'AND',
    start_date: '2026-03-01',
    end_date: '2026-03-31',
    status: 'enabled',
    trigger_count: 0,
    max_trigger_count: 1,
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
    order.quantity,
    order.amount,
    order.position_pct,
    order.conditions,
    order.condition_logic,
    order.start_date,
    order.end_date,
    order.status,
    order.trigger_count,
    order.max_trigger_count,
    now,
    now,
  ]);

  return result.lastID;
}

function buildIncreasingHistory(tsCode) {
  const rows = [];
  for (let index = 1; index <= 30; index += 1) {
    const close = 10 + index;
    rows.push({
      ts_code: tsCode,
      trade_date: `202603${String(index).padStart(2, '0')}`,
      open: close - 0.5,
      high: close + 0.5,
      low: close - 1,
      close,
      pre_close: close - 1,
      change: 1,
      pct_chg: 100 / (close - 1),
      vol: 100000 + index * 1000,
      amount: close * (100000 + index * 1000),
    });
  }
  return rows;
}

function createBufferLogger(buffer) {
  return {
    info(message) {
      buffer.push(`INFO ${message}`);
    },
    warn(message) {
      buffer.push(`WARN ${message}`);
    },
    error(message) {
      buffer.push(`ERROR ${message}`);
    },
  };
}

async function main() {
  const db = createTestDb();
  await bootstrap(db);
  const accountId = await seedAccount(db, 200000);

  const priceOrderId = await createOrder(db, {
    account_id: accountId,
    ts_code: '000001.SZ',
    stock_name: '平安银行',
    action: 'buy',
    quantity: 200,
    conditions: JSON.stringify([{ type: 'price', operator: '>=', value: 10 }]),
  });

  const rsiOrderId = await createOrder(db, {
    account_id: accountId,
    ts_code: '600000.SH',
    stock_name: '浦发银行',
    action: 'buy',
    quantity: 100,
    conditions: JSON.stringify([{ trigger_type: 'rsi_overbought', params: { threshold: 70 } }]),
  });

  const pendingOrderId = await createOrder(db, {
    account_id: accountId,
    ts_code: '300750.SZ',
    stock_name: '宁德时代',
    action: 'buy',
    quantity: 100,
    conditions: JSON.stringify([{ type: 'price', operator: '>=', value: 500 }]),
  });

  const peOrderId = await createOrder(db, {
    account_id: accountId,
    ts_code: '601318.SH',
    stock_name: '中国平安',
    action: 'buy',
    quantity: 100,
    conditions: JSON.stringify([{ type: 'pe_percentile', operator: '<=', value: 0.25 }]),
  });

  await createOrder(db, {
    account_id: accountId,
    ts_code: '688981.SH',
    stock_name: '中芯国际',
    action: 'buy',
    quantity: 100,
    status: 'disabled',
  });

  const notifications = [];
  const logs = [];
  const quoteMap = {
    '000001.SZ': { price: 12.3, percent: 3.5, preClose: 11.88, volume: 500000, amount: 6150000 },
    '600000.SH': { price: 18.6, percent: 4.2, preClose: 17.85, volume: 420000, amount: 7812000 },
    '300750.SZ': { price: 260, percent: -1.2, preClose: 263.16, volume: 180000, amount: 46800000 },
    '601318.SH': { price: 45.6, percent: 1.1, preClose: 45.1, volume: 260000, amount: 11856000 },
  };

  const result = await checkAllConditionalOrders({
    db,
    now: new Date('2026-03-22T10:00:00+08:00'),
    logger: createBufferLogger(logs),
    quoteProvider: async (tsCode) => {
      const quote = quoteMap[tsCode];
      assert(quote, `缺少测试行情: ${tsCode}`);
      return quote;
    },
    dailyHistoryProvider: async (tsCode) => buildIncreasingHistory(tsCode),
    dailyBasicProvider: async () => ({ volume_ratio: 1.8, pe: 12.5, pe_ttm: 12.2 }),
    pePercentileProvider: async (tsCode) => {
      if (tsCode === '601318.SH') {
        return { percentile5y: 0.18, percentile3y: 0.22, percentile1y: 0.35 };
      }
      return { percentile5y: 0.42, percentile3y: 0.5, percentile1y: 0.65 };
    },
    tradeDateProvider: async () => '20260320',
    moneyflowProvider: async () => [{ net_mf_amount: 1234567 }],
    executor: (orderId, marketData, technicalData, options) =>
      executeConditionalOrder(orderId, marketData, technicalData, { db, ...options }),
    notifier: async (order, tradeResult) => {
      notifications.push({ orderId: order.id, success: tradeResult.success });
      return { success: true };
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.total, 4);
  assert.equal(result.triggered, 3);
  assert.equal(result.check_failed, 0);
  assert.equal(result.execution_failed, 0);

  const trades = await db.allPromise('SELECT conditional_order_id FROM portfolio_trade ORDER BY conditional_order_id ASC');
  assert.deepEqual(trades.map((item) => item.conditional_order_id), [priceOrderId, rsiOrderId, peOrderId]);

  const priceOrder = await db.getPromise('SELECT status, trigger_count FROM conditional_order WHERE id = ?', [priceOrderId]);
  const rsiOrder = await db.getPromise('SELECT status, trigger_count FROM conditional_order WHERE id = ?', [rsiOrderId]);
  const pendingOrder = await db.getPromise('SELECT status, trigger_count FROM conditional_order WHERE id = ?', [pendingOrderId]);
  const peOrder = await db.getPromise('SELECT status, trigger_count FROM conditional_order WHERE id = ?', [peOrderId]);

  assert.equal(priceOrder.status, 'expired');
  assert.equal(priceOrder.trigger_count, 1);
  assert.equal(rsiOrder.status, 'expired');
  assert.equal(rsiOrder.trigger_count, 1);
  assert.equal(pendingOrder.status, 'enabled');
  assert.equal(pendingOrder.trigger_count, 0);
  assert.equal(peOrder.status, 'expired');
  assert.equal(peOrder.trigger_count, 1);

  assert.equal(notifications.length, 3);
  assert(logs.some((line) => line.includes(`orderId=${priceOrderId}`) && line.includes('条件满足')));
  assert(logs.some((line) => line.includes(`orderId=${rsiOrderId}`) && line.includes('条件满足')));
  assert(logs.some((line) => line.includes(`orderId=${pendingOrderId}`) && line.includes('条件未满足')));
  assert(logs.some((line) => line.includes(`orderId=${peOrderId}`) && line.includes('"pePercentile":0.18')));
  assert(logs.some((line) => line.includes(`orderId=${peOrderId}`) && line.includes('条件满足')));

  console.log('PASS conditional monitor loop');
}

main().catch((error) => {
  console.error(`FAIL conditional monitor loop: ${error.message}`);
  process.exitCode = 1;
});
