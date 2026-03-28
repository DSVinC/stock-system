#!/usr/bin/env node

const assert = require('assert');

function createMockDb() {
  const strategyConfigs = [
    {
      id: 1,
      name: '公开策略A',
      is_public: 1,
      portfolio_config: '{"core":0.7}',
      grid_config: null,
      backtest_period: null,
      updated_at: '2026-03-27T16:00:00Z'
    },
    {
      id: 2,
      name: '公开策略B',
      is_public: 1,
      portfolio_config: null,
      grid_config: null,
      backtest_period: null,
      updated_at: '2026-03-27T15:00:00Z'
    }
  ];

  const feedbackRows = [
    {
      strategy_config_id: 1,
      source_version_id: 'ver-001',
      execution_feedback_status: 'positive',
      execution_feedback_confidence: 'medium',
      execution_summary_json: '{"position_closed_count":6,"total_realized_pnl":3800}',
      backtest_score: 0.85
    }
  ];

  return {
    async runPromise() {
      return { changes: 1 };
    },
    async allPromise(sql) {
      if (sql.includes('FROM strategy_configs')) {
        return strategyConfigs;
      }
      return [];
    },
    async getPromise(sql, params = []) {
      if (sql.includes("sqlite_master")) {
        return { name: 'strategy_config_feedback' };
      }
      if (sql.includes('FROM strategy_config_feedback')) {
        return feedbackRows.find((row) => row.strategy_config_id === params[0]) || null;
      }
      return null;
    }
  };
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
  const db = createMockDb();
  const strategyConfig = loadModuleWithMockedDb(db);

  const req = {};
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
    }
  };

  await strategyConfig.listPublicStrategies(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.length, 2);

  const first = res.body.data[0];
  const second = res.body.data[1];

  assert.deepEqual(first.portfolio_config, { core: 0.7 });
  assert.ok(first.feedback, '存在 feedback 快照时应附带 feedback 字段');
  assert.equal(first.feedback.source_version_id, 'ver-001');
  assert.equal(first.feedback.execution_feedback_status, 'positive');
  assert.equal(first.feedback.execution_feedback_confidence, 'medium');
  assert.deepEqual(first.feedback.execution_summary_json, {
    position_closed_count: 6,
    total_realized_pnl: 3800
  });
  assert.equal(first.feedback.backtest_score, 0.85);

  assert.equal(second.feedback, null, '缺少 feedback 快照时应稳定返回 null');

  console.log('✅ strategy-config public feedback test passed');
}

main().catch((error) => {
  console.error(`❌ strategy-config public feedback test failed: ${error.message}`);
  process.exit(1);
});
