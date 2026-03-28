#!/usr/bin/env node

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const iterationRouter = require('../api/iteration-manager');

function createTestDb() {
  const db = new sqlite3.Database(':memory:');
  db.getPromise = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
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

async function createFeedbackTable(db) {
  await db.runPromise(`CREATE TABLE execution_feedback (
    feedback_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    version_id TEXT,
    realized_pnl REAL,
    realized_return REAL,
    holding_days INTEGER
  )`);
}

async function seedRows(db) {
  const rows = [
    ['id-1', 'simulated_trade', 'ver-1', null, null, null],
    ['id-2', 'simulated_trade', 'ver-1', null, null, null],
    ['id-3', 'conditional_trigger', 'ver-1', null, null, null],
    ['id-4', 'position_closed', 'ver-1', 100, 0.10, 5],
    ['id-5', 'position_closed', 'ver-1', -40, -0.04, 9],
    ['id-6', 'simulated_trade', 'ver-2', null, null, null],
    ['id-7', 'position_closed', 'ver-2', 60, 0.06, 3]
  ];

  for (const row of rows) {
    await db.runPromise(
      'INSERT INTO execution_feedback (feedback_id, event_type, version_id, realized_pnl, realized_return, holding_days) VALUES (?, ?, ?, ?, ?, ?)',
      row
    );
  }
}

async function main() {
  const { aggregateExecutionFeedback, DEFAULT_EXECUTION_SUMMARY } = iterationRouter.__test;

  const db = createTestDb();
  await createFeedbackTable(db);
  await seedRows(db);

  const ver1 = await aggregateExecutionFeedback(db, 'ver-1');
  assert.equal(ver1.simulated_trade_count, 2);
  assert.equal(ver1.position_closed_count, 2);
  assert.equal(ver1.trigger_failure_count, 1);
  assert.equal(ver1.win_rate, 0.5);
  assert.equal(ver1.total_realized_pnl, 60);
  assert.equal(ver1.avg_realized_return, 0.03);
  assert.equal(ver1.avg_holding_days, 7);
  assert.equal(ver1.trigger_failure_rate, 0.3333);

  const ver2 = await aggregateExecutionFeedback(db, 'ver-2');
  assert.equal(ver2.simulated_trade_count, 1);
  assert.equal(ver2.position_closed_count, 1);
  assert.equal(ver2.trigger_failure_count, 0);
  assert.equal(ver2.win_rate, 1);
  assert.equal(ver2.total_realized_pnl, 60);
  assert.equal(ver2.avg_realized_return, 0.06);
  assert.equal(ver2.avg_holding_days, 3);
  assert.equal(ver2.trigger_failure_rate, 0);

  const verMissing = await aggregateExecutionFeedback(db, 'ver-missing');
  assert.deepEqual(verMissing, DEFAULT_EXECUTION_SUMMARY);

  const missingTableDb = createTestDb();
  const fallback = await aggregateExecutionFeedback(missingTableDb, 'ver-x');
  assert.deepEqual(fallback, DEFAULT_EXECUTION_SUMMARY);

  console.log('✅ iteration feedback summary test passed');
}

main().catch((error) => {
  console.error(`❌ iteration feedback summary test failed: ${error.message}`);
  process.exit(1);
});
