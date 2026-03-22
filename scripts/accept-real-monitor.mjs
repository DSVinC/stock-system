#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(__dirname, '..', 'api');

const monitorModule = await import(`file://${path.join(API_DIR, 'monitor-conditional.js')}`);
const conditionalModule = await import(`file://${path.join(API_DIR, 'conditional-order.js')}`);
const marketDataModule = await import(`file://${path.join(API_DIR, 'market-data.js')}`);

const { buildOrderContext, sendFeishuNotification } = monitorModule;
const { checkCondition } = conditionalModule;
const {
  getDailyHistory,
  getLatestDailyBasic,
  getMoneyflowRows,
  getRealtimeQuote,
  getStockPePercentile,
  findLatestTradeDate,
} = marketDataModule;

const SINA_SCRIPT_DIR = '/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/scripts';

function parseArgs(argv) {
  const options = {
    tsCode: '000001.SZ',
    threshold: 1,
    operator: '>=',
    notify: false,
    moneyflow: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ts-code') {
      options.tsCode = argv[index + 1] || options.tsCode;
      index += 1;
      continue;
    }
    if (arg === '--threshold') {
      options.threshold = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--operator') {
      options.operator = argv[index + 1] || options.operator;
      index += 1;
      continue;
    }
    if (arg === '--notify') {
      options.notify = true;
      continue;
    }
    if (arg === '--moneyflow') {
      options.moneyflow = true;
      continue;
    }
  }

  return options;
}

function assertEnv(key) {
  const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
  return value.length > 0;
}

async function checkLocalDependency() {
  const required = [
    path.join(SINA_SCRIPT_DIR, 'quote.cjs'),
    path.join(SINA_SCRIPT_DIR, 'search-symbol.cjs'),
  ];

  for (const file of required) {
    await access(file);
  }
}

function createOrder(tsCode, operator, threshold, includeMoneyflow) {
  const conditions = [
    { type: 'pe_percentile', operator, value: threshold },
  ];

  if (includeMoneyflow) {
    conditions.push({ type: 'main_force_net', operator: '>=', value: -999999999 });
  }

  return {
    id: 'acceptance-pe-percentile',
    ts_code: tsCode,
    stock_name: tsCode,
    action: 'buy',
    quantity: 100,
    condition_logic: 'AND',
    conditions: JSON.stringify(conditions),
  };
}

function printSection(title, payload) {
  console.log(`\n[${title}]`);
  if (typeof payload === 'string') {
    console.log(payload);
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log('开始真实环境验收: 条件单监控 pe_percentile');
  console.log(`股票: ${options.tsCode}`);
  console.log(`条件: pe_percentile ${options.operator} ${options.threshold}`);

  await checkLocalDependency();

  const envSummary = {
    TUSHARE_TOKEN: assertEnv('TUSHARE_TOKEN'),
    FEISHU_APP_ID: assertEnv('FEISHU_APP_ID'),
    FEISHU_APP_SECRET: assertEnv('FEISHU_APP_SECRET'),
    FEISHU_OPEN_ID: assertEnv('FEISHU_OPEN_ID'),
    sinaAsharesMcpScripts: true,
  };
  printSection('依赖检查', envSummary);

  if (!envSummary.TUSHARE_TOKEN) {
    throw new Error('未配置 TUSHARE_TOKEN，无法执行真实环境验收。');
  }

  const order = createOrder(options.tsCode, options.operator, options.threshold, options.moneyflow);
  const dependencies = {
    quoteProvider: getRealtimeQuote,
    dailyHistoryProvider: getDailyHistory,
    dailyBasicProvider: getLatestDailyBasic,
    pePercentileProvider: getStockPePercentile,
    tradeDateProvider: findLatestTradeDate,
    moneyflowProvider: getMoneyflowRows,
  };

  let context;
  try {
    context = await buildOrderContext(order, dependencies, new Map());
  } catch (error) {
    if (String(error.message).includes('Exec SecretRef did not resolve')) {
      throw new Error('新浪实时行情脚本可执行，但其依赖的 SecretRef/Keychain 凭据未解析成功。请先修复 sina-ashare-mcp 的本机凭据配置，再重新验收。');
    }
    throw error;
  }
  const triggered = checkCondition(
    { ...order, conditions: JSON.parse(order.conditions) },
    context.marketData,
    context.technicalData
  );

  printSection('监控上下文', {
    marketData: {
      price: context.marketData.price,
      pctChange: context.marketData.pctChange,
      volumeRatio: context.marketData.volumeRatio,
      pe: context.marketData.pe ?? context.marketData.pe_ttm ?? null,
      pePercentile: context.marketData.pePercentile ?? null,
      mainForceNet: context.marketData.mainForceNet ?? null,
    },
    technicalData: context.technicalData,
  });

  if (context.marketData.pePercentile == null) {
    throw new Error('真实环境未返回 marketData.pePercentile，验收失败。');
  }

  printSection('条件判定', {
    triggered,
    expectedCondition: JSON.parse(order.conditions),
  });

  if (options.notify) {
    if (!envSummary.FEISHU_APP_ID || !envSummary.FEISHU_APP_SECRET || !envSummary.FEISHU_OPEN_ID) {
      throw new Error('请求发送飞书通知，但飞书环境变量未完整配置。');
    }

    const notification = await sendFeishuNotification(
      { ...order, stock_name: `验收-${options.tsCode}` },
      {
        success: true,
        quantity: order.quantity,
        price: context.marketData.price,
        amount: context.marketData.price * order.quantity,
      }
    );
    printSection('飞书通知', notification);
  }

  console.log('\n验收脚本执行完成。');
  console.log(triggered ? '结果: 条件已触发' : '结果: 条件未触发');
}

main().catch((error) => {
  console.error('\n验收失败:', error.message);
  process.exitCode = 1;
});
