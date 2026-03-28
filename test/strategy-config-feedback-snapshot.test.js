#!/usr/bin/env node

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function createDb() {
  const db = new sqlite3.Database(':memory:');
  db.runPromise = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
  db.getPromise = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  db.allPromise = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  return db;
}

async function seedRequiredTables(db) {
  await db.runPromise(`
    CREATE TABLE strategy_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      is_public INTEGER DEFAULT 0
    )
  `);
  await db.runPromise(`
    CREATE TABLE strategy_versions (
      version_id TEXT PRIMARY KEY
    )
  `);
  await db.runPromise(`INSERT INTO strategy_configs (id, name, is_public) VALUES (1, '测试策略', 1)`);
  await db.runPromise(`INSERT INTO strategy_versions (version_id) VALUES ('ver-001')`);
  await db.runPromise(`INSERT INTO strategy_versions (version_id) VALUES ('ver-002')`);
}

function loadModuleWithMockedDb(db) {
  const dbModulePath = require.resolve('/Users/vvc/.openclaw/workspace/stock-system/api/db.js');
  const strategyConfigPath = require.resolve('/Users/vvc/.openclaw/workspace/stock-system/api/strategy-config.js');

  delete require.cache[strategyConfigPath];
  delete require.cache[dbModulePath];

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getDatabase: async () => db
    }
  };

  return require(strategyConfigPath);
}

async function main() {
  const db = createDb();
  await seedRequiredTables(db);

  const strategyConfig = loadModuleWithMockedDb(db);
  const { ensureSideTablesExist, upsertFeedbackSnapshot, getFeedbackSnapshot } = strategyConfig;

  assert.equal(typeof ensureSideTablesExist, 'function', '应导出 ensureSideTablesExist');
  assert.equal(typeof upsertFeedbackSnapshot, 'function', '应导出 upsertFeedbackSnapshot');
  assert.equal(typeof getFeedbackSnapshot, 'function', '应导出 getFeedbackSnapshot');

  console.log('\n测试 1: 首次调用会创建 side table');
  const beforeTable = await db.getPromise(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_config_feedback'"
  );
  assert.equal(beforeTable, undefined);
  await ensureSideTablesExist();
  const afterTable = await db.getPromise(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_config_feedback'"
  );
  assert.equal(afterTable.name, 'strategy_config_feedback');
  console.log('✓ 表创建成功');

  console.log('\n测试 2: 会插入快照记录');
  await upsertFeedbackSnapshot({
    strategy_config_id: 1,
    source_version_id: 'ver-001',
    execution_feedback_status: 'positive',
    execution_feedback_confidence: 'high',
    execution_summary_json: { position_closed_count: 3, total_realized_pnl: 1200 },
    backtest_score: 82.5
  });

  const inserted = await db.getPromise(
    'SELECT * FROM strategy_config_feedback WHERE strategy_config_id = ?',
    [1]
  );
  assert.equal(inserted.source_version_id, 'ver-001');
  assert.equal(inserted.execution_feedback_status, 'positive');
  assert.equal(inserted.execution_feedback_confidence, 'high');
  assert.equal(inserted.backtest_score, 82.5);
  assert.deepEqual(JSON.parse(inserted.execution_summary_json), {
    position_closed_count: 3,
    total_realized_pnl: 1200
  });
  console.log('✓ 插入快照记录成功');

  console.log('\n测试 3: 再次调用会更新同一 strategy_config_id 的快照');
  await upsertFeedbackSnapshot({
    strategy_config_id: 1,
    source_version_id: 'ver-002',
    execution_feedback_status: 'caution',
    execution_feedback_confidence: 'low',
    execution_summary_json: { position_closed_count: 1, total_realized_pnl: -300 },
    backtest_score: 61.2
  });

  const rows = await db.allPromise(
    'SELECT * FROM strategy_config_feedback WHERE strategy_config_id = ?',
    [1]
  );
  assert.equal(rows.length, 1, '同一 strategy_config_id 应只保留一条快照');
  assert.equal(rows[0].source_version_id, 'ver-002');
  assert.equal(rows[0].execution_feedback_status, 'caution');
  assert.equal(rows[0].execution_feedback_confidence, 'low');
  assert.equal(rows[0].backtest_score, 61.2);
  assert.deepEqual(JSON.parse(rows[0].execution_summary_json), {
    position_closed_count: 1,
    total_realized_pnl: -300
  });
  console.log('✓ 更新快照记录成功');

  console.log('\n测试 4: getFeedbackSnapshot 返回解析后的 summary');
  const snapshot = await getFeedbackSnapshot(1);
  assert.equal(snapshot.source_version_id, 'ver-002');
  assert.deepEqual(snapshot.execution_summary_json, {
    position_closed_count: 1,
    total_realized_pnl: -300
  });
  console.log('✓ getFeedbackSnapshot 成功');

  console.log('\n========================================');
  console.log('✅ strategy-config feedback snapshot 测试通过');
  console.log('========================================');

  db.close();
}

main().catch((error) => {
  console.error(`\n❌ strategy-config feedback snapshot test failed: ${error.message}`);
  process.exit(1);
});
