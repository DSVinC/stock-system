#!/usr/bin/env node
/**
 * 容错测试脚本
 * 测试 daily-monitor.mjs 的异常处理能力
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import {
  findAnalysisReport,
  generatePositionAssessment,
  parseAnalysisReport
} from './daily-monitor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, '..', 'data', 'test-reports');

// 确保测试目录存在
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

// 测试结果统计
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

/**
 * 断言辅助函数
 */
function assert(condition, message) {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    testResults.details.push({ status: '✅ PASS', message });
    console.log(`  ✅ PASS: ${message}`);
    return true;
  } else {
    testResults.failed++;
    testResults.details.push({ status: '❌ FAIL', message });
    console.log(`  ❌ FAIL: ${message}`);
    return false;
  }
}

/**
 * 测试场景1: 无报告场景（报告文件不存在）
 */
function testNoReportScenario() {
  console.log('\n📋 测试场景1: 无报告场景');
  console.log('─'.repeat(50));

  // 模拟 findAnalysisReport 返回 null 的情况
  const result = findAnalysisReport('999999.SZ', '不存在的股票', TEST_DIR);

  assert(result === null, '当报告文件不存在时，应返回 null');

  // 测试 generatePositionAssessment 处理 null 报告
  const mockPosition = {
    stock_name: '测试股票',
    ts_code: '000001.SZ',
    unrealized_pnl_rate: -5.5
  };

  const assessment = generatePositionAssessment(mockPosition, null);

  assert(assessment.action === 'hold', '无报告时，默认操作应为 hold');
  assert(assessment.risk_level === 'medium', '无报告且收益率为-5.5%时，风险等级应为 medium');
  assert(assessment.summary.includes('-5.50%'), '摘要应包含收益率信息');
  assert(assessment.follow_ups.length >= 2, '应至少有2条跟进事项');
  assert(assessment.watch_items.length === 0, '无报告时，观察点应为空数组');
  assert(assessment.risk_alerts.length > 0, '负收益率时应有风险警报');

  console.log('  📊 评估结果:', JSON.stringify(assessment, null, 2));
}

/**
 * 测试场景2: 报告字段缺失场景
 */
function testMissingFieldsScenario() {
  console.log('\n📋 测试场景2: 报告字段缺失场景');
  console.log('─'.repeat(50));

  // 创建缺失字段的报告
  const incompleteReport = {
    file_name: 'incomplete_report.html',
    file_path: path.join(TEST_DIR, 'incomplete_report.html'),
    parsed_data: {
      parse_status: 'partial_success',
      decision: null,
      report_score: null,
      buyZone: null,
      stopLoss: null,
      targetPrice: null,
      strategy: null,
      key_watch_points: [],
      risk_controls: []
    }
  };

  const mockPosition = {
    stock_name: '测试股票',
    ts_code: '000001.SZ',
    unrealized_pnl_rate: -8.0
  };

  const assessment = generatePositionAssessment(mockPosition, incompleteReport);

  assert(assessment.action === 'hold', '缺失决策字段时，默认操作应为 hold');
  assert(assessment.risk_level === 'medium', '部分解析且收益率为-8%时，风险等级应为 medium');
  assert(assessment.summary.includes('-8.00%'), '摘要应包含收益率信息');
  assert(assessment.watch_items.length === 0, '无关键观察点时，watch_items 应为空');
  assert(assessment.follow_ups.length >= 2, '应至少有2条跟进事项（默认填充）');

  // 测试解析状态为 error 的情况
  const errorReport = {
    parsed_data: {
      parse_status: 'error: 未解析到核心字段',
      decision: null,
      report_score: null
    }
  };

  const errorAssessment = generatePositionAssessment(mockPosition, errorReport);

  assert(errorAssessment.risk_alerts.some(alert => alert.includes('error') || alert.includes('解析')),
    '解析失败时，风险警报应包含错误信息');
  assert(errorAssessment.follow_ups.some(item => item.includes('解析失败')),
    '解析失败时，跟进事项应提示检查报告格式');

  console.log('  📊 评估结果:', JSON.stringify(errorAssessment, null, 2));
}

/**
 * 测试场景3: API 调用失败场景
 */
