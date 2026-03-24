/**
 * 回测转条件单 API 测试
 * TASK_V3_401
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// 模拟模块路径
const apiPath = path.join(__dirname, '..', 'api', 'backtest-to-conditional.js');

// 测试数据
const mockOptimizationResult = {
  status: 'completed',
  elapsed_ms: 100,
  totalCombinations: 10,
  validCombinations: 10,
  bestAllocation: {
    coreWeight: 0.7,
    satelliteWeight: 0.3,
    coreWeightPercent: '70%',
    satelliteWeightPercent: '30%'
  },
  bestMetrics: {
    sharpeRatio: 2.5,
    maxDrawdown: 0.08,
    annualizedReturn: 0.25,
    calmarRatio: 3.125,
    totalReturn: 0.33
  },
  allResults: [],
  constraints: { maxDrawdown: 0.2 },
  timestamp: new Date().toISOString()
};

const mockGridConfig = {
  description: '网格超额收益曲线示例数据',
  grid_config: {
    grid_step: 0.012,
    single_amount: 30000,
    trend_filter: true
  },
  excessReturn: [0, 0.01, 0.02]
};

// 辅助函数：临时创建测试缓存
function createTestCache() {
  const cacheDir = path.join(__dirname, '..', 'cache');
  const jointPath = path.join(cacheDir, 'joint_optimization.json');
  const gridPath = path.join(cacheDir, 'grid_excess_return.json');

  // 备份原文件
  const backup = {};
  if (fs.existsSync(jointPath)) {
    backup.joint = fs.readFileSync(jointPath, 'utf-8');
  }
  if (fs.existsSync(gridPath)) {
    backup.grid = fs.readFileSync(gridPath, 'utf-8');
  }

  // 写入测试数据
  fs.writeFileSync(jointPath, JSON.stringify(mockOptimizationResult, null, 2));
  fs.writeFileSync(gridPath, JSON.stringify(mockGridConfig, null, 2));

  return () => {
    // 恢复原文件
    if (backup.joint) {
      fs.writeFileSync(jointPath, backup.joint);
    } else {
      fs.unlinkSync(jointPath);
    }
    if (backup.grid) {
      fs.writeFileSync(gridPath, backup.grid);
    } else {
      fs.unlinkSync(gridPath);
    }
  };
}

// 测试套件
async function runTests() {
  console.log('=== 回测转条件单 API 测试 ===\n');

  const cleanup = createTestCache();
  let passed = 0;
  let failed = 0;

  try {
    // 加载模块
    const api = require(apiPath);

    // 测试 1: 读取联合优化结果
    console.log('测试 1: 读取联合优化结果');
    try {
      const result = api.readJointOptimization();
      assert(result !== null, '结果不应为空');
      assert(result.status === 'completed', '状态应为 completed');
      assert(result.bestAllocation !== undefined, '应包含 bestAllocation');
      console.log('  ✅ 通过\n');
      passed++;
    } catch (e) {
      console.log('  ❌ 失败:', e.message, '\n');
      failed++;
    }

    // 测试 2: 读取网格配置
    console.log('测试 2: 读取网格配置');
    try {
      const result = api.readGridExcessConfig();
      assert(result !== null, '结果不应为空');
      assert(result.grid_config !== undefined, '应包含 grid_config');
      console.log('  ✅ 通过\n');
      passed++;
    } catch (e) {
      console.log('  ❌ 失败:', e.message, '\n');
      failed++;
    }

    // 测试 3: 生成条件单配置
    console.log('测试 3: 生成条件单配置');
    try {
      const result = api.generateConditionalOrdersFromBacktest(
        mockOptimizationResult,
        mockGridConfig,
        { ts_code: '600519.SH', stock_name: '贵州茅台', account_id: 1 }
      );

      assert(result.orders !== undefined, '应包含 orders');
      assert(Array.isArray(result.orders), 'orders 应为数组');
      assert(result.orders.length > 0, '应生成至少一个条件单');

      // 检查条件单字段
      const order = result.orders[0];
      assert(order.account_id !== undefined, '应包含 account_id');
      assert(order.ts_code === '600519.SH', '股票代码应正确');
      assert(order.conditions !== undefined, '应包含 conditions');
      assert(Array.isArray(order.conditions), 'conditions 应为数组');

      console.log(`  生成了 ${result.orders.length} 个条件单:`);
      result.orders.forEach((o, i) => {
        console.log(`    ${i + 1}. ${o.order_type} - ${o.action}`);
      });
      console.log('  ✅ 通过\n');
      passed++;
    } catch (e) {
      console.log('  ❌ 失败:', e.message, '\n');
      failed++;
    }

    // 测试 4: 条件单类型验证
    console.log('测试 4: 条件单类型验证');
    try {
      const result = api.generateConditionalOrdersFromBacktest(
        mockOptimizationResult,
        mockGridConfig,
        { ts_code: '600519.SH', stock_name: '贵州茅台', account_id: 1 }
      );

      const orderTypes = result.orders.map(o => o.order_type);
      assert(orderTypes.includes('stop_loss'), '应包含止损条件单');

      // 检查核心仓条件单
      if (mockOptimizationResult.bestAllocation.coreWeight > 0) {
        assert(orderTypes.includes('core_entry'), '应包含核心仓入场条件单');
      }

      // 检查卫星仓条件单
      if (mockOptimizationResult.bestAllocation.satelliteWeight > 0) {
        assert(orderTypes.includes('satellite_entry'), '应包含卫星仓入场条件单');
      }

      console.log('  条件单类型:', orderTypes.join(', '));
      console.log('  ✅ 通过\n');
      passed++;
    } catch (e) {
      console.log('  ❌ 失败:', e.message, '\n');
      failed++;
    }

    // 测试 5: 止损条件参数验证
    console.log('测试 5: 止损条件参数验证');
    try {
      const result = api.generateConditionalOrdersFromBacktest(
        mockOptimizationResult,
        mockGridConfig,
        { ts_code: '600519.SH', stock_name: '贵州茅台', account_id: 1 }
      );

      const stopLossOrder = result.orders.find(o => o.order_type === 'stop_loss');
      assert(stopLossOrder, '应包含止损条件单');
      assert(stopLossOrder.action === 'sell', '止损应为卖出');
      assert(stopLossOrder.conditions.length > 0, '应有触发条件');

      const condition = stopLossOrder.conditions[0];
      assert(condition.trigger_type === 'daily_loss', '应为日跌条件');
      assert(condition.params.percent > 0, '跌幅应为正数');

      console.log(`  止损阈值: ${condition.params.percent}%`);
      console.log('  ✅ 通过\n');
      passed++;
    } catch (e) {
      console.log('  ❌ 失败:', e.message, '\n');
      failed++;
    }

    // 测试 6: 无效数据处理
    console.log('测试 6: 无效数据处理');
    try {
      let errorCaught = false;
      try {
        api.generateConditionalOrdersFromBacktest(
          null,
          mockGridConfig,
          { ts_code: '600519.SH', stock_name: '贵州茅台' }
        );
      } catch (e) {
        errorCaught = true;
        assert(e.message.includes('无效') || e.message.includes('未完成'), '应抛出正确的错误信息');
      }
      assert(errorCaught, '应抛出错误');
      console.log('  ✅ 通过\n');
      passed++;
    } catch (e) {
      console.log('  ❌ 失败:', e.message, '\n');
      failed++;
    }

    // 测试 7: 仓位比例计算
    console.log('测试 7: 仓位比例计算');
    try {
      const result = api.generateConditionalOrdersFromBacktest(
        mockOptimizationResult,
        mockGridConfig,
        { ts_code: '600519.SH', stock_name: '贵州茅台', account_id: 1 }
      );

      const coreOrder = result.orders.find(o => o.order_type === 'core_entry');
      const satelliteOrder = result.orders.find(o => o.order_type === 'satellite_entry');

      if (coreOrder) {
        const expectedCorePct = Math.round(mockOptimizationResult.bestAllocation.coreWeight * 100);
        assert(coreOrder.position_pct === expectedCorePct, `核心仓仓位应为 ${expectedCorePct}%`);
        console.log(`  核心仓仓位: ${coreOrder.position_pct}%`);
      }

      if (satelliteOrder) {
        const expectedSatPct = Math.round(mockOptimizationResult.bestAllocation.satelliteWeight * 100);
        assert(satelliteOrder.position_pct === expectedSatPct, `卫星仓仓位应为 ${expectedSatPct}%`);
        console.log(`  卫星仓仓位: ${satelliteOrder.position_pct}%`);
      }

      console.log('  ✅ 通过\n');
      passed++;
    } catch (e) {
      console.log('  ❌ 失败:', e.message, '\n');
      failed++;
    }

  } finally {
    cleanup();
  }

  // 输出结果
  console.log('=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

// 运行测试
runTests().catch(console.error);