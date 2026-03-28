#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

/**
 * 测试 iteration-manager.html 版本对比执行反馈面板
 *
 * 验证要求:
 * 1. HTML 中有 compare 结果容器
 * 2. compare 渲染函数会输出 feedback badge 和 summary 文本
 */

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

function createMockContainer() {
  return {
    innerHTML: '',
    children: []
  };
}

function createMockDocument() {
  const containers = {};
  return {
    getElementById: (id) => {
      if (!containers[id]) {
        containers[id] = createMockContainer();
      }
      return containers[id];
    },
    containers
  };
}

function loadSandbox() {
  const html = fs.readFileSync('/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html', 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('未找到主 script 标签');
  }
  const scriptContent = scriptMatch[1];

  const mockDocument = createMockDocument();
  const sandbox = {
    document: mockDocument,
    console: console
  };
  vm.createContext(sandbox);

  // 加载依赖函数
  vm.runInContext(extractFunction(scriptContent, 'formatExecutionSummary'), sandbox);
  vm.runInContext(extractFunction(scriptContent, 'renderCompareFeedback'), sandbox);

  return { sandbox, document: mockDocument };
}

function main() {
  const html = fs.readFileSync('/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html', 'utf8');

  console.log('测试 1: HTML 中必须有 compare 结果容器');
  assert.ok(
    html.includes('id="compareFeedbackPanel"'),
    '必须存在 id="compareFeedbackPanel" 容器'
  );
  assert.ok(
    html.includes('id="compareFeedbackContent"'),
    '必须存在 id="compareFeedbackContent" 容器'
  );
  console.log('  ✅ compare 结果容器存在');

  console.log('\n测试 2: renderCompareFeedback 函数必须存在');
  assert.ok(
    html.includes('function renderCompareFeedback'),
    'renderCompareFeedback 函数必须存在'
  );
  console.log('  ✅ renderCompareFeedback 函数存在');

  console.log('\n测试 3: doCompare 必须调用 renderCompareFeedback');
  assert.ok(
    html.includes('renderCompareFeedback(result.comparison.versions)'),
    'doCompare 必须调用 renderCompareFeedback'
  );
  console.log('  ✅ doCompare 调用 renderCompareFeedback');

  console.log('\n测试 4: 渲染函数输出 feedback badge');
  const { sandbox, document } = loadSandbox();

  const testVersions = [
    {
      strategy_name: '版本A',
      version_id: 'v001',
      backtest_score: 78.5,
      execution_feedback_status: 'positive',
      execution_feedback_confidence: 'high',
      execution_summary: {
        simulated_trade_count: 12,
        position_closed_count: 6,
        win_rate: 0.67,
        total_realized_pnl: 2500.00,
        avg_realized_return: 0.08,
        avg_holding_days: 5.2,
        trigger_failure_count: 0,
        trigger_failure_rate: 0
      }
    },
    {
      strategy_name: '版本B',
      version_id: 'v002',
      backtest_score: 65.0,
      execution_feedback_status: 'mixed',
      execution_feedback_confidence: 'medium',
      execution_summary: {
        simulated_trade_count: 8,
        position_closed_count: 4,
        win_rate: 0.50,
        total_realized_pnl: 800.00,
        avg_realized_return: 0.03,
        avg_holding_days: 3.8,
        trigger_failure_count: 2,
        trigger_failure_rate: 0.25
      }
    }
  ];

  sandbox.renderCompareFeedback(testVersions);
  const container = document.getElementById('compareFeedbackContent');
  const renderedHtml = container.innerHTML;

  // 验证 strategy_name 标题
  assert.ok(
    renderedHtml.includes('版本A') && renderedHtml.includes('版本B'),
    '渲染输出必须包含 strategy_name 标题'
  );
  console.log('  ✅ 包含 strategy_name 标题');

  // 验证 feedback badge
  assert.ok(
    renderedHtml.includes('feedback-status-positive'),
    '必须包含 feedback-status-positive badge'
  );
  assert.ok(
    renderedHtml.includes('feedback-status-mixed'),
    '必须包含 feedback-status-mixed badge'
  );
  assert.ok(
    renderedHtml.includes('feedback-confidence-high'),
    '必须包含 feedback-confidence-high badge'
  );
  assert.ok(
    renderedHtml.includes('feedback-confidence-medium'),
    '必须包含 feedback-confidence-medium badge'
  );
  console.log('  ✅ 包含 feedback badge');

  console.log('\n测试 5: 渲染函数输出 summary 文本');
  // 验证 position_closed_count
  assert.ok(
    renderedHtml.includes('6笔') || renderedHtml.includes('4笔'),
    '必须包含 position_closed_count 信息'
  );
  console.log('  ✅ 包含 position_closed_count');

  // 验证 win_rate
  assert.ok(
    renderedHtml.includes('67.0%') || renderedHtml.includes('50.0%'),
    '必须包含 win_rate 信息'
  );
  console.log('  ✅ 包含 win_rate');

  // 验证 total_realized_pnl
  assert.ok(
    renderedHtml.includes('+2500') || renderedHtml.includes('+800'),
    '必须包含 total_realized_pnl 信息'
  );
  console.log('  ✅ 包含 total_realized_pnl');

  console.log('\n测试 6: 验证执行状态和置信度文案');
  assert.ok(
    renderedHtml.includes('执行状态:') || renderedHtml.includes('正向反馈'),
    '必须包含执行状态文案'
  );
  assert.ok(
    renderedHtml.includes('置信度:') || renderedHtml.includes('高'),
    '必须包含置信度文案'
  );
  console.log('  ✅ 包含执行状态和置信度文案');

  console.log('\n========================================');
  console.log('✅ iteration-manager-compare-feedback-panel.test.js 全部测试通过');
  console.log('========================================');
}

try {
  main();
} catch (error) {
  console.error(`\n❌ 测试失败: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}