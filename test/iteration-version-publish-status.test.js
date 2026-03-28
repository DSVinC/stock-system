/**
 * 测试：版本历史返回发布状态字段
 * 路径：GET /api/iteration/versions/:strategyType
 *
 * 测试覆盖：
 * 1. 未发布版本返回 published_strategy_config_id = null, is_published_to_library = false
 * 2. 已发布版本返回 published_strategy_config_id 和 is_published_to_library = true
 * 3. 一个版本对应多个公开策略时，返回最大的 strategy_config_id
 */

const assert = require('assert');

// 模拟数据存储
const mockData = {
  strategy_versions: [],
  strategy_configs: [],
  strategy_config_feedback: [],
  // 控制表是否存在
  tablesExist: {
    strategy_config_feedback: true,
    strategy_configs: true
  }
};

// 创建模拟数据库
function createMockDb() {
  return {
    runPromise: async (sql, params = []) => {
      return { changes: 1 };
    },

    getPromise: async (sql, params = []) => {
      sql = sql.trim();

      // 检查 execution_feedback 表是否存在
      if (sql.includes('SELECT name FROM sqlite_master')) {
        return null; // 表不存在
      }

      return null;
    },

    allPromise: async (sql, params = []) => {
      sql = sql.trim();

      // 查询 strategy_versions
      if (sql.includes('FROM strategy_versions')) {
        if (sql.includes('WHERE strategy_type =')) {
          return mockData.strategy_versions.filter(v => v.strategy_type === params[0]);
        }
        return mockData.strategy_versions;
      }

      // 查询 strategy_config_feedback 关联发布状态
      if (sql.includes('FROM strategy_config_feedback')) {
        if (sql.includes('INNER JOIN strategy_configs')) {
          // 查询已发布的版本映射（支持 IN 子句）
          // params 是 versionIds 数组
          if (params && params.length > 0) {
            const results = [];
            // 按版本分组，找出每个版本对应的公开策略
            const versionToConfigs = new Map();

            for (const feedback of mockData.strategy_config_feedback) {
              if (params.includes(feedback.source_version_id)) {
                const config = mockData.strategy_configs.find(c => c.id === feedback.strategy_config_id);
                if (config && config.is_public === 1) {
                  if (!versionToConfigs.has(feedback.source_version_id)) {
                    versionToConfigs.set(feedback.source_version_id, []);
                  }
                  versionToConfigs.get(feedback.source_version_id).push(config.id);
                }
              }
            }

            // 返回每个版本的最大 strategy_config_id
            for (const [versionId, configIds] of versionToConfigs) {
              results.push({
                source_version_id: versionId,
                strategy_config_id: Math.max(...configIds)
              });
            }
            return results;
          }
        }
        return mockData.strategy_config_feedback;
      }

      return [];
    }
  };
}

function createMissingPublishTableDb() {
  return {
    allPromise: async (sql) => {
      sql = sql.trim();
      if (sql.includes('FROM strategy_config_feedback')) {
        throw new Error('SQLITE_ERROR: no such table: strategy_config_feedback');
      }
      return [];
    },
    getPromise: async () => null,
    runPromise: async () => ({ changes: 0 })
  };
}

// 简单测试框架
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

// 重置模拟数据
function resetMockData() {
  mockData.strategy_versions = [];
  mockData.strategy_configs = [];
  mockData.strategy_config_feedback = [];
}

// ============================================================
// 测试用例
// ============================================================