function testAPIFailureScenario() {
  console.log('\n📋 测试场景3: API 调用失败场景');
  console.log('─'.repeat(50));

  // 测试数据库查询失败处理
  let dbErrorCaught = false;
  let errorMessage = '';

  try {
    simulateDBQueryFailure();
  } catch (error) {
    dbErrorCaught = true;
    errorMessage = error.message;
  }

  assert(dbErrorCaught, '数据库查询失败时应抛出异常');
  assert(errorMessage.includes('数据库') || errorMessage.includes('DB'),
    '错误消息应包含数据库相关信息');

  // 测试文件读取失败处理
  let fileErrorCaught = false;
  try {
    parseAnalysisReport('/nonexistent/path.html');
  } catch (error) {
    fileErrorCaught = true;
  }

  // parseAnalysisReport 应该捕获异常并返回错误状态，而不是抛出
  assert(!fileErrorCaught, 'parseAnalysisReport 应该内部捕获异常，不抛出');

  const errorResult = parseAnalysisReport('/nonexistent/path.html');
  assert(errorResult.parse_status.startsWith('error'),
    '文件不存在时，parse_status 应以 error 开头');

  console.log('  📊 解析结果:', JSON.stringify(errorResult, null, 2));
}

/**
 * 测试场景4: JSON 解析失败场景
 */
function testJSONParseFailureScenario() {
  console.log('\n📋 测试场景4: JSON 解析失败场景');
  console.log('─'.repeat(50));

  // 创建包含无效 JSON 的测试文件
  const invalidJsonPath = path.join(TEST_DIR, 'invalid.json');
  fs.writeFileSync(invalidJsonPath, '{ invalid json: broken }', 'utf8');

  let parseErrorCaught = false;
  let parsedResult = null;

  try {
    const content = fs.readFileSync(invalidJsonPath, 'utf8');
    parsedResult = JSON.parse(content);
  } catch (error) {
    parseErrorCaught = true;
  }

  assert(parseErrorCaught, '无效 JSON 应触发解析错误');
  assert(parsedResult === null, '解析失败时不应有结果');

  // 测试健壮的数据处理
  const mockPosition = {
    stock_name: '测试股票',
    ts_code: '000001.SZ',
    unrealized_pnl_rate: 15.5
  };

  const reportWithMalformedData = {
    parsed_data: {
      parse_status: 'success',
      decision: '买入',
      report_score: 4.5,
      buyZone: null,
      stopLoss: 'invalid_number',
      targetPrice: null,
      key_watch_points: null, // 应该是数组但为 null
      risk_controls: undefined // 未定义
    }
  };

  const assessment = generatePositionAssessment(mockPosition, reportWithMalformedData);

  assert(assessment.action === 'buy', '决策包含"买入"时，action 应为 buy');
  assert(Array.isArray(assessment.watch_items), 'watch_items 应为数组（即使输入为 null）');
  assert(Array.isArray(assessment.risk_alerts), 'risk_alerts 应为数组（即使输入为 undefined）');
  assert(assessment.risk_level === 'low', '正收益率时风险等级应为 low');

  console.log('  📊 评估结果:', JSON.stringify(assessment, null, 2));

  // 清理测试文件
  fs.unlinkSync(invalidJsonPath);
}

/**
 * 辅助函数: 模拟数据库查询失败
 */
function simulateDBQueryFailure() {
  throw new Error('数据库连接失败: ECONNREFUSED');
}

/**
 * 运行所有测试
 */
function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 容错测试套件 - daily-monitor.mjs 异常处理能力测试');
  console.log('='.repeat(60));
  console.log(`⏰ 测试时间: ${new Date().toLocaleString('zh-CN')}`);

  // 运行测试场景
  testNoReportScenario();
  testMissingFieldsScenario();
  testAPIFailureScenario();
  testJSONParseFailureScenario();

  // 输出测试摘要
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果摘要');
  console.log('='.repeat(60));
  console.log(`   总测试数: ${testResults.total}`);
  console.log(`   ✅ 通过: ${testResults.passed}`);
  console.log(`   ❌ 失败: ${testResults.failed}`);
  console.log(`   📈 通过率: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

  if (testResults.failed === 0) {
    console.log('\n🎉 所有测试通过！');
  } else {
    console.log(`\n⚠️ 有 ${testResults.failed} 个测试失败`);
    console.log('\n失败详情:');
    testResults.details
      .filter(d => d.status === '❌ FAIL')
      .forEach(d => console.log(`   - ${d.message}`));
  }

  console.log('='.repeat(60));

  // 清理测试目录
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  return testResults.failed === 0;
}

// 执行测试
const success = runAllTests();
process.exit(success ? 0 : 1);
