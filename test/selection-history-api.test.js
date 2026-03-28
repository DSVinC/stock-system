#!/usr/bin/env node

const assert = require('node:assert');

async function fetchJsonWithTimeout(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    return { response, text, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { response, text, payload } = await fetchJsonWithTimeout('http://127.0.0.1:3000/api/selection/history?limit=3');

  assert.equal(response.status, 200, 'history API 应返回 200');
  assert.ok(payload && typeof payload === 'object', `history API 应返回 JSON，实际: ${text.slice(0, 200)}`);
  assert.equal(payload.success, true, 'history API 应返回 success=true');
  assert.ok(Array.isArray(payload.data), 'history API data 应为数组');
  assert.ok(payload.data.length <= 3, 'history API 应尊重 limit=3');

  console.log('✅ selection-history API test passed');
}

main().catch((error) => {
  console.error(`❌ selection-history API test failed: ${error.message}`);
  process.exit(1);
});