async function runTests() {
  console.log('\n📋 测试：版本历史返回发布状态字段\n');

  // 模拟 getDatabase
  const originalGetDatabase = require('../api/db').getDatabase;
  const mockDb = createMockDb();
  require('../api/db').getDatabase = async () => mockDb;

  try {
    // 导入 iteration-manager 模块
    const iterationManager = require('../api/iteration-manager');

    // ----------------------------------------
    // 前置检查: enrichVersionsWithPublishStatus 必须存在
    // ----------------------------------------
    const enrichFn = iterationManager.__test?.enrichVersionsWithPublishStatus;
    test('enrichVersionsWithPublishStatus 函数存在', () => {
      assert.ok(typeof enrichFn === 'function', 'enrichVersionsWithPublishStatus 必须是函数');
    });

    // 如果函数不存在，后续测试无法进行
    if (typeof enrichFn !== 'function') {
      console.log('\n❌ 致命错误: enrichVersionsWithPublishStatus 函数不存在，无法继续测试\n');
      process.exit(1);
    }

    // ----------------------------------------
    // 测试 1: 未发布版本返回 null/false
    // ----------------------------------------
    console.log('\n测试组 1: 未发布版本');

    resetMockData();

    // 准备测试数据：创建一个未发布的 strategy_version
    mockData.strategy_versions.push({
      version_id: 'unpublished-version-001',
      strategy_type: 'core_satellite',
      strategy_name: '未发布策略版本',
      backtest_score: 0.85,
      sharpe_ratio: 1.5,
      max_drawdown: -0.15,
      calmar_ratio: 2.0,
      profit_loss_ratio: 1.8,
      win_rate: 0.65,
      total_return: 0.35,
      created_at: new Date().toISOString(),
      parent_version: null,
      change_log: '初始版本'
    });

    const enrichedVersions1 = await enrichFn(mockDb, mockData.strategy_versions);

    test('未发布版本有 published_strategy_config_id 字段', () => {
      assert.ok('published_strategy_config_id' in enrichedVersions1[0]);
    });

    test('未发布版本 published_strategy_config_id = null', () => {
      assert.strictEqual(enrichedVersions1[0].published_strategy_config_id, null);
    });

    test('未发布版本有 is_published_to_library 字段', () => {
      assert.ok('is_published_to_library' in enrichedVersions1[0]);
    });

    test('未发布版本 is_published_to_library = false', () => {
      assert.strictEqual(enrichedVersions1[0].is_published_to_library, false);
    });

    // ----------------------------------------
    // 测试 2: 已发布版本返回 strategy_config_id 和 true
    // ----------------------------------------
    console.log('\n测试组 2: 已发布版本');

    resetMockData();

    // 创建已发布的策略配置
    mockData.strategy_configs.push({
      id: 101,
      name: '已发布策略',
      is_public: 1,
      created_at: new Date().toISOString()
    });

    // 创建研究版本
    mockData.strategy_versions.push({
      version_id: 'published-version-001',
      strategy_type: 'core_satellite',
      strategy_name: '已发布策略版本',
      backtest_score: 0.90,
      sharpe_ratio: 1.8,
      max_drawdown: -0.10,
      calmar_ratio: 2.5,
      profit_loss_ratio: 2.0,
      win_rate: 0.70,
      total_return: 0.45,
      created_at: new Date().toISOString(),
      parent_version: null,
      change_log: '发布版本'
    });

    // 创建关联记录
    mockData.strategy_config_feedback.push({
      id: 1,
      strategy_config_id: 101,
      source_version_id: 'published-version-001'
    });

    const enrichedVersions2 = await enrichFn(mockDb, mockData.strategy_versions);

    test('已发布版本 published_strategy_config_id = 101', () => {
      assert.strictEqual(enrichedVersions2[0].published_strategy_config_id, 101);
    });

    test('已发布版本 is_published_to_library = true', () => {
      assert.strictEqual(enrichedVersions2[0].is_published_to_library, true);
    });

    // ----------------------------------------
    // 测试 3: 多个公开策略返回最大 id
    // ----------------------------------------
    console.log('\n测试组 3: 多个公开策略');

    resetMockData();

    // 创建多个公开策略配置
    mockData.strategy_configs.push({
      id: 201,
      name: '策略 v1',
      is_public: 1,
      created_at: '2026-01-01T00:00:00.000Z'
    });
    mockData.strategy_configs.push({
      id: 305,
      name: '策略 v2',
      is_public: 1,
      created_at: '2026-02-01T00:00:00.000Z'
    });

    // 创建研究版本
    mockData.strategy_versions.push({
      version_id: 'multi-published-version-001',
      strategy_type: 'core_satellite',
      strategy_name: '多次发布策略版本',
      backtest_score: 0.88,
      created_at: new Date().toISOString()
    });

    // 创建多条关联记录（同一版本发布到多个策略）
    mockData.strategy_config_feedback.push({
      id: 1,
      strategy_config_id: 201,
      source_version_id: 'multi-published-version-001'
    });
    mockData.strategy_config_feedback.push({
      id: 2,
      strategy_config_id: 305,
      source_version_id: 'multi-published-version-001'
    });

    const enrichedVersions3 = await enrichFn(mockDb, mockData.strategy_versions);

    test('多策略版本返回最大 id (305)', () => {
      assert.strictEqual(enrichedVersions3[0].published_strategy_config_id, 305);
    });

    test('多策略版本 is_published_to_library = true', () => {
      assert.strictEqual(enrichedVersions3[0].is_published_to_library, true);
    });

    // ----------------------------------------
    // 测试 4: 混合场景（部分发布，部分未发布）
    // ----------------------------------------
    console.log('\n测试组 4: 混合场景');

    resetMockData();

    // 创建策略配置
    mockData.strategy_configs.push({
      id: 401,
      name: '策略 A',
      is_public: 1,
      created_at: new Date().toISOString()
    });

    // 创建多个版本
    mockData.strategy_versions.push(
      {
        version_id: 'mixed-published-001',
        strategy_type: 'core_satellite',
        strategy_name: '已发布版本 A',
        backtest_score: 0.85,
        created_at: '2026-01-15T00:00:00.000Z'
      },
      {
        version_id: 'mixed-unpublished-002',
        strategy_type: 'core_satellite',
        strategy_name: '未发布版本 B',
        backtest_score: 0.80,
        created_at: '2026-02-15T00:00:00.000Z'
      }
    );

    // 只关联第一个版本
    mockData.strategy_config_feedback.push({
      id: 1,
      strategy_config_id: 401,
      source_version_id: 'mixed-published-001'
    });

    const enrichedVersions4 = await enrichFn(mockDb, mockData.strategy_versions);

    test('已发布版本 A 正确标记', () => {
      const published = enrichedVersions4.find(v => v.version_id === 'mixed-published-001');
      assert.strictEqual(published.published_strategy_config_id, 401);
      assert.strictEqual(published.is_published_to_library, true);
    });

    test('未发布版本 B 正确标记', () => {
      const unpublished = enrichedVersions4.find(v => v.version_id === 'mixed-unpublished-002');
      assert.strictEqual(unpublished.published_strategy_config_id, null);
      assert.strictEqual(unpublished.is_published_to_library, false);
    });

    // ----------------------------------------
    // 测试 5: 非公开策略不标记为已发布
    // ----------------------------------------
    console.log('\n测试组 5: 非公开策略');

    resetMockData();

    // 创建非公开策略配置
    mockData.strategy_configs.push({
      id: 501,
      name: '私有策略',
      is_public: 0, // 非公开
      created_at: new Date().toISOString()
    });

    // 创建研究版本
    mockData.strategy_versions.push({
      version_id: 'private-published-001',
      strategy_type: 'core_satellite',
      strategy_name: '私有策略版本',
      backtest_score: 0.82,
      created_at: new Date().toISOString()
    });

    // 创建关联记录（但策略是非公开的）
    mockData.strategy_config_feedback.push({
      id: 1,
      strategy_config_id: 501,
      source_version_id: 'private-published-001'
    });

    const enrichedVersions5 = await enrichFn(mockDb, mockData.strategy_versions);

    test('非公开策略不标记为已发布', () => {
      assert.strictEqual(enrichedVersions5[0].published_strategy_config_id, null);
      assert.strictEqual(enrichedVersions5[0].is_published_to_library, false);
    });

    // ----------------------------------------
    // 测试 6: strategy_config_feedback 表不存在时应安全回退
    // ----------------------------------------
    console.log('\n测试组 6: 侧表缺失回退');

    resetMockData();

    const fallbackVersions = await enrichFn(
      createMissingPublishTableDb(),
      [{
        version_id: 'missing-table-version-001',
        strategy_type: 'core_satellite',
        strategy_name: '缺失侧表版本',
        backtest_score: 0.77,
        created_at: new Date().toISOString()
      }]
    );

    test('侧表不存在时 published_strategy_config_id 回退为 null', () => {
      assert.strictEqual(fallbackVersions[0].published_strategy_config_id, null);
    });

    test('侧表不存在时 is_published_to_library 回退为 false', () => {
      assert.strictEqual(fallbackVersions[0].is_published_to_library, false);
    });

  } finally {
    // 恢复原始 getDatabase
    require('../api/db').getDatabase = originalGetDatabase;
  }

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

// 运行测试
runTests().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
