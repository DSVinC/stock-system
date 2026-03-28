#!/usr/bin/env node

const assert = require('node:assert');
const path = require('node:path');

async function main() {
  const reportStoragePath = path.join(__dirname, '..', 'api', 'report-storage.js');
  const dbModulePath = path.join(__dirname, '..', 'api', 'db.js');

  delete require.cache[reportStoragePath];
  delete require.cache[dbModulePath];

  const runCalls = [];
  const mockDb = {
    async getPromise(sql, params) {
      if (sql.includes('FROM stock_analysis_reports WHERE report_id = ?')) {
        return {
          report_id: params[0],
          stock_code: '300308.SZ',
          stock_name: '中际旭创',
          decision: 'buy',
          report_json: JSON.stringify({ current_price: 100 }),
          stop_loss: 95,
          stop_profit: JSON.stringify([110, 120]),
          entry_zone: JSON.stringify([98, 102]),
          add_position: JSON.stringify([]),
          key_events: JSON.stringify([])
        };
      }

      if (sql.includes('SELECT * FROM conditional_order WHERE id = ?')) {
        return {
          id: params[0],
          account_id: 1,
          ts_code: '300308.SZ',
          stock_name: '中际旭创',
          action: 'buy',
          order_type: 'position_pct',
          position_pct: 10,
          conditions: JSON.stringify([])
        };
      }

      throw new Error(`unexpected getPromise SQL: ${sql}`);
    },
    async runPromise(sql, params) {
      runCalls.push({ sql, params });
      if (sql.includes('INSERT INTO conditional_order_context')) {
        return { lastID: 88, changes: 1 };
      }
      if (sql.includes('INSERT INTO conditional_order (')) {
        return { lastID: 77, changes: 1 };
      }
      throw new Error(`unexpected runPromise SQL: ${sql}`);
    }
  };

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getDatabase: () => mockDb
    }
  };

  const { importToOrderFromReport } = require(reportStoragePath);

  const req = {
    params: { reportId: 'REPORT-IMPORT-001' },
    body: {
      account_id: 1,
      position_pct: 10,
      use_stop_loss: true,
      use_stop_profit: true,
      use_entry_zone: true
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

  await importToOrderFromReport(req, res);

  assert.strictEqual(res.statusCode, 200, '当前导入链路应能走到成功分支');

  const orderInsert = runCalls.find(call => call.sql.includes('INSERT INTO conditional_order ('));
  assert.ok(orderInsert, '应写入 conditional_order 主表');
  assert.ok(
    !orderInsert.sql.includes('remark'),
    '修复后：主表写入不应再依赖 conditional_order.remark 列'
  );
  assert.ok(
    orderInsert.sql.includes('end_date'),
    '修复后：主表应补齐当前 schema 必需的 end_date 列'
  );

  const contextInsert = runCalls.find(call => call.sql.includes('INSERT INTO conditional_order_context'));
  assert.ok(contextInsert, '修复后：应写入 conditional_order_context 侧表');
  assert.strictEqual(contextInsert.params[0], 77, '侧表应关联新建的条件单 ID');
  assert.strictEqual(contextInsert.params[1], 'analysis_report', '侧表应记录报告来源');
  assert.strictEqual(contextInsert.params[2], '从分析报告导入: REPORT-IMPORT-001', '侧表应记录导入说明');
  assert.strictEqual(contextInsert.params[3], 'REPORT-IMPORT-001', '侧表应记录 report_id');

  console.log('✅ report-storage import schema fix test passed');
}

main().catch(error => {
  console.error(`❌ report-storage import schema reproduction test failed: ${error.message}`);
  process.exit(1);
});
