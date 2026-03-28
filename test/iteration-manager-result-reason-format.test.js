#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const HTML_PATH = '/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html';

function loadScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('未找到主脚本');
  }
  return match[1];
}

function extractFunction(source, functionName) {
  const token = `function ${functionName}`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`未找到函数 ${functionName}`);
  }
  const braceIndex = source.indexOf('{', start);
  let depth = 0;
  let end = braceIndex;
  while (end < source.length) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
    end += 1;
  }
  return source.slice(start, end);
}

async function main() {
  const script = loadScript();
  const fn = extractFunction(script, 'formatResultReason');

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fn, sandbox);

  assert.equal(sandbox.formatResultReason('manual_stop'), '手动停止任务');
  assert.equal(sandbox.formatResultReason('timeout'), '任务执行超时');
  assert.equal(sandbox.formatResultReason('已完成全部迭代'), '已完成全部迭代');
  assert.equal(sandbox.formatResultReason(''), '');
  assert.equal(sandbox.formatResultReason(null), '');

  console.log('✅ iteration manager result reason format test passed');
}

main().catch((error) => {
  console.error(`❌ iteration manager result reason format test failed: ${error.message}`);
  process.exit(1);
});
