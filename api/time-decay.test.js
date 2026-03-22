/**
 * 时间衰减函数模块测试
 */

const { calculateDecayFactor, getHalfLife, createDecayCurve, getDecayStats } = require('./time-decay');

// 测试用例
function runTests() {
  console.log('=== 时间衰减函数模块测试 ===\n');
  
  let passed = 0;
  let failed = 0;

  // 测试 1: 即时数据无衰减
  console.log('测试 1: 即时数据无衰减');
  try {
    const now = Date.now();
    const factor = calculateDecayFactor(now, 'news');
    
    if (factor >= 0.99 && factor <= 1.0) {
      console.log(`✅ 通过（衰减因子=${factor.toFixed(4)}）\n`);
      passed++;
    } else {
      console.log(`❌ 失败：衰减因子=${factor.toFixed(4)}，预期≈1.0\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 测试 2: 新闻 12 小时后衰减到 0.5
  console.log('测试 2: 新闻 12 小时后衰减到 0.5');
  try {
    const twelveHoursAgo = Date.now() - (12 * 60 * 60 * 1000);
    const factor = calculateDecayFactor(twelveHoursAgo, 'news');
    
    if (factor >= 0.45 && factor <= 0.55) {
      console.log(`✅ 通过（衰减因子=${factor.toFixed(4)}）\n`);
      passed++;
    } else {
      console.log(`❌ 失败：衰减因子=${factor.toFixed(4)}，预期≈0.5\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 测试 3: 公告 5 天后衰减到 0.5
  console.log('测试 3: 公告 5 天后衰减到 0.5');
  try {
    const fiveDaysAgo = Date.now() - (5 * 24 * 60 * 60 * 1000);
    const factor = calculateDecayFactor(fiveDaysAgo, 'announcement');
    
    if (factor >= 0.45 && factor <= 0.55) {
      console.log(`✅ 通过（衰减因子=${factor.toFixed(4)}）\n`);
      passed++;
    } else {
      console.log(`❌ 失败：衰减因子=${factor.toFixed(4)}，预期≈0.5\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 测试 4: 半衰期配置正确
  console.log('测试 4: 半衰期配置正确');
  try {
    const halfLives = {
      news: 12,
      announcement: 120,
      earnings: 720,
      major_event: 48,
    };
    
    let allCorrect = true;
    for (const [type, expected] of Object.entries(halfLives)) {
      const actual = getHalfLife(type);
      if (actual !== expected) {
        console.log(`  ❌ ${type}: ${actual}小时，预期${expected}小时`);
        allCorrect = false;
      }
    }
    
    if (allCorrect) {
      console.log('✅ 通过（所有半衰期配置正确）\n');
      passed++;
    } else {
      console.log('\n');
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 测试 5: 自定义衰减曲线
  console.log('测试 5: 自定义衰减曲线');
  try {
    const curve = createDecayCurve({ curve: 'linear', halfLife: 24, minFactor: 0.1 });
    const config = curve.getConfig();
    
    if (config.curve === 'linear' && config.halfLife === 24 && config.minFactor === 0.1) {
      console.log('✅ 通过（自定义曲线配置正确）\n');
      passed++;
    } else {
      console.log(`❌ 失败：${JSON.stringify(config)}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 统计测试
  console.log('=== 测试统计 ===');
  console.log(`通过：${passed}/${passed + failed}`);
  console.log(`失败：${failed}/${passed + failed}`);
  
  const stats = getDecayStats();
  console.log(`\n衰减配置：`);
  console.log(`  新闻：${stats.config.news}小时`);
  console.log(`  公告：${stats.config.announcement}小时`);
  console.log(`  财报：${stats.config.earnings}小时`);
  console.log(`  默认：${stats.config.default}小时`);
  
  return failed === 0;
}

// 导出测试函数
module.exports = { runTests };

// 如果直接运行
if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}
