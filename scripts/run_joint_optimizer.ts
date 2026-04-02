#!/usr/bin/env node
/**
 * 联合优化器命令行脚本
 * TASK_V3_301
 *
 * 使用方式：
 *   node scripts/run_joint_optimizer.mjs --base cache/base_equity.json --grid cache/grid_excess_return.json
 *   node scripts/run_joint_optimizer.mjs --help
 *
 * 输入文件：
 *   --base, -b    基础净值曲线文件路径（必需）
 *   --grid, -g    网格超额收益曲线文件路径（可选）
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    baseEquityPath: null,
    gridExcessPath: null,
    coreMin: 50,
    coreMax: 95,
    coreStep: 5,
    maxDrawdown: 20,
    output: 'json',
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--base':
      case '-b':
        params.baseEquityPath = args[++i];
        break;
      case '--grid':
      case '-g':
        params.gridExcessPath = args[++i];
        break;
      case '--core-min':
        {
          const val = parseInt(args[++i], 10);
          params.coreMin = isNaN(val) ? 50 : val;
        }
        break;
      case '--core-max':
        {
          const val = parseInt(args[++i], 10);
          params.coreMax = isNaN(val) ? 95 : val;
        }
        break;
      case '--core-step':
        {
          const val = parseInt(args[++i], 10);
          params.coreStep = isNaN(val) ? 5 : val;
        }
        break;
      case '--max-drawdown':
        {
          const val = parseInt(args[++i], 10);
          params.maxDrawdown = isNaN(val) ? 20 : val;
        }
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
联合优化器命令行工具
TASK_V3_301 - 三目标协同优化（数学组合）

使用方式:
  node scripts/run_joint_optimizer.mjs --base <文件路径> [选项]

必需参数:
  --base, -b <路径>        基础净值曲线文件路径

可选参数:
  --grid, -g <路径>        网格超额收益曲线文件路径
  --output, -o <format>    输出格式: json, table, markdown (默认: json)
  --help, -h               显示帮助信息

仓位比例参数:
  --core-min <percent>     核心仓最小比例 (默认: 50%)
  --core-max <percent>     核心仓最大比例 (默认: 95%)
  --core-step <percent>    核心仓比例步长 (默认: 5%)

约束条件:
  --max-drawdown <percent> 最大回撤约束 (默认: 20%)

示例:
  # 基础用法
  node scripts/run_joint_optimizer.mjs -b cache/base_equity.json

  # 包含网格超额收益
  node scripts/run_joint_optimizer.mjs -b cache/base_equity.json -g cache/grid_excess_return.json

  # 自定义仓位比例范围
  node scripts/run_joint_optimizer.mjs -b cache/base_equity.json \\
    --core-min 60 --core-max 90 --core-step 10

  # 自定义回撤约束
  node scripts/run_joint_optimizer.mjs -b cache/base_equity.json --max-drawdown 15

输入文件格式:
  JSON 数组或包含以下字段的对象：
  - equityCurve: 净值曲线数组
  - values: 净值曲线数组
  - 或直接是数组

输出:
  - cache/joint_optimization.json - 优化结果
  - report/joint_optimizer/result_{timestamp}.md - 优化报告

计算公式:
  联合净值 = 核心仓比例 × 基础净值 + 卫星仓比例 × (基础净值 + 网格超额)

优化目标:
  - 目标: 最大化夏普比率
  - 约束: 最大回撤 ≤ 设定阈值
`);
}

function formatOutput(result, format) {
  if (!result || !result.bestAllocation) {
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
  const { bestAllocation, bestMetrics, allResults, elapsed_ms, totalCombinations, validCombinations, constraints } = result;

  let md = `# 联合优化器结果

## 最优仓位配比

| 配置项 | 值 |
|--------|------|
| 核心仓比例 | ${bestAllocation.coreWeightPercent} |
| 卫星仓比例 | ${bestAllocation.satelliteWeightPercent} |

## 绩效指标

| 指标 | 数值 |
|------|------|
| 夏普比率 | ${bestMetrics.sharpeRatio.toFixed(4)} |
| 最大回撤 | ${(bestMetrics.maxDrawdown * 100).toFixed(2)}% |
| 年化收益率 | ${(bestMetrics.annualizedReturn * 100).toFixed(2)}% |
| 卡玛比率 | ${bestMetrics.calmarRatio.toFixed(4)} |
| 总收益率 | ${(bestMetrics.totalReturn * 100).toFixed(2)}% |

## 优化统计

- **计算耗时**: ${elapsed_ms}ms
- **组合总数**: ${totalCombinations}
- **有效组合**: ${validCombinations}
- **约束条件**: 最大回撤 ≤ ${(constraints.maxDrawdown * 100).toFixed(0)}%

## 所有组合结果

| 核心仓 | 卫星仓 | 夏普比率 | 最大回撤 | 年化收益 | 有效 |
|--------|--------|----------|----------|----------|------|
`;

  for (const r of allResults) {
    const valid = r.valid ? '✅' : '❌';
    md += `| ${(r.coreWeight * 100).toFixed(0)}% | ${(r.satelliteWeight * 100).toFixed(0)}% | ${r.metrics?.sharpeRatio?.toFixed(4) || 'N/A'} | ${((r.metrics?.maxDrawdown || 0) * 100).toFixed(2)}% | ${((r.metrics?.annualizedReturn || 0) * 100).toFixed(2)}% | ${valid} |\n`;
  }

  md += `
---
*生成时间: ${new Date().toLocaleString('zh-CN')}*
*任务: TASK_V3_301*
`;

  return md;
}

function formatTable(result) {
  const { bestAllocation, bestMetrics, elapsed_ms, totalCombinations, validCombinations } = result;

  let output = '\n========================================\n';
  output += '       联合优化器结果\n';
  output += '       TASK_V3_301\n';
  output += '========================================\n\n';

  output += '【最优仓位配比】\n';
  output += `  核心仓比例:  ${bestAllocation.coreWeightPercent}\n`;
  output += `  卫星仓比例:  ${bestAllocation.satelliteWeightPercent}\n\n`;

  output += '【绩效指标】\n';
  output += `  夏普比率:    ${bestMetrics.sharpeRatio.toFixed(4)}\n`;
  output += `  最大回撤:    ${(bestMetrics.maxDrawdown * 100).toFixed(2)}%\n`;
  output += `  年化收益:    ${(bestMetrics.annualizedReturn * 100).toFixed(2)}%\n`;
  output += `  卡玛比率:    ${bestMetrics.calmarRatio.toFixed(4)}\n`;
  output += `  总收益率:    ${(bestMetrics.totalReturn * 100).toFixed(2)}%\n\n`;

  output += `耗时: ${elapsed_ms}ms | 组合: ${validCombinations}/${totalCombinations}\n`;
  output += '========================================\n';

  return output;
}

async function main() {
  const params = parseArgs();

  if (params.help) {
    showHelp();
    process.exit(0);
  }

  if (!params.baseEquityPath) {
    console.error('错误: 必须提供 --base 参数');
    console.error('使用 --help 查看帮助');
    process.exit(1);
  }

  console.log('========================================');
  console.log('       联合优化器（数学组合）');
  console.log('       TASK_V3_301');
  console.log('========================================\n');

  console.log(`基础净值曲线: ${params.baseEquityPath}`);
  console.log(`网格超额收益: ${params.gridExcessPath || '未提供'}`);
  console.log(`核心仓范围: ${params.coreMin}% - ${params.coreMax}% (步长 ${params.coreStep}%)`);
  console.log(`最大回撤约束: ≤ ${params.maxDrawdown}%`);
  console.log('');

  try {
    // 加载优化器模块
    const apiDir = join(__dirname, '..', 'api');
    const {
      JointOptimizer,
      generateWeightCombinations,
      saveResult,
      generateReport
    } = require(join(apiDir, 'joint-optimizer.js'));

    // 计算组合数量
    const weightRange = {
      min: params.coreMin / 100,
      max: params.coreMax / 100,
      step: params.coreStep / 100
    };
    const combinations = generateWeightCombinations(weightRange);
    console.log(`[优化器] 共 ${combinations.length} 种仓位比例组合\n`);

    // 创建优化器
    const optimizer = new JointOptimizer({
      weightRange,
      constraints: {
        maxDrawdown: params.maxDrawdown / 100
      }
    });

    // 加载数据
    console.log('[加载数据]');
    optimizer.loadBaseEquity(params.baseEquityPath);

    if (params.gridExcessPath) {
      optimizer.loadGridExcess(params.gridExcessPath);
    }

    console.log('\n[开始优化]\n');

    // 运行优化
    const result = optimizer.optimize();

    // 输出结果
    console.log('\n[优化完成]\n');
    console.log(formatOutput(result, params.output));

    // 保存结果到缓存目录
    const cacheDir = join(__dirname, '..', 'cache');
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    const cachePath = join(cacheDir, 'joint_optimization.json');
    saveResult(result, cachePath);
    console.log(`\n结果已保存到: ${cachePath}`);

    // 保存 Markdown 报告
    const reportDir = join(__dirname, '..', 'report', 'joint-optimizer');
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }
    const timestamp = Date.now();
    const reportPath = join(reportDir, `result_${timestamp}.md`);
    writeFileSync(reportPath, generateReport(result));
    console.log(`报告已保存到: ${reportPath}`);

    process.exit(0);

  } catch (error) {
    console.error('\n[优化失败]', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();