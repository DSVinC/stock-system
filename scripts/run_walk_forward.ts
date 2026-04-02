#!/usr/bin/env node

/**
 * Walk-Forward 样本外测试脚本
 * 用于验证策略参数在样本外数据上的表现，防止过拟合
 *
 * TASK_V3_303
 */

import { createRequire } from 'module';
import { URL } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = new URL('.', import.meta.url).pathname;

const { WalkForwardAnalyzer, SPLIT_STRATEGY } = require('../api/walk-forward-analyzer');

// 命令行参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        params[key] = args[i + 1];
        i++;
      } else {
        params[key] = true;
      }
    }
  }

  return params;
}

// 显示帮助信息
function showHelp() {
  console.log(`
Walk-Forward 样本外测试脚本
==========================

用法:
  node run_walk_forward.mjs [选项]

选项:
  --start-date        开始日期 (YYYY-MM-DD) [必需]
  --end-date          结束日期 (YYYY-MM-DD) [必需]
  --train-ratio       训练集比例 (0-1, 默认: 0.7)
  --split-strategy    分割策略 (fixed_ratio/rolling_window/expanding_window)
  --window-size       滚动窗口大小 (交易日数, 默认: 252)
  --step-size         步进大小 (交易日数, 默认: 63)
  --threshold         过拟合阈值 (0-1, 默认: 0.30)
  --param-ranges      参数范围配置文件路径 (JSON)
  --strategy-config   策略配置文件路径 (JSON)
  --output-dir        输出目录 (默认: report/walk_forward)
  --output            输出文件名前缀 (默认: walk_forward_result)
  --format            输出格式 (json/md, 默认: both)
  --help              显示此帮助信息

分割策略说明:
  fixed_ratio      - 固定比例分割 (如 70% 训练 / 30% 测试)
  rolling_window   - 滚动窗口分割 (固定窗口大小向前滚动)
  expanding_window - 扩展窗口分割 (训练集逐渐扩大)

示例:
  # 基础用法
  node run_walk_forward.mjs --start-date 2020-01-01 --end-date 2023-12-31

  # 使用滚动窗口
  node run_walk_forward.mjs --start-date 2020-01-01 --end-date 2023-12-31 \\
    --split-strategy rolling_window --window-size 252 --step-size 63

  # 带参数优化
  node run_walk_forward.mjs --start-date 2020-01-01 --end-date 2023-12-31 \\
    --param-ranges ./params.json

参数范围配置文件示例 (params.json):
  {
    "minFactorScore": [0, 10, 20],
    "maxStocks": [5, 10, 15],
    "minSevenFactorScore": [0, 5, 10]
  }
  `);
}

// 从文件加载配置
function loadConfig(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`无法加载配置文件: ${filePath}`, error.message);
    return {};
  }
}

// 确保目录存在
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[Walk-Forward] 创建输出目录: ${dirPath}`);
  }
}

// 格式化指标输出
function formatMetrics(metrics, indent = '') {
  return `
${indent}年化收益: ${(metrics.annualizedReturn * 100).toFixed(2)}%
${indent}夏普比率: ${metrics.sharpeRatio.toFixed(3)}
${indent}最大回撤: ${(metrics.maxDrawdown * 100).toFixed(2)}%
${indent}胜率: ${(metrics.winRate * 100).toFixed(1)}%
${indent}总交易: ${metrics.totalTrades} 次
  `.trim();
}

// 执行 Walk-Forward 分析
async function runWalkForwardAnalysis(params) {
  const {
    startDate,
    endDate,
    trainRatio = 0.7,
    splitStrategy = 'fixed_ratio',
    windowSize = 252,
    stepSize = 63,
    threshold = 0.30,
    paramRanges = {},
    strategyConfig = {},
    outputDir = 'report/walk_forward',
    outputPrefix = 'walk_forward_result',
    format = 'both'
  } = params;

  console.log('\n========================================');
  console.log('  Walk-Forward 样本外测试分析');
  console.log('========================================\n');

  console.log(`[配置信息]`);
  console.log(`  分析期间: ${startDate} ~ ${endDate}`);
  console.log(`  分割策略: ${splitStrategy}`);
  console.log(`  训练比例: ${(trainRatio * 100).toFixed(0)}%`);
  console.log(`  过拟合阈值: ${(threshold * 100).toFixed(0)}%`);

  if (splitStrategy === 'rolling_window' || splitStrategy === 'expanding_window') {
    console.log(`  窗口大小: ${windowSize} 交易日`);
    console.log(`  步进大小: ${stepSize} 交易日`);
  }

  console.log('');

  // 创建分析器
  const analyzer = new WalkForwardAnalyzer({
    trainRatio: parseFloat(trainRatio),
    testRatio: 1 - parseFloat(trainRatio),
    splitStrategy,
    windowSize: parseInt(windowSize),
    stepSize: parseInt(stepSize),
    overfittingThreshold: parseFloat(threshold),
    paramRanges
  });

  // 执行分析
  const result = await analyzer.runAnalysis({
    startDate,
    endDate,
    strategyConfig,
    paramRanges
  });

  // 输出结果摘要
  console.log('\n========================================');
  console.log('  分析结果');
  console.log('========================================\n');

  // 判断是否是多折分析
  if (result.results.splits && result.results.splits.length > 0) {
    // 多折分析结果
    console.log(`[聚合指标] 共 ${result.results.splits.length} 折\n`);

    const agg = result.results.aggregatedMetrics;
    console.log(`训练集:`);
    console.log(`  平均年化收益: ${(agg.train.avgReturn * 100).toFixed(2)}%`);
    console.log(`  平均夏普比率: ${agg.train.avgSharpe.toFixed(3)}`);
    console.log(`  平均最大回撤: ${(agg.train.avgDrawdown * 100).toFixed(2)}%`);

    console.log(`\n测试集:`);
    console.log(`  平均年化收益: ${(agg.test.avgReturn * 100).toFixed(2)}%`);
    console.log(`  平均夏普比率: ${agg.test.avgSharpe.toFixed(3)}`);
    console.log(`  平均最大回撤: ${(agg.test.avgDrawdown * 100).toFixed(2)}%`);

  } else {
    // 单次分割结果
    const split = result.results;

    console.log(`[数据分割]`);
    console.log(`  训练集: ${split.trainPeriod.startDate} ~ ${split.trainPeriod.endDate} (${split.trainPeriod.tradingDays} 天)`);
    console.log(`  测试集: ${split.testPeriod.startDate} ~ ${split.testPeriod.endDate} (${split.testPeriod.tradingDays} 天)`);

    if (Object.keys(split.bestParams).length > 0) {
      console.log(`\n[最优参数]`);
      for (const [key, value] of Object.entries(split.bestParams)) {
        console.log(`  ${key}: ${value}`);
      }
    }

    console.log(`\n[训练集绩效]`);
    console.log(formatMetrics(split.trainPerformance, '  '));

    console.log(`\n[测试集绩效]`);
    console.log(formatMetrics(split.testPerformance, '  '));
  }

  // 过拟合分析
  console.log(`\n[过拟合分析]`);
  const overfittingScore = result.results.splits
    ? result.results.aggregatedMetrics.overfitting.avgScore
    : result.results.overfittingAnalysis.overfittingScore;

  console.log(`  过拟合得分: ${overfittingScore.toFixed(2)}`);

  if (result.results.overfittingAnalysis && result.results.overfittingAnalysis.warnings) {
    const warnings = result.results.overfittingAnalysis.warnings;
    if (warnings.length > 0) {
      console.log(`  告警数量: ${warnings.length}`);
      warnings.forEach((w, i) => {
        console.log(`    [${i + 1}] [${w.severity}] ${w.message}`);
      });
    } else {
      console.log(`  状态: ✅ 未检测到明显过拟合风险`);
    }
  }

  // 结论
  console.log(`\n[结论]`);
  console.log(`  有效性: ${result.conclusion.isValid ? '✅ 通过' : '❌ 未通过'}`);
  console.log(`  建议: ${result.conclusion.recommendation}`);

  // 保存结果
  ensureDirectory(outputDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'json' || format === 'both') {
    const jsonPath = path.join(outputDir, `${outputPrefix}_${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\n[输出] JSON 报告已保存: ${jsonPath}`);
  }

  if (format === 'md' || format === 'both') {
    const mdReport = analyzer.generateMarkdownReport();
    const mdPath = path.join(outputDir, `${outputPrefix}_${timestamp}.md`);
    fs.writeFileSync(mdPath, mdReport, 'utf-8');
    console.log(`[输出] Markdown 报告已保存: ${mdPath}`);
  }

  return result;
}

// 主函数
async function main() {
  const params = parseArgs();

  if (params.help) {
    showHelp();
    return;
  }

  // 验证必需参数
  if (!params.startDate || !params.endDate) {
    console.error('错误: 必须提供 --start-date 和 --end-date 参数');
    showHelp();
    process.exit(1);
  }

  // 加载配置文件
  let paramRanges = {};
  let strategyConfig = {};

  if (params.paramRanges) {
    paramRanges = loadConfig(params.paramRanges);
  }

  if (params.strategyConfig) {
    strategyConfig = loadConfig(params.strategyConfig);
  }

  // 执行分析
  try {
    await runWalkForwardAnalysis({
      startDate: params.startDate,
      endDate: params.endDate,
      trainRatio: params.trainRatio ? parseFloat(params.trainRatio) : 0.7,
      splitStrategy: params.splitStrategy || 'fixed_ratio',
      windowSize: params.windowSize ? parseInt(params.windowSize) : 252,
      stepSize: params.stepSize ? parseInt(params.stepSize) : 63,
      threshold: params.threshold ? parseFloat(params.threshold) : 0.30,
      paramRanges,
      strategyConfig,
      outputDir: params.outputDir || 'report/walk_forward',
      outputPrefix: params.output || 'walk_forward_result',
      format: params.format || 'both'
    });

    console.log('\n✅ Walk-Forward 分析完成!\n');
  } catch (error) {
    console.error('\n❌ 分析失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 执行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

export { runWalkForwardAnalysis };