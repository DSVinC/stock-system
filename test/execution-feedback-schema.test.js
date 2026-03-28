#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function sqlite(dbPath, sql) {
  return execFileSync('sqlite3', [dbPath, sql], { encoding: 'utf8' }).trim();
}

function main() {
  const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '017_create_execution_feedback.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-feedback-schema-'));
  const dbPath = path.join(tmpDir, 'test.db');

  sqlite(dbPath, `
    PRAGMA foreign_keys = ON;
    CREATE TABLE conditional_order (id INTEGER PRIMARY KEY);
    CREATE TABLE portfolio_trade (id INTEGER PRIMARY KEY);
    CREATE TABLE strategy_versions (version_id TEXT PRIMARY KEY);
  `);
  execFileSync('sqlite3', [dbPath], { input: migrationSql, encoding: 'utf8' });

  const schema = sqlite(dbPath, '.schema execution_feedback');
  assert.ok(schema.includes('CREATE TABLE execution_feedback'), '应创建 execution_feedback 表');
  assert.ok(schema.includes('feedback_id TEXT PRIMARY KEY'), '应包含 feedback_id 主键');
  assert.ok(schema.includes('event_type TEXT NOT NULL'), '应包含 event_type');
  assert.ok(schema.includes('conditional_order_id INTEGER'), '应包含 conditional_order_id');
  assert.ok(schema.includes('trade_id INTEGER'), '应包含 trade_id');
  assert.ok(schema.includes('version_id TEXT'), '应包含 version_id');
  assert.ok(schema.includes('payload_json TEXT'), '应包含 payload_json');

  const indexes = sqlite(dbPath, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'execution_feedback' ORDER BY name;");
  assert.ok(indexes.includes('idx_execution_feedback_event_type'), '应创建 event_type 索引');
  assert.ok(indexes.includes('idx_execution_feedback_occurred_at'), '应创建 occurred_at 索引');
  assert.ok(indexes.includes('idx_execution_feedback_version_id'), '应创建 version_id 索引');

  console.log('✅ execution feedback schema test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ execution feedback schema test failed: ${error.message}`);
  process.exit(1);
}
