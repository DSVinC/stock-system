#!/usr/bin/env node

const assert = require('assert');
const express = require('express');

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function getRouteHandler(router, path) {
  const layer = router.stack.find(entry => entry.route && entry.route.path === path);
  if (!layer) {
    throw new Error(`未找到路由: ${path}`);
  }
  const [handlerLayer] = layer.route.stack;
  if (!handlerLayer || typeof handlerLayer.handle !== 'function') {
    throw new Error(`路由 ${path} 缺少可执行处理函数`);
  }
  return handlerLayer.handle;
}

async function main() {
  const createStrategyTemplateRouter = require('../api/strategy-template');
  const router = createStrategyTemplateRouter(express);
  const handler = getRouteHandler(router, '/profiles');
  const req = {};
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.count, 4);
  assert.ok(Array.isArray(res.body.data));

  const types = res.body.data.map(item => item.strategy_type).sort();
  assert.deepEqual(types, ['industry_7factor', 'mean_reversion', 'multi_factor', 'trend_following']);

  console.log('✅ strategy template profiles test passed');
}

main().catch(error => {
  console.error(`❌ strategy template profiles test failed: ${error.message}`);
  process.exit(1);
});
