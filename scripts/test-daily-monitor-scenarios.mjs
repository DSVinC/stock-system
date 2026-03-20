#!/usr/bin/env node
/**
 * 每日监控脚本 - 多样本验证测试
 * 测试 daily-monitor.mjs 在不同场景下的行为
 */

import {
  generatePositionAssessment,
  generateAccountSummary,
  generateReportOverview
} from './daily-monitor.mjs';

// ============================================
// 测试框架
// ============================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTest(name, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    testResults.push({ name, status: 'PASS', error: null });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failedTests++;
    testResults.push({ name, status: 'FAIL', error: error.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

// ============================================
// 测试场景 1: 多账户多持仓场景
// ============================================

function testMultiAccountMultiPosition() {
  console.log('\n📋 场景 1: 多账户多持仓场景');
  console.log('  测试多个账户，每个账户有多个持仓的复杂情况');

  // 模拟账户数据
  const account1 = {
    account_id: 1,
    account_name: '主账户',
    positions: [
      {
        ts_code: '000001.SZ',
        stock_name: '平安银行',
        unrealized_pnl_rate: 15.5,
        monitor_assessment: null
      },
      {
        ts_code: '600519.SH',
        stock_name: '贵州茅台',
        unrealized_pnl_rate: -8.2,
        monitor_assessment: null
      }
    ]
  };

  const account2 = {
    account_id: 2,
    account_name: '测试账户',
    positions: [
      {
        ts_code: '000858.SZ',
        stock_name: '五粮液',
        unrealized_pnl_rate: 25.0,
        monitor_assessment: null
      },
      {
        ts_code: '002594.SZ',
        stock_name: '比亚迪',
        unrealized_pnl_rate: -12.5,
        monitor_assessment: null
      }
    ]
  };

  // 模拟报告信息
  const reportInfo1 = {
    parsed_data: {
      decision: '买入',
      report_score: 4.5,
      key_watch_points: ['技术面突破', '成交量放大'],
      risk_controls: ['设置止损点', '控制仓位']
    }
  };

  const reportInfo2 = {
    parsed_data: {
      decision: '卖出',
      report_score: 2.0,
      key_watch_points: ['业绩下滑', '行业周期'],
      risk_controls: ['及时止损']
    }
  };

  // 为持仓生成评估
  account1.positions[0].monitor_assessment = generatePositionAssessment(account1.positions[0], reportInfo1);
  account1.positions[1].monitor_assessment = generatePositionAssessment(account1.positions[1], reportInfo2);
  account2.positions[0].monitor_assessment = generatePositionAssessment(account2.positions[0], reportInfo1);
  account2.positions[1].monitor_assessment = generatePositionAssessment(account2.positions[1], reportInfo2);

  // 生成账户摘要
  account1.summary = generateAccountSummary(account1);
  account2.summary = generateAccountSummary(account2);

  // 生成报告概览
  const report = { accounts: [account1, account2] };
  report.overview = generateReportOverview(report);

  // 运行测试用例
  runTest('多账户场景: 账户数量正确', () => {
    assert(report.accounts.length === 2, '应该有2个账户');
  });

  runTest('多账户场景: 总持仓数正确', () => {
    const totalPositions = report.accounts.reduce((sum, acc) => sum + acc.positions.length, 0);
    assert(totalPositions === 4, '应该有4个持仓');
  });

  runTest('多账户场景: 正收益持仓识别正确', () => {
    assert(report.overview.positive_positions.length === 2, '应该有2个正收益持仓');
  });

  runTest('多账户场景: 负收益持仓识别正确', () => {
    assert(report.overview.negative_positions.length === 2, '应该有2个负收益持仓');
  });

  runTest('多账户场景: 高风险持仓识别正确', () => {
    assert(report.overview.high_risk_positions.length === 2, '应该有2个高风险持仓');
  });

  runTest('多账户场景: 需要关注的账户识别正确', () => {
    assert(report.overview.accounts_requiring_attention.length === 2, '应该有2个账户需要关注');
  });

  // 输出测试报告
  console.log('\n  📊 场景 1 测试报告:');
  console.log(`     - 账户数: ${report.accounts.length}`);
  console.log(`     - 总持仓: ${report.accounts.reduce((sum, acc) => sum + acc.positions.length, 0)}`);
  console.log(`     - 正收益: ${report.overview.positive_positions.length}`);
  console.log(`     - 负收益: ${report.overview.negative_positions.length}`);
  console.log(`     - 高风险: ${report.overview.high_risk_positions.length}`);
  console.log(`     - 需关注账户: ${report.overview.accounts_requiring_attention.length}`);
  console.log(`     - 标题: ${report.overview.headline}`);
}

// ============================================
// 测试场景 2: 空账户场景（无持仓）
// ============================================

function testEmptyAccount() {
  console.log('\n📋 场景 2: 空账户场景（无持仓）');
  console.log('  测试没有持仓的账户行为');

  const emptyAccount = {
    account_id: 3,
    account_name: '空账户',
    positions: []
  };

  // 生成账户摘要
  emptyAccount.summary = generateAccountSummary(emptyAccount);

  // 生成报告概览
  const report = { accounts: [emptyAccount] };
  report.overview = generateReportOverview(report);

  runTest('空账户场景: 持仓数组为空', () => {
    assert(emptyAccount.positions.length === 0, '持仓数组应该为空');
  });

  runTest('空账户场景: summary 各数组为空', () => {
    assert(emptyAccount.summary.high_risk_positions.length === 0, '高风险持仓应该为空');
    assert(emptyAccount.summary.positive_positions.length === 0, '正收益持仓应该为空');
    assert(emptyAccount.summary.negative_positions.length === 0, '负收益持仓应该为空');
    assert(emptyAccount.summary.action_items.length === 0, '操作建议应该为空');
  });

  runTest('空账户场景: 计数器为0', () => {
    assert(emptyAccount.summary.watch_items_count === 0, 'watch_items_count 应该为0');
    assert(emptyAccount.summary.risk_alerts_count === 0, 'risk_alerts_count 应该为0');
  });

  runTest('空账户场景: overview 正确生成', () => {
    assert(report.overview.headline === '📊 每日监控报告: 市场表现平稳', '空账户应该显示平稳报告');
    assert(report.overview.high_risk_positions.length === 0, '高风险持仓列表应该为空');
    assert(report.overview.positive_positions.length === 0, '正收益持仓列表应该为空');
    assert(report.overview.negative_positions.length === 0, '负收益持仓列表应该为空');
  });

  console.log('\n  📊 场景 2 测试报告:');
  console.log(`     - 持仓数: ${emptyAccount.positions.length}`);
  console.log(`     - 高风险持仓: ${emptyAccount.summary.high_risk_positions.length}`);
  console.log(`     - 正收益持仓: ${emptyAccount.summary.positive_positions.length}`);
  console.log(`     - 负收益持仓: ${emptyAccount.summary.negative_positions.length}`);
  console.log(`     - 标题: ${report.overview.headline}`);
}

// ============================================
// 测试场景 3: 单账户多持仓场景
// ============================================

function testSingleAccountMultiPosition() {
  console.log('\n📋 场景 3: 单账户多持仓场景');
  console.log('  测试单个账户包含多个持仓的情况');

  const singleAccount = {
    account_id: 4,
    account_name: '单账户',
    positions: []
  };

  // 创建多个持仓（覆盖不同风险等级和收益率）
  const positions = [
    { ts_code: '000001.SZ', stock_name: '平安银行', unrealized_pnl_rate: 30.0, monitor_assessment: null },
    { ts_code: '000002.SZ', stock_name: '万科A', unrealized_pnl_rate: 10.0, monitor_assessment: null },
    { ts_code: '000858.SZ', stock_name: '五粮液', unrealized_pnl_rate: 0.0, monitor_assessment: null },
    { ts_code: '002594.SZ', stock_name: '比亚迪', unrealized_pnl_rate: -3.0, monitor_assessment: null },
    { ts_code: '600519.SH', stock_name: '贵州茅台', unrealized_pnl_rate: -8.0, monitor_assessment: null },
    { ts_code: '300750.SZ', stock_name: '宁德时代', unrealized_pnl_rate: -15.0, monitor_assessment: null }
  ];

  // 模拟报告信息（部分有报告，部分无报告）
  const reportInfos = [
    { parsed_data: { decision: '买入', report_score: 5.0 } },
    { parsed_data: { decision: '增持', report_score: 4.0 } },
    null, // 无报告
    { parsed_data: { decision: '持有', report_score: 3.0 } },
    { parsed_data: { decision: '减持', report_score: 2.5 } },
    { parsed_data: { decision: '卖出', report_score: 1.5 } }
  ];

  positions.forEach((pos, index) => {
    pos.monitor_assessment = generatePositionAssessment(pos, reportInfos[index]);
    singleAccount.positions.push(pos);
  });

  singleAccount.summary = generateAccountSummary(singleAccount);

  const report = { accounts: [singleAccount] };
  report.overview = generateReportOverview(report);

  runTest('单账户多持仓: 持仓数量正确', () => {
    assert(singleAccount.positions.length === 6, '应该有6个持仓');
  });

  runTest('单账户多持仓: 正收益识别正确', () => {
    assert(singleAccount.summary.positive_positions.length === 2, '应该有2个正收益持仓');
  });

  runTest('单账户多持仓: 负收益识别正确', () => {
    assert(singleAccount.summary.negative_positions.length === 3, '应该有3个负收益持仓');
  });

  runTest('单账户多持仓: 零收益不计入正/负', () => {
    assert(singleAccount.summary.positive_positions.length + singleAccount.summary.negative_positions.length === 5,
      '零收益持仓不应计入正或负收益');
  });

  runTest('单账户多持仓: 高风险持仓识别正确', () => {
    assert(singleAccount.summary.high_risk_positions.length === 1, '应该有1个高风险持仓（评分<=2 或 收益率<=-10）');
  });

  runTest('单账户多持仓: 操作建议生成正确', () => {
    assert(singleAccount.summary.action_items.includes('建议增持: 平安银行'), '应该有增持建议');
    assert(singleAccount.summary.action_items.includes('建议减持: 贵州茅台'), '应该有减持建议');
    assert(singleAccount.summary.action_items.some(item => item.includes('高风险持仓')), '应该有高风险提示');
  });

  runTest('单账户多持仓: 负收益多于正收益时生成优化建议', () => {
    assert(singleAccount.summary.action_items.some(item => item.includes('优化持仓结构')),
      '负收益多于正收益时应建议优化持仓结构');
  });

  console.log('\n  📊 场景 3 测试报告:');
  console.log(`     - 总持仓: ${singleAccount.positions.length}`);
  console.log(`     - 正收益: ${singleAccount.summary.positive_positions.length}`);
  console.log(`     - 负收益: ${singleAccount.summary.negative_positions.length}`);
  console.log(`     - 高风险: ${singleAccount.summary.high_risk_positions.length}`);
  console.log(`     - 操作建议: ${singleAccount.summary.action_items.length} 条`);
  console.log(`     - 标题: ${report.overview.headline}`);
}

// ============================================
// 测试场景 4: 持仓数据字段缺失场景
// ============================================

function testMissingFields() {
  console.log('\n📋 场景 4: 持仓数据字段缺失场景');
  console.log('  测试部分字段缺失时的容错处理');

  // 测试缺失 reportInfo
  const positionNoReport = {
    ts_code: '000001.SZ',
    stock_name: '平安银行',
    unrealized_pnl_rate: 5.0,
    monitor_assessment: null
  };

  const assessmentNoReport = generatePositionAssessment(positionNoReport, null);

  runTest('字段缺失: reportInfo 为 null', () => {
    assert(assessmentNoReport.action === 'hold', '无报告时默认action应为hold');
    assert(assessmentNoReport.risk_level === 'low', '收益率5%无报告时风险等级应为low');
    assert(assessmentNoReport.follow_ups.length >= 2, '即使没有报告也应有默认跟进事项');
  });

  // 测试 reportInfo 中 parsed_data 为空对象
  const positionEmptyParsed = {
    ts_code: '000002.SZ',
    stock_name: '万科A',
    unrealized_pnl_rate: -6.0,
    monitor_assessment: null
  };

  const assessmentEmptyParsed = generatePositionAssessment(positionEmptyParsed, { parsed_data: {} });

  runTest('字段缺失: parsed_data 为空对象', () => {
    assert(assessmentEmptyParsed.action === 'hold', '空parsed_data时默认action应为hold');
    assert(assessmentEmptyParsed.risk_level === 'medium', '收益率-6%时风险等级应为medium');
    assert(assessmentEmptyParsed.summary.includes('-6.00%'), 'summary应包含收益率');
  });

  // 测试部分字段缺失
  const positionPartialData = {
    ts_code: '000858.SZ',
    stock_name: '五粮液',
    unrealized_pnl_rate: -15.0,
    monitor_assessment: null
  };

  const reportInfoPartial = {
    parsed_data: {
      decision: '买入',
      // 缺少 report_score, key_watch_points, risk_controls
    }
  };

  const assessmentPartial = generatePositionAssessment(positionPartialData, reportInfoPartial);

  runTest('字段缺失: 部分字段缺失', () => {
    assert(assessmentPartial.action === 'buy', '有decision时应正确识别action');
    assert(assessmentPartial.risk_level === 'high', '收益率-15%时风险等级应为high');
    assert(assessmentPartial.watch_items.length === 0, '无watch_points时应为空数组');
    assert(assessmentPartial.risk_alerts.length > 0, '高风险应有风险告警');
  });

  // 测试 parse_status 错误
  const positionParseError = {
    ts_code: '600519.SH',
    stock_name: '贵州茅台',
    unrealized_pnl_rate: -5.0,
    monitor_assessment: null
  };

  const reportInfoError = {
    parsed_data: {
      parse_status: 'error: 文件读取失败',
      decision: null,
      report_score: null
    }
  };

  const assessmentError = generatePositionAssessment(positionParseError, reportInfoError);

  runTest('字段缺失: parse_status 错误', () => {
    assert(assessmentError.risk_alerts.some(alert => alert.includes('error') || alert.includes('解析失败')),
      '解析错误时应添加风险告警');
    assert(assessmentError.follow_ups.some(follow => follow.includes('解析失败')),
      '解析错误时跟进事项应包含解析失败提示');
  });

  // 测试 parse_status partial_success
  const positionPartialSuccess = {
    ts_code: '002594.SZ',
    stock_name: '比亚迪',
    unrealized_pnl_rate: 8.0,
    monitor_assessment: null
  };

  const reportInfoPartialSuccess = {
    parsed_data: {
      parse_status: 'partial_success',
      decision: '持有',
      report_score: 3.5
    }
  };

  const assessmentPartialSuccess = generatePositionAssessment(positionPartialSuccess, reportInfoPartialSuccess);

  runTest('字段缺失: parse_status partial_success', () => {
    assert(assessmentPartialSuccess.risk_alerts.some(alert => alert.includes('部分成功')),
      '部分成功时应添加风险提示');
  });

  // 测试缺失 stock_name 和 ts_code（边界情况）
  const positionMinimal = {
    ts_code: '300750.SZ',
    stock_name: '',
    unrealized_pnl_rate: 0.0,
    monitor_assessment: null
  };

  const assessmentMinimal = generatePositionAssessment(positionMinimal, null);

  runTest('字段缺失: 空字符串字段', () => {
    assert(assessmentMinimal.action === 'hold', '空字段时不应崩溃');
    assert(assessmentMinimal.summary === '收益率: 0.00%', '只有收益率时应正确显示');
  });

  // 测试 accountReport 生成时处理缺失字段
  const accountWithMissing = {
    account_id: 5,
    account_name: '字段缺失测试账户',
    positions: [
      {
        ts_code: '000001.SZ',
        stock_name: '平安银行',
        unrealized_pnl_rate: 5.0,
        monitor_assessment: assessmentNoReport
      },
      {
        ts_code: '000002.SZ',
        stock_name: '万科A',
        unrealized_pnl_rate: -6.0,
        monitor_assessment: assessmentEmptyParsed
      }
    ]
  };

  accountWithMissing.summary = generateAccountSummary(accountWithMissing);

  runTest('字段缺失: accountSummary 处理缺失字段', () => {
    assert(accountWithMissing.summary.positive_positions.length === 1, '应正确识别正收益');
    assert(accountWithMissing.summary.negative_positions.length === 1, '应正确识别负收益');
    assert(accountWithMissing.summary.watch_items_count === 0, '无watch_items时应为0');
  });

  const reportWithMissing = { accounts: [accountWithMissing] };
  reportWithMissing.overview = generateReportOverview(reportWithMissing);

  runTest('字段缺失: reportOverview 处理缺失字段', () => {
    assert(reportWithMissing.overview.headline.includes('正收益') || reportWithMissing.overview.headline.includes('负收益'),
      '应正确生成标题');
  });

  console.log('\n  📊 场景 4 测试报告:');
  console.log(`     - 无报告场景: action=${assessmentNoReport.action}, risk=${assessmentNoReport.risk_level}`);
  console.log(`     - 空数据场景: action=${assessmentEmptyParsed.action}, risk=${assessmentEmptyParsed.risk_level}`);
  console.log(`     - 部分缺失场景: action=${assessmentPartial.action}, risk=${assessmentPartial.risk_level}`);
  console.log(`     - 解析错误场景: risk_alerts=${assessmentError.risk_alerts.length}`);
  console.log(`     - 账户汇总: 正收益=${accountWithMissing.summary.positive_positions.length}, 负收益=${accountWithMissing.summary.negative_positions.length}`);
}

// ============================================
// 主函数
// ============================================

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊 Daily Monitor 多样本验证测试');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`⏰ 测试时间: ${new Date().toLocaleString('zh-CN')}\n`);

  // 运行所有测试场景
  testMultiAccountMultiPosition();
  testEmptyAccount();
  testSingleAccountMultiPosition();
  testMissingFields();

  // 输出最终报告
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  📋 测试结果摘要');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  总测试数: ${totalTests}`);
  console.log(`  ✅ 通过: ${passedTests}`);
  console.log(`  ❌ 失败: ${failedTests}`);
  console.log(`  📊 通过率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (failedTests > 0) {
    console.log('\n  失败的测试:');
    testResults
      .filter(r => r.status === 'FAIL')
      .forEach(r => console.log(`    - ${r.name}: ${r.error}`));
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  测试场景覆盖:');
  console.log('    ✓ 场景1: 多账户多持仓');
  console.log('    ✓ 场景2: 空账户（无持仓）');
  console.log('    ✓ 场景3: 单账户多持仓');
  console.log('    ✓ 场景4: 字段缺失容错');
  console.log('═══════════════════════════════════════════════════════════════');

  // 返回测试结果用于外部调用
  return {
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    results: testResults
  };
}

// 执行测试
main();
