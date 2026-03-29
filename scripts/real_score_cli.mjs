#!/usr/bin/env node

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

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

  if (strategyType === 'seven_factor') {
    const filters = normalized.filters && typeof normalized.filters === 'object' ? normalized.filters : {};

    if (normalized.min_seven_factor_score === undefined && normalized.min_score !== undefined) {
      normalized.min_seven_factor_score = normalized.min_score;
    }
    if (normalized.min_seven_factor_score === undefined && filters.minScore !== undefined) {
      normalized.min_seven_factor_score = filters.minScore;
    }
    if (normalized.pe_max === undefined && filters.peMax !== undefined) {
      normalized.pe_max = filters.peMax;
    }
    if (normalized.peg_max === undefined && filters.pegMax !== undefined) {
      normalized.peg_max = filters.pegMax;
    }
    if (normalized.max_price === undefined && filters.maxPrice !== undefined) {
      normalized.max_price = filters.maxPrice;
    }
  }

  return normalized;
}

function extractTradeCount(report) {
  const candidates = [
    report?.summary?.tradeCount,
    report?.metrics?.tradeCount,
    report?.summary?.totalTrades,
    report?.metrics?.totalTrades
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function buildSuccessPayload({ report, scoreResult, normalizedParams }) {
  return {
    success: true,
    scoreTotal: scoreResult.scoreTotal,
    level: scoreResult.level,
    tradeCount: extractTradeCount(report),
    metrics: scoreResult.metrics,
    params: normalizedParams
  };
}

function buildNoTradePayload({ report, normalizedParams, scoreResult }) {
  return {
    success: false,
    error: 'no_trade_samples',
    message: '无有效交易样本，本次评分结果无效',
    tradeCount: extractTradeCount(report),
    metrics: scoreResult?.metrics || report?.metrics || {},
    params: normalizedParams
  };
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
    const metricsForScoring = (() => {
      const m = report?.metrics && typeof report.metrics === 'object' ? { ...report.metrics } : {};
      // 评分器使用收益率口径；部分回测结果会给出总收益金额(totalReturn)
      if (!Number.isFinite(Number(m.totalReturn)) || Number(m.totalReturn) > 1 || Number(m.totalReturn) < -1) {
        const returnRate = Number(m.returnRate);
        if (Number.isFinite(returnRate)) {
          m.totalReturn = returnRate;
        }
      }
      return m;
    })();
    const scoreResult = quickScore(metricsForScoring);
    const tradeCount = extractTradeCount(report);

    restoreConsole();
    if (tradeCount <= 0) {
      outputJson(
        buildNoTradePayload({
          report,
          normalizedParams,
          scoreResult
        }),
        2
      );
      return;
    }

    outputJson(
      buildSuccessPayload({
        report,
        scoreResult,
        normalizedParams
      })
    );
  } catch (error) {
    restoreConsole();
    outputJson({
      success: false,
      error: error.message
    }, 1);
  }
}

const isEntrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isEntrypoint) {
  run();
}

export {
  buildNoTradePayload,
  buildSuccessPayload,
  extractTradeCount,
  normalizeStrategyParams,
  parseArgs,
  parseParams,
  parseStocks,
  run
};
