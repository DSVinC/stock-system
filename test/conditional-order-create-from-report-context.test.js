#!/usr/bin/env node

const assert = require('node:assert');
const path = require('node:path');

async function main() {
  const apiPath = path.join(__dirname, '..', 'api', 'conditional-order.js');
  const dbModulePath = path.join(__dirname, '..', 'api', 'db.js');

  delete require.cache[apiPath];
  delete require.cache[dbModulePath];

  const runCalls = [];
  let nextId = 500;
  const mockDb = {
    async getPromise(sql, params) {
      if (sql.includes('FROM stock_analysis_reports WHERE report_id = ? AND stock_code = ?')) {
        return {
          report_id: params[0],
          stock_code: params[1],
          stock_name: '中际旭创',
          report_json: JSON.stringify({
            decisions: {
              stop_loss: 95,
              stop_profit: [110],
              entry_zone: { low: 98, high: 102 }
            }
          })
        };
      }
      throw new Error(`unexpected getPromise SQL: ${sql}`);
    },
    async runPromise(sql, params) {
      runCalls.push({ sql, params });
      if (sql.includes('INSERT INTO conditional_order_context')) {
        return { lastID: ++nextId, changes: 1 };
      }
      if (sql.includes('INSERT INTO conditional_order')) {
        return { lastID: ++nextId, changes: 1 };
      }
      throw new Error(`unexpected runPromise SQL: ${sql}`);
    }
  };

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getPromise: mockDb.getPromise,
      runPromise: mockDb.runPromise,
      getDatabase: async () => mockDb
    }
  };

  const { createFromReport } = require(apiPath);

  const req = {
    body: {
      stock_code: '300308.SZ',
      report_id: 'REPORT-CREATE-001',
      account_id: 1,
      position_pct: 10
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

  await createFromReport(req, res);

  assert.strictEqual(res.statusCode, 200, '从报告创建条件单应成功');
  assert.ok(res.payload?.success, '返回体应为 success=true');

  const orderInserts = runCalls.filter(call => call.sql.includes('INSERT INTO conditional_order ('));
  assert.strictEqual(orderInserts.length, 3, '应创建 3 个条件单（止损、止盈、建仓）');
  for (const call of orderInserts) {
    assert.ok(
      !call.sql.includes('report_id'),
      '修复后：主表写入不应再引用 report_id 列'
    );
  }

  const contextInserts = runCalls.filter(call => call.sql.includes('INSERT INTO conditional_order_context'));
  assert.strictEqual(contextInserts.length, 3, '每个条件单都应补一条侧表上下文');
  for (const call of contextInserts) {
    assert.strictEqual(call.params[1], 'analysis_report', '侧表应记录分析报告来源');
    assert.strictEqual(call.params[3], 'REPORT-CREATE-001', '侧表应记录 report_id');
  }

  console.log('✅ conditional-order createFromReport context test passed');
}

main().catch(error => {
  console.error(`❌ conditional-order createFromReport context test failed: ${error.message}`);
  process.exit(1);
});
