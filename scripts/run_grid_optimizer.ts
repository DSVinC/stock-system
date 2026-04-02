#!/usr/bin/env node
/**
 * 网格参数优化命令行脚本
 * TASK_V3_204
 *
 * 使用方式：
 *   node scripts/run_grid_optimizer.mjs --start 2025-01-01 --end 2025-03-31 --stock 000001.SZ
 *   node scripts/run_grid_optimizer.mjs --help
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    startDate: null,
    endDate: null,
    stock: null,
    parallel: 4,
    gridStepMin: 0.5,
    gridStepMax: 2.0,
    gridStepStep: 0.1,
    positionMin: 10,
    positionMax: 50,
    positionStep: 5,
    gridCountMin: 5,
    gridCountMax: 10,
    gridCountStep: 1,
    output: 'json',
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--start':
      case '-s':
        params.startDate = args[++i];
        break;
      case '--end':
      case '-e':
        params.endDate = args[++i];
        break;
      case '--stock':
      case '-S':
        params.stock = args[++i];
        break;
      case '--parallel':
      case '-p':
        params.parallel = parseInt(args[++i], 10) || 4;
        break;
      case '--grid-step-min':
        params.gridStepMin = parseFloat(args[++i]) || 0.5;
        break;
      case '--grid-step-max':
        params.gridStepMax = parseFloat(args[++i]) || 2.0;
        break;
      case '--grid-step-step':
        params.gridStepStep = parseFloat(args[++i]) || 0.1;
        break;
      case '--position-min':
        params.positionMin = parseInt(args[++i], 10) || 10;
        break;
      case '--position-max':
        params.positionMax = parseInt(args[++i], 10) || 50;
        break;
      case '--position-step':
        params.positionStep = parseInt(args[++i], 10) || 5;
        break;
      case '--grid-count-min':
        params.gridCountMin = parseInt(args[++i], 10) || 5;
        break;
      case '--grid-count-max':
        params.gridCountMax = parseInt(args[++i], 10) || 10;
        break;
      case '--grid-count-step':
        params.gridCountStep = parseInt(args[++i], 10) || 1;
        break;
      case '--output':
      case '-o':
        params.output = args[++i] || 'json';
        break;
      case '--help':
      case '-h':
        params.help = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          console.warn(`未知参数: ${arg}`);
        }
    }
  }

  return params;
}

function showHelp() {
  console.log(`
网格交易参数优化工具
TASK_V3_204

使用方式:
  node scripts/run_grid_optimizer.mjs --start <日期> --end <日期> [选项]

必需参数:
  --start, -s <YYYY-MM-DD>    回测开始日期
  --end, -e <YYYY-MM-DD>      回测结束日期

可选参数:
  --stock, -S <code>          股票代码 (如: 000001.SZ)
  --parallel, -p <N>          并行线程数 (默认: 4)
  --output, -o <format>       输出格式: json, table, markdown (默认: json)
  --help, -h                  显示帮助信息

网格步长参数:
  --grid-step-min <value>     最小步长 (默认: 0.5%)
  --grid-step-max <value>     最大步长 (默认: 2.0%)
  --grid-step-step <value>    步长增量 (默认: 0.1%)

仓位比例参数:
  --position-min <value>      最小仓位 (默认: 10%)
  --position-max <value>      最大仓位 (默认: 50%)
  --position-step <value>     仓位增量 (默认: 5%)

网格数量参数:
  --grid-count-min <value>    最小网格数 (默认: 5)
  --grid-count-max <value>    最大网格数 (默认: 10)
  --grid-count-step <value>   网格数增量 (默认: 1)

示例:
  # 基础用法
  node scripts/run_grid_optimizer.mjs --start 2025-01-01 --end 2025-03-31

  # 指定股票
  node scripts/run_grid_optimizer.mjs -s 2025-01-01 -e 2025-03-31 -S 000001.SZ

  # 自定义参数范围
  node scripts/run_grid_optimizer.mjs -s 2025-01-01 -e 2025-03-31 \\
    --grid-step-min 0.8 --grid-step-max 1.5 --grid-step-step 0.1

  # 使用 4 核并行
  node scripts/run_grid_optimizer.mjs -s 2025-01-01 -e 2025-03-31 -p 4

优化目标:
  - 最大化收益率 (权重 0.4)
  - 最大化夏普比率 (权重 0.4)
  - 最小化最大回撤 (权重 -0.2)

参数空间:
  - 网格步长: 0.5% - 2.0%, 步长 0.1% (16 个值)
  - 仓位比例: 10% - 50%, 步长 5% (9 个值)
  - 网格数量: 5 - 10, 步长 1 (6 个值)
  - 总组合数: 16 × 9 × 6 = 864 种组合
`);
}

function formatOutput(result, format) {
  if (!result || !result.bestParams) {
    return '未找到有效的优化结果';
  }

  switch (format) {
    case 'markdown':
      return formatMarkdown(result);
    case 'table':
      return formatTable(result);
    default:
      return JSON.stringify(result, null, 2);
  }
}

function formatMarkdown(result) {
  const { bestParams, bestMetrics, elapsed_ms, totalCombinations, successCount, paretoFront } = result;

  let md = `# 网格参数优化结果

## 最优参数

| 参数 | 值 |
|------|------|
| 网格步长 | ${bestParams.gridStep}% |
| 仓位比例 | ${bestParams.positionRatio}% |
| 网格数量 | ${bestParams.gridCount} |

## 绩效指标

| 指标 | 数值 |
|------|------|
| 总收益率 | ${(bestMetrics.totalReturn * 100).toFixed(2)}% |
| 年化收益率 | ${(bestMetrics.annualizedReturn * 100).toFixed(2)}% |
| 夏普比率 | ${bestMetrics.sharpeRatio.toFixed(4)} |
| 最大回撤 | ${(bestMetrics.maxDrawdown * 100).toFixed(2)}% |
| 胜率 | ${(bestMetrics.winRate * 100).toFixed(1)}% |
| 交易次数 | ${bestMetrics.totalTrades} |

## 优化统计

- **耗时**: ${(elapsed_ms / 1000).toFixed(1)} 秒
- **参数组合数**: ${totalCombinations}
- **成功组合数**: ${successCount}
- **帕累托前沿解**: ${paretoFront?.length || 0} 个
`;

  if (paretoFront && paretoFront.length > 1) {
    md += `
## 帕累托前沿 (多目标优化)

| 网格步长 | 仓位比例 | 网格数量 | 收益率 | 夏普比率 | 最大回撤 |
|----------|----------|----------|--------|----------|----------|
`;
    for (const solution of paretoFront.slice(0, 10)) {
      md += `| ${solution.params.gridStep}% | ${solution.params.positionRatio}% | ${solution.params.gridCount} | ${(solution.metrics.totalReturn * 100).toFixed(2)}% | ${solution.metrics.sharpeRatio.toFixed(4)} | ${(solution.metrics.maxDrawdown * 100).toFixed(2)}% |
`;
    }
  }

  md += `
---
*生成时间: ${new Date().toLocaleString('zh-CN')}*
`;

  return md;
}

function formatTable(result) {
  const { bestParams, bestMetrics, elapsed_ms, totalCombinations, successCount } = result;

  let output = '\n========================================\n';
  output += '       网格参数优化结果\n';
  output += '========================================\n\n';

  output += '【最优参数】\n';
  output += `  网格步长:  ${bestParams.gridStep}%\n`;
  output += `  仓位比例:  ${bestParams.positionRatio}%\n`;
  output += `  网格数量:  ${bestParams.gridCount}\n\n`;

  output += '【绩效指标】\n';
  output += `  总收益率:  ${(bestMetrics.totalReturn * 100).toFixed(2)}%\n`;
  output += `  年化收益:  ${(bestMetrics.annualizedReturn * 100).toFixed(2)}%\n`;
  output += `  夏普比率:  ${bestMetrics.sharpeRatio.toFixed(4)}\n`;
  output += `  最大回撤:  ${(bestMetrics.maxDrawdown * 100).toFixed(2)}%\n`;
  output += `  胜率:      ${(bestMetrics.winRate * 100).toFixed(1)}%\n`;
  output += `  交易次数:  ${bestMetrics.totalTrades}\n\n`;

  output += `耗时: ${(elapsed_ms / 1000).toFixed(1)}s | 组合: ${successCount}/${totalCombinations}\n`;
  output += '========================================\n';

  return output;
}

async function main() {
  const params = parseArgs();

  if (params.help) {
    showHelp();
    process.exit(0);
  }

  if (!params.startDate || !params.endDate) {
    console.error('错误: 必须提供 --start 和 --end 参数');
    console.error('使用 --help 查看帮助');
    process.exit(1);
  }

  console.log('========================================');
  console.log('       网格交易参数优化');
  console.log('       TASK_V3_204');
  console.log('========================================\n');

  console.log(`回测区间: ${params.startDate} ~ ${params.endDate}`);
  console.log(`股票代码: ${params.stock || '全市场'}`);
  console.log(`并行线程: ${params.parallel}`);
  console.log(`参数空间:`);
  console.log(`  网格步长: ${params.gridStepMin}% - ${params.gridStepMax}% (步长 ${params.gridStepStep}%)`);
  console.log(`  仓位比例: ${params.positionMin}% - ${params.positionMax}% (步长 ${params.positionStep}%)`);
  console.log(`  网格数量: ${params.gridCountMin} - ${params.gridCountMax} (步长 ${params.gridCountStep})`);
  console.log('');

  try {
    // 加载优化器模块
    const apiDir = join(__dirname, '..', 'api');
    const { GridOptimizer, generateAllCombinations } = require(join(apiDir, 'grid-optimizer.js'));

    // 计算组合数量
    const paramSpace = {
      gridStep: { min: params.gridStepMin, max: params.gridStepMax, step: params.gridStepStep },
      positionRatio: { min: params.positionMin, max: params.positionMax, step: params.positionStep },
      gridCount: { min: params.gridCountMin, max: params.gridCountMax, step: params.gridCountStep }
    };

    const combinations = generateAllCombinations(paramSpace);
    console.log(`[优化器] 共 ${combinations.length} 个参数组合\n`);

    // 创建优化器
    const optimizer = new GridOptimizer({
      parallelWorkers: params.parallel,
      parameterSpace: paramSpace
    });

    console.log('[开始优化]\n');

    // 运行优化
    const result = await optimizer.optimize({
      startDate: params.startDate,
      endDate: params.endDate,
      tsCode: params.stock,
      customParamSpace: paramSpace
    });

    // 输出结果
    console.log('\n[优化完成]\n');
    console.log(formatOutput(result, params.output));

    // 保存结果到文件
    if (params.output === 'json') {
      const outputDir = join(__dirname, '..', 'data', 'optimizer');
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = join(outputDir, `grid_optimizer_${Date.now()}.json`);
      writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n结果已保存到: ${outputPath}`);
    }

    // 保存 Markdown 报告
    const reportDir = join(__dirname, '..', 'report', 'grid-optimizer');
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }
    const reportPath = join(reportDir, `report_${Date.now()}.md`);
    writeFileSync(reportPath, formatMarkdown(result));
    console.log(`报告已保存到: ${reportPath}`);

    process.exit(0);

  } catch (error) {
    console.error('\n[优化失败]', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();