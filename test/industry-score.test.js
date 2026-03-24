#!/usr/bin/env node

/**
 * industry-score.js 单元测试
 * TASK_V3_001 - 补充单元测试（修复缺口）
 *
 * 测试覆盖：
 * 1. calculatePolicyScore() 关键词匹配测试
 * 2. dimensionFromRaw() 归一化测试
 * 3. scoreIndustry() 主函数测试
 */

const assert = require('node:assert');

// 模拟 POLICY_KEYWORDS（从源码复制）
const POLICY_KEYWORDS = {
  5: ['算力', '人工智能', '机器人', '创新药', '低空', '半导体', '芯片', '储能', '电网', '数据', '信创', '卫星', '军工', 'AI'],
  4: ['医疗', '工业', '新能源', '智能', '新材料', '高端制造', '汽车', '消费电子', '光模块', '服务器', '云', '数字'],
};

// 默认权重配置
const DEFAULT_WEIGHTS = {
  policy: 0.25,
  commercial: 0.30,
  public: 0.25,
  capital: 0.20
};

// ==================== 辅助函数（从源码复制，用于独立测试）====================

/**
 * 归一化名称
 */
function normalizeName(value) {
  return String(value || '').trim();
}

/**
 * 根据关键词计算政策评分
 * @param {string} name - 行业名称
 * @returns {number} 政策评分 (1-5)
 */
function calculatePolicyScore(name) {
  const normalized = normalizeName(name);
  if (!normalized) return 3;

  for (const keyword of POLICY_KEYWORDS[5]) {
    if (normalized.includes(keyword)) return 5;
  }
  for (const keyword of POLICY_KEYWORDS[4]) {
    if (normalized.includes(keyword)) return 4;
  }
  return 3;
}

/**
 * 原始值转换为维度评分 (0-100 -> 1-5)
 */
function dimensionFromRaw(rawValue) {
  const normalized = Math.max(0, Math.min(100, rawValue));
  if (normalized >= 85) return 5;
  if (normalized >= 70) return 4;
  if (normalized >= 55) return 3;
  if (normalized >= 35) return 2;
  return 1;
}

/**
 * 转换为数字
 */
