#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HTML_PATH = path.join(__dirname, '..', 'iteration-manager.html');

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

function loadSandbox() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/);
  if (!script) {
    throw new Error('未找到 script 标签');
  }
  const sandbox = { document: { getElementById: () => ({ innerHTML: '' }) } };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(script[1], 'formatExecutionSummary'), sandbox);
  vm.runInContext(extractFunction(script[1], 'renderCompareFeedback'), sandbox);
  return sandbox;
}

function main() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');

  // 测试 1: DOM 容器存在
  assert.ok(html.includes('id="compareFeedbackPanel"'), 'compareFeedbackPanel 容器必须存在');
  assert.ok(html.includes('id="compareFeedbackContent"'), 'compareFeedbackContent 容器必须存在');

  // 测试 2: renderCompareFeedback 函数存在
  assert.ok(html.includes('function renderCompareFeedback'), 'renderCompareFeedback 函数必须存在');

  // 测试 3: doCompare 调用 renderCompareFeedback
  assert.ok(html.includes('renderCompareFeedback(result.comparison.versions)'), 'doCompare 必须调用 renderCompareFeedback');

  // 测试 4: 函数渲染关键内容
  const sandbox = loadSandbox();

  // 模拟版本数据
  const testVersions = [
    {
      strategy_name: '测试策略A',
      backtest_score: 75.5,
      execution_feedback_status: 'positive',
      execution_feedback_confidence: 'high',
      execution_summary: {
        simulated_trade_count: 10,
        position_closed_count: 5,
        win_rate: 0.6,
        total_realized_pnl: 1000,
        avg_realized_return: 0.05,
        avg_holding_days: 3.5,
        trigger_failure_count: 0,
        trigger_failure_rate: 0
      }
    },
    {
      strategy_name: '测试策略B',
      backtest_score: 82.0,
      execution_feedback_status: 'mixed',
      execution_feedback_confidence: 'medium',
      execution_summary: {
        simulated_trade_count: 8,
        position_closed_count: 4,
        win_rate: 0.5,
        total_realized_pnl: 500,
        avg_realized_return: 0.03,
        avg_holding_days: 4.0,
        trigger_failure_count: 1,
        trigger_failure_rate: 0.1
      }
    }
  ];

  sandbox.renderCompareFeedback(testVersions);

  // 测试 5: HTML 模板中包含关键文案
  assert.ok(html.includes('版本对比执行反馈'), '必须包含"版本对比执行反馈"标题');
  assert.ok(html.includes('执行状态:'), '必须包含"执行状态:"文案');
  assert.ok(html.includes('置信度:'), '必须包含"置信度:"文案');

  console.log('✅ iteration-manager-compare-feedback-render test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ iteration-manager-compare-feedback-render test failed: ${error.message}`);
  process.exit(1);
}
