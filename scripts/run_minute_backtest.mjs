#!/usr/bin/env node

/**
 * 分钟线回测命令行工具
 * 
 * 用法:
 *   node scripts/run_minute_backtest.mjs --strategy rsi_oversold --stocks 000001.SZ,600519.SH --days 30
 *   node scripts/run_minute_backtest.mjs --strategy ma_cross --stocks 000001.SZ --start 2026-01-01 --end 2026-03-24
 *   node scripts/run_minute_backtest.mjs --scan --strategy rsi_oversold --stocks 000001.SZ
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 解析命令行参数
function parseArgs(args) {
  const options = {
    strategy: 'rsi_oversold',
    stocks: [],
    days: 30,
    startDate: null,
    endDate: null,
    scan: false,
    output: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--strategy' && args[i + 1]) {
      options.strategy = args[++i];
    } else if (arg === '--stocks' && args[i + 1]) {
      options.stocks = args[++i].split(',').map(s => s.trim());
    } else if (arg === '--days' && args[i + 1]) {
      options.days = parseInt(args[++i], 10);
    } else if (arg === '--start' && args[i + 1]) {
      options.startDate = args[++i];
    } else if (arg === '--end' && args[i + 1]) {
      options.endDate = args[++i];
    } else if (arg === '--scan') {
      options.scan = true;
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // 计算默认日期范围
  if (!options.startDate) {
    const endDate = options.endDate ? new Date(options.endDate) : new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - options.days);
    options.startDate = startDate.toISOString().split('T')[0];
    options.endDate = endDate.toISOString().split('T')[0];
  }

  return options;
}

function printHelp() {
  console.log(`
分钟线回测命令行工具

用法:
  node scripts/run_minute_backtest.mjs [选项]

选项:
  --strategy <name>     策略名称 (rsi_oversold, ma_cross, volume_spike)
  --stocks <codes>      股票代码列表，逗号分隔 (例如：000001.SZ,600519.SH)
  --days <num>          回测天数 (默认：30)
  --start <date>        开始日期 (YYYY-MM-DD)
  --end <date>          结束日期 (YYYY-MM-DD)
  --scan                启用参数扫描模式
  --output <file>       输出结果到文件 (JSON 格式)
  --verbose, -v         详细输出
  --help, -h            显示帮助信息

示例:
  # 使用 RSI 策略回测平安银行和贵州茅台，最近 30 天
  node scripts/run_minute_backtest.mjs --strategy rsi_oversold --stocks 000001.SZ,600519.SH --days 30

  # 使用均线策略回测特定日期范围
  node scripts/run_minute_backtest.mjs --strategy ma_cross --stocks 000001.SZ --start 2026-01-01 --end 2026-03-24

  # 参数扫描模式
  node scripts/run_minute_backtest.mjs --scan --strategy rsi_oversold --stocks 000001.SZ
`);
}

// 格式化回测结果
function formatResult(result) {
  const lines = [];
  
  lines.push('\n========== 回测结果 ==========');
  lines.push(`策略：${result.strategyName || '未命名'}`);
  lines.push(`回测区间：${result.startDate} ~ ${result.endDate}`);
  lines.push(`股票数量：${result.symbolCount || 0}`);
  lines.push('');
  
  if (result.metrics) {
    lines.push('--- 绩效指标 ---');
    lines.push(`总收益率：${(result.metrics.returnRate * 100).toFixed(2)}%`);
    if (result.metrics.annualizedReturn !== undefined) {
      lines.push(`年化收益率：${(result.metrics.annualizedReturn * 100).toFixed(2)}%`);
    }
    if (result.metrics.maxDrawdown !== undefined) {
      lines.push(`最大回撤：${(result.metrics.maxDrawdown * 100).toFixed(2)}%`);
    }
    if (result.metrics.sharpeRatio !== undefined) {
      lines.push(`夏普比率：${result.metrics.sharpeRatio.toFixed(2)}`);
    }
    if (result.metrics.winRate !== undefined) {
      lines.push(`胜率：${(result.metrics.winRate * 100).toFixed(1)}%`);
    }
    if (result.metrics.totalTrades !== undefined) {
      lines.push(`总交易次数：${result.metrics.totalTrades}`);
    }
    lines.push('');
  }
  
  if (result.trades && result.trades.length > 0) {
    lines.push('--- 交易记录 ---');
    result.trades.slice(0, 10).forEach((trade, i) => {
      lines.push(`${i + 1}. ${trade.timestamp} ${trade.action === 'buy' ? '买入' : '卖出'} ${trade.symbol} @ ¥${trade.price.toFixed(2)} (${trade.reason || ''})`);
    });
    if (result.trades.length > 10) {
      lines.push(`... 还有 ${result.trades.length - 10} 条交易记录`);
    }
    lines.push('');
  }
  
  if (result.signals && result.signals.length > 0) {
    lines.push(`--- 信号统计 ---`);
    const buySignals = result.signals.filter(s => s.type === 'buy').length;
    const sellSignals = result.signals.filter(s => s.type === 'sell').length;
    lines.push(`买入信号：${buySignals}`);
    lines.push(`卖出信号：${sellSignals}`);
    lines.push('');
  }
  
  lines.push('==============================\n');
  
  return lines.join('\n');
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.verbose) {
    console.log('启动参数:', JSON.stringify(options, null, 2));
  }

  // 验证股票代码
  if (options.stocks.length === 0) {
    console.error('错误：请指定至少一只股票 (--stocks)');
    process.exit(1);
  }

  const tsCodeRegex = /^[0-9]{6}\.(SZ|SH|BJ)$/;
  for (const stock of options.stocks) {
    if (!tsCodeRegex.test(stock)) {
      console.error(`错误：股票代码格式无效 - ${stock}`);
      console.error('正确格式示例：000001.SZ, 600519.SH, 000001.BJ');
      process.exit(1);
    }
  }

  try {
    // 加载分钟线回测引擎
    const { runMinuteBacktest } = await import('../api/backtest-minute.js');
    
    // 加载策略
    let strategyModule;
    const strategyPath = `../api/strategies/minute/${options.strategy}_strategy.js`;
    
    try {
      strategyModule = await import(strategyPath);
    } catch (e) {
      console.error(`错误：找不到策略 "${options.strategy}"`);
      console.error('可用策略：rsi_oversold, ma_cross, volume_spike');
      process.exit(1);
    }

    if (!strategyModule.generateSignals) {
      console.error(`错误：策略 "${options.strategy}" 缺少 generateSignals 函数`);
      process.exit(1);
    }

    // 构建回测配置
    const config = {
      strategy: {
        name: options.strategy,
        generateSignals: strategyModule.generateSignals,
      },
      stocks: options.stocks,
      startDate: options.startDate,
      endDate: options.endDate,
      scan: options.scan,
    };

    if (options.verbose) {
      console.log(`\n开始回测...`);
      console.log(`策略：${options.strategy}`);
      console.log(`股票：${options.stocks.join(', ')}`);
      console.log(`区间：${config.startDate} ~ ${config.endDate}`);
    }

    // 执行回测
    const result = await runMinuteBacktest(config);

    // 输出结果
    if (options.output) {
      // 输出到文件
      const { writeFileSync } = await import('fs');
      writeFileSync(options.output, JSON.stringify(result, null, 2));
      console.log(`结果已保存到：${options.output}`);
    } else {
      // 输出到控制台
      console.log(formatResult(result));
    }

    // 返回退出码（有收益为 0，否则为 1）
    const hasProfit = result.metrics && result.metrics.returnRate > 0;
    process.exit(hasProfit ? 0 : 1);

  } catch (error) {
    console.error('回测执行失败:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 运行主函数
main();
