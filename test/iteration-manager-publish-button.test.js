#!/usr/bin/env node

/**
 * 测试：iteration-manager 发布按钮功能
 * 路径：test/iteration-manager-publish-button.test.js
 *
 * 测试覆盖：
 * 1. renderVersionList 函数生成的 HTML 包含发布按钮
 * 2. publishVersion 函数存在于全局脚本
 * 3. 发布按钮有正确的 onclick 事件绑定
 * 4. 发布按钮调用正确的 API 端点
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, '..', 'iteration-manager.html');

// 提取函数源码
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

// 加载模板文件
function loadHtml() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

// 提取主脚本内容
function extractMainScript(html) {
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('未找到主脚本块');
  }
  return scriptMatch[1];
}

// 测试计数
let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failCount++;
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

function main() {
  console.log('\n📋 测试：iteration-manager 发布按钮功能\n');

  const html = loadHtml();
  const script = extractMainScript(html);

  // ----------------------------------------
  // 测试组 1: renderVersionList 函数
  // ----------------------------------------
  console.log('测试组 1: renderVersionList 函数');

  test('renderVersionList 函数存在', () => {
    assert.ok(script.includes('function renderVersionList('));
  });

  test('renderVersionList 生成发布按钮', () => {
    // 模拟调用 renderVersionList
    const sandbox = {
      document: {
        getElementById: (id) => ({
          innerHTML: ''
        })
      },
      formatExecutionFeedbackBadges: () => '<span class="feedback-badge">test</span>',
      formatExecutionSummary: () => '<div class="exec-summary">test</div>',
      compareVersions: () => {},
      publishVersion: () => {}
    };
    vm.createContext(sandbox);
    vm.runInContext(extractFunction(script, 'renderVersionList'), sandbox);

    const versions = [{
      version_id: 'test-v1',
      strategy_name: '测试策略',
      created_at: '2026-03-27T10:00:00Z',
      backtest_score: 85.5,
      execution_feedback_status: 'positive',
      execution_feedback_confidence: 'high',
      execution_summary: {}
    }];

    sandbox.renderVersionList(versions);

    // 检查 innerHTML 是否包含发布按钮
    const mockContainer = { innerHTML: '' };
    sandbox.document.getElementById = (id) => mockContainer;
    sandbox.renderVersionList(versions);

    assert.ok(mockContainer.innerHTML.includes('publish-btn'), '应包含发布按钮样式类');
    assert.ok(mockContainer.innerHTML.includes('📤 发布'), '应包含发布按钮文字');
    assert.ok(mockContainer.innerHTML.includes("publishVersion('test-v1'"), '应调用 publishVersion 函数');
  });

  test('发布按钮阻止事件冒泡 (event.stopPropagation)', () => {
    const sandbox = {
      document: {
        getElementById: () => ({ innerHTML: '' })
      },
      formatExecutionFeedbackBadges: () => '',
      formatExecutionSummary: () => ''
    };
    vm.createContext(sandbox);
    vm.runInContext(extractFunction(script, 'renderVersionList'), sandbox);

    const versions = [{ version_id: 'v1', backtest_score: 70 }];
    sandbox.renderVersionList(versions);

    // 通过重新读取生成的 HTML 来验证
    const funcSource = extractFunction(script, 'renderVersionList');
    assert.ok(funcSource.includes('event.stopPropagation()'), '应包含 event.stopPropagation()');
  });

  test('已发布版本显示已发布文案并禁用按钮', () => {
    const sandbox = {
      document: {
        getElementById: () => ({ innerHTML: '' })
      },
      formatExecutionFeedbackBadges: () => '',
      formatExecutionSummary: () => ''
    };
    vm.createContext(sandbox);
    vm.runInContext(extractFunction(script, 'renderVersionList'), sandbox);

    const mockContainer = { innerHTML: '' };
    sandbox.document.getElementById = () => mockContainer;
    sandbox.renderVersionList([{
      version_id: 'published-v1',
      strategy_name: '已发布策略',
      created_at: '2026-03-27T10:00:00Z',
      backtest_score: 92.3,
      is_published_to_library: true,
      published_strategy_config_id: 88
    }]);

    assert.ok(mockContainer.innerHTML.includes('✅ 已发布'), '应显示已发布文案');
    assert.ok(mockContainer.innerHTML.includes('disabled'), '已发布按钮应为 disabled');
    assert.ok(mockContainer.innerHTML.includes('ID: 88'), '应展示策略库 ID');
    assert.ok(!mockContainer.innerHTML.includes("publishVersion('published-v1'"), '已发布版本不应再绑定 publishVersion');
  });

  // ----------------------------------------
  // 测试组 2: publishVersion 函数
  // ----------------------------------------
  console.log('\n测试组 2: publishVersion 函数');

  test('publishVersion 函数存在', () => {
    assert.ok(script.includes('async function publishVersion('));
  });

  test('publishVersion 函数调用正确的 API 端点', () => {
    const funcSource = extractFunction(script, 'publishVersion');
    assert.ok(funcSource.includes("/api/strategy-config/publish-version"), '应调用 /api/strategy-config/publish-version 端点');
    assert.ok(funcSource.includes('method: \'POST\''), '应使用 POST 方法');
    assert.ok(funcSource.includes('version_id'), '应发送 version_id 参数');
  });

  test('publishVersion 包含确认对话框', () => {
    const funcSource = extractFunction(script, 'publishVersion');
    assert.ok(funcSource.includes('confirm('), '应包含确认对话框');
  });

  test('publishVersion 包含成功反馈', () => {
    const funcSource = extractFunction(script, 'publishVersion');
    assert.ok(funcSource.includes('addLog'), '应调用 addLog 函数');
    assert.ok(funcSource.includes('发布成功'), '应包含成功日志');
    assert.ok(funcSource.includes('result.data?.strategy_config?.id'), '应从 result.data.strategy_config.id 读取策略ID');
  });

  test('publishVersion 包含失败反馈', () => {
    const funcSource = extractFunction(script, 'publishVersion');
    assert.ok(funcSource.includes('catch'), '应包含 catch 错误处理');
    assert.ok(funcSource.includes('发布失败'), '应包含失败日志');
  });

  test('publishVersion 成功后刷新版本列表', () => {
    const funcSource = extractFunction(script, 'publishVersion');
    assert.ok(funcSource.includes('loadVersionHistory'), '成功后应刷新版本列表');
  });

  // ----------------------------------------
  // 测试组 3: CSS 样式
  // ----------------------------------------
  console.log('\n测试组 3: CSS 样式');

  test('发布按钮样式类存在', () => {
    assert.ok(html.includes('.publish-btn {'), '应定义 .publish-btn 样式');
  });

  test('发布按钮样式包含 hover 效果', () => {
    assert.ok(html.includes('.publish-btn:hover'), '应定义 hover 样式');
  });

  test('发布按钮样式包含 disabled 效果', () => {
    assert.ok(html.includes('.publish-btn:disabled'), '应定义 disabled 样式');
  });

  // ----------------------------------------
  // 测试组 4: 完整 HTML 验证
  // ----------------------------------------
  console.log('\n测试组 4: 完整 HTML 验证');

  test('HTML 文件语法完整', () => {
    assert.ok(html.includes('<!DOCTYPE html>'), '应包含 DOCTYPE');
    assert.ok(html.includes('</html>'), '应包含闭合的 html 标签');
  });

  test('版本列表容器存在', () => {
    assert.ok(html.includes('id="versionList"'), '应包含 versionList 容器');
  });

  // ----------------------------------------
  // 测试结果汇总
  // ----------------------------------------
  console.log('\n' + '='.repeat(50));
  console.log(`测试完成: ${testCount} 个测试`);
  console.log(`  ✅ 通过: ${passCount}`);
  console.log(`  ❌ 失败: ${failCount}`);
  console.log('='.repeat(50) + '\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`❌ 测试执行失败: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
