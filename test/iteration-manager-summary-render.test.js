#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start === -1) {
    throw new Error(`未找到函数 ${functionName}`);
  }

  let braceIndex = source.indexOf('{', start);
  let depth = 0;
  let end = braceIndex;
  while (end < source.length) {
    const char = source[end];
    if (char === '{') depth += 1;
    if (char === '}') {
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

function loadHelper() {
  const html = fs.readFileSync('/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html', 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(script, 'formatExecutionSummary'), sandbox);
  return sandbox.formatExecutionSummary;
}

function main() {
  const formatExecutionSummary = loadHelper();

  const richHtml = formatExecutionSummary({
    simulated_trade_count: 12,
    position_closed_count: 5,
    win_rate: 0.6,
    total_realized_pnl: 1234.56,
    avg_realized_return: 0.034,
    avg_holding_days: 7.5,
    trigger_failure_count: 3,
    trigger_failure_rate: 0.2
  });

  assert.ok(richHtml.includes('模拟交易'));
  assert.ok(richHtml.includes('12笔'));
  assert.ok(richHtml.includes('平仓'));
  assert.ok(richHtml.includes('5笔'));
  assert.ok(richHtml.includes('胜率'));
  assert.ok(richHtml.includes('60.0%'));
  assert.ok(richHtml.includes('累计收益'));
  assert.ok(richHtml.includes('+1234.56'));
  assert.ok(richHtml.includes('持仓天数'));
  assert.ok(richHtml.includes('7.5天'));
  assert.ok(richHtml.includes('失败率'));
  assert.ok(richHtml.includes('20.0%'));

  const defaultHtml = formatExecutionSummary();
  assert.ok(defaultHtml.includes('0笔'));
  assert.ok(defaultHtml.includes('0.0%'));
  assert.ok(defaultHtml.includes('+0.00'));

  console.log('✅ iteration manager summary render test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ iteration manager summary render test failed: ${error.message}`);
  process.exit(1);
}
