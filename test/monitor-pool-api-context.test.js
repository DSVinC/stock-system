#!/usr/bin/env node

const assert = require('node:assert');
const path = require('node:path');

async function main() {
  const modulePath = path.join(__dirname, '..', 'api', 'monitor-pool.js');
  const dbModulePath = path.join(__dirname, '..', 'api', 'db.js');

  delete require.cache[modulePath];
  delete require.cache[dbModulePath];

  const calls = {
    run: [],
    get: [],
    all: []
  };

  let insertedContext = null;

  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getDatabase: () => ({
        async getPromise(sql, params = []) {
          calls.get.push({ sql, params });
          if (sql.includes('SELECT id FROM monitor_pool WHERE stock_code = ?')) {
            return null;
          }
          return null;
        },
        async runPromise(sql, params = []) {
          calls.run.push({ sql, params });
          if (sql.includes('INSERT INTO monitor_pool_context')) {
            insertedContext = params;
          }
          return { lastID: 101, changes: 1 };
        },
        async allPromise(sql, params = []) {
          calls.all.push({ sql, params });
          return [{
            id: 101,
            stock_code: '300308.SZ',
            stock_name: '中际旭创',
            strategy_source: 'strategy_config',
            strategy_config_id: 999,
            strategy_config_name: '七因子高分策略（导入副本）',
            template_id: 888,
            template_name: '七因子高分策略模板'
          }];
        }
      })
    }
  };

  const { addToPool, getPoolList } = require(modulePath);

  const addRes = {
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

  await addToPool({
    body: {
      stock_code: '300308.SZ',
      stock_name: '中际旭创',
      strategySource: 'strategy_config',
      strategyConfigId: 999,
      strategyConfigName: '七因子高分策略（导入副本）',
      templateId: 888,
      templateName: '七因子高分策略模板'
    }
  }, addRes);

  assert.ok(calls.run.some((entry) => entry.sql.includes('CREATE TABLE IF NOT EXISTS monitor_pool_context')), '应创建 monitor_pool_context 侧表');
  assert.ok(calls.run.some((entry) => entry.sql.includes('INSERT INTO monitor_pool_context')), '添加时应写入 monitor_pool_context');
  assert.ok(insertedContext, '应捕获 monitor_pool_context 插入参数');
  assert.strictEqual(insertedContext[0], 101, '侧表应关联 monitor_pool 主表 ID');
  assert.strictEqual(insertedContext[1], 'strategy_config', '应持久化 strategy_source');
  assert.strictEqual(insertedContext[2], 999, '应持久化 strategy_config_id');
  assert.strictEqual(insertedContext[3], '七因子高分策略（导入副本）', '应持久化 strategy_config_name');
  assert.strictEqual(insertedContext[4], 888, '应持久化 template_id');
  assert.strictEqual(insertedContext[5], '七因子高分策略模板', '应持久化 template_name');

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

  await getPoolList({}, listRes);

  assert.ok(calls.all.some((entry) => entry.sql.includes('LEFT JOIN monitor_pool_context')), '列表查询应联表 monitor_pool_context');
  const first = listRes.payload?.data?.[0];
  assert.strictEqual(first.strategy_source, 'strategy_config', '列表应返回 strategy_source');
  assert.strictEqual(first.strategy_config_id, 999, '列表应返回 strategy_config_id');
  assert.strictEqual(first.template_id, 888, '列表应返回 template_id');

  console.log('✅ monitor-pool api context test passed');
}

main().catch((error) => {
  console.error(`❌ monitor-pool api context test failed: ${error.message}`);
  process.exit(1);
});
