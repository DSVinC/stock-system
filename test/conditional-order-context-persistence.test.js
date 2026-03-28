#!/usr/bin/env node

const assert = require('node:assert');
const path = require('node:path');

async function main() {
  const conditionalOrderPath = path.join(__dirname, '..', 'api', 'conditional-order.js');
  const dbModulePath = path.join(__dirname, '..', 'api', 'db.js');

  delete require.cache[conditionalOrderPath];
  delete require.cache[dbModulePath];

  const runCalls = [];
  const mockDb = {
    async getPromise(sql) {
      if (sql.includes('FROM portfolio_account')) {
        return {
          id: 1,
          account_name: '测试账户',
          current_cash: 100000,
          initial_cash: 100000
        };
      }

      if (sql.includes('FROM portfolio_position')) {
        return null;
      }

      if (sql.includes('FROM stock_daily')) {
        return { close: 100 };
      }

      throw new Error(`unexpected getPromise SQL: ${sql}`);
    },
    async runPromise(sql, params) {
      runCalls.push({ sql, params });
      if (sql.includes('INSERT INTO conditional_order_context')) {
        return { lastID: 11, changes: 1 };
      }
      if (sql.includes('INSERT INTO conditional_order')) {
        return { lastID: 321, changes: 1 };
      }
      throw new Error(`unexpected runPromise SQL: ${sql}`);
    }
  };

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getDatabase: async () => mockDb
    }
  };

  const { createConditionalOrder } = require(conditionalOrderPath);

  const req = {
    body: {
      account_id: 1,
      ts_code: '300308.SZ',
      stock_name: '中际旭创',
      order_type: 'price',
      action: 'buy',
      position_pct: 10,
      conditions: [{ type: 'price', operator: '<=', value: 100 }],
      strategySource: 'strategy_config',
      strategyConfigId: 999,
      strategyConfigName: '七因子高分策略（导入副本）',
      templateId: 888,
      templateName: '七因子高分策略模板',
      strategyId: 'STRAT-001',
      strategyVersion: 'v1.0.0',
      reportId: 'REPORT-123'
    }
  };

  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  await createConditionalOrder(req, res);

  assert.strictEqual(res.statusCode, 200, '创建条件单应成功');
  assert.ok(res.payload?.success, '返回体应为 success=true');

  const orderInsert = runCalls.find(call => call.sql.includes('INSERT INTO conditional_order ('));
  assert.ok(orderInsert, '应先写入 conditional_order 主表');

  const contextInsert = runCalls.find(call => call.sql.includes('INSERT INTO conditional_order_context'));
  assert.ok(contextInsert, '应写入 conditional_order_context 侧表');

  assert.strictEqual(contextInsert.params[0], 321, '侧表应关联主表 lastID');
  assert.strictEqual(contextInsert.params[1], 'strategy_config', '应持久化 strategy_source');
  assert.strictEqual(contextInsert.params[2], 999, '应持久化 strategy_config_id');
  assert.strictEqual(contextInsert.params[3], '七因子高分策略（导入副本）', '应持久化 strategy_config_name');
  assert.strictEqual(contextInsert.params[4], 888, '应持久化 template_id');
  assert.strictEqual(contextInsert.params[5], '七因子高分策略模板', '应持久化 template_name');
  assert.strictEqual(contextInsert.params[6], 'STRAT-001', '应持久化 strategy_id');
  assert.strictEqual(contextInsert.params[7], 'v1.0.0', '应持久化 strategy_version');
  assert.strictEqual(contextInsert.params[8], 'REPORT-123', '应持久化 report_id');

  console.log('✅ conditional-order context persistence test passed');
}

main().catch(error => {
  console.error(`❌ conditional-order context persistence test failed: ${error.message}`);
  process.exit(1);
});
