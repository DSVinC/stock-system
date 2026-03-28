/**
 * 策略版本历史筛选功能测试
 * 测试 iteration-manager.html 中的前端筛选逻辑
 */

const assert = require('assert');

// 模拟筛选逻辑（从 iteration-manager.html 提取）
function applyVersionFiltersLogic(versions, statusFilter, confidenceFilter) {
  let filtered = versions.slice();

  // 按状态筛选
  if (statusFilter !== 'all') {
    filtered = filtered.filter(v => (v.execution_feedback_status || 'no_data') === statusFilter);
  }

  // 按置信度筛选
  if (confidenceFilter !== 'all') {
    filtered = filtered.filter(v => (v.execution_feedback_confidence || 'none') === confidenceFilter);
  }

  return filtered;
}

// 测试数据
const mockVersions = [
  { version_id: 'v1', execution_feedback_status: 'positive', execution_feedback_confidence: 'high' },
  { version_id: 'v2', execution_feedback_status: 'positive', execution_feedback_confidence: 'low' },
  { version_id: 'v3', execution_feedback_status: 'mixed', execution_feedback_confidence: 'medium' },
  { version_id: 'v4', execution_feedback_status: 'caution', execution_feedback_confidence: 'high' },
  { version_id: 'v5', execution_feedback_status: 'no_data', execution_feedback_confidence: 'none' },
  { version_id: 'v6', execution_feedback_status: 'positive', execution_feedback_confidence: 'medium' },
  { version_id: 'v7' }, // 无反馈数据，默认 no_data / none
];

// 测试用例
const tests = [
  {
    name: '测试1: status=positive 时只保留 positive',
    statusFilter: 'positive',
    confidenceFilter: 'all',
    expectedIds: ['v1', 'v2', 'v6']
  },
  {
    name: '测试2: confidence=high 时只保留 high',
    statusFilter: 'all',
    confidenceFilter: 'high',
    expectedIds: ['v1', 'v4']
  },
  {
    name: '测试3: status+confidence 组合过滤正确',
    statusFilter: 'positive',
    confidenceFilter: 'high',
    expectedIds: ['v1']
  },
  {
    name: '测试4: 全部/全部 时返回原始列表',
    statusFilter: 'all',
    confidenceFilter: 'all',
    expectedIds: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']
  },
  {
    name: '测试5: status=mixed 过滤正确',
    statusFilter: 'mixed',
    confidenceFilter: 'all',
    expectedIds: ['v3']
  },
  {
    name: '测试6: confidence=none 过滤正确',
    statusFilter: 'all',
    confidenceFilter: 'none',
    expectedIds: ['v5', 'v7']
  },
  {
    name: '测试7: status=caution + confidence=high 组合',
    statusFilter: 'caution',
    confidenceFilter: 'high',
    expectedIds: ['v4']
  },
  {
    name: '测试8: status=no_data 过滤正确（默认值）',
    statusFilter: 'no_data',
    confidenceFilter: 'all',
    expectedIds: ['v5', 'v7']
  }
];

// 运行测试
let passed = 0;
let failed = 0;

console.log('========================================');
console.log('策略版本历史筛选功能测试');
console.log('========================================\n');

tests.forEach((test, index) => {
  try {
    const result = applyVersionFiltersLogic(mockVersions, test.statusFilter, test.confidenceFilter);
    const resultIds = result.map(v => v.version_id);

    assert.deepStrictEqual(resultIds, test.expectedIds, `期望 ${test.expectedIds.join(',')} 但得到 ${resultIds.join(',')}`);

    console.log(`✅ ${test.name}`);
    console.log(`   筛选条件: status=${test.statusFilter}, confidence=${test.confidenceFilter}`);
    console.log(`   结果: ${resultIds.length} 条记录 [${resultIds.join(', ')}]\n`);
    passed++;
  } catch (error) {
    console.log(`❌ ${test.name}`);
    console.log(`   筛选条件: status=${test.statusFilter}, confidence=${test.confidenceFilter}`);
    console.log(`   错误: ${error.message}\n`);
    failed++;
  }
});

console.log('========================================');
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
console.log('========================================');

process.exit(failed > 0 ? 1 : 0);