#!/usr/bin/env node
/**
 * 测试 /api/strategy-config/public 路由
 * 问题：GET /api/strategy-config/public 被路由 /:id 吞掉，返回 {success:false,error:"策略配置不存在"}
 * 原因：V4_015 路由器先挂载，其中 /:id 在 V4_016 的 /public 之前匹配
 */

const assert = require('assert');
const express = require('express');

// 模拟数据库
function createMockDb() {
  return {
    async runPromise() {
      return { changes: 1 };
    },
    async allPromise(sql) {
      if (sql.includes('FROM strategy_configs')) {
        return [
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
      }
      return [];
    },
    async getPromise(sql, params = []) {
      if (sql.includes("sqlite_master")) {
        return { name: 'strategy_config_feedback' };
      }
      if (sql.includes('FROM strategy_configs WHERE id =')) {
        // 模拟找不到策略（id = 'public' 时）
        if (params[0] === 'public') {
          return null;
        }
        return null;
      }
      return null;
    }
  };
}

// Mock getDatabase
let mockDb = null;
const originalGetDatabase = require('../api/db').getDatabase;

async function runTests() {
  console.log('=== 测试 /api/strategy-config/public 路由 ===\n');

  // 设置 mock
  const db = require('../api/db');
  mockDb = createMockDb();
  db.getDatabase = async () => mockDb;

  const strategyConfig = require('../api/strategy-config');

  // 创建 Express 应用，模拟 server.js 中的挂载顺序
  const app = express();
  app.use(express.json());

  const v4_015Router = strategyConfig.createV4_015Router(express);
  app.use('/api/strategy-config', v4_015Router);

  const v4_016Router = strategyConfig.createV4_016Router(express);
  app.use('/api/strategy-config', v4_016Router);

  // 启动测试服务器
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  let passed = 0;
  let failed = 0;

  // 测试 1: /public 应返回 success:true
  console.log('测试 1: GET /api/strategy-config/public 应返回 success:true');
  try {
    const response = await fetch(`${baseUrl}/api/strategy-config/public`);
    const data = await response.json();

    assert.strictEqual(data.success, true, `期望 success:true，实际返回: ${JSON.stringify(data)}`);
    console.log('  ✓ 通过: 返回 success:true\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ 失败: ${error.message}\n`);
    failed++;
  }

  // 测试 2: /public 应返回策略列表数据结构
  console.log('测试 2: GET /api/strategy-config/public 应返回策略列表');
  try {
    const response = await fetch(`${baseUrl}/api/strategy-config/public`);
    const data = await response.json();

    assert.strictEqual(data.success, true);
    // 数据结构是 {success:true, data:[...strategies], meta:{total:N}}
    assert.ok(Array.isArray(data.data), `期望 data 数组，实际: ${JSON.stringify(data)}`);
    console.log(`  ✓ 通过: 返回 ${data.data.length} 条策略\n`);
    passed++;
  } catch (error) {
    console.log(`  ✗ 失败: ${error.message}\n`);
    failed++;
  }

  // 测试 3: /public 不应被当作 id 参数
  console.log('测试 3: /public 不应被 /:id 路由吞掉');
  try {
    const response = await fetch(`${baseUrl}/api/strategy-config/public`);
    const data = await response.json();

    // 如果被 /:id 匹配，会返回 {success:false, error:"策略配置不存在"}
    if (data.error && data.error.includes('不存在')) {
      throw new Error(`路由被 /:id 吞掉，返回错误: ${data.error}`);
    }
    assert.strictEqual(data.success, true);
    console.log('  ✓ 通过: 正确命中公开列表路由\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ 失败: ${error.message}\n`);
    failed++;
  }

  // 测试 4: 数字 id 应正确处理
  console.log('测试 4: GET /api/strategy-config/123 应被 /:id 路由处理');
  try {
    const response = await fetch(`${baseUrl}/api/strategy-config/123`);
    const data = await response.json();

    // 数字 id 应该正常被 /:id 路由处理
    assert.ok(data.success !== undefined, '应该返回标准的 API 响应格式');
    console.log('  ✓ 通过: 数字 id 正确处理\n');
    passed++;
  } catch (error) {
    console.log(`  ✗ 失败: ${error.message}\n`);
    failed++;
  }

  // 关闭服务器
  await new Promise((resolve) => server.close(resolve));

  // 恢复原始函数
  db.getDatabase = originalGetDatabase;

  // 输出结果
  console.log('=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});