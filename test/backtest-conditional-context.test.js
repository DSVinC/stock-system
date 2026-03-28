#!/usr/bin/env node

const assert = require('node:assert');
const path = require('node:path');

async function main() {
  const apiPath = path.join(__dirname, '..', 'api', 'backtest-to-conditional.js');
  const dbModulePath = path.join(__dirname, '..', 'api', 'db.js');

  delete require.cache[apiPath];
  delete require.cache[dbModulePath];

  const runCalls = [];
  const mockDb = {
    async runPromise(sql, params) {
      runCalls.push({ sql, params });
      if (sql.includes('INSERT INTO conditional_order_context')) {
        return { lastID: 902, changes: 1 };
      }
      if (sql.includes('INSERT INTO conditional_order (')) {
        return { lastID: 901, changes: 1 };
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

  const { createConditionalOrderInDB } = require(apiPath);

  const result = await createConditionalOrderInDB({
    account_id: 1,
    ts_code: '600519.SH',
    stock_name: '贵州茅台',
    order_type: 'core_entry',
    action: 'buy',
    position_pct: 70,
    conditions: [{ trigger_type: 'ma_golden_cross', params: { ma_short: 5, ma_long: 20 } }],
    condition_logic: 'AND',
    status: 'enabled',
    source: 'backtest_optimization',
    reason: '核心仓配置 - 夏普比率: 2.50'
  });

  assert.strictEqual(result.id, 901, '应返回主表新建 ID');

  const orderInsert = runCalls.find(call => call.sql.includes('INSERT INTO conditional_order ('));
  assert.ok(orderInsert, '应写入 conditional_order 主表');

  const contextInsert = runCalls.find(call => call.sql.includes('INSERT INTO conditional_order_context'));
  assert.ok(contextInsert, '应写入 conditional_order_context 侧表');
  assert.strictEqual(contextInsert.params[0], 901, '侧表应关联主表 lastID');
  assert.strictEqual(contextInsert.params[1], 'backtest_optimization', '应记录研究流来源');
  assert.strictEqual(contextInsert.params[2], '核心仓配置 - 夏普比率: 2.50', '应记录回测导入原因');

  console.log('✅ backtest conditional context test passed');
}

main().catch(error => {
  console.error(`❌ backtest conditional context test failed: ${error.message}`);
  process.exit(1);
});
