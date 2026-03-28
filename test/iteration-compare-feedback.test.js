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
    ['id-2', 'position_closed', 'ver-1', 120, 0.12, 6],
    ['id-3', 'conditional_trigger', 'ver-1', null, null, null],
    ['id-4', 'simulated_trade', 'ver-2', null, null, null],
    ['id-5', 'position_closed', 'ver-2', -50, -0.05, 8]
  ];

  for (const row of rows) {
    await db.runPromise(
      'INSERT INTO execution_feedback (feedback_id, event_type, version_id, realized_pnl, realized_return, holding_days) VALUES (?, ?, ?, ?, ?, ?)',
      row
    );
  }
}

async function main() {
  const { enrichVersionsWithExecutionFeedback, DEFAULT_EXECUTION_SUMMARY } = iterationRouter.__test;

  const db = createTestDb();
  await createFeedbackTable(db);
  await seedRows(db);

  const enriched = await enrichVersionsWithExecutionFeedback(db, [
    { version_id: 'ver-1', strategy_name: '版本1', config_json: '{}' },
    { version_id: 'ver-2', strategy_name: '版本2', config_json: '{}' }
  ]);

  const v1 = enriched.find((item) => item.version_id === 'ver-1');
  const v2 = enriched.find((item) => item.version_id === 'ver-2');

  assert.ok(v1.execution_summary);
  assert.equal(v1.execution_summary.position_closed_count, 1);
  assert.equal(v1.execution_feedback_status, 'caution');
  assert.equal(v1.execution_feedback_confidence, 'low');

  assert.ok(v2.execution_summary);
  assert.equal(v2.execution_summary.position_closed_count, 1);
  assert.equal(v2.execution_feedback_status, 'caution');
  assert.equal(v2.execution_feedback_confidence, 'low');

  const missingTableDb = createTestDb();
  const fallback = await enrichVersionsWithExecutionFeedback(missingTableDb, [
    { version_id: 'ver-x', strategy_name: '版本X' }
  ]);

  assert.deepEqual(fallback[0].execution_summary, DEFAULT_EXECUTION_SUMMARY);
  assert.equal(fallback[0].execution_feedback_status, 'no_data');
  assert.equal(fallback[0].execution_feedback_confidence, 'none');

  console.log('✅ iteration compare feedback test passed');
}

main().catch((error) => {
  console.error(`❌ iteration compare feedback test failed: ${error.message}`);
  process.exit(1);
});
