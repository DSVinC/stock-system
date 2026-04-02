#!/usr/bin/env node
/**
 * 贝叶斯优化命令行脚本
 * TASK_V3_102
 *
 * 使用方式：
 *   node scripts/run_optimizer.mjs --start 2025-01-01 --end 2025-12-31 --iterations 100
 *   node scripts/run_optimizer.mjs --help
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    startDate: null,
    endDate: null,
    iterations: 50,
    initial: 5,
    parallel: 3,
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
      case '--iterations':
      case '-i':
        params.iterations = parseInt(args[++i], 10) || 50;
        break;
      case '--initial':
        params.initial = parseInt(args[++i], 10) || 5;
        break;
      case '--parallel':
      case '-p':
        params.parallel = parseInt(args[++i], 10) || 3;
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
        console.warn(`未知参数: ${arg}`);
    }
  }

  return params;
}

function showHelp() {
  console.log(`
选股参数贝叶斯优化工具
TASK_V3_102

使用方式:
  node scripts/run_optimizer.mjs --start <日期> --end <日期> [选项]

必需参数:
  --start, -s <YYYY-MM-DD>    回测开始日期
  --end, -e <YYYY-MM-DD>      回测结束日期

可选参数:
  --iterations, -i <N>        优化迭代次数 (默认: 50)
  --initial, -I <N>           初始随机采样数 (默认: 5)
  --parallel, -p <N>          并行评估数 (默认: 3)
  --output, -o <format>       输出格式: json, table, markdown (默认: json)
  --help, -h                  显示帮助信息

示例:
  # 基础用法
  node scripts/run_optimizer.mjs --start 2025-01-01 --end 2025-12-31

  # 自定义迭代次数和并行数
  node scripts/run_optimizer.mjs -s 2025-01-01 -e 2025-06-30 -i 100 -p 5

  # 输出 Markdown 格式
  node scripts/run_optimizer.mjs -s 2025-01-01 -e 2025-06-30 -o markdown

优化目标:
  - 最大化夏普比率
  - 约束: 最大回撤 < 20%

参数空间:
  - 4 维度行业权重 (政策、商业、舆论、资本)
  - 7 因子阈值 (ROE、营收增长、利润增长、PE、PB、RSI、MACD)
`);
}

function formatOutput(result, format) {
  if (!result || !result.bestParams) {
    return '未找到满足约束的最优参数';
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
  const { bestParams, bestMetrics, elapsed_ms, totalEvaluations } = result;
  const weights = bestParams.industry_weights;
  const thresholds = bestParams.factor_thresholds;

  return `# 贝叶斯优化结果

## 最优参数

### 行业权重 (4 维度)

| 维度 | 权重 |
|------|------|
| 政策 | ${(weights.policy_weight * 100).toFixed(1)}% |
| 商业 | ${(weights.business_weight * 100).toFixed(1)}% |
| 舆论 | ${(weights.opinion_weight * 100).toFixed(1)}% |
| 资本 | ${(weights.capital_weight * 100).toFixed(1)}% |

### 因子阈值 (7 因子)

| 因子 | 阈值 |
|------|------|
| ROE | ${thresholds.roe_threshold.toFixed(1)}% |
| 营收增长 | ${thresholds.revenue_growth.toFixed(1)}% |
| 利润增长 | ${thresholds.profit_growth.toFixed(1)}% |
| PE 分位数 | ${thresholds.pe_percentile.toFixed(1)} |
| PB 分位数 | ${thresholds.pb_percentile.toFixed(1)} |
| RSI | ${thresholds.rsi_threshold.toFixed(1)} |
| MACD | ${thresholds.macd_threshold.toFixed(2)} |

## 绩效指标

| 指标 | 数值 |
|------|------|
| 夏普比率 | ${bestMetrics.sharpeRatio.toFixed(4)} |
| 最大回撤 | ${(bestMetrics.maxDrawdown * 100).toFixed(2)}% |
| 总收益率 | ${(bestMetrics.totalReturn * 100).toFixed(2)}% |
| 年化收益率 | ${(bestMetrics.annualizedReturn * 100).toFixed(2)}% |

## 优化统计

- **耗时**: ${(elapsed_ms / 1000).toFixed(1)} 秒
- **总评估次数**: ${totalEvaluations}
- **满足约束次数**: ${result.constraintMetEvaluations}

---
*生成时间: ${new Date().toLocaleString('zh-CN')}*
`;
}

function formatTable(result) {
  const { bestParams, bestMetrics } = result;
  const weights = bestParams.industry_weights;
  const thresholds = bestParams.factor_thresholds;

  let output = '\n========================================\n';
  output += '         贝叶斯优化结果\n';
  output += '========================================\n\n';

  output += '【行业权重】\n';
  output += `  政策: ${(weights.policy_weight * 100).toFixed(1)}%\n`;
  output += `  商业: ${(weights.business_weight * 100).toFixed(1)}%\n`;
  output += `  舆论: ${(weights.opinion_weight * 100).toFixed(1)}%\n`;
  output += `  资本: ${(weights.capital_weight * 100).toFixed(1)}%\n\n`;

  output += '【因子阈值】\n';
  output += `  ROE:       ${thresholds.roe_threshold.toFixed(1)}%\n`;
  output += `  营收增长:  ${thresholds.revenue_growth.toFixed(1)}%\n`;
  output += `  利润增长:  ${thresholds.profit_growth.toFixed(1)}%\n`;
  output += `  PE分位数:  ${thresholds.pe_percentile.toFixed(1)}\n`;
  output += `  PB分位数:  ${thresholds.pb_percentile.toFixed(1)}\n`;
  output += `  RSI:       ${thresholds.rsi_threshold.toFixed(1)}\n`;
  output += `  MACD:      ${thresholds.macd_threshold.toFixed(2)}\n\n`;

  output += '【绩效指标】\n';
  output += `  夏普比率:  ${bestMetrics.sharpeRatio.toFixed(4)}\n`;
  output += `  最大回撤:  ${(bestMetrics.maxDrawdown * 100).toFixed(2)}%\n`;
  output += `  总收益率:  ${(bestMetrics.totalReturn * 100).toFixed(2)}%\n`;
  output += `  年化收益:  ${(bestMetrics.annualizedReturn * 100).toFixed(2)}%\n\n`;

  output += `耗时: ${(result.elapsed_ms / 1000).toFixed(1)}s | 评估: ${result.totalEvaluations} 次\n`;
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
  console.log('   选股参数贝叶斯优化');
  console.log('   TASK_V3_102');
  console.log('========================================\n');

  console.log(`回测区间: ${params.startDate} ~ ${params.endDate}`);
  console.log(`迭代次数: ${params.iterations}`);
  console.log(`初始采样: ${params.initial}`);
  console.log(`并行评估: ${params.parallel}`);
  console.log('');

  try {
    // 加载优化器模块
    const apiDir = join(__dirname, '..', 'api');
    const { BayesianOptimizer } = require(join(apiDir, 'optimizer.js'));

    // 创建优化器
    const optimizer = new BayesianOptimizer({
      nIterations: params.iterations,
      nInitial: params.initial,
      nParallel: params.parallel
    });

    console.log('[开始优化]\n');

    // 运行优化
    const result = await optimizer.optimize({
      startDate: params.startDate,
      endDate: params.endDate,
      initialCapital: 1000000
    });

    // 输出结果
    console.log('\n[优化完成]\n');
    console.log(formatOutput(result, params.output));

    // 保存结果到文件
    if (params.output === 'json') {
      const fs = require('fs');
      const outputPath = join(__dirname, '..', 'data', 'optimizer', `result_${Date.now()}.json`);
      const outputDir = dirname(outputPath);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n结果已保存到: ${outputPath}`);
    }

    process.exit(0);

  } catch (error) {
    console.error('\n[优化失败]', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();