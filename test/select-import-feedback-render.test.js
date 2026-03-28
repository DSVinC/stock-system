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

function main() {
  const html = fs.readFileSync('/Users/vvc/.openclaw/workspace/stock-system/select.html', 'utf8');

  assert.ok(html.includes('function renderImportStrategyFeedback'), '应定义 renderImportStrategyFeedback');
  assert.ok(html.includes('执行状态:'), '应显示执行状态文案');
  assert.ok(html.includes('置信度:'), '应显示置信度文案');
  assert.ok(html.includes('平仓数:'), '应显示平仓数文案');
  assert.ok(html.includes('已实现盈亏:'), '应显示已实现盈亏文案');
  assert.ok(html.includes('暂无执行反馈快照'), '应包含无快照降级文案');
  assert.ok(html.includes('${renderImportStrategyFeedback(strategy.feedback)}'), '导入列表应调用反馈渲染函数');

  const script = html.match(/<script>([\s\S]*)<\/script>/);
  if (!script) {
    throw new Error('未找到 script 标签');
  }

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(script[1], 'renderImportStrategyFeedback'), sandbox);

  const rendered = sandbox.renderImportStrategyFeedback({
    execution_feedback_status: 'positive',
    execution_feedback_confidence: 'medium',
    execution_summary_json: {
      position_closed_count: 6,
      total_realized_pnl: 3800
    }
  });

  assert.ok(rendered.includes('正向反馈'));
  assert.ok(rendered.includes('置信度: 中'));
  assert.ok(rendered.includes('平仓数: 6'));
  assert.ok(rendered.includes('已实现盈亏: 3800'));

  const renderedFallback = sandbox.renderImportStrategyFeedback({
    execution_feedback_status: 'mixed',
    execution_feedback_confidence: 'low',
    total_pnl: 1200,
    successful_trades: 3,
    failed_trades: 2
  });
  assert.ok(renderedFallback.includes('平仓数: 5'));
  assert.ok(renderedFallback.includes('已实现盈亏: 1200'));

  const emptyRendered = sandbox.renderImportStrategyFeedback(null);
  assert.ok(emptyRendered.includes('暂无执行反馈快照'));

  console.log('✅ select import feedback render test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ select import feedback render test failed: ${error.message}`);
  process.exit(1);
}
