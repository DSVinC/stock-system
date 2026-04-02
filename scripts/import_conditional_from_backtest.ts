/**
 * 导入脚本：从回测结果创建条件单
 * TASK_V3_401
 *
 * 用法：node scripts/import_conditional_from_backtest.mjs [options]
 *
 * 选项：
 *   --stock <code>    股票代码（必填，如 600519.SH）
 *   --name <name>     股票名称
 *   --account <id>    账户ID（默认 1）
 *   --types <types>   条件单类型，逗号分隔（默认全部）
 *   --dry-run         预览模式，不实际创建
 */

const fs = require('fs');
const path = require('path');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    stock: null,
    name: null,
    account: 1,
    types: null,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--stock':
        options.stock = args[++i];
        break;
      case '--name':
        options.name = args[++i];
        break;
      case '--account':
        options.account = parseInt(args[++i]);
        break;
      case '--types':
        options.types = args[++i].split(',');
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
导入脚本：从回测结果创建条件单

用法：node scripts/import_conditional_from_backtest.mjs [options]

选项：
  --stock <code>    股票代码（必填，如 600519.SH）
  --name <name>     股票名称
  --account <id>    账户ID（默认 1）
  --types <types>   条件单类型，逗号分隔（默认全部）
                    可选值：core_entry, satellite_entry, stop_loss, take_profit
  --dry-run         预览模式，不实际创建
  --help            显示帮助信息

示例：
  node scripts/import_conditional_from_backtest.mjs --stock 600519.SH --name 贵州茅台
  node scripts/import_conditional_from_backtest.mjs --stock 600519.SH --types stop_loss,take_profit --dry-run
        `);
        process.exit(0);
    }
  }

  return options;
}

// 读取缓存文件
function readCacheFile(filename) {
  const cachePath = path.join(__dirname, '..', 'cache', filename);
  if (!fs.existsSync(cachePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch (e) {
    console.error(`读取缓存文件失败: ${filename}`, e.message);
    return null;
  }
}

// 生成条件单配置
function generateOrders(optimization, gridConfig, options) {
  const { stock, name, account, types } = options;
  const { bestAllocation, bestMetrics } = optimization;

  const orders = [];

  // 核心仓买入
  if (bestAllocation.coreWeight > 0) {
    if (!types || types.includes('core_entry')) {
      orders.push({
        type: 'core_entry',
        action: 'buy',
        position_pct: Math.round(bestAllocation.coreWeight * 100),
        condition: 'MA金叉 (5日上穿20日)',
        reason: `核心仓配置 - 夏普比率: ${bestMetrics.sharpeRatio.toFixed(2)}`
      });
    }
  }

  // 卫星仓买入
  if (bestAllocation.satelliteWeight > 0 && gridConfig) {
    if (!types || types.includes('satellite_entry')) {
      const gridStep = (gridConfig.grid_config?.grid_step || 0.012) * 100;
      orders.push({
        type: 'satellite_entry',
        action: 'buy',
        position_pct: Math.round(bestAllocation.satelliteWeight * 100),
        condition: `日跌 ${gridStep.toFixed(1)}%`,
        reason: `卫星仓配置 - 网格步长: ${gridStep.toFixed(1)}%`
      });
    }
  }

  // 止损
  if (!types || types.includes('stop_loss')) {
    const stopLossPct = Math.max(8, Math.round(bestMetrics.maxDrawdown * 100 * 1.5));
    orders.push({
      type: 'stop_loss',
      action: 'sell',
      position_pct: 100,
      condition: `日跌 ${stopLossPct}%`,
      reason: `风险控制 - 基于最大回撤 ${((bestMetrics.maxDrawdown || 0.1) * 100).toFixed(2)}%`
    });
  }

  // 止盈
  if (!types || types.includes('take_profit')) {
    const targetReturn = bestMetrics.totalReturn * 0.8;
    if (targetReturn > 0.1) {
      orders.push({
        type: 'take_profit',
        action: 'sell',
        position_pct: 50,
        condition: `日涨 ${Math.round(targetReturn * 100)}%`,
        reason: `止盈目标 - 基于历史收益 ${((bestMetrics.totalReturn || 0) * 100).toFixed(2)}%`
      });
    }
  }

  return orders;
}

// 主函数
async function main() {
  const options = parseArgs();

  if (!options.stock) {
    console.error('错误: 必须指定股票代码 (--stock)');
    console.log('使用 --help 查看帮助');
    process.exit(1);
  }

  console.log('=== 回测结果导入条件单 ===');
  console.log(`股票代码: ${options.stock}`);
  console.log(`股票名称: ${options.name || '未知'}`);
  console.log(`账户ID: ${options.account}`);
  console.log(`模式: ${options.dryRun ? '预览' : '实际创建'}`);
  console.log('');

  // 读取缓存
  const optimization = readCacheFile('joint_optimization.json');
  const gridConfig = readCacheFile('grid_excess_return.json');

  if (!optimization) {
    console.error('错误: 未找到回测优化结果 (cache/joint_optimization.json)');
    console.log('请先运行联合优化器: node scripts/run_joint_optimizer.mjs');
    process.exit(1);
  }

  console.log('=== 优化结果摘要 ===');
  console.log(`状态: ${optimization.status}`);
  console.log(`核心仓比例: ${optimization.bestAllocation.coreWeightPercent}`);
  console.log(`卫星仓比例: ${optimization.bestAllocation.satelliteWeightPercent}`);
  console.log(`夏普比率: ${optimization.bestMetrics.sharpeRatio.toFixed(2)}`);
  console.log(`最大回撤: ${(optimization.bestMetrics.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`年化收益: ${(optimization.bestMetrics.annualizedReturn * 100).toFixed(2)}%`);
  console.log('');

  // 生成条件单
  const orders = generateOrders(optimization, gridConfig, options);

  console.log('=== 待创建条件单 ===');
  orders.forEach((order, i) => {
    console.log(`${i + 1}. [${order.type}] ${order.action === 'buy' ? '买入' : '卖出'}`);
    console.log(`   触发条件: ${order.condition}`);
    console.log(`   仓位/数量: ${order.position_pct}%`);
    console.log(`   原因: ${order.reason}`);
    console.log('');
  });

  if (options.dryRun) {
    console.log('=== 预览模式，未实际创建条件单 ===');
    return;
  }

  // 调用 API 创建条件单
  try {
    const response = await fetch('http://127.0.0.1:3000/api/backtest-to-conditional/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ts_code: options.stock,
        stock_name: options.name,
        account_id: options.account,
        order_types: options.types
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log('=== 导入结果 ===');
      console.log(`总计: ${result.data.total}`);
      console.log(`成功: ${result.data.success}`);
      console.log(`失败: ${result.data.failed}`);
      console.log('');
      result.data.orders.forEach((order, i) => {
        if (order.error) {
          console.log(`❌ ${order.order_type}: ${order.error}`);
        } else {
          console.log(`✅ ${order.order_type} (ID: ${order.id})`);
        }
      });
    } else {
      console.error('导入失败:', result.error);
    }
  } catch (error) {
    console.error('请求 API 失败:', error.message);
    console.log('请确保服务已启动: npm run start');
  }
}

main().catch(console.error);