#!/usr/bin/env node

/**
 * 回测脚本
 * 用于执行基于因子快照的回测
 */

import { createRequire } from 'module';
import { URL } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = new URL('.', import.meta.url).pathname;

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
因子快照回测脚本
================

用法:
  node run_backtest.mjs [选项]

选项:
  --start-date     开始日期 (YYYY-MM-DD) [必需]
  --end-date       结束日期 (YYYY-MM-DD) [必需]
  --initial-capital 初始资金 (默认: 1000000)
  --strategy-config 策略配置文件路径 (JSON)
  --output         输出文件路径 (默认: backtest-result.json)
  --api-url        API地址 (默认: http://localhost:3000)
  --help           显示此帮助信息

示例:
  node run_backtest.mjs --start-date 2024-01-01 --end-date 2024-12-31
  node run_backtest.mjs --start-date 2024-01-01 --end-date 2024-12-31 --strategy-config ./strategy.json
  `);
}

// 从文件加载策略配置
function loadStrategyConfig(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`无法加载策略配置文件: ${filePath}`, error.message);
    return {};
  }
}

// 执行回测
async function runBacktest(params) {
  const {
    startDate,
    endDate,
    initialCapital = 1000000,
    strategyConfig = {},
    apiUrl = 'http://localhost:3000',
    output = 'backtest-result.json'
  } = params;
  
  console.log('开始执行因子快照回测...');
  console.log(`回测期间: ${startDate} 到 ${endDate}`);
  console.log(`初始资金: ${initialCapital.toLocaleString()} 元`);
  
  if (Object.keys(strategyConfig).length > 0) {
    console.log('策略配置:', JSON.stringify(strategyConfig, null, 2));
  }
  
  const requestBody = {
    startDate,
    endDate,
    initialCapital: parseInt(initialCapital),
    strategy: strategyConfig
  };
  
  try {
    const response = await fetch(`${apiUrl}/api/backtest/factor-snapshot/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '回测执行失败');
    }
    
    console.log('回测执行成功！');
    console.log('\n回测结果:');
    console.log('=' .repeat(50));

    const summary = result.data.summary;

    // 7个核心绩效指标
    console.log('\n【7个核心绩效指标】');
    console.log(`1. 总收益率:   ${(summary.totalReturn * 100).toFixed(2)}%`);
    console.log(`2. 年化收益率: ${(summary.annualizedReturn * 100).toFixed(2)}%`);
    console.log(`3. 夏普比率:   ${summary.sharpeRatio.toFixed(3)}`);
    console.log(`4. 最大回撤:   ${(summary.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`5. 波动率:     ${((result.data.sevenMetrics?.volatility || 0) * 100).toFixed(2)}%`);
    console.log(`6. 胜率:       ${(summary.winRate * 100).toFixed(1)}%`);
    console.log(`7. 交易次数:   ${summary.totalTrades}`);

    // 额外指标
    console.log('\n【额外指标】');
    console.log(`卡玛比率:     ${summary.calmarRatio.toFixed(3)}`);
    console.log(`盈亏比:       ${summary.profitLossRatio.toFixed(2)}`);
    console.log(`交易天数:     ${summary.tradingDays}`);
    console.log(`初始资金:     ${summary.initialCapital.toLocaleString()} 元`);
    console.log(`最终资金:     ${summary.finalCapital.toLocaleString()} 元`);
    console.log(`回测ID:       ${result.data.backtestId}`);
    
    // 保存结果到文件
    if (output) {
      fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`\n回测结果已保存到: ${output}`);
    }
    
    return result;
    
  } catch (error) {
    console.error('回测执行失败:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n提示: 请确保API服务正在运行');
      console.error('运行命令: npm start (在 stock-system 目录下)');
    }
    
    throw error;
  }
}

// 显示回测历史
async function showBacktestHistory(apiUrl = 'http://localhost:3000', limit = 10) {
  try {
    const response = await fetch(`${apiUrl}/api/backtest/factor-snapshot/history?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '获取回测历史失败');
    }
    
    console.log('\n回测历史记录:');
    console.log('=' .repeat(80));
    
    const history = result.data.history;
    
    if (history.length === 0) {
      console.log('暂无回测历史记录');
      return;
    }
    
    history.forEach((item, index) => {
      console.log(`\n[${index + 1}] ${item.name}`);
      console.log(`   期间: ${item.startDate} 到 ${item.endDate}`);
      console.log(`   创建时间: ${item.createdAt}`);
      
      const summary = item.resultSummary;
      if (summary) {
        console.log(`   总收益率: ${(summary.totalReturn * 100).toFixed(2)}%`);
        console.log(`   年化收益率: ${(summary.annualizedReturn * 100).toFixed(2)}%`);
        console.log(`   最大回撤: ${(summary.maxDrawdown * 100).toFixed(2)}%`);
        console.log(`   夏普比率: ${summary.sharpeRatio?.toFixed(3) || 'N/A'}`);
      }
    });
    
    console.log(`\n共 ${result.data.pagination.total} 条记录`);
    
  } catch (error) {
    console.error('获取回测历史失败:', error.message);
  }
}

// 主函数
async function main() {
  const params = parseArgs();
  
  if (params.help) {
    showHelp();
    return;
  }
  
  if (params.history) {
    await showBacktestHistory(params.apiUrl, parseInt(params.limit) || 10);
    return;
  }
  
  // 验证必需参数
  if (!params.startDate || !params.endDate) {
    console.error('错误: 必须提供 --start-date 和 --end-date 参数');
    showHelp();
    process.exit(1);
  }
  
  // 加载策略配置
  let strategyConfig = {};
  if (params.strategyConfig) {
    strategyConfig = loadStrategyConfig(params.strategyConfig);
  }
  
  // 执行回测
  try {
    await runBacktest({
      startDate: params.startDate,
      endDate: params.endDate,
      initialCapital: params.initialCapital ? parseInt(params.initialCapital) : 1000000,
      strategyConfig,
      apiUrl: params.apiUrl || 'http://localhost:3000',
      output: params.output || 'backtest-result.json'
    });
  } catch (error) {
    console.error('\n回测失败，请检查参数和服务状态');
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

export { runBacktest, showBacktestHistory };