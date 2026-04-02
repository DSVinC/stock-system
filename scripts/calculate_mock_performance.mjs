#!/usr/bin/env node

/**
 * TASK_MOCK_003
 * 每日计算模拟账户绩效并写入 mock_performance（实时数据日口径）
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { getDatabase } = require(path.join(rootDir, 'api', 'db.js'));

const DEVIATION_THRESHOLD = 0.20;
const SAMPLE_TRADE_THRESHOLD = 20;
const DRAWDOWN_DEVIATION_THRESHOLD = 0.10;
const WIN_RATE_DEVIATION_THRESHOLD = 0.15;
const RISK_FREE_RATE = 0.02;

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function todayDataDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const cst = new Date(utc + 8 * 3600000);
  const y = cst.getFullYear();
  const m = String(cst.getMonth() + 1).padStart(2, '0');
  const d = String(cst.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function normalizeDate(value, fallback) {
  const normalized = String(value || '').replace(/-/g, '').slice(0, 8);
  return /^\d{8}$/.test(normalized) ? normalized : fallback;
}

function daysBetween(startYYYYMMDD, endYYYYMMDD) {
  if (!/^\d{8}$/.test(startYYYYMMDD) || !/^\d{8}$/.test(endYYYYMMDD)) return 1;
  const s = new Date(`${startYYYYMMDD.slice(0, 4)}-${startYYYYMMDD.slice(4, 6)}-${startYYYYMMDD.slice(6, 8)}T00:00:00+08:00`);
  const e = new Date(`${endYYYYMMDD.slice(0, 4)}-${endYYYYMMDD.slice(4, 6)}-${endYYYYMMDD.slice(6, 8)}T00:00:00+08:00`);
  const days = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return days > 0 ? days : 1;
}

function stdDev(samples) {
  if (!Array.isArray(samples) || samples.length <= 1) return 0;
  const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (samples.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

function computeDrawdown(equityCurve) {
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  for (const value of equityCurve) {
    if (value > peak) peak = value;
    if (peak > 0) {
      const dd = (peak - value) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
  }
  return maxDrawdown;
}

function computeTradeStats(trades) {
  const sells = trades.filter((t) => t.action === 'SELL' && Number.isFinite(Number(t.pnl)));
  const wins = sells.filter((t) => Number(t.pnl) > 0);
  const losses = sells.filter((t) => Number(t.pnl) < 0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const avgWin = winCount ? wins.reduce((s, t) => s + Number(t.pnl), 0) / winCount : 0;
  const avgLoss = lossCount ? losses.reduce((s, t) => s + Number(t.pnl), 0) / lossCount : 0;
  const winRate = sells.length ? winCount / sells.length : 0;
  const profitLossRatio = avgLoss < 0 ? Math.abs(avgWin / avgLoss) : null;

  return {
    tradeCount: trades.length,
    winCount,
    lossCount,
    winRate,
    avgWin,
    avgLoss,
    profitLossRatio
  };
}

async function calculateAccountPerformance(db, account, runDataDate) {
  const trades = await db.allPromise(
    `SELECT trade_id, action, quantity, price, simulated_price, commission, stamp_duty, pnl, slippage_rate, data_date, occurred_at
     FROM mock_trade
     WHERE account_id = ? AND execution_status = 'FILLED'
     ORDER BY occurred_at ASC, created_at ASC`,
    [account.account_id]
  );

  const positions = await db.allPromise(
    `SELECT quantity, avg_cost, current_price
     FROM mock_position
     WHERE account_id = ?`,
    [account.account_id]
  );

  const periodStart = normalizeDate(
    trades[0]?.data_date || account.started_at || account.created_at,
    runDataDate
  );
  const periodEnd = normalizeDate(runDataDate, runDataDate);
  const periodDays = daysBetween(periodStart, periodEnd);
  const years = periodDays / 365;

  const initialCapital = Number(account.initial_capital || 0);
  const currentCapital = Number(account.current_capital || 0);
  const availableCapital = Number(account.available_capital || 0);
  const positionsMarketValue = positions.reduce((sum, p) => {
    const qty = Number(p.quantity || 0);
    const price = Number(p.current_price || p.avg_cost || 0);
    return sum + qty * price;
  }, 0);
  const equityNow = currentCapital + positionsMarketValue;
  const totalReturn = initialCapital > 0 ? (equityNow - initialCapital) / initialCapital : 0;
  const annualizedReturn = years > 0 ? (Math.pow(1 + totalReturn, 1 / years) - 1) : totalReturn;

  let cash = initialCapital;
  const equityCurve = [initialCapital];
  const periodicReturns = [];
  let prevEquity = initialCapital;
  let totalCommission = 0;
  let totalStampDuty = 0;
  let slippageSum = 0;
  let turnoverAmount = 0;

  for (const trade of trades) {
    const simulatedPrice = Number(trade.simulated_price || 0);
    const qty = Number(trade.quantity || 0);
    const gross = simulatedPrice * qty;
    const commission = Number(trade.commission || 0);
    const stampDuty = Number(trade.stamp_duty || 0);
    totalCommission += commission;
    totalStampDuty += stampDuty;
    slippageSum += Number(trade.slippage_rate || 0);
    turnoverAmount += gross;

    if (trade.action === 'BUY') {
      cash -= gross + commission + stampDuty;
    } else if (trade.action === 'SELL') {
      cash += gross - commission - stampDuty;
    }

    const equity = cash + positionsMarketValue;
    equityCurve.push(equity);
    if (prevEquity > 0) {
      periodicReturns.push((equity - prevEquity) / prevEquity);
    }
    prevEquity = equity;
  }

  const maxDrawdown = computeDrawdown(equityCurve);
  const volatility = stdDev(periodicReturns) * Math.sqrt(252);
  const downsideReturns = periodicReturns.filter((r) => r < 0);
  const downsideDeviation = stdDev(downsideReturns) * Math.sqrt(252);
  const sharpeRatio = volatility > 0 ? (annualizedReturn - RISK_FREE_RATE) / volatility : null;
  const sortinoRatio = downsideDeviation > 0 ? (annualizedReturn - RISK_FREE_RATE) / downsideDeviation : null;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : null;

  const tradeStats = computeTradeStats(trades);
  const avgSlippage = trades.length ? slippageSum / trades.length : 0;
  const turnoverRate = initialCapital > 0 ? turnoverAmount / initialCapital : 0;

  const strategyVersion = await db.getPromise(
    `SELECT total_return, max_drawdown, win_rate
     FROM strategy_versions
     WHERE version_id = ?`,
    [account.strategy_version_id]
  );

  const backtestTotalReturn = Number.isFinite(Number(strategyVersion?.total_return))
    ? Number(strategyVersion.total_return)
    : null;
  const backtestMaxDrawdown = Number.isFinite(Number(strategyVersion?.max_drawdown))
    ? Number(strategyVersion.max_drawdown)
    : null;
  const backtestWinRate = Number.isFinite(Number(strategyVersion?.win_rate))
    ? Number(strategyVersion.win_rate)
    : null;

  const backtestDeviation = backtestTotalReturn == null ? null : totalReturn - backtestTotalReturn;
  const drawdownDeviation = backtestMaxDrawdown == null ? null : maxDrawdown - backtestMaxDrawdown;
  const winRateDeviation = backtestWinRate == null ? null : tradeStats.winRate - backtestWinRate;
  const deviationChecks = [
    backtestDeviation == null ? false : Math.abs(backtestDeviation) > DEVIATION_THRESHOLD,
    drawdownDeviation == null ? false : Math.abs(drawdownDeviation) > DRAWDOWN_DEVIATION_THRESHOLD,
    winRateDeviation == null ? false : Math.abs(winRateDeviation) > WIN_RATE_DEVIATION_THRESHOLD
  ];
  const isDeviationExceeded = deviationChecks.some(Boolean) ? 1 : 0;
  const isSampleValid = tradeStats.tradeCount >= SAMPLE_TRADE_THRESHOLD ? 1 : 0;

  return {
    performance_id: crypto.randomUUID(),
    account_id: account.account_id,
    strategy_version_id: account.strategy_version_id,
    period_start: periodStart,
    period_end: periodEnd,
    total_return: round(totalReturn),
    annualized_return: round(annualizedReturn),
    excess_return: null,
    max_drawdown: round(maxDrawdown),
    volatility: round(volatility),
    var_95: null,
    sharpe_ratio: round(sharpeRatio),
    sortino_ratio: round(sortinoRatio),
    calmar_ratio: round(calmarRatio),
    trade_count: tradeStats.tradeCount,
    win_count: tradeStats.winCount,
    loss_count: tradeStats.lossCount,
    win_rate: round(tradeStats.winRate),
    avg_win: round(tradeStats.avgWin),
    avg_loss: round(tradeStats.avgLoss),
    profit_loss_ratio: round(tradeStats.profitLossRatio),
    avg_holding_period: null,
    turnover_rate: round(turnoverRate),
    avg_slippage: round(avgSlippage),
    total_commission: round(totalCommission),
    total_stamp_duty: round(totalStampDuty),
    backtest_total_return: round(backtestTotalReturn),
    backtest_deviation: round(backtestDeviation),
    backtest_max_drawdown: round(backtestMaxDrawdown),
    drawdown_deviation: round(drawdownDeviation),
    backtest_win_rate: round(backtestWinRate),
    win_rate_deviation: round(winRateDeviation),
    deviation_threshold: DEVIATION_THRESHOLD,
    is_deviation_exceeded: isDeviationExceeded,
    sample_trade_threshold: SAMPLE_TRADE_THRESHOLD,
    is_sample_valid: isSampleValid,
    created_at: new Date().toISOString(),
    _debug: {
      available_capital: availableCapital,
      positions_market_value: round(positionsMarketValue),
      equity_now: round(equityNow)
    }
  };
}

async function writePerformance(db, performance) {
  await db.runPromise(
    `INSERT INTO mock_performance (
      performance_id, account_id, strategy_version_id, period_start, period_end,
      total_return, annualized_return, excess_return, max_drawdown, volatility, var_95,
      sharpe_ratio, sortino_ratio, calmar_ratio, trade_count, win_count, loss_count, win_rate,
      avg_win, avg_loss, profit_loss_ratio, avg_holding_period, turnover_rate,
      avg_slippage, total_commission, total_stamp_duty, backtest_total_return, backtest_deviation,
      backtest_max_drawdown, drawdown_deviation, backtest_win_rate, win_rate_deviation,
      deviation_threshold, is_deviation_exceeded, sample_trade_threshold, is_sample_valid, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
    [
      performance.performance_id, performance.account_id, performance.strategy_version_id,
      performance.period_start, performance.period_end, performance.total_return, performance.annualized_return,
      performance.excess_return, performance.max_drawdown, performance.volatility, performance.var_95,
      performance.sharpe_ratio, performance.sortino_ratio, performance.calmar_ratio, performance.trade_count,
      performance.win_count, performance.loss_count, performance.win_rate, performance.avg_win, performance.avg_loss,
      performance.profit_loss_ratio, performance.avg_holding_period, performance.turnover_rate, performance.avg_slippage,
      performance.total_commission, performance.total_stamp_duty, performance.backtest_total_return,
      performance.backtest_deviation, performance.backtest_max_drawdown, performance.drawdown_deviation,
      performance.backtest_win_rate, performance.win_rate_deviation, performance.deviation_threshold,
      performance.is_deviation_exceeded, performance.sample_trade_threshold, performance.is_sample_valid,
      performance.created_at
    ]
  );
}

async function run(options = {}) {
  const db = getDatabase();
  const runDataDate = normalizeDate(options.dataDate, todayDataDate());
  const accountId = options.accountId ? String(options.accountId) : null;

  const accounts = accountId
    ? await db.allPromise(
        `SELECT account_id, strategy_version_id, initial_capital, current_capital, available_capital, created_at, started_at, status
         FROM mock_account
         WHERE account_id = ?`,
        [accountId]
      )
    : await db.allPromise(
        `SELECT account_id, strategy_version_id, initial_capital, current_capital, available_capital, created_at, started_at, status
         FROM mock_account
         WHERE status = 'active'
         ORDER BY created_at ASC`
      );

  const results = [];
  for (const account of accounts) {
    const performance = await calculateAccountPerformance(db, account, runDataDate);
    await writePerformance(db, performance);
    results.push(performance);
  }

  return {
    success: true,
    data_date: runDataDate,
    account_count: accounts.length,
    inserted_count: results.length,
    exceeded_count: results.filter((r) => r.is_deviation_exceeded === 1).length,
    invalid_sample_count: results.filter((r) => r.is_sample_valid === 0).length,
    results: results.map((r) => ({
      account_id: r.account_id,
      total_return: r.total_return,
      max_drawdown: r.max_drawdown,
      win_rate: r.win_rate,
      backtest_deviation: r.backtest_deviation,
      is_deviation_exceeded: r.is_deviation_exceeded,
      trade_count: r.trade_count
    }))
  };
}

function parseCliArgs(argv) {
  const args = { accountId: null, dataDate: null };
  for (const item of argv) {
    if (item.startsWith('--account-id=')) {
      args.accountId = item.slice('--account-id='.length);
    } else if (item.startsWith('--data-date=')) {
      args.dataDate = item.slice('--data-date='.length);
    }
  }
  return args;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  run(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('[calculate_mock_performance] 执行失败:', error.message);
      process.exit(1);
    });
}

export { run, calculateAccountPerformance };
