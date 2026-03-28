#!/usr/bin/env node

const assert = require('node:assert');
const path = require('node:path');

async function main() {
  const conditionalOrderPath = path.join(__dirname, '..', 'api', 'conditional-order.js');
  const dbModulePath = path.join(__dirname, '..', 'api', 'db.js');

  delete require.cache[conditionalOrderPath];
  delete require.cache[dbModulePath];

  const captured = {
    allSql: null,
    getSql: null
  };

  const mockRow = {
    id: 321,
    account_id: 1,
    account_name: '测试账户',
    ts_code: '300308.SZ',
    stock_name: '中际旭创',
    status: 'enabled',
    conditions: JSON.stringify([{ type: 'price', operator: '<=', value: 100 }]),
    strategy_source: 'strategy_config',
    strategy_config_id: 999,
    strategy_config_name: '七因子高分策略（导入副本）',
    template_id: 888,
    template_name: '七因子高分策略模板',
    strategy_id: 'STRAT-001',
    strategy_version: 'v1.0.0',
    report_id: 'REPORT-123',
    execution_feedback_status: 'positive',
    execution_feedback_confidence: 'high',
    total_trades: 12,
    total_pnl: 3580.5
  };

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getDatabase: async () => ({
        async allPromise(sql) {
          captured.allSql = sql;
          return [mockRow];
        },
        async getPromise(sql) {
          captured.getSql = sql;
          return mockRow;
        }
      })
    }
  };

  const { getConditionalOrders, getConditionalOrder } = require(conditionalOrderPath);

  const listRes = {
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

  const detailRes = {
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

  await getConditionalOrders({ query: {} }, listRes);
  await getConditionalOrder({ params: { id: 321 } }, detailRes);

  assert.ok(captured.allSql && captured.allSql.includes('LEFT JOIN conditional_order_context'), '列表查询应联表 conditional_order_context');
  assert.ok(captured.getSql && captured.getSql.includes('LEFT JOIN conditional_order_context'), '详情查询应联表 conditional_order_context');
  assert.ok(captured.allSql && captured.allSql.includes('LEFT JOIN strategy_config_feedback'), '列表查询应联表 strategy_config_feedback');
  assert.ok(captured.getSql && captured.getSql.includes('LEFT JOIN strategy_config_feedback'), '详情查询应联表 strategy_config_feedback');

  const listOrder = listRes.payload?.data?.[0];
  const detailOrder = detailRes.payload?.data;

  assert.strictEqual(listOrder.strategy_source, 'strategy_config', '列表应返回 strategy_source');
  assert.strictEqual(listOrder.strategy_config_id, 999, '列表应返回 strategy_config_id');
  assert.strictEqual(listOrder.template_id, 888, '列表应返回 template_id');
  assert.strictEqual(listOrder.execution_feedback_status, 'positive', '列表应返回 execution_feedback_status');
  assert.strictEqual(listOrder.execution_feedback_confidence, 'high', '列表应返回 execution_feedback_confidence');
  assert.strictEqual(listOrder.total_trades, 12, '列表应返回 total_trades');
  assert.strictEqual(listOrder.total_pnl, 3580.5, '列表应返回 total_pnl');
  assert.strictEqual(detailOrder.strategy_source, 'strategy_config', '详情应返回 strategy_source');
  assert.strictEqual(detailOrder.strategy_version, 'v1.0.0', '详情应返回 strategy_version');
  assert.strictEqual(detailOrder.report_id, 'REPORT-123', '详情应返回 report_id');
  assert.strictEqual(detailOrder.execution_feedback_status, 'positive', '详情应返回 execution_feedback_status');
  assert.strictEqual(detailOrder.execution_feedback_confidence, 'high', '详情应返回 execution_feedback_confidence');
  assert.strictEqual(detailOrder.total_trades, 12, '详情应返回 total_trades');
  assert.strictEqual(detailOrder.total_pnl, 3580.5, '详情应返回 total_pnl');

  console.log('✅ conditional-order context query test passed');
}

main().catch(error => {
  console.error(`❌ conditional-order context query test failed: ${error.message}`);
  process.exit(1);
});
