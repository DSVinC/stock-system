#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');

const SERVER_PATH = '/Users/vvc/.openclaw/workspace/stock-system/api/server.js';

function main() {
  console.log('\n📋 测试：server.js 中 strategy-config 路由挂载顺序\n');

  const source = fs.readFileSync(SERVER_PATH, 'utf8');
  const v4015Index = source.indexOf("app.use('/api/strategy-config', v4_015Router)");
  const v4016Index = source.indexOf("app.use('/api/strategy-config', v4_016Router)");

  assert.ok(v4015Index >= 0, '应存在 V4_015 挂载语句');
  assert.ok(v4016Index >= 0, '应存在 V4_016 挂载语句');
  assert.ok(v4016Index < v4015Index, 'V4_016 必须先于 V4_015 挂载，避免 /public 被 /:id 吞掉');

  console.log('  ✅ V4_016 挂载语句存在');
  console.log('  ✅ V4_015 挂载语句存在');
  console.log('  ✅ V4_016 挂载顺序正确（位于 V4_015 之前）');
  console.log('\n测试通过\n');
}

try {
  main();
} catch (error) {
  console.error(`❌ 测试失败: ${error.message}`);
  process.exit(1);
}
