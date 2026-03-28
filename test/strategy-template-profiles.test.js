#!/usr/bin/env node

const assert = require('assert');
const http = require('http');
const express = require('express');

function requestJson({ port, path }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET'
      },
      res => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              body: JSON.parse(raw)
            });
          } catch (error) {
            reject(new Error(`响应不是有效 JSON: ${raw}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const app = express();
  const createStrategyTemplateRouter = require('../api/strategy-template');
  app.use('/api/strategy-template', createStrategyTemplateRouter(express));

  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;

  try {
    const res = await requestJson({
      port,
      path: '/api/strategy-template/profiles'
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.count, 4);
    assert.ok(Array.isArray(res.body.data));

    const types = res.body.data.map(item => item.strategy_type).sort();
    assert.deepEqual(types, ['industry_7factor', 'mean_reversion', 'multi_factor', 'trend_following']);

    console.log('✅ strategy template profiles test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(`❌ strategy template profiles test failed: ${error.message}`);
  process.exit(1);
});
