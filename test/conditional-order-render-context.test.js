#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'conditional-order.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunction(source, name) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`未找到函数: ${name}`);
  }

  let parenDepth = 0;
  let signatureEnd = -1;
  for (let i = start + token.length - 1; i < source.length; i++) {
    const char = source[i];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnd = i;
        break;
      }
    }
  }
  if (signatureEnd === -1) {
    throw new Error(`函数参数未正确闭合: ${name}`);
  }

  const braceIndex = source.indexOf('{', signatureEnd);
  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`函数大括号未闭合: ${name}`);
}

function main() {
  const context = {
    console,
    escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(html, 'formatStrategyContextMeta'), context, {
    filename: 'conditional-order-render-context.js'
  });
  vm.runInContext(extractFunction(html, 'formatNumber'), context, {
    filename: 'conditional-order-render-context.js'
  });
  vm.runInContext(extractFunction(html, 'formatExecutionFeedbackMeta'), context, {
    filename: 'conditional-order-render-context.js'
  });

  const strategyConfigMeta = context.formatStrategyContextMeta({
    strategy_source: 'strategy_config',
    strategy_config_name: '自动迭代版本（导入副本）'
  });
  assert.ok(strategyConfigMeta.includes('策略库'), '策略库副本应显示“策略库”来源标签');
  assert.ok(strategyConfigMeta.includes('自动迭代版本（导入副本）'), '策略库副本应显示策略名称');

  const templateMeta = context.formatStrategyContextMeta({
    strategy_source: 'template',
    template_name: '七因子模板'
  });
  assert.ok(templateMeta.includes('模板'), '模板来源应显示“模板”标签');
  assert.ok(templateMeta.includes('七因子模板'), '模板来源应显示模板名称');

  const emptyMeta = context.formatStrategyContextMeta({});
  assert.strictEqual(emptyMeta, '', '没有策略上下文时不应渲染额外信息');

  const feedbackMeta = context.formatExecutionFeedbackMeta({
    execution_feedback_status: 'positive',
    execution_feedback_confidence: 'high',
    total_trades: 12,
    total_pnl: 3580.5
  });
  assert.ok(feedbackMeta.includes('反馈: 正向'), '应显示执行反馈状态标签');
  assert.ok(feedbackMeta.includes('置信度: 高'), '应显示反馈置信度标签');
  assert.ok(feedbackMeta.includes('样本: 12 笔'), '应显示反馈样本数');
  assert.ok(feedbackMeta.includes('盈亏: 3580.5'), '应显示反馈盈亏');

  const emptyFeedbackMeta = context.formatExecutionFeedbackMeta({});
  assert.strictEqual(emptyFeedbackMeta, '', '没有执行反馈时不应渲染反馈标签');

  console.log('✅ conditional-order.html 条件单策略来源渲染测试通过');
}

try {
  main();
} catch (error) {
  console.error(`❌ conditional-order.html 条件单策略来源渲染测试失败: ${error.message}`);
  process.exit(1);
}
