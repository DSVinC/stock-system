#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BacktestEngine } = require('../api/backtest');
const { quickScore } = require('../api/strategy-scorer');
const { getDatabase } = require('../api/db');
const { normalizeToDb } = require('../utils/format');

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const eqIndex = token.indexOf('=');
    if (eqIndex > 2) {
      const key = token.slice(2, eqIndex);
      const value = token.slice(eqIndex + 1);
      args[key] = value;
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
}

function outputJson(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = exitCode;
}

function parseStocks(rawStocks) {
  if (!rawStocks || typeof rawStocks !== 'string') {
    return [];
  }

  return [...new Set(
    rawStocks
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map(normalizeToDb)
  )];
}

function parseParams(rawParams) {
  if (!rawParams) {
    return {};
  }

  if (typeof rawParams !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(rawParams);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('--params 必须是合法的 JSON 字符串');
  }
}

function normalizeStrategyParams(strategyType, params) {
  const normalized = { ...(params || {}) };

  if (strategyType === 'double_ma') {
    if (normalized.fast_period === undefined && normalized.ma_short !== undefined) {
      normalized.fast_period = normalized.ma_short;
    }
    if (normalized.slow_period === undefined && normalized.ma_long !== undefined) {
      normalized.slow_period = normalized.ma_long;
    }
  }

  return normalized;
}

async function ensureRealData(db, stocks, startDate, endDate) {
  const missingStocks = [];

  for (const stock of stocks) {
    const row = await db.getPromise(
      `SELECT COUNT(1) AS count
       FROM stock_daily
       WHERE ts_code = ? AND trade_date BETWEEN ? AND ?`,
      [stock, startDate, endDate]
    );

    if (!row || Number(row.count) === 0) {
      missingStocks.push(stock);
    }
  }

  if (missingStocks.length > 0) {
    throw new Error(`指定区间内缺少真实数据: ${missingStocks.join(', ')}`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const strategyType = args['strategy-type'] || args.strategyType || args.strategy_type;
  const stocks = parseStocks(args.stocks);
  const startDate = args.start;
  const endDate = args.end;

  let params;
  try {
    params = parseParams(args.params);
  } catch (error) {
    outputJson({ success: false, error: error.message }, 1);
    return;
  }

  if (!strategyType || stocks.length === 0 || !startDate || !endDate) {
    outputJson({
      success: false,
      error: '缺少必要参数：--strategy-type, --stocks, --start, --end'
    }, 1);
    return;
  }

  const normalizedParams = normalizeStrategyParams(strategyType, params);
  const strategy = {
    type: strategyType,
    params: normalizedParams
  };

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };

  const silenceConsole = () => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  };

  const restoreConsole = () => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  };

  try {
    silenceConsole();

    const db = getDatabase();
    await ensureRealData(db, stocks, startDate, endDate);

    const engine = new BacktestEngine({
      startDate,
      endDate,
      strategy,
      stocks
    });

    engine.generateMockDataForStock = () => {
      throw new Error('检测到真实数据缺失，禁止回退到模拟数据');
    };

    const historicalData = await engine.loadHistoricalData();
    const dates = Object.keys(historicalData).sort();

    for (const date of dates) {
      engine.state.currentDate = date;
      const dayData = historicalData[date];

      for (const stock of dayData) {
        engine.state.currentPrice[stock.ts_code] = stock;
      }

      await engine.executeStrategy(dayData);
      engine.recordDailyValue();
    }

    engine.calculateMetrics();
    const report = engine.generateReport();
    const scoreResult = quickScore(report.metrics);

    restoreConsole();
    outputJson({
      success: true,
      scoreTotal: scoreResult.scoreTotal,
      level: scoreResult.level,
      metrics: scoreResult.metrics,
      params: normalizedParams
    });
  } catch (error) {
    restoreConsole();
    outputJson({
      success: false,
      error: error.message
    }, 1);
  }
}

run();
