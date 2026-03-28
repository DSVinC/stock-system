/**
 * 测试：研究版本发布到策略库 API
 * 路径：POST /api/strategy-config/publish-version
 *
 * 测试覆盖：
 * 1. 能从 strategy_versions 发布出 strategy_configs
 * 2. strategy_config_feedback 会被写入
 * 3. feedback 状态/置信度/summary 会落盘
 */

const assert = require('assert');
const path = require('path');

// 测试数据库路径
const TEST_DB_PATH = path.join(__dirname, '../data/test_publish_version.db');

// 模拟数据库
let mockDb = null;
let tablesCreated = false;

// 模拟数据存储
const mockData = {
  strategy_versions: [],
  strategy_configs: [],
  strategy_config_feedback: [],
  execution_feedback: []
};

// 创建模拟数据库
function createMockDb() {
  return {
    runPromise: async (sql, params = []) => {
      sql = sql.trim();

      // CREATE TABLE
      if (sql.startsWith('CREATE TABLE')) {
        return { changes: 1 };
      }

      // CREATE INDEX
      if (sql.startsWith('CREATE INDEX')) {
        return { changes: 1 };
      }

      // ALTER TABLE
      if (sql.startsWith('ALTER TABLE')) {
        return { changes: 1 };
      }

      // INSERT INTO strategy_versions
      if (sql.includes('INSERT INTO strategy_versions')) {
        const version = {
          version_id: params[0],
          strategy_type: params[1],
          strategy_name: params[2],
          config_json: params[3],
          backtest_score: params[4],
          sharpe_ratio: params[5],
          max_drawdown: params[6],
          calmar_ratio: params[7],
          profit_loss_ratio: params[8],
          win_rate: params[9],
          total_return: params[10],
          simulation_result: params[11],
          created_at: params[12],
          parent_version: params[13],
          change_log: params[14],
          created_by: params[15],
          tags: params[16]
        };
        mockData.strategy_versions.push(version);
        return { lastID: mockData.strategy_versions.length, changes: 1 };
      }

      // INSERT INTO strategy_configs
      if (sql.includes('INSERT INTO strategy_configs')) {
        const placeholderCount = (sql.match(/\?/g) || []).length;
        if (placeholderCount !== params.length) {
          throw new Error(`SQLITE_ERROR: ${params.length} values for ${placeholderCount} columns`);
        }

        const config = {
          id: mockData.strategy_configs.length + 1,
          name: params[0],
          version: params[1],
          description: params[2],
          template_id: params[3],
          policy_weight: params[4],
          commercialization_weight: params[5],
          sentiment_weight: params[6],
          capital_weight: params[7],
          revenue_growth_min: params[8],
          gross_margin_min: params[9],
          sentiment_top_percentile: params[10],
          seven_factor_min_score: params[11],
          pe_max: params[12],
          peg_max: params[13],
          core_ratio: params[14],
          satellite_ratio: params[15],
          satellite_count: params[16],
          grid_step: params[17],
          grid_price_range: params[18],
          grid_single_amount: params[19],
          grid_trend_filter: params[20],
          max_drawdown: params[21],
          min_annual_return: params[22],
          min_win_rate: params[23],
          portfolio_config: params[24],
          grid_config: params[25],
          backtest_period: params[26],
          is_public: params[27],
          is_default: params[28],
          is_active: params[29],
          created_by: params[30],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        mockData.strategy_configs.push(config);
        return { lastID: config.id, changes: 1 };
      }

      // INSERT INTO strategy_config_feedback
      if (sql.includes('INSERT INTO strategy_config_feedback')) {
        const feedback = {
          id: mockData.strategy_config_feedback.length + 1,
          strategy_config_id: params[0],
          source_version_id: params[1],
          execution_feedback_status: params[2],
          execution_feedback_confidence: params[3],
          execution_summary_json: params[4],
          backtest_score: params[5],
          total_trades: params[6],
          successful_trades: params[7],
          failed_trades: params[8],
          total_pnl: params[9],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        mockData.strategy_config_feedback.push(feedback);
        return { lastID: feedback.id, changes: 1 };
      }

      // INSERT INTO execution_feedback
      if (sql.includes('INSERT INTO execution_feedback')) {
        const feedback = {
          feedback_id: params[0],
          event_type: params[1],
          conditional_order_id: params[2],
          trade_id: params[3],
          account_id: params[4],
          ts_code: params[5],
          strategy_source: params[6],
          strategy_config_id: params[7],
          strategy_config_name: params[8],
          template_id: params[9],
          template_name: params[10],
          strategy_id: params[11],
          strategy_version: params[12],
          version_id: params[13],
          report_id: params[14],
          action: params[15],
          quantity: params[16],
          price: params[17],
          amount: params[18],
          realized_pnl: params[19],
          realized_return: params[20],
          holding_days: params[21],
          payload_json: params[22],
          occurred_at: params[23],
          created_at: new Date().toISOString()
        };
        mockData.execution_feedback.push(feedback);
        return { lastID: mockData.execution_feedback.length, changes: 1 };
      }

      return { changes: 1 };
    },

    getPromise: async (sql, params = []) => {
      sql = sql.trim();

      // SELECT FROM strategy_versions
      if (sql.includes('FROM strategy_versions')) {
        if (sql.includes('WHERE version_id =')) {
          return mockData.strategy_versions.find(v => v.version_id === params[0]) || null;
        }
        return mockData.strategy_versions[0] || null;
      }

      // SELECT FROM strategy_configs
      if (sql.includes('FROM strategy_configs')) {
        if (sql.includes('WHERE id =')) {
          return mockData.strategy_configs.find(c => c.id === params[0]) || null;
        }
        return mockData.strategy_configs[0] || null;
      }

      // SELECT FROM strategy_config_feedback
      if (sql.includes('FROM strategy_config_feedback')) {
        if (sql.includes('WHERE strategy_config_id =')) {
          return mockData.strategy_config_feedback.find(f => f.strategy_config_id === params[0]) || null;
        }
        if (sql.includes('WHERE id =')) {
          return mockData.strategy_config_feedback.find(f => f.id === params[0]) || null;
        }
        return mockData.strategy_config_feedback[0] || null;
      }

      // SELECT id FROM strategy_config_feedback
      if (sql.includes('SELECT id FROM strategy_config_feedback')) {
        const found = mockData.strategy_config_feedback.find(f => f.strategy_config_id === params[0]);
        return found ? { id: found.id } : null;
      }

      return null;
    },

    allPromise: async (sql, params = []) => {
      sql = sql.trim();

      // SELECT FROM execution_feedback
      if (sql.includes('FROM execution_feedback')) {
        if (sql.includes('WHERE version_id =')) {
          return mockData.execution_feedback.filter(f => f.version_id === params[0]);
        }
        return mockData.execution_feedback;
      }

      // SELECT FROM strategy_configs
      if (sql.includes('FROM strategy_configs')) {
        if (sql.includes('WHERE is_public = 1')) {
          return mockData.strategy_configs.filter(c => c.is_public === 1);
        }
        return mockData.strategy_configs;
      }

      // SELECT FROM strategy_config_feedback
      if (sql.includes('FROM strategy_config_feedback')) {
        return mockData.strategy_config_feedback;
      }

      return [];
    }
  };
}

// 重置模拟数据
function resetMockData() {
  mockData.strategy_versions = [];
  mockData.strategy_configs = [];
  mockData.strategy_config_feedback = [];
  mockData.execution_feedback = [];
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

// ============================================================
// 测试用例
// ============================================================

async function runTests() {
  console.log('\n📋 测试：研究版本发布到策略库 API\n');

  // 设置模拟数据库
  mockDb = createMockDb();

  // 模拟 getDatabase
  const originalGetDatabase = require('../api/db').getDatabase;
  require('../api/db').getDatabase = async () => mockDb;

  try {
    // ----------------------------------------
    // 测试 1: 基本发布流程
    // ----------------------------------------
    console.log('测试组 1: 基本发布流程');

    resetMockData();

    // 准备测试数据：创建一个 strategy_version
    const testVersionId = 'test-version-001';
    const testConfigJson = JSON.stringify({
      policy_weight: 0.3,
      commercialization_weight: 0.25,
      sentiment_weight: 0.25,
      capital_weight: 0.2,
      core_ratio: 0.7,
      satellite_ratio: 0.3
    });

    mockData.strategy_versions.push({
      version_id: testVersionId,
      strategy_type: 'core_satellite',
      strategy_name: '测试策略版本',
      config_json: testConfigJson,
      backtest_score: 0.85,
      sharpe_ratio: 1.5,
      max_drawdown: -0.15,
      calmar_ratio: 2.0,
      profit_loss_ratio: 1.8,
      win_rate: 0.65,
      total_return: 0.35,
      simulation_result: null,
      created_at: new Date().toISOString(),
      parent_version: null,
      change_log: '初始版本',
      created_by: 'test',
      tags: 'test'
    });

    // 准备 execution_feedback 数据
    mockData.execution_feedback.push(
      { feedback_id: 'fb-001', version_id: testVersionId, ts_code: '000001.SZ', realized_return: 0.1, realized_pnl: 1000, event_type: 'simulated_trade' },
      { feedback_id: 'fb-002', version_id: testVersionId, ts_code: '000002.SZ', realized_return: -0.05, realized_pnl: -500, event_type: 'simulated_trade' },
      { feedback_id: 'fb-003', version_id: testVersionId, ts_code: '000003.SZ', realized_return: 0.15, realized_pnl: 1500, event_type: 'simulated_trade' },
      { feedback_id: 'fb-004', version_id: testVersionId, ts_code: '000004.SZ', realized_return: 0.08, realized_pnl: 800, event_type: 'simulated_trade' },
      { feedback_id: 'fb-005', version_id: testVersionId, ts_code: '000005.SZ', realized_return: 0.12, realized_pnl: 1200, event_type: 'simulated_trade' },
      { feedback_id: 'fb-006', version_id: testVersionId, ts_code: '000006.SZ', realized_return: -0.02, realized_pnl: -200, event_type: 'simulated_trade' }
    );

    // 导入模块
    const strategyConfig = require('../api/strategy-config');

    // 创建模拟请求/响应
    const mockReq = {
      body: { version_id: testVersionId }
    };
    const mockRes = {
      statusCode: 200,
      jsonData: null,
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { this.jsonData = data; }
    };

    // 执行发布
    await strategyConfig.publishVersionToStrategyLibrary(mockReq, mockRes);

    test('发布成功返回 success: true', () => {
      assert.strictEqual(mockRes.jsonData.success, true);
    });

    test('返回 data.strategy_config.id', () => {
      assert.ok(mockRes.jsonData.data.strategy_config.id);
      assert.strictEqual(mockRes.jsonData.data.strategy_config.id, 1);
    });

    test('strategy_configs 被创建', () => {
      assert.strictEqual(mockData.strategy_configs.length, 1);
    });

    test('strategy_config.name 正确映射', () => {
      assert.strictEqual(mockData.strategy_configs[0].name, '测试策略版本');
    });

    test('strategy_config.is_active = 1 (发布时自动激活)', () => {
      assert.strictEqual(mockData.strategy_configs[0].is_active, 1);
    });

    test('strategy_config.is_public = 1 (发布后进入 public 口径)', () => {
      assert.strictEqual(mockData.strategy_configs[0].is_public, 1);
    });

    const publicStrategies = await mockDb.allPromise('SELECT * FROM strategy_configs WHERE is_public = 1');
    test('public list 可见发布出的策略配置', () => {
      assert.strictEqual(publicStrategies.length, 1);
      assert.strictEqual(publicStrategies[0].id, 1);
    });

    test('strategy_config_feedback 被创建', () => {
      assert.strictEqual(mockData.strategy_config_feedback.length, 1);
    });

    // ----------------------------------------
    // 测试 2: 反馈聚合
    // ----------------------------------------
    console.log('\n测试组 2: 反馈聚合');

    test('feedback.strategy_config_id 正确关联', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].strategy_config_id, 1);
    });

    test('feedback.source_version_id 正确记录', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].source_version_id, testVersionId);
    });

    test('feedback.total_trades = 6', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].total_trades, 6);
    });

    test('feedback.successful_trades = 4 (return > 0)', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].successful_trades, 4);
    });

    test('feedback.failed_trades = 2 (return < 0)', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].failed_trades, 2);
    });

    test('feedback.total_pnl = 3800', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].total_pnl, 3800);
    });

    test('feedback.backtest_score 继承自版本', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].backtest_score, 0.85);
    });

    test('feedback.execution_feedback_status 计算（与研究流语义保持一致）', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].execution_feedback_status, 'positive');
    });

    test('feedback.execution_feedback_confidence 计算', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].execution_feedback_confidence, 'medium');
    });

    test('feedback.execution_summary_json 包含数据', () => {
      const summary = JSON.parse(mockData.strategy_config_feedback[0].execution_summary_json);
      assert.ok(summary !== null);
      assert.ok(Array.isArray(summary.event_types));
      assert.ok(Array.isArray(summary.ts_codes));
    });

    // ----------------------------------------
    // 测试 3: 边界情况
    // ----------------------------------------
    console.log('\n测试组 3: 边界情况');

    // 测试不存在的版本
    resetMockData();

    const mockReqNotFound = { body: { version_id: 'non-existent-version' } };
    const mockResNotFound = {
      statusCode: 200,
      jsonData: null,
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { this.jsonData = data; }
    };

    await strategyConfig.publishVersionToStrategyLibrary(mockReqNotFound, mockResNotFound);

    test('不存在的版本返回 404', () => {
      assert.strictEqual(mockResNotFound.statusCode, 404);
    });

    // 测试缺少 version_id
    const mockReqNoId = { body: {} };
    const mockResNoId = {
      statusCode: 200,
      jsonData: null,
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { this.jsonData = data; }
    };

    await strategyConfig.publishVersionToStrategyLibrary(mockReqNoId, mockResNoId);

    test('缺少 version_id 返回 400', () => {
      assert.strictEqual(mockResNoId.statusCode, 400);
    });

    // ----------------------------------------
    // 测试 4: 无 execution_feedback 的情况
    // ----------------------------------------
    console.log('\n测试组 4: 无 execution_feedback 情况');

    resetMockData();

    mockData.strategy_versions.push({
      version_id: 'test-version-no-feedback',
      strategy_type: 'test',
      strategy_name: '无反馈策略',
      config_json: JSON.stringify({}),
      backtest_score: 0.75,
      created_at: new Date().toISOString()
    });

    const mockReqNoFeedback = { body: { version_id: 'test-version-no-feedback' } };
    const mockResNoFeedback = {
      statusCode: 200,
      jsonData: null,
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { this.jsonData = data; }
    };

    await strategyConfig.publishVersionToStrategyLibrary(mockReqNoFeedback, mockResNoFeedback);

    test('无反馈时发布成功', () => {
      assert.strictEqual(mockResNoFeedback.jsonData.success, true);
    });

    test('无反馈时 status = no_data', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].execution_feedback_status, 'no_data');
    });

    test('无反馈时 confidence = none', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].execution_feedback_confidence, 'none');
    });

    test('无反馈时 total_trades = 0', () => {
      assert.strictEqual(mockData.strategy_config_feedback[0].total_trades, 0);
    });

    // ----------------------------------------
    // 测试 5: aggregateExecutionFeedback 函数
    // ----------------------------------------
    console.log('\n测试组 5: aggregateExecutionFeedback 函数');

    resetMockData();

    // 测试 positive 状态
    mockData.execution_feedback = Array(8).fill(null).map((_, i) => ({
      feedback_id: `fb-s-${i}`,
      version_id: 'test-success',
      ts_code: `00000${i}.SZ`,
      realized_return: 0.1,
      realized_pnl: 1000,
      event_type: 'simulated_trade'
    }));

    const successResult = await strategyConfig.aggregateExecutionFeedback('test-success');

    test('positive 状态: 总收益为正且胜率 >= 50%', () => {
      assert.strictEqual(successResult.status, 'positive');
      assert.strictEqual(successResult.confidence, 'medium');
    });

    // 测试 mixed 状态
    mockData.execution_feedback = [
      ...Array(4).fill(null).map((_, i) => ({
        feedback_id: `fb-p-${i}`,
        version_id: 'test-partial',
        ts_code: `00000${i}.SZ`,
        realized_return: 0.1,
        realized_pnl: 1000,
        event_type: 'simulated_trade'
      })),
      ...Array(4).fill(null).map((_, i) => ({
        feedback_id: `fb-p2-${i}`,
        version_id: 'test-partial',
        ts_code: `00001${i}.SZ`,
        realized_return: -0.1,
        realized_pnl: -1000,
        event_type: 'simulated_trade'
      }))
    ];

    const partialResult = await strategyConfig.aggregateExecutionFeedback('test-partial');

    test('mixed 状态: 样本足够但没有明显正负倾向', () => {
      assert.strictEqual(partialResult.status, 'mixed');
      assert.strictEqual(partialResult.confidence, 'medium');
    });

    // 测试 caution 状态
    mockData.execution_feedback = [
      ...Array(2).fill(null).map((_, i) => ({
        feedback_id: `fb-f-${i}`,
        version_id: 'test-failed',
        ts_code: `00000${i}.SZ`,
        realized_return: 0.1,
        realized_pnl: 1000,
        event_type: 'simulated_trade'
      })),
      ...Array(5).fill(null).map((_, i) => ({
        feedback_id: `fb-f2-${i}`,
        version_id: 'test-failed',
        ts_code: `00001${i}.SZ`,
        realized_return: -0.1,
        realized_pnl: -1000,
        event_type: 'simulated_trade'
      }))
    ];

    const failedResult = await strategyConfig.aggregateExecutionFeedback('test-failed');

    test('caution 状态: 收益偏负或胜率偏低', () => {
      assert.strictEqual(failedResult.status, 'caution');
      assert.strictEqual(failedResult.confidence, 'medium');
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