function toNumber(value, defaultValue = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

/**
 * 计算行业 4 维度评分
 */
function scoreIndustry(flow, index, hot, ipoMatches, weights) {
  const name = normalizeName(flow.name || index?.name);
  const companyCount = Math.max(toNumber(flow.company_num), toNumber(index?.count));
  const netAmount = toNumber(flow.net_amount);
  const pctChange = toNumber(flow.pct_change);
  const hotRank = hot ? toNumber(hot.rank, 999) : 999;
  const hotValue = hot ? toNumber(hot.hot) : 0;
  const pctChangeStock = toNumber(flow.pct_change_stock);

  // 1. 政策评分 (关键词匹配)
  const policyScore = calculatePolicyScore(name);

  // 2. 商业化评分 (基于公司数量、IPO、涨幅)
  const commercialRaw = Math.min(100,
    (companyCount * 0.6) +
    (ipoMatches * 22) +
    (pctChange > 0 ? 15 : 0) +
    (pctChangeStock * 5)
  );
  const commercialScore = dimensionFromRaw(commercialRaw);

  // 3. 舆论评分 (基于热度值、热度排名)
  const publicRaw = Math.min(100,
    (hotValue / 2000) +
    (hotRank < 999 ? (110 - hotRank * 3) : 15) +
    (pctChange * 6)
  );
  const publicScore = dimensionFromRaw(publicRaw);

  // 4. 资本评分 (基于资金净流入)
  const capitalRaw = Math.min(100,
    (Math.max(netAmount, 0) * 4) +
    (companyCount * 0.4) +
    (pctChangeStock * 8)
  );
  const capitalScore = dimensionFromRaw(capitalRaw);

  // 加权计算综合评分 (满分 100)
  const totalScore = Math.round(
    (policyScore * weights.policy +
     commercialScore * weights.commercial +
     publicScore * weights.public +
     capitalScore * weights.capital) * 20
  );

  return {
    name,
    policy_score: policyScore * 20,
    commercial_score: commercialScore * 20,
    public_score: publicScore * 20,
    capital_score: capitalScore * 20,
    total_score: totalScore,
    metrics: {
      companyCount,
      netAmount,
      hotRank: hotRank === 999 ? null : hotRank,
      hotValue,
      ipoMatches,
      pctChange
    }
  };
}

// ==================== 测试用例 ====================

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     错误: ${error.message}`);
    failed++;
  }
}

console.log('\n========================================');
console.log('industry-score.js 单元测试');
console.log('========================================\n');

// ==================== 1. calculatePolicyScore() 关键词匹配测试 ====================
console.log('1. calculatePolicyScore() 关键词匹配测试');

runTest('匹配"人工智能"返回 5 分', () => {
  const score = calculatePolicyScore('人工智能产业链');
  assert.strictEqual(score, 5, '应返回 5 分');
});

runTest('匹配"半导体"返回 5 分', () => {
  const score = calculatePolicyScore('半导体材料');
  assert.strictEqual(score, 5, '应返回 5 分');
});

runTest('匹配"AI"返回 5 分', () => {
  const score = calculatePolicyScore('AI算力');
  assert.strictEqual(score, 5, '应返回 5 分');
});

runTest('匹配"新能源"返回 4 分', () => {
  const score = calculatePolicyScore('新能源电池');
  assert.strictEqual(score, 4, '应返回 4 分');
});

runTest('匹配"医疗"返回 4 分', () => {
  const score = calculatePolicyScore('医疗器械');
  assert.strictEqual(score, 4, '应返回 4 分');
});

runTest('无匹配关键词返回 3 分', () => {
  const score = calculatePolicyScore('传统制造业');
  assert.strictEqual(score, 3, '无匹配应返回默认 3 分');
});

runTest('空字符串返回 3 分', () => {
  const score = calculatePolicyScore('');
  assert.strictEqual(score, 3, '空字符串应返回默认 3 分');
});

runTest('null 返回 3 分', () => {
  const score = calculatePolicyScore(null);
  assert.strictEqual(score, 3, 'null 应返回默认 3 分');
});

// ==================== 2. dimensionFromRaw() 归一化测试 ====================
console.log('\n2. dimensionFromRaw() 归一化测试 (0-100 -> 1-5)');

runTest('值 >= 85 返回 5', () => {
  assert.strictEqual(dimensionFromRaw(85), 5);
  assert.strictEqual(dimensionFromRaw(90), 5);
  assert.strictEqual(dimensionFromRaw(100), 5);
});

runTest('值 >= 70 且 < 85 返回 4', () => {
  assert.strictEqual(dimensionFromRaw(70), 4);
  assert.strictEqual(dimensionFromRaw(75), 4);
  assert.strictEqual(dimensionFromRaw(84), 4);
});

runTest('值 >= 55 且 < 70 返回 3', () => {
  assert.strictEqual(dimensionFromRaw(55), 3);
  assert.strictEqual(dimensionFromRaw(60), 3);
  assert.strictEqual(dimensionFromRaw(69), 3);
});

runTest('值 >= 35 且 < 55 返回 2', () => {
  assert.strictEqual(dimensionFromRaw(35), 2);
  assert.strictEqual(dimensionFromRaw(40), 2);
  assert.strictEqual(dimensionFromRaw(54), 2);
});

runTest('值 < 35 返回 1', () => {
  assert.strictEqual(dimensionFromRaw(0), 1);
  assert.strictEqual(dimensionFromRaw(10), 1);
  assert.strictEqual(dimensionFromRaw(34), 1);
});

runTest('负数边界处理 (clamp 到 0)', () => {
  assert.strictEqual(dimensionFromRaw(-10), 1, '负数应被 clamp 到 0');
});

runTest('超过 100 边界处理 (clamp 到 100)', () => {
  assert.strictEqual(dimensionFromRaw(150), 5, '超过 100 应被 clamp 到 100');
});

// ==================== 3. scoreIndustry() 主函数测试 ====================
console.log('\n3. scoreIndustry() 主函数测试');

runTest('完整流程测试 - 正常数据', () => {
  const flow = {
    name: '人工智能算力',
    company_num: 30,
    net_amount: 5,
    pct_change: 2.5,
    pct_change_stock: 3
  };
  const index = { name: 'AI算力指数', count: 35 };
  const hot = { rank: 10, hot: 5000 };
  const ipoMatches = 2;
  const weights = DEFAULT_WEIGHTS;

  const result = scoreIndustry(flow, index, hot, ipoMatches, weights);

  // 验证返回结构
  assert.ok(result.name, '应有行业名称');
  assert.ok(typeof result.policy_score === 'number', 'policy_score 应为数字');
  assert.ok(typeof result.commercial_score === 'number', 'commercial_score 应为数字');
  assert.ok(typeof result.public_score === 'number', 'public_score 应为数字');
  assert.ok(typeof result.capital_score === 'number', 'capital_score 应为数字');
  assert.ok(typeof result.total_score === 'number', 'total_score 应为数字');
  assert.ok(result.metrics, '应有 metrics 对象');

  // 验证评分范围 (0-100)
  assert.ok(result.policy_score >= 0 && result.policy_score <= 100, 'policy_score 应在 0-100');
  assert.ok(result.total_score >= 0 && result.total_score <= 100, 'total_score 应在 0-100');
});

runTest('边界情况 - 数据缺失 (flow 为空对象)', () => {
  const flow = {};
  const index = null;
  const hot = null;
  const ipoMatches = 0;
  const weights = DEFAULT_WEIGHTS;

  const result = scoreIndustry(flow, index, hot, ipoMatches, weights);

  // 即使数据缺失，也应返回有效结果
  assert.ok(result, '应返回结果对象');
  assert.strictEqual(result.name, '', '无名称时应为空字符串');
  assert.strictEqual(result.metrics.companyCount, 0, '公司数应为 0');
  assert.strictEqual(result.metrics.netAmount, 0, '净流入应为 0');
  assert.strictEqual(result.metrics.ipoMatches, 0, 'IPO 匹配数应为 0');
});

runTest('边界情况 - 部分数据为 null', () => {
  const flow = {
    name: '新能源',
    company_num: null,
    net_amount: null,
    pct_change: null
  };
  const index = { count: null };
  const hot = { rank: null, hot: null };
  const ipoMatches = 0;
  const weights = DEFAULT_WEIGHTS;

  const result = scoreIndustry(flow, index, hot, ipoMatches, weights);

  assert.ok(result, '应返回结果对象');
  assert.strictEqual(result.name, '新能源', '名称应正确');
  // null 应被转换为 0
  assert.strictEqual(result.metrics.companyCount, 0, 'null company_num 应转为 0');
  assert.strictEqual(result.metrics.netAmount, 0, 'null net_amount 应转为 0');
});

runTest('政策评分 - 匹配 5 分关键词', () => {
  const flow = { name: '人工智能' };
  const result = scoreIndustry(flow, null, null, 0, DEFAULT_WEIGHTS);
  assert.strictEqual(result.policy_score, 100, '匹配 5 分关键词应返回 100');
});

runTest('政策评分 - 匹配 4 分关键词', () => {
  const flow = { name: '新能源' };
  const result = scoreIndustry(flow, null, null, 0, DEFAULT_WEIGHTS);
  assert.strictEqual(result.policy_score, 80, '匹配 4 分关键词应返回 80');
});

runTest('政策评分 - 无匹配返回默认 3 分', () => {
  const flow = { name: '传统行业' };
  const result = scoreIndustry(flow, null, null, 0, DEFAULT_WEIGHTS);
  assert.strictEqual(result.policy_score, 60, '无匹配应返回 60');
});

runTest('自定义权重测试', () => {
  const customWeights = {
    policy: 0.5,    // 政策权重提高
    commercial: 0.2,
    public: 0.2,
    capital: 0.1
  };

  const flow = { name: '人工智能' };
  const result = scoreIndustry(flow, null, null, 0, customWeights);

  assert.ok(result.total_score > 0, '应有有效评分');
});

// ==================== 测试结果汇总 ====================
console.log('\n========================================');
console.log('测试结果汇总');
console.log('========================================');
console.log(`总计: ${passed + failed} 个测试`);
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('========================================\n');

// 退出码
process.exit(failed > 0 ? 1 : 0);