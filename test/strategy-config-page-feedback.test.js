#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start === -1) {
    throw new Error(`未找到函数 ${functionName}`);
  }

  const braceIndex = source.indexOf('{', start);
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
  const htmlPath = path.join(__dirname, '..', 'strategy-config.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('/api/strategy-config/public'), '页面应改为消费公开策略 API');
  assert.ok(html.includes('/api/strategy-config/save'), '页面应使用当前保存 API');
  assert.ok(html.includes('/api/strategy-config/list?is_default=1&is_active=1'), '页面应使用当前默认策略列表 API');
  assert.ok(!html.includes('/api/strategy/configs'), '旧的 /api/strategy/configs 路径不应再出现');
  assert.ok(html.includes('function renderPublicStrategyFeedback'), '页面应定义公开策略反馈渲染函数');
  assert.ok(html.includes('${renderPublicStrategyFeedback(config.feedback)}'), '列表项应渲染反馈摘要');

  const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
  if (!scriptMatch) {
    throw new Error('未找到页面脚本');
  }

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(scriptMatch[1], 'formatFeedbackMetric'), sandbox);
  vm.runInContext(extractFunction(scriptMatch[1], 'renderPublicStrategyFeedback'), sandbox);

  const rendered = sandbox.renderPublicStrategyFeedback({
    execution_feedback_status: 'positive',
    execution_feedback_confidence: 'medium',
    total_trades: 12,
    successful_trades: 8,
    failed_trades: 3,
    total_pnl: 3812.5,
    backtest_score: 0.85,
    execution_summary_json: {
      event_types: ['buy', 'sell'],
      ts_codes: ['000001.SZ'],
      avg_return: 0.1234
    }
  });

  assert.ok(rendered.includes('执行状态: 正向反馈'), '应渲染执行状态标签');
  assert.ok(rendered.includes('置信度: 中'), '应渲染置信度标签');
  assert.ok(rendered.includes('样本'), '应渲染样本摘要');
  assert.ok(rendered.includes('成功'), '应渲染成功摘要');
  assert.ok(rendered.includes('失败'), '应渲染失败摘要');
  assert.ok(rendered.includes('总盈亏'), '应渲染总盈亏摘要');
  assert.ok(rendered.includes('回测分'), '应渲染回测分摘要');
  assert.ok(rendered.includes('0.85'), '回测分应保留小数');
  assert.ok(rendered.includes('事件类型: buy、sell'), '应显示摘要中的事件类型');
  assert.ok(rendered.includes('标的: 000001.SZ'), '应显示摘要中的标的');
  assert.ok(rendered.includes('平均收益: 0.12'), '应格式化平均收益');

  const emptyRendered = sandbox.renderPublicStrategyFeedback(null);
  assert.ok(emptyRendered.includes('暂无执行反馈快照'), '缺少反馈时应有空状态提示');

  console.log('✅ strategy-config page feedback test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ strategy-config page feedback test failed: ${error.message}`);
  process.exit(1);
}
