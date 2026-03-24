/**
 * 导入脚本：从回测结果推荐到监控池
 * TASK_V3_402
 *
 * 用法：node scripts/import_monitor_from_backtest.mjs [options]
 *
 * 选项：
 *   --stock <code>    股票代码（必填）
 *   --name <name>     股票名称
 *   --dry-run         预览模式，不实际添加
 */

const fs = require('fs');
const path = require('path');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    stocks: [],
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--stock':
        options.stocks.push({
          ts_code: args[++i],
          stock_name: args[++i] || ''
        });
        break;
      case '--name':
        if (options.stocks.length > 0) {
          options.stocks[options.stocks.length - 1].stock_name = args[++i];
        }
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
导入脚本：从回测结果推荐到监控池

用法：node scripts/import_monitor_from_backtest.mjs [options]

选项：
  --stock <code> <name>  股票代码和名称（可多次指定）
  --dry-run              预览模式，不实际添加
  --help                 显示帮助信息

示例：
  node scripts/import_monitor_from_backtest.mjs --stock 600519.SH 贵州茅台
  node scripts/import_monitor_from_backtest.mjs --stock 600519.SH 贵州茅台 --stock 000858.SZ 五粮液
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

// 评估推荐
function evaluateRecommendation(metrics) {
  const reasons = [];
  let score = 0;

  if (metrics.sharpeRatio >= 1.0) {
    reasons.push(`夏普比率优秀 (${metrics.sharpeRatio.toFixed(2)})`);
    score += 30;
  } else if (metrics.sharpeRatio >= 0.5) {
    reasons.push(`夏普比率良好 (${metrics.sharpeRatio.toFixed(2)})`);
    score += 15;
  }

  if (metrics.maxDrawdown <= 0.25) {
    reasons.push(`回撤控制良好 (${(metrics.maxDrawdown * 100).toFixed(2)}%)`);
    score += 25;
  }

  if (metrics.annualizedReturn >= 0.10) {
    reasons.push(`年化收益达标 (${(metrics.annualizedReturn * 100).toFixed(2)}%)`);
    score += 25;
  }

  if (metrics.calmarRatio >= 3) {
    reasons.push(`卡玛比率优秀 (${metrics.calmarRatio.toFixed(2)})`);
    score += 20;
  }

  return { recommend: score >= 40, score, reasons };
}

// 生成推荐原因
function generateReason(optimization, gridConfig) {
  const { bestAllocation, bestMetrics } = optimization;
  const parts = [];

  parts.push(`联合优化推荐`);
  parts.push(`核心仓${bestAllocation.coreWeightPercent}/卫星仓${bestAllocation.satelliteWeightPercent}`);
  parts.push(`夏普比率${bestMetrics.sharpeRatio.toFixed(2)}`);
  parts.push(`最大回撤${(bestMetrics.maxDrawdown * 100).toFixed(2)}%`);
  parts.push(`年化收益${(bestMetrics.annualizedReturn * 100).toFixed(2)}%`);

  if (gridConfig && gridConfig.grid_config) {
    parts.push(`网格步长${((gridConfig.grid_config.grid_step || 0.012) * 100).toFixed(1)}%`);
  }

  return parts.join(' | ');
}

// 主函数
async function main() {
  const options = parseArgs();

  if (options.stocks.length === 0) {
    console.error('错误: 必须指定至少一只股票');
    console.log('使用 --help 查看帮助');
    process.exit(1);
  }

  console.log('=== 回测结果推荐到监控池 ===');
  console.log(`股票数量: ${options.stocks.length}`);
  console.log(`模式: ${options.dryRun ? '预览' : '实际添加'}`);
  console.log('');

  // 读取缓存
  const optimization = readCacheFile('joint_optimization.json');
  const gridConfig = readCacheFile('grid_excess_return.json');

  if (!optimization) {
    console.error('错误: 未找到回测优化结果');
    process.exit(1);
  }

  const evaluation = evaluateRecommendation(optimization.bestMetrics);
  const reason = generateReason(optimization, gridConfig);

  console.log('=== 优化结果评估 ===');
  console.log(`推荐评分: ${evaluation.score}/100`);
  console.log(`是否推荐: ${evaluation.recommend ? '✅ 是' : '❌ 否'}`);
  console.log(`推荐原因:`);
  evaluation.reasons.forEach(r => console.log(`  - ${r}`));
  console.log('');

  console.log('=== 推荐详情 ===');
  options.stocks.forEach(stock => {
    console.log(`股票: ${stock.stock_name || '未知'} (${stock.ts_code})`);
    console.log(`原因: ${reason}`);
    console.log('');
  });

  if (options.dryRun) {
    console.log('=== 预览模式，未实际添加到监控池 ===');
    return;
  }

  // 调用 API
  try {
    const response = await fetch('http://127.0.0.1:3000/api/backtest-to-monitor/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stocks: options.stocks
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log('=== 导入结果 ===');
      console.log(`总计: ${result.data.total}`);
      console.log(`新增: ${result.data.added}`);
      console.log(`更新: ${result.data.updated}`);
      console.log(`失败: ${result.data.failed}`);
      console.log('');
      result.data.details.forEach(detail => {
        if (detail.status === 'success') {
          console.log(`✅ ${detail.stock_name || detail.stock_code}: ${detail.added ? '已添加' : '已更新'}`);
        } else {
          console.log(`❌ ${detail.stock_name || detail.stock_code}: ${detail.error}`);
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