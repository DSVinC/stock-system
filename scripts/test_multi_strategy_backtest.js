/**
 * 多策略回测测试脚本
 * 测试 TASK_V4_025 实现的多策略模板回测功能
 */

const MultiStrategyBacktestEngine = require('../api/backtest-multi-strategy');

async function testMultiStrategyBacktest() {
  console.log('='.repeat(60));
  console.log('多策略回测引擎测试');
  console.log('='.repeat(60));

  // 测试配置
  const config = {
    initialCapital: 1000000,
    commissionRate: 0.00025,
    minCommission: 5,
    positionLimit: 10
  };

  const testParams = {
    startDate: '2024-01-01',
    endDate: '2024-03-31' // 测试用较短时间范围
  };

  // 测试 1: 单策略回测（默认策略）
  console.log('\n📊 测试 1: 单策略回测（默认策略）');
  console.log('-'.repeat(40));

  try {
    const engine1 = new MultiStrategyBacktestEngine(config);
    engine1.addStrategy({ templateId: 'DEFAULT', weight: 1.0 });

    const result1 = await engine1.run(testParams);

    if (result1.success) {
      console.log('✅ 单策略回测成功');
      console.log(`   总收益率: ${(result1.summary.totalReturn * 100).toFixed(2)}%`);
      console.log(`   年化收益: ${(result1.summary.annualizedReturn * 100).toFixed(2)}%`);
      console.log(`   最大回撤: ${(result1.summary.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`   夏普比率: ${result1.summary.sharpeRatio.toFixed(3)}`);
    } else {
      console.log('❌ 单策略回测失败:', result1.error);
    }
  } catch (error) {
    console.log('❌ 单策略回测异常:', error.message);
  }

  // 测试 2: 单策略回测（指定模板）
  console.log('\n📊 测试 2: 单策略回测（CORE_FACTOR_V1 模板）');
  console.log('-'.repeat(40));

  try {
    const engine2 = new MultiStrategyBacktestEngine(config);
    engine2.addStrategy({ templateId: 'CORE_FACTOR_V1', weight: 1.0 });

    const result2 = await engine2.run(testParams);

    if (result2.success) {
      console.log('✅ CORE_FACTOR_V1 策略回测成功');
      console.log(`   总收益率: ${(result2.summary.totalReturn * 100).toFixed(2)}%`);
      console.log(`   年化收益: ${(result2.summary.annualizedReturn * 100).toFixed(2)}%`);
    } else {
      console.log('❌ CORE_FACTOR_V1 策略回测失败:', result2.error);
    }
  } catch (error) {
    console.log('❌ CORE_FACTOR_V1 策略回测异常:', error.message);
  }

  // 测试 3: 多策略组合回测
  console.log('\n📊 测试 3: 多策略组合回测');
  console.log('-'.repeat(40));

  try {
    const engine3 = new MultiStrategyBacktestEngine(config);
    engine3.setStrategies([
      { templateId: 'CORE_FACTOR_V1', weight: 0.5 },
      { templateId: 'MONEYFLOW_V1', weight: 0.3 },
      { templateId: 'ROTATION_V1', weight: 0.2 }
    ]);

    const result3 = await engine3.run(testParams);

    if (result3.success) {
      console.log('✅ 多策略组合回测成功');
      console.log(`   总收益率: ${(result3.summary.totalReturn * 100).toFixed(2)}%`);
      console.log(`   年化收益: ${(result3.summary.annualizedReturn * 100).toFixed(2)}%`);
      console.log(`   最大回撤: ${(result3.summary.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`   夏普比率: ${result3.summary.sharpeRatio.toFixed(3)}`);
      console.log(`   总交易次数: ${result3.summary.totalTrades}`);

      console.log('\n   策略贡献度:');
      for (const contrib of result3.strategyContributions) {
        console.log(`   - ${contrib.name}: 权重 ${(contrib.weight * 100).toFixed(0)}%, 收益 ${(contrib.return * 100).toFixed(2)}%, 贡献 ${(contrib.contribution * 100).toFixed(2)}%`);
      }
    } else {
      console.log('❌ 多策略组合回测失败:', result3.error);
    }
  } catch (error) {
    console.log('❌ 多策略组合回测异常:', error.message);
  }

  // 测试 4: 策略参数覆盖
  console.log('\n📊 测试 4: 策略参数覆盖');
  console.log('-'.repeat(40));

  try {
    const engine4 = new MultiStrategyBacktestEngine(config);
    engine4.addStrategy({
      templateId: 'CORE_FACTOR_V1',
      weight: 1.0,
      customParams: {
        selection: {
          peMax: 100, // 放宽 PE 限制
          minSevenFactorScore: 0.6 // 降低因子得分门槛
        }
      }
    });

    const result4 = await engine4.run(testParams);

    if (result4.success) {
      console.log('✅ 自定义参数策略回测成功');
      console.log(`   总收益率: ${(result4.summary.totalReturn * 100).toFixed(2)}%`);
      console.log(`   总交易次数: ${result4.summary.totalTrades}`);
    } else {
      console.log('❌ 自定义参数策略回测失败:', result4.error);
    }
  } catch (error) {
    console.log('❌ 自定义参数策略回测异常:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));

  process.exit(0);
}

// 运行测试
testMultiStrategyBacktest().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});