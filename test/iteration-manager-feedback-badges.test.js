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

function loadHelper() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(script, 'formatExecutionFeedbackBadges'), sandbox);
  return sandbox.formatExecutionFeedbackBadges;
}

function main() {
  const formatExecutionFeedbackBadges = loadHelper();

  const positiveHtml = formatExecutionFeedbackBadges({
    execution_feedback_status: 'positive',
    execution_feedback_confidence: 'high'
  });
  assert.ok(positiveHtml.includes('正向反馈'));
  assert.ok(positiveHtml.includes('置信度: 高'));
  assert.ok(positiveHtml.includes('feedback-status-positive'));
  assert.ok(positiveHtml.includes('feedback-confidence-high'));

  const cautionHtml = formatExecutionFeedbackBadges({
    execution_feedback_status: 'caution',
    execution_feedback_confidence: 'low'
  });
  assert.ok(cautionHtml.includes('需警惕'));
  assert.ok(cautionHtml.includes('置信度: 低'));
  assert.ok(cautionHtml.includes('feedback-status-caution'));
  assert.ok(cautionHtml.includes('feedback-confidence-low'));

  const fallbackHtml = formatExecutionFeedbackBadges({});
  assert.ok(fallbackHtml.includes('暂无反馈'));
  assert.ok(fallbackHtml.includes('置信度: 无样本'));

  console.log('✅ iteration manager feedback badges test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ iteration manager feedback badges test failed: ${error.message}`);
  process.exit(1);
}
