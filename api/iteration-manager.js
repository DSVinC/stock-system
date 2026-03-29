/**
 * 自迭代管理器 API (iteration-manager.js)
 * 职责：管理策略参数自动迭代优化流程
 *
 * API 端点:
 * - POST /api/iteration/start - 启动迭代任务
 * - POST /api/iteration/stop/:taskId - 停止任务
 * - GET /api/iteration/status/:taskId - 获取任务状态
 * - GET /api/iteration/versions/:strategyType - 获取版本历史
 * - GET /api/iteration/compare - 版本对比
 * - POST /api/iteration/optimize - 执行优化
 * - POST /api/iteration/score - 计算评分
 */
const express = require('express');
const { StrategyScorer, quickScore } = require('./strategy-scorer');
const { BacktestEngine } = require('./backtest');
const { getDatabase } = require('./db');
const { normalizeToDb, normalizeToApi } = require('../utils/format');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();
const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
const MIN_VALID_TRADE_SAMPLES = 5;

// 活跃任务存储
const activeTasks = new Map();
const ITERATION_TASK_RUNS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS iteration_task_runs (
    task_id TEXT PRIMARY KEY,
    strategy_type TEXT,
    input_summary_json TEXT,
    status TEXT,
    progress REAL,
    current_iteration INTEGER,
    max_iterations INTEGER,
    best_score REAL,
    best_params_json TEXT,
    result_summary_json TEXT,
    created_at TEXT,
    updated_at TEXT
  )
`;

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function safeJsonStringify(value) {
  return value === undefined ? null : JSON.stringify(value);
}

function normalizeOptimizationBackend(value) {
  return String(value || 'heuristic').toLowerCase() === 'optuna' ? 'optuna' : 'heuristic';
}

function normalizeIterationCount(value, fallback = 10) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 1000);
}

function normalizeScoreThreshold(value, fallback = 80) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

function normalizeParallelTasks(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 256);
}

async function augmentSevenFactorStocks(db, stocks, startDate, endDate, targetSize = 20) {
  const base = Array.isArray(stocks)
    ? [...new Set(stocks.map(item => String(item || '').trim()).filter(Boolean))]
    : [];
  if (base.length >= targetSize) {
    return { stocks: base, added: [] };
  }

  const startDb = normalizeToDb(startDate);
  const endDb = normalizeToDb(endDate);
  const room = Math.max(targetSize - base.length, 0);
  if (room <= 0) {
    return { stocks: base, added: [] };
  }

  let rows = await db.allPromise(
    `
      SELECT ts_code, COUNT(1) AS sample_count, AVG(amount) AS avg_amount
      FROM stock_daily
      WHERE trade_date BETWEEN ? AND ?
        AND (
          ts_code LIKE 'sh.6%'
          OR ts_code LIKE 'sz.0%'
          OR ts_code LIKE 'sz.3%'
        )
      GROUP BY ts_code
      HAVING COUNT(1) >= 60
      ORDER BY avg_amount DESC, sample_count DESC
      LIMIT 400
    `,
    [startDb, endDb]
  );

  // 指定区间样本过少时，再回退到因子快照库补齐候选
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = await db.allPromise(
      `
      SELECT ts_code, COUNT(1) AS sample_count, 0 AS avg_amount
      FROM stock_factor_snapshot
      WHERE trade_date BETWEEN ? AND ?
        AND ts_code NOT LIKE '%.BJ'
      GROUP BY ts_code
      HAVING COUNT(1) >= 5
      ORDER BY sample_count DESC
      LIMIT 200
    `,
      [startDb, endDb]
    );
  }

  const next = [...base];
  const added = [];
  for (const row of rows) {
    const code = normalizeToApi(String(row?.ts_code || '').trim().toUpperCase());
    if (!code || next.includes(code)) continue;
    next.push(code);
    added.push(code);
    if (added.length >= room) break;
  }

  return { stocks: next, added };
}

function parseOptionalFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function filterStocksByRealDataCoverage(stocks, startDate, endDate) {
  const normalizedStocks = Array.isArray(stocks)
    ? [...new Set(stocks.map(stock => String(stock || '').trim()).filter(Boolean))]
    : [];

  if (normalizedStocks.length === 0) {
    return {
      supportedStocks: [],
      excludedStocks: []
    };
  }

  const db = await getDatabase();
  const supportedStocks = [];
  const excludedStocks = [];

  // 测试环境或精简库中可能不存在 stock_daily，此时不应阻塞任务启动。
  try {
    const stockDailyTable = await db.getPromise(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stock_daily'`
    );
    if (!stockDailyTable || String(stockDailyTable.name || '').toLowerCase() !== 'stock_daily') {
      return {
        supportedStocks: normalizedStocks,
        excludedStocks: []
      };
    }
  } catch (error) {
    return {
      supportedStocks: normalizedStocks,
      excludedStocks: []
    };
  }

  for (const stock of normalizedStocks) {
    const dbStockCode = normalizeToDb(stock);
    const row = await db.getPromise(
      `SELECT COUNT(1) AS count
         FROM stock_daily
        WHERE ts_code = ? AND trade_date BETWEEN ? AND ?`,
      [dbStockCode, startDate, endDate]
    );

    if (row && Number(row.count) > 0) {
      supportedStocks.push(stock);
    } else {
      excludedStocks.push(stock);
    }
  }

  return {
    supportedStocks,
    excludedStocks
  };
}

function normalizeInvalidResultReason(reason) {
  const value = String(reason || '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'no_trade_samples') return 'no_trade_samples';
  if (value === 'insufficient_trade_samples') return 'insufficient_trade_samples';
  if (value === 'no_valid_samples') return 'no_valid_samples';
  if (value === 'threshold_not_reached') return 'threshold_not_reached';
  if (value === 'invalid_optuna_result') return 'invalid_optuna_result';
  return value;
}

function formatInvalidResultMessage(reason, details = {}) {
  const tradeCount = parseOptionalFiniteNumber(details.tradeCount);
  const threshold = parseOptionalFiniteNumber(details.scoreThreshold);
  const score = parseOptionalFiniteNumber(details.bestScore);

  switch (normalizeInvalidResultReason(reason)) {
    case 'no_trade_samples':
      return `无有效交易样本，交易次数为 ${tradeCount ?? 0}，本次结果不能作为有效迭代结果。`;
    case 'insufficient_trade_samples':
      return `有效交易样本不足（当前 ${tradeCount ?? 0} 笔，至少需要 ${MIN_VALID_TRADE_SAMPLES} 笔），本次结果不能作为有效迭代结果。`;
    case 'no_valid_samples':
      return '所有迭代轮次都未产生有效样本，本次结果不能作为有效迭代结果。';
    case 'threshold_not_reached':
      return `最佳得分 ${score?.toFixed(1) ?? '--'} 未达到阈值 ${threshold?.toFixed(1) ?? '--'}，本次结果不应视为完成。`;
    case 'invalid_optuna_result':
      return 'Optuna 返回结果缺少有效参数或有效样本，本次结果不能作为有效迭代结果。';
    default:
      return '本次迭代未产生有效结果。';
  }
}

function extractTradeCountFromMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;
  return parseOptionalFiniteNumber(
    metrics.tradeCount ??
    metrics.totalTrades ??
    metrics.total_trades ??
    metrics.trade_count ??
    metrics.closedTrades ??
    metrics.closed_trades
  );
}

function hasValidIterationSample(metrics) {
  const tradeCount = extractTradeCountFromMetrics(metrics);
  return tradeCount !== null && tradeCount > 0;
}

function hasSufficientTradeSamples(metrics) {
  const tradeCount = extractTradeCountFromMetrics(metrics);
  return tradeCount !== null && tradeCount >= MIN_VALID_TRADE_SAMPLES;
}

function finalizeTaskAsFailed(task, invalidReason, message, extra = {}) {
  task.status = 'failed';
  task.error = message || formatInvalidResultMessage(invalidReason, {
    tradeCount: extra.tradeCount,
    scoreThreshold: task.scoreThreshold,
    bestScore: task.bestScore
  });
  task.invalidResult = true;
  task.invalidReason = normalizeInvalidResultReason(invalidReason);
  task.finishedAt = new Date().toISOString();
  task.resultSummary = buildTaskResultSummary(task);
}

function inferInvalidReasonFromError(errorMessage) {
  const message = String(errorMessage || '').toLowerCase();
  if (!message) return 'invalid_optuna_result';
  if (
    message.includes('no_trade_samples') ||
    message.includes('无有效交易样本') ||
    message.includes('tradecount') && message.includes('0')
  ) {
    return 'no_trade_samples';
  }
  if (
    message.includes('insufficient_trade_samples') ||
    message.includes('样本不足')
  ) {
    return 'insufficient_trade_samples';
  }
  return 'invalid_optuna_result';
}

function getLatestMetricsFromHistory(task) {
  const history = Array.isArray(task?.history) ? task.history : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry && entry.metrics && typeof entry.metrics === 'object') {
      return entry.metrics;
    }
  }
  return {};
}

function deriveDeploymentReadiness(task) {
  const scoreThreshold = parseOptionalFiniteNumber(task.scoreThreshold) ?? 75;
  const bestScore = parseOptionalFiniteNumber(task.bestScore) ?? 0;
  const summary = task.resultSummary && typeof task.resultSummary === 'object' ? task.resultSummary : {};
  const metrics = getLatestMetricsFromHistory(task);
  const tradeCount = parseOptionalFiniteNumber(
    metrics.tradeCount ?? metrics.totalTrades ?? summary.tradeCount ?? summary.totalTrades
  );

  const inputSummary = task.inputSummary && typeof task.inputSummary === 'object' ? task.inputSummary : {};
  const startDateRaw = inputSummary.startDate || task.startDate || '';
  const endDateRaw = inputSummary.endDate || task.endDate || '';
  const startDate = startDateRaw ? new Date(startDateRaw) : null;
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const validationDays = (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()))
    ? Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
    : null;

  const simulationDeviation = parseOptionalFiniteNumber(
    metrics.simulationDeviation ?? summary.simulationDeviation ?? summary.simulation_deviation
  );

  const bestParams = task.bestParams && typeof task.bestParams === 'object' ? task.bestParams : {};
  const hasRiskParams = (
    bestParams.stop_loss !== undefined ||
    bestParams.stopLoss !== undefined ||
    bestParams.max_position !== undefined ||
    bestParams.maxPosition !== undefined ||
    bestParams.risk_limit !== undefined ||
    bestParams.riskLimit !== undefined
  );

  const feishuTestedRaw = inputSummary?.notifications?.feishuTested ?? task.feishuPushTested;
  const feishuTested = feishuTestedRaw === true;

  const checks = [
    {
      id: 'score_threshold',
      title: '策略评分 >= 75',
      status: bestScore >= scoreThreshold ? 'pass' : 'fail',
      detail: `当前 ${bestScore.toFixed(1)} / 阈值 ${scoreThreshold.toFixed(1)}`
    },
    {
      id: 'simulation_period_or_trade_count',
      title: '模拟周期 >= 14 天 或 交易次数 >= 30',
      status: (validationDays !== null && validationDays >= 14) || (tradeCount !== null && tradeCount >= 30) ? 'pass' : 'fail',
      detail: `周期 ${validationDays ?? '--'} 天，交易 ${tradeCount ?? '--'} 笔`
    },
    {
      id: 'simulation_deviation',
      title: '模拟收益偏差 < 20%',
      status: simulationDeviation === null ? 'pending' : (Math.abs(simulationDeviation) < 0.2 ? 'pass' : 'fail'),
      detail: simulationDeviation === null
        ? '暂无偏差数据'
        : `偏差 ${(simulationDeviation * 100).toFixed(1)}%`
    },
    {
      id: 'risk_params_configured',
      title: '风控参数已配置',
      status: hasRiskParams ? 'pass' : 'pending',
      detail: hasRiskParams ? '已检测到止损/仓位/风险限制参数' : '未检测到标准风控参数字段'
    },
    {
      id: 'feishu_push_tested',
      title: '飞书推送已测试',
      status: feishuTested ? 'pass' : 'pending',
      detail: feishuTested ? '已标记完成飞书推送测试' : '未标记飞书推送测试'
    }
  ];

  const failedCount = checks.filter(check => check.status === 'fail').length;
  const pendingCount = checks.filter(check => check.status === 'pending').length;
  const readyForLive = failedCount === 0 && pendingCount === 0;

  return {
    readyForLive,
    failedCount,
    pendingCount,
    checks
  };
}

function deriveNextActionSuggestion(task) {
  const status = String(task.status || '').toLowerCase();
  const stopReason = String(task.stopReason || task.resultSummary?.stopReason || '').toLowerCase();
  const scoreThreshold = parseOptionalFiniteNumber(task.scoreThreshold);
  const bestScore = parseOptionalFiniteNumber(task.bestScore) ?? 0;
  const deploymentReadiness = deriveDeploymentReadiness(task);
  const invalidReason = normalizeInvalidResultReason(task.invalidReason || task.resultSummary?.invalidReason);

  if (
    invalidReason === 'no_trade_samples' ||
    invalidReason === 'insufficient_trade_samples' ||
    invalidReason === 'no_valid_samples' ||
    invalidReason === 'invalid_optuna_result'
  ) {
    return {
      action: 'expand_sample_and_fix_constraints',
      title: '先补齐有效交易样本',
      reason: formatInvalidResultMessage(invalidReason, {
        tradeCount: task.resultSummary?.tradeCount,
        scoreThreshold,
        bestScore
      })
    };
  }

  if (invalidReason === 'threshold_not_reached') {
    return {
      action: 'increase_trials',
      title: '结果未达阈值，继续优化',
      reason: formatInvalidResultMessage(invalidReason, {
        scoreThreshold,
        bestScore
      })
    };
  }

  if (status === 'failed') {
    return {
      action: 'inspect_error_and_retry',
      title: '先排查报错并重试',
      reason: '任务执行失败，需先定位错误日志并修复后再继续迭代。'
    };
  }

  if (status === 'stopped' && stopReason === 'manual_stop') {
    return {
      action: 'resume_iteration',
      title: '继续迭代任务',
      reason: '任务被手动停止，可在确认参数后继续迭代。'
    };
  }

  if (status === 'completed' && scoreThreshold !== null && bestScore >= scoreThreshold) {
    if (!deploymentReadiness.readyForLive) {
      return {
        action: 'complete_preflight_checklist',
        title: '先补齐实盘前检查',
        reason: `评分已达标，但仍有 ${deploymentReadiness.failedCount} 项失败、${deploymentReadiness.pendingCount} 项待补齐。建议先完成检查清单再发布。`
      };
    }

    return {
      action: 'publish_to_strategy_library',
      title: '发布到策略库',
      reason: `最佳得分 ${bestScore.toFixed(1)} 已达到目标阈值 ${scoreThreshold.toFixed(1)}，建议发布并进入执行验证。`
    };
  }

  const summary = task.resultSummary && typeof task.resultSummary === 'object' ? task.resultSummary : {};
  const metrics = getLatestMetricsFromHistory(task);
  const maxDrawdown = parseOptionalFiniteNumber(metrics.maxDrawdown);
  const winRate = parseOptionalFiniteNumber(metrics.winRate);
  const tradeCount = parseOptionalFiniteNumber(metrics.tradeCount ?? metrics.totalTrades);
  const sharpeRatio = parseOptionalFiniteNumber(metrics.sharpeRatio);
  const totalReturn = parseOptionalFiniteNumber(metrics.returnRate ?? metrics.totalReturn);
  const simulationDeviation = parseOptionalFiniteNumber(
    metrics.simulationDeviation ?? summary.simulationDeviation ?? summary.simulation_deviation
  );

  if (status === 'completed' && scoreThreshold !== null && bestScore < scoreThreshold) {
    return {
      action: 'increase_trials',
      title: '扩大迭代规模',
      reason: `当前最佳得分 ${bestScore.toFixed(1)} 低于阈值 ${scoreThreshold.toFixed(1)}，建议增加迭代轮数并扩展参数搜索范围。`
    };
  }

  if (maxDrawdown !== null && maxDrawdown <= -0.2) {
    return {
      action: 'tighten_risk_limits',
      title: '收紧风险阈值后重跑',
      reason: `最大回撤 ${Math.abs(maxDrawdown * 100).toFixed(1)}% 偏高，建议收紧止损或下调仓位上限。`
    };
  }

  if (simulationDeviation !== null && Math.abs(simulationDeviation) >= 0.2) {
    return {
      action: 'recalibrate_slippage_model',
      title: '先校准模拟偏差',
      reason: `模拟收益偏差 ${(simulationDeviation * 100).toFixed(1)}% 偏高，建议先校准滑点/成本假设再继续迭代。`
    };
  }

  if (winRate !== null && winRate < 0.45) {
    return {
      action: 'switch_strategy_template',
      title: '切换策略模板',
      reason: `胜率 ${((winRate || 0) * 100).toFixed(1)}% 偏低，建议切换策略模板或因子组合。`
    };
  }

  if (sharpeRatio !== null && sharpeRatio < 1) {
    return {
      action: 'optimize_exit_ratio',
      title: '优化止盈止损比',
      reason: `夏普比率 ${sharpeRatio.toFixed(2)} 偏低，建议优先优化止盈止损比与退出逻辑。`
    };
  }

  if (totalReturn !== null && totalReturn < 0.1 && winRate !== null && winRate >= 0.55) {
    return {
      action: 'increase_holding_period',
      title: '延长持仓周期',
      reason: `胜率 ${((winRate || 0) * 100).toFixed(1)}% 尚可但收益仅 ${(totalReturn * 100).toFixed(1)}%，建议延长持仓周期捕捉趋势。`
    };
  }

  if (tradeCount !== null && tradeCount > 0 && tradeCount < 5) {
    return {
      action: 'loosen_entry_conditions',
      title: '放宽入场条件',
      reason: `有效交易仅 ${tradeCount} 笔，建议放宽入场阈值以提升样本量。`
    };
  }

  return {
    action: 'increase_trials',
    title: '扩大迭代规模',
    reason: '当前结果未达目标，建议增加迭代轮数或扩展样本区间。'
  };
}

function deriveTuningPlan(task, nextActionSuggestion) {
  const action = nextActionSuggestion?.action || 'increase_trials';
  const basePlan = {
    action,
    priority: 'medium',
    steps: [],
    guardrails: []
  };

  if (action === 'tighten_risk_limits') {
    return {
      ...basePlan,
      priority: 'high',
      steps: [
        '下调止损阈值 1%（例如从 8% 调整到 7%）',
        '下调单笔最大仓位 10%',
        '保持入场逻辑不变，先验证回撤改善效果'
      ],
      guardrails: [
        '最大回撤目标 < 20%',
        '不得通过过度减少交易次数掩盖风险'
      ]
    };
  }

  if (action === 'recalibrate_slippage_model') {
    return {
      ...basePlan,
      priority: 'high',
      steps: [
        '将滑点或冲击成本假设提高 0.1%~0.2%',
        '复核手续费、印花税与撮合成交价口径',
        '在同区间重跑并对比 simulationDeviation'
      ],
      guardrails: [
        '模拟偏差绝对值目标 < 20%',
        '参数调整后必须保持评分逻辑一致'
      ]
    };
  }

  if (action === 'switch_strategy_template') {
    return {
      ...basePlan,
      priority: 'high',
      steps: [
        '切换到备选策略模板（趋势/均值/多因子）',
        '保留相同回测区间进行横向对比',
        '胜率与收益同时改善后再进入下一轮优化'
      ],
      guardrails: [
        '胜率目标 >= 45%',
        '避免仅追求胜率而显著牺牲收益'
      ]
    };
  }

  if (action === 'optimize_exit_ratio') {
    return {
      ...basePlan,
      steps: [
        '优先调整止盈止损比（Risk-Reward Ratio）',
        '固定入场条件，按网格搜索测试退出参数',
        '优先选择夏普与回撤同时改善的组合'
      ],
      guardrails: [
        '夏普目标 >= 1.0',
        '最大回撤不可恶化'
      ]
    };
  }

  if (action === 'increase_holding_period') {
    return {
      ...basePlan,
      steps: [
        '将最大持仓周期提高约 20%',
        '观察单笔盈亏分布是否向右偏移',
        '若交易频次骤降则回退一档周期'
      ],
      guardrails: [
        '收益率目标 >= 10%',
        '交易样本数保持可统计'
      ]
    };
  }

  if (action === 'complete_preflight_checklist') {
    return {
      ...basePlan,
      priority: 'high',
      steps: [
        '补齐实盘前检查缺口（偏差/风控参数/飞书测试）',
        '确认 deploymentReadiness 全部为 pass',
        '检查完成后再执行发布流程'
      ],
      guardrails: [
        'failedCount 必须为 0',
        'pendingCount 必须为 0'
      ]
    };
  }

  if (action === 'publish_to_strategy_library') {
    return {
      ...basePlan,
      priority: 'high',
      steps: [
        '将当前最佳参数发布到策略库',
        '写入版本备注与回测报告快照',
        '进入执行流做监控池与条件单验证'
      ],
      guardrails: [
        '发布前需保留可回滚版本',
        '发布后必须跟踪真实执行反馈'
      ]
    };
  }

  return {
    ...basePlan,
    steps: [
      '增加迭代轮数（建议 +50%）',
      '扩展参数搜索范围并保持边界约束',
      '优先保留得分提升最稳定的参数组合'
    ],
    guardrails: [
      '避免参数越界导致策略不可解释',
      '每轮需保留可复现实验记录'
    ]
  };
}

function buildTaskResponse(task) {
  if (!task) return null;

  const optimizationBackend = normalizeOptimizationBackend(task.optimizationBackend || task.inputSummary?.optimizationBackend);
  const inputSummary = task.inputSummary ? { ...task.inputSummary } : {
    stocks: task.stocks,
    startDate: task.startDate,
    endDate: task.endDate,
    config: task.config,
    parallelTasks: task.parallelTasks ?? null
  };
  inputSummary.optimizationBackend = optimizationBackend;

  const resultSummary = task.resultSummary || buildTaskResultSummary(task);
  const history = Array.isArray(task.history)
    ? task.history.slice(-10)
    : Array.isArray(resultSummary.history)
      ? resultSummary.history.slice(-10)
      : [];

  return {
    taskId: task.taskId,
    strategyType: task.strategyType,
    inputSummary,
    status: task.status,
    progress: task.progress ?? 0,
    currentIteration: task.currentIteration ?? 0,
    maxIterations: task.maxIterations ?? 0,
    scoreThreshold: task.scoreThreshold ?? null,
    bestScore: task.bestScore ?? 0,
    bestParams: task.bestParams ?? null,
    resultSummary,
    history,
    createdAt: task.createdAt || task.created_at || new Date().toISOString(),
    optimizationBackend,
    ...(task.error ? { error: task.error } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    ...(task.stoppedAt ? { stoppedAt: task.stoppedAt } : {}),
    ...(task.stopReason ? { stopReason: task.stopReason } : {})
  };
}

function buildTaskResultSummary(task) {
  const optimizationBackend = normalizeOptimizationBackend(task.optimizationBackend || task.inputSummary?.optimizationBackend);
  const requestedTrialsRaw = task.optunaTrialsRequested ?? task.resultSummary?.requestedTrials;
  const completedTrialsRaw = task.optunaTrialsCompleted ?? task.resultSummary?.completedTrials ?? task.resultSummary?.trialCount;
  const requestedTrials = parseOptionalFiniteNumber(requestedTrialsRaw);
  const completedTrials = parseOptionalFiniteNumber(completedTrialsRaw);
  const invalidReason = normalizeInvalidResultReason(task.invalidReason || task.resultSummary?.invalidReason);
  const tradeCount = (() => {
    const latestMetrics = getLatestMetricsFromHistory(task);
    return parseOptionalFiniteNumber(
      latestMetrics.tradeCount ??
      latestMetrics.totalTrades ??
      task.resultSummary?.tradeCount ??
      task.resultSummary?.totalTrades
    );
  })();
  const nextActionSuggestion = deriveNextActionSuggestion(task);
  const tuningPlan = deriveTuningPlan(task, nextActionSuggestion);
  const deploymentReadiness = deriveDeploymentReadiness(task);
  const validation = (() => {
    if (task.validation && typeof task.validation === 'object') {
      return task.validation;
    }
    const history = Array.isArray(task.history) ? task.history : [];
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const item = history[i];
      if (item && item.validation && typeof item.validation === 'object') {
        return item.validation;
      }
    }
    return null;
  })();

  return {
    status: task.status || null,
    optimizationBackend,
    bestScore: task.bestScore ?? null,
    bestParams: task.bestParams ?? null,
    finishedAt: task.finishedAt || task.completedAt || null,
    history: Array.isArray(task.history) ? task.history.slice(-10) : [],
    error: task.error || null,
    stoppedAt: task.stoppedAt || null,
    stopReason: task.stopReason || null,
    completedAt: task.completedAt || null,
    invalidResult: Boolean(task.invalidResult || invalidReason),
    invalidReason: invalidReason || null,
    invalidMessage: invalidReason ? formatInvalidResultMessage(invalidReason, {
      tradeCount,
      scoreThreshold: task.scoreThreshold,
      bestScore: task.bestScore
    }) : null,
    thresholdMet: parseOptionalFiniteNumber(task.scoreThreshold) !== null
      ? (parseOptionalFiniteNumber(task.bestScore) ?? 0) >= parseOptionalFiniteNumber(task.scoreThreshold)
      : null,
    tradeCount,
    nextActionSuggestion,
    tuningPlan,
    deploymentReadiness,
    validation,
    ...(optimizationBackend === 'optuna'
      ? {
          requestedTrials,
          completedTrials,
          trialCount: completedTrials
        }
      : {})
  };
}

function buildIterationVersionPayload(task) {
  const summary = task.resultSummary && typeof task.resultSummary === 'object'
    ? task.resultSummary
    : buildTaskResultSummary(task);
  const latestMetrics = getLatestMetricsFromHistory(task);

  return {
    versionId: task.taskId,
    strategyType: task.strategyType,
    strategyName: `自动迭代版本 ${task.taskId}`,
    config: task.bestParams || {},
    backtestScore: parseOptionalFiniteNumber(task.bestScore) ?? 0,
    sharpeRatio: parseOptionalFiniteNumber(latestMetrics.sharpeRatio),
    maxDrawdown: parseOptionalFiniteNumber(latestMetrics.maxDrawdown),
    calmarRatio: parseOptionalFiniteNumber(latestMetrics.calmarRatio),
    profitLossRatio: parseOptionalFiniteNumber(latestMetrics.profitLossRatio),
    winRate: parseOptionalFiniteNumber(latestMetrics.winRate),
    totalReturn: parseOptionalFiniteNumber(latestMetrics.totalReturn),
    createdAt: task.createdAt || new Date().toISOString(),
    changeLog: summary.invalidResult
      ? `自动迭代结果无效 - ${summary.invalidMessage || '缺少有效样本'}`
      : `自动迭代完成 - 得分: ${(parseOptionalFiniteNumber(task.bestScore) ?? 0).toFixed(1)}`,
    createdBy: 'iteration-manager'
  };
}

function buildVersionSemanticKey(version) {
  if (!version || typeof version !== 'object') return null;

  const name = String(version.strategy_name || '');
  const configJson = version.config_json ?? null;
  const displayScore = Number.isFinite(Number(version.display_score))
    ? Number(version.display_score).toFixed(4)
    : (Number.isFinite(Number(version.backtest_score)) ? Number(version.backtest_score).toFixed(4) : 'null');
  const publishBlockedReason = String(version.publish_blocked_reason || '');
  const invalidMessage = String(version.invalid_message || '');
  const feedbackStatus = String(version.execution_feedback_status || '');
  const confidence = String(version.execution_feedback_confidence || '');
  const invalidLegacy = version.invalid_legacy_result === true ? '1' : '0';

  if (!name.startsWith('自动迭代版本 ')) {
    return null;
  }

  return JSON.stringify({
    strategyType: version.strategy_type || '',
    configJson,
    displayScore,
    publishBlockedReason,
    invalidMessage,
    feedbackStatus,
    confidence,
    invalidLegacy
  });
}

async function ensureStrategyVersionFromTask(db, task) {
  if (!task || !task.taskId || !task.strategyType) return;

  const version = buildIterationVersionPayload(task);
  const existing = await db.getPromise(
    'SELECT rowid FROM strategy_versions WHERE version_id = ? ORDER BY rowid ASC LIMIT 1',
    [version.versionId]
  );

  if (existing?.rowid) {
    await db.runPromise(
      `
        UPDATE strategy_versions SET
          strategy_type = ?,
          strategy_name = ?,
          config_json = ?,
          backtest_score = ?,
          sharpe_ratio = ?,
          max_drawdown = ?,
          calmar_ratio = ?,
          profit_loss_ratio = ?,
          win_rate = ?,
          total_return = ?,
          created_at = ?,
          parent_version = ?,
          change_log = ?,
          created_by = ?
        WHERE rowid = ?
      `,
      [
        version.strategyType,
        version.strategyName,
        safeJsonStringify(version.config || {}),
        version.backtestScore,
        version.sharpeRatio,
        version.maxDrawdown,
        version.calmarRatio,
        version.profitLossRatio,
        version.winRate,
        version.totalReturn,
        version.createdAt,
        null,
        version.changeLog,
        version.createdBy,
        existing.rowid
      ]
    );
  } else {
    await db.runPromise(
      `
        INSERT INTO strategy_versions (
          version_id, strategy_type, strategy_name, config_json,
          backtest_score, sharpe_ratio, max_drawdown, calmar_ratio,
          profit_loss_ratio, win_rate, total_return,
          created_at, parent_version, change_log, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        version.versionId,
        version.strategyType,
        version.strategyName,
        safeJsonStringify(version.config || {}),
        version.backtestScore,
        version.sharpeRatio,
        version.maxDrawdown,
        version.calmarRatio,
        version.profitLossRatio,
        version.winRate,
        version.totalReturn,
        version.createdAt,
        null,
        version.changeLog,
        version.createdBy
      ]
    );
  }
}

async function syncIterationTaskRunsToStrategyVersions(db, strategyType) {
  await ensureIterationTaskRunsTable(db);

  const rows = await db.allPromise(
    `
      SELECT
        task_id,
        strategy_type,
        input_summary_json,
        status,
        progress,
        current_iteration,
        max_iterations,
        best_score,
        best_params_json,
        result_summary_json,
        created_at,
        updated_at
      FROM iteration_task_runs
      WHERE strategy_type = ?
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [strategyType]
  );

  for (const row of rows) {
    const resultSummary = safeJsonParse(row.result_summary_json, {});
    const task = {
      taskId: row.task_id,
      strategyType: row.strategy_type,
      inputSummary: safeJsonParse(row.input_summary_json, {}),
      status: row.status,
      progress: Number(row.progress ?? 0),
      currentIteration: Number(row.current_iteration ?? 0),
      maxIterations: Number(row.max_iterations ?? 0),
      bestScore: Number(row.best_score ?? 0),
      bestParams: safeJsonParse(row.best_params_json, {}),
      resultSummary,
      history: Array.isArray(resultSummary.history) ? resultSummary.history : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    await ensureStrategyVersionFromTask(db, task);
  }

  await db.runPromise(
    `
      DELETE FROM strategy_versions
      WHERE rowid NOT IN (
        SELECT MIN(rowid)
        FROM strategy_versions
        GROUP BY version_id
      )
    `
  );
}

function generateIterationReportMarkdown(taskPayload) {
  const task = taskPayload || {};
  const inputSummary = task.inputSummary && typeof task.inputSummary === 'object' ? task.inputSummary : {};
  const summary = task.resultSummary && typeof task.resultSummary === 'object' ? task.resultSummary : {};
  const readiness = summary.deploymentReadiness && typeof summary.deploymentReadiness === 'object'
    ? summary.deploymentReadiness
    : null;
  const checks = readiness && Array.isArray(readiness.checks) ? readiness.checks : [];
  const nextAction = summary.nextActionSuggestion && typeof summary.nextActionSuggestion === 'object'
    ? summary.nextActionSuggestion
    : null;
  const tuningPlan = summary.tuningPlan && typeof summary.tuningPlan === 'object'
    ? summary.tuningPlan
    : null;
  const stocks = Array.isArray(inputSummary.stocks) ? inputSummary.stocks : [];
  const bestParams = task.bestParams && typeof task.bestParams === 'object' ? task.bestParams : {};
  const bestParamEntries = Object.entries(bestParams);

  const lines = [
    '# 迭代任务回测报告',
    '',
    '## 任务信息',
    `- 任务 ID: ${task.taskId || '--'}`,
    `- 策略类型: ${task.strategyType || '--'}`,
    `- 优化后端: ${task.optimizationBackend || summary.optimizationBackend || '--'}`,
    `- 当前状态: ${task.status || summary.status || '--'}`,
    `- 创建时间: ${task.createdAt || '--'}`,
    `- 完成时间: ${summary.completedAt || task.completedAt || '--'}`,
    '',
    '## 回测输入',
    `- 股票池: ${stocks.length > 0 ? stocks.join(', ') : '--'}`,
    `- 时间区间: ${inputSummary.startDate || '--'} ~ ${inputSummary.endDate || '--'}`,
    `- 最大迭代次数: ${task.maxIterations ?? '--'}`,
    `- 目标分数: ${task.scoreThreshold ?? '--'}`,
    '',
    '## 结果摘要',
    `- 最佳得分: ${Number.isFinite(Number(task.bestScore)) ? Number(task.bestScore).toFixed(1) : '--'}`,
    `- 当前轮次: ${task.currentIteration ?? '--'} / ${task.maxIterations ?? '--'}`,
    `- 进度: ${Number.isFinite(Number(task.progress)) ? Number(task.progress).toFixed(0) : '--'}%`,
    `- 计划试验数: ${summary.requestedTrials ?? '--'}`,
    `- 完成试验数: ${summary.completedTrials ?? summary.trialCount ?? '--'}`,
    '',
    '## 最佳参数'
  ];

  if (bestParamEntries.length === 0) {
    lines.push('- 暂无最佳参数');
  } else {
    for (const [key, value] of bestParamEntries) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  lines.push('', '## 实盘前检查');
  if (!readiness) {
    lines.push('- 暂无检查结果');
  } else {
    lines.push(`- 实盘就绪: ${readiness.readyForLive ? '是' : '否'}`);
    lines.push(`- 失败项: ${readiness.failedCount ?? 0}`);
    lines.push(`- 待补齐: ${readiness.pendingCount ?? 0}`);
    lines.push('');
    lines.push('### 检查清单');
    if (checks.length === 0) {
      lines.push('- 暂无检查明细');
    } else {
      for (const check of checks) {
        lines.push(`- ${check.title || check.id || '--'}: ${check.status || '--'}${check.detail ? `（${check.detail}）` : ''}`);
      }
    }
  }

  lines.push('', '## 下一步建议');
  if (!nextAction) {
    lines.push('- 暂无建议');
  } else {
    lines.push(`- 建议动作: ${nextAction.title || nextAction.action || '--'}`);
    lines.push(`- 建议原因: ${nextAction.reason || '--'}`);
  }

  if (tuningPlan && Array.isArray(tuningPlan.steps) && tuningPlan.steps.length > 0) {
    lines.push('', '## 执行清单');
    lines.push(`- 优先级: ${tuningPlan.priority || '--'}`);
    for (const step of tuningPlan.steps) {
      lines.push(`- ${step}`);
    }
    if (Array.isArray(tuningPlan.guardrails) && tuningPlan.guardrails.length > 0) {
      lines.push('', '## 约束条件');
      for (const guardrail of tuningPlan.guardrails) {
        lines.push(`- ${guardrail}`);
      }
    }
  }

  lines.push('', `> 报告生成时间: ${new Date().toISOString()}`);
  return lines.join('\n');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateIterationReportHtml(taskPayload) {
  const task = taskPayload || {};
  const inputSummary = task.inputSummary && typeof task.inputSummary === 'object' ? task.inputSummary : {};
  const summary = task.resultSummary && typeof task.resultSummary === 'object' ? task.resultSummary : {};
  const readiness = summary && summary.deploymentReadiness && typeof summary.deploymentReadiness === 'object'
    ? summary.deploymentReadiness
    : null;
  const checks = readiness && Array.isArray(readiness.checks) ? readiness.checks : [];
  const nextAction = summary && summary.nextActionSuggestion && typeof summary.nextActionSuggestion === 'object'
    ? summary.nextActionSuggestion
    : null;
  const tuningPlan = summary && summary.tuningPlan && typeof summary.tuningPlan === 'object'
    ? summary.tuningPlan
    : null;
  const stocks = Array.isArray(inputSummary.stocks) ? inputSummary.stocks : [];
  const bestParams = task.bestParams && typeof task.bestParams === 'object' ? task.bestParams : {};
  const bestParamEntries = Object.entries(bestParams);

  const renderList = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return '<li>--</li>';
    }
    return items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  };

  const checkListHtml = checks.length === 0
    ? '<li>暂无检查明细</li>'
    : checks.map(check => {
      const title = check.title || check.id || '--';
      const suffix = check.detail ? `（${check.detail}）` : '';
      return `<li>${escapeHtml(`${title}: ${check.status || '--'}${suffix}`)}</li>`;
    }).join('');

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>迭代任务回测报告 - ${escapeHtml(task.taskId || '--')}</title>`,
    '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;margin:24px;line-height:1.6;color:#111}h1,h2,h3{margin:16px 0 8px}ul{margin:6px 0 14px 20px}code{background:#f5f5f5;padding:2px 4px;border-radius:4px}</style>',
    '</head>',
    '<body>',
    '<h1>迭代任务回测报告</h1>',
    '<h2>任务信息</h2>',
    '<ul>',
    `<li>任务 ID: ${escapeHtml(task.taskId || '--')}</li>`,
    `<li>策略类型: ${escapeHtml(task.strategyType || '--')}</li>`,
    `<li>优化后端: ${escapeHtml(task.optimizationBackend || summary.optimizationBackend || '--')}</li>`,
    `<li>当前状态: ${escapeHtml(task.status || summary.status || '--')}</li>`,
    `<li>创建时间: ${escapeHtml(task.createdAt || '--')}</li>`,
    `<li>完成时间: ${escapeHtml(summary.completedAt || task.completedAt || '--')}</li>`,
    '</ul>',
    '<h2>回测输入</h2>',
    '<ul>',
    `<li>股票池: ${escapeHtml(stocks.length > 0 ? stocks.join(', ') : '--')}</li>`,
    `<li>时间区间: ${escapeHtml(inputSummary.startDate || '--')} ~ ${escapeHtml(inputSummary.endDate || '--')}</li>`,
    `<li>最大迭代次数: ${escapeHtml(task.maxIterations ?? '--')}</li>`,
    `<li>目标分数: ${escapeHtml(task.scoreThreshold ?? '--')}</li>`,
    '</ul>',
    '<h2>结果摘要</h2>',
    '<ul>',
    `<li>最佳得分: ${escapeHtml(Number.isFinite(Number(task.bestScore)) ? Number(task.bestScore).toFixed(1) : '--')}</li>`,
    `<li>当前轮次: ${escapeHtml(task.currentIteration ?? '--')} / ${escapeHtml(task.maxIterations ?? '--')}</li>`,
    `<li>进度: ${escapeHtml(Number.isFinite(Number(task.progress)) ? Number(task.progress).toFixed(0) : '--')}%</li>`,
    `<li>计划试验数: ${escapeHtml(summary.requestedTrials ?? '--')}</li>`,
    `<li>完成试验数: ${escapeHtml(summary.completedTrials ?? summary.trialCount ?? '--')}</li>`,
    '</ul>',
    '<h2>最佳参数</h2>',
    `<ul>${bestParamEntries.length === 0 ? '<li>暂无最佳参数</li>' : bestParamEntries.map(([key, value]) => `<li>${escapeHtml(`${key}: ${value}`)}</li>`).join('')}</ul>`,
    '<h2>实盘前检查</h2>',
    readiness
      ? `<ul><li>实盘就绪: ${readiness.readyForLive ? '是' : '否'}</li><li>失败项: ${escapeHtml(readiness.failedCount ?? 0)}</li><li>待补齐: ${escapeHtml(readiness.pendingCount ?? 0)}</li></ul><h3>检查清单</h3><ul>${checkListHtml}</ul>`
      : '<ul><li>暂无检查结果</li></ul>',
    '<h2>下一步建议</h2>',
    nextAction
      ? `<ul><li>建议动作: ${escapeHtml(nextAction.title || nextAction.action || '--')}</li><li>建议原因: ${escapeHtml(nextAction.reason || '--')}</li></ul>`
      : '<ul><li>暂无建议</li></ul>',
    tuningPlan && Array.isArray(tuningPlan.steps) && tuningPlan.steps.length > 0
      ? `<h2>执行清单</h2><ul><li>优先级: ${escapeHtml(tuningPlan.priority || '--')}</li>${renderList(tuningPlan.steps)}</ul>`
      : '',
    tuningPlan && Array.isArray(tuningPlan.guardrails) && tuningPlan.guardrails.length > 0
      ? `<h2>约束条件</h2><ul>${renderList(tuningPlan.guardrails)}</ul>`
      : '',
    `<p>报告生成时间: <code>${escapeHtml(new Date().toISOString())}</code></p>`,
    '</body>',
    '</html>'
  ].join('');
}

async function ensureIterationTaskRunsTable(db) {
  await db.runPromise(ITERATION_TASK_RUNS_TABLE_SQL);
}

async function persistIterationTaskRun(task) {
  const db = await getDatabase();
  await ensureIterationTaskRunsTable(db);

  const taskResponse = buildTaskResponse(task);
  await db.runPromise(
    `
      INSERT INTO iteration_task_runs (
        task_id,
        strategy_type,
        input_summary_json,
        status,
        progress,
        current_iteration,
        max_iterations,
        best_score,
        best_params_json,
        result_summary_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        strategy_type = excluded.strategy_type,
        input_summary_json = excluded.input_summary_json,
        status = excluded.status,
        progress = excluded.progress,
        current_iteration = excluded.current_iteration,
        max_iterations = excluded.max_iterations,
        best_score = excluded.best_score,
        best_params_json = excluded.best_params_json,
        result_summary_json = excluded.result_summary_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `,
    [
      taskResponse.taskId,
      taskResponse.strategyType,
      safeJsonStringify(taskResponse.inputSummary),
      taskResponse.status,
      taskResponse.progress,
      taskResponse.currentIteration,
      taskResponse.maxIterations,
      taskResponse.bestScore,
      safeJsonStringify(taskResponse.bestParams),
      safeJsonStringify(buildTaskResultSummary(task)),
      taskResponse.createdAt,
      new Date().toISOString()
    ]
  );
}

async function loadIterationTaskRun(taskId) {
  const db = await getDatabase();
  await ensureIterationTaskRunsTable(db);

  const row = await db.getPromise(
    `
      SELECT
        task_id,
        strategy_type,
        input_summary_json,
        status,
        progress,
        current_iteration,
        max_iterations,
        best_score,
        best_params_json,
        result_summary_json,
        created_at,
        updated_at
      FROM iteration_task_runs
      WHERE task_id = ?
    `,
    [taskId]
  );

  if (!row) return null;

  const inputSummary = safeJsonParse(row.input_summary_json, {});
  const bestParams = safeJsonParse(row.best_params_json, null);
  const resultSummary = safeJsonParse(row.result_summary_json, {});
  const optimizationBackend = normalizeOptimizationBackend(inputSummary.optimizationBackend || resultSummary.optimizationBackend);
  inputSummary.optimizationBackend = optimizationBackend;
  resultSummary.optimizationBackend = optimizationBackend;

  return {
    taskId: row.task_id,
    strategyType: row.strategy_type,
    inputSummary,
    status: row.status,
    progress: Number(row.progress ?? 0),
    currentIteration: Number(row.current_iteration ?? 0),
    maxIterations: Number(row.max_iterations ?? 0),
    bestScore: Number(row.best_score ?? 0),
    bestParams,
    resultSummary,
    history: Array.isArray(resultSummary.history) ? resultSummary.history.slice(-10) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    optimizationBackend,
    ...(resultSummary.error ? { error: resultSummary.error } : {}),
    ...(resultSummary.completedAt ? { completedAt: resultSummary.completedAt } : {}),
    ...(resultSummary.stoppedAt ? { stoppedAt: resultSummary.stoppedAt } : {})
  };
}

/**
 * 启动自迭代任务
 * POST /api/iteration/start
 *
 * Request body:
 * - strategyType: 策略类型
 * - config: 初始配置
 * - maxIterations: 最大迭代次数
 * - scoreThreshold: 目标分数阈值
 * - stocks: 股票池
 * - startDate: 回测开始日期
 * - endDate: 回测结束日期
 */
router.post('/start', async (req, res) => {
  try {
    const {
      strategyType,
      config,
      maxIterations = 10,
      scoreThreshold = 80,
      stocks,
      startDate,
      endDate,
      optimizationBackend,
      parallelTasks
    } = req.body;

    if (!strategyType || !stocks || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：strategyType, stocks, startDate, endDate'
      });
    }

    const taskId = `ITER_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const normalizedOptimizationBackend = normalizeOptimizationBackend(optimizationBackend);
    const normalizedMaxIterations = normalizeIterationCount(maxIterations, 10);
    const normalizedScoreThreshold = normalizeScoreThreshold(scoreThreshold, 80);
    const normalizedParallelTasks = normalizeParallelTasks(parallelTasks);
    const { supportedStocks, excludedStocks } = await filterStocksByRealDataCoverage(stocks, startDate, endDate);

    let finalStocks = supportedStocks;
    let autoAddedStocks = [];
    let autoExcludedStocks = [];
    if (String(strategyType || '').toLowerCase() === 'seven_factor') {
      try {
        const db = await getDatabase();
        const augmented = await augmentSevenFactorStocks(db, supportedStocks, startDate, endDate, 20);
        autoAddedStocks = augmented.added;
        const rechecked = await filterStocksByRealDataCoverage(augmented.stocks, startDate, endDate);
        finalStocks = rechecked.supportedStocks;
        autoExcludedStocks = rechecked.excludedStocks.filter(code => augmented.added.includes(code));
      } catch (augmentError) {
        console.warn('[迭代管理器] seven_factor 股票池自动扩展失败，回退原始股票池:', augmentError.message);
      }
    }

    if (finalStocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '当前股票池在指定区间内缺少真实行情数据，无法启动迭代任务',
        excludedStocks
      });
    }

    // 创建任务记录
    const task = {
      taskId,
      strategyType,
      optimizationBackend: normalizedOptimizationBackend,
      config: config || {},
      inputSummary: {
        stocks: finalStocks,
        excludedStocks,
        autoExcludedStocks,
        autoAddedStocks,
        startDate,
        endDate,
        config: config || {},
        parallelTasks: normalizedParallelTasks,
        optimizationBackend: normalizedOptimizationBackend
      },
      maxIterations: normalizedMaxIterations,
      scoreThreshold: normalizedScoreThreshold,
      stocks: finalStocks,
      startDate,
      endDate,
      parallelTasks: normalizedParallelTasks,
      status: 'pending',
      progress: 0,
      currentIteration: 0,
      bestScore: 0,
      bestParams: null,
      history: [],
      createdAt: new Date().toISOString()
    };
    if (normalizedOptimizationBackend === 'optuna') {
      task.optunaTrialsRequested = normalizedMaxIterations;
    }

    activeTasks.set(taskId, task);
    try {
      await persistIterationTaskRun(task);
    } catch (persistError) {
      console.error(`[迭代任务 ${taskId}] 快照保存失败:`, persistError);
    }

    // 异步执行迭代优化
    runIterationTask(taskId).catch(err => {
      console.error(`[迭代任务 ${taskId}] 执行失败:`, err);
      const t = activeTasks.get(taskId);
      if (t) {
        if (t.status === 'stopped') {
          t.resultSummary = buildTaskResultSummary(t);
          persistIterationTaskRun(t).catch(persistError => {
            console.error(`[迭代任务 ${taskId}] 停止态快照保存失败:`, persistError);
          });
          return;
        }
        finalizeTaskAsFailed(
          t,
          inferInvalidReasonFromError(err?.message),
          err?.message || '任务执行失败'
        );
        persistIterationTaskRun(t).catch(persistError => {
          console.error(`[迭代任务 ${taskId}] 失败快照保存失败:`, persistError);
        });
      }
    });

    res.json({
      success: true,
      taskId,
      message: (() => {
        const parts = ['迭代任务已启动'];
        if (excludedStocks.length > 0) {
          parts.push(`已自动排除 ${excludedStocks.length} 只缺少真实行情数据的股票`);
        }
        if (autoAddedStocks.length > 0) {
          parts.push(`seven_factor 已自动补充 ${autoAddedStocks.length} 只高覆盖样本股票`);
        }
        if (autoExcludedStocks.length > 0) {
          parts.push(`其中 ${autoExcludedStocks.length} 只补充股票因缺少真实行情已自动剔除`);
        }
        return parts.join('，');
      })(),
      excludedStocks,
      autoAddedStocks,
      autoExcludedStocks
    });
  } catch (error) {
    console.error('[迭代管理器] 启动失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 停止自迭代任务
 * POST /api/iteration/stop/:taskId
 */
router.post('/stop/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = activeTasks.get(taskId);

  if (!task) {
    return res.status(404).json({
      success: false,
      error: '任务不存在'
    });
  }

  task.status = 'stopped';
  task.stopReason = 'manual_stop';
  task.stoppedAt = new Date().toISOString();
  const optunaProcess = task.optunaProcess;
  if (optunaProcess && typeof optunaProcess.kill === 'function') {
    try {
      optunaProcess.kill('SIGTERM');
    } catch (error) {
      console.warn(`[迭代任务 ${taskId}] 终止 Optuna 子进程失败:`, error.message);
    }
  }
  task.resultSummary = buildTaskResultSummary(task);
  persistIterationTaskRun(task).catch(error => {
    console.error(`[迭代任务 ${taskId}] 停止快照保存失败:`, error);
  });

  res.json({
    success: true,
    message: '任务已停止',
    task: buildTaskResponse(task)
  });
});

/**
 * 获取任务状态
 * GET /api/iteration/status/:taskId
 */
router.get('/status/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const task = activeTasks.get(taskId);

  if (task) {
    return res.json({
      success: true,
      task: buildTaskResponse(task)
    });
  }

  try {
    const snapshot = await loadIterationTaskRun(taskId);

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: '任务不存在'
      });
    }

    if (snapshot.status === 'running' || snapshot.status === 'pending') {
      // 进程内没有活跃任务，说明原执行进程已丢失（例如服务重启中断）。
      snapshot.status = 'failed';
      snapshot.error = snapshot.error || '迭代任务执行进程已中断，请重新发起任务。';
      snapshot.invalidResult = true;
      snapshot.invalidReason = snapshot.invalidReason || 'process_interrupted';
      snapshot.finishedAt = snapshot.finishedAt || new Date().toISOString();
      snapshot.resultSummary = buildTaskResultSummary(snapshot);
      persistIterationTaskRun(snapshot).catch(persistError => {
        console.error(`[迭代任务 ${taskId}] 中断态快照保存失败:`, persistError);
      });
    }

    return res.json({
      success: true,
      task: snapshot
    });
  } catch (error) {
    console.error(`[迭代任务 ${taskId}] 查询快照失败:`, error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 导出迭代任务报告
 * GET /api/iteration/report/:taskId?format=markdown|html
 */
router.get('/report/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const format = String(req.query.format || 'markdown').toLowerCase();
  const download = String(req.query.download || '') === '1';

  if (format !== 'markdown' && format !== 'html') {
    return res.status(400).json({
      success: false,
      error: '仅支持 format=markdown/html'
    });
  }

  const activeTask = activeTasks.get(taskId);
  let taskPayload = activeTask ? buildTaskResponse(activeTask) : null;

  if (!taskPayload) {
    try {
      taskPayload = await loadIterationTaskRun(taskId);
    } catch (error) {
      console.error(`[迭代任务 ${taskId}] 报告加载失败:`, error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (!taskPayload) {
    return res.status(404).json({
      success: false,
      error: '任务不存在'
    });
  }

  const isHtml = format === 'html';
  const reportContent = isHtml
    ? generateIterationReportHtml(taskPayload)
    : generateIterationReportMarkdown(taskPayload);

  if (download) {
    const fileName = `${taskId}_report.${isHtml ? 'html' : 'md'}`;
    res.setHeader('Content-Type', `${isHtml ? 'text/html' : 'text/markdown'}; charset=utf-8`);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(reportContent);
  }

  return res.json({
    success: true,
    data: {
      taskId,
      format: isHtml ? 'html' : 'markdown',
      fileName: `${taskId}_report.${isHtml ? 'html' : 'md'}`,
      generatedAt: new Date().toISOString(),
      ...(isHtml ? { html: reportContent } : { markdown: reportContent })
    }
  });
});

/**
 * 默认 execution_summary 值
 */
const DEFAULT_EXECUTION_SUMMARY = {
  simulated_trade_count: 0,
  position_closed_count: 0,
  win_rate: 0,
  total_realized_pnl: 0,
  avg_realized_return: 0,
  avg_holding_days: 0,
  trigger_failure_count: 0,
  trigger_failure_rate: 0
};

/**
 * 根据 execution_summary 推断执行反馈状态
 * @param {Object} summary - execution_summary 对象
 * @returns {{ status: string, confidence: string }}
 */
function deriveExecutionFeedbackStatus(summary) {
  // 默认值处理
  const s = {
    position_closed_count: summary?.position_closed_count ?? 0,
    simulated_trade_count: summary?.simulated_trade_count ?? 0,
    trigger_failure_count: summary?.trigger_failure_count ?? 0,
    trigger_failure_rate: summary?.trigger_failure_rate ?? 0,
    total_realized_pnl: summary?.total_realized_pnl ?? 0,
    win_rate: summary?.win_rate ?? 0
  };

  // 计算 confidence
  let confidence;
  if (s.position_closed_count >= 10) {
    confidence = 'high';
  } else if (s.position_closed_count >= 3) {
    confidence = 'medium';
  } else if (s.position_closed_count >= 1) {
    confidence = 'low';
  } else {
    confidence = 'none';
  }

  // 计算 status
  let status;
  if (s.position_closed_count === 0 && s.simulated_trade_count === 0 && s.trigger_failure_count === 0) {
    status = 'no_data';
  } else if (s.trigger_failure_rate >= 0.4) {
    status = 'caution';
  } else if (s.total_realized_pnl > 0 && s.win_rate >= 0.5) {
    status = 'positive';
  } else if (s.total_realized_pnl < 0 || s.win_rate < 0.4) {
    status = 'caution';
  } else {
    status = 'mixed';
  }

  return { status, confidence };
}

function hasExecutionSample(summary) {
  const s = summary || {};
  return Number(s.simulated_trade_count || 0) > 0
    || Number(s.position_closed_count || 0) > 0
    || Number(s.trigger_failure_count || 0) > 0;
}

function classifyVersionValidity(version, executionSummary) {
  const score = Number(version?.backtest_score ?? 0);
  const hasSample = hasExecutionSample(executionSummary);
  const noDataStatus = (version?.execution_feedback_status || 'no_data') === 'no_data';
  const looksLikeLegacyFallback = !hasSample && noDataStatus && score === 50;
  const invalid = looksLikeLegacyFallback;
  const missingExecutionEvidence = !hasSample && noDataStatus;
  const scoreQualifiedForPublish = Number.isFinite(score) && score >= 75;
  const canPublish = !invalid && (hasSample || scoreQualifiedForPublish);

  return {
    has_execution_sample: hasSample,
    invalid_legacy_result: invalid,
    invalid_reason: invalid ? 'no_trade_samples' : null,
    invalid_message: invalid ? '历史版本未产生任何交易样本，旧逻辑曾回填 50 分；该记录不应视为有效迭代结果。' : null,
    display_score: invalid ? null : score,
    publish_blocked_reason: canPublish
      ? null
      : (
        missingExecutionEvidence
          ? '该版本尚无执行反馈样本且评分未达 75 分，暂不允许发布到策略库。'
          : '当前版本不满足发布条件。'
      ),
    publish_warning: !hasSample && scoreQualifiedForPublish
      ? '该版本暂无执行反馈样本，允许先发布；请在发布后尽快补齐模拟/实盘验证。'
      : null,
    can_publish: canPublish
  };
}

/**
 * 聚合 execution_feedback 数据，生成 execution_summary
 * @param {Object} db - 数据库连接
 * @param {string} versionId - 策略版本 ID
 * @returns {Object} execution_summary
 */
async function aggregateExecutionFeedback(db, versionId) {
  try {
    // 检查 execution_feedback 表是否存在
    const tableCheck = await db.getPromise(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'execution_feedback'
    `);

    if (!tableCheck) {
      return { ...DEFAULT_EXECUTION_SUMMARY };
    }

    // 聚合各类统计数据
    const stats = await db.getPromise(`
      SELECT
        COUNT(CASE WHEN event_type = 'simulated_trade' THEN 1 END) AS simulated_trade_count,
        COUNT(CASE WHEN event_type = 'position_closed' THEN 1 END) AS position_closed_count,
        COUNT(CASE WHEN event_type = 'conditional_trigger' THEN 1 END) AS trigger_failure_count,
        SUM(CASE WHEN event_type = 'position_closed' THEN realized_pnl ELSE 0 END) AS total_realized_pnl,
        AVG(CASE WHEN event_type = 'position_closed' THEN realized_pnl ELSE NULL END) AS avg_realized_pnl,
        AVG(CASE WHEN event_type = 'position_closed' AND realized_pnl IS NOT NULL THEN realized_return ELSE NULL END) AS avg_realized_return,
        AVG(CASE WHEN event_type = 'position_closed' AND holding_days IS NOT NULL THEN holding_days ELSE NULL END) AS avg_holding_days,
        COUNT(CASE WHEN event_type = 'position_closed' AND realized_pnl > 0 THEN 1 END) AS win_count
      FROM execution_feedback
      WHERE version_id = ?
    `, [versionId]);

    const simulatedTradeCount = stats.simulated_trade_count || 0;
    const positionClosedCount = stats.position_closed_count || 0;
    const triggerFailureCount = stats.trigger_failure_count || 0;
    const winCount = stats.win_count || 0;

    // 计算 win_rate
    const winRate = positionClosedCount > 0 ? winCount / positionClosedCount : 0;

    // 计算 trigger_failure_rate
    const triggerTotal = triggerFailureCount + simulatedTradeCount;
    const triggerFailureRate = triggerTotal > 0 ? triggerFailureCount / triggerTotal : 0;

    return {
      simulated_trade_count: simulatedTradeCount,
      position_closed_count: positionClosedCount,
      win_rate: Math.round(winRate * 10000) / 10000, // 保留4位小数
      total_realized_pnl: Math.round((stats.total_realized_pnl || 0) * 100) / 100,
      avg_realized_return: stats.avg_realized_return !== null
        ? Math.round(stats.avg_realized_return * 10000) / 10000
        : 0,
      avg_holding_days: stats.avg_holding_days !== null
        ? Math.round(stats.avg_holding_days * 100) / 100
        : 0,
      trigger_failure_count: triggerFailureCount,
      trigger_failure_rate: Math.round(triggerFailureRate * 10000) / 10000
    };
  } catch (error) {
    console.error(`[execution_summary] 聚合失败 versionId=${versionId}:`, error);
    return { ...DEFAULT_EXECUTION_SUMMARY };
  }
}

async function enrichVersionsWithExecutionFeedback(db, versions) {
  return Promise.all(
    versions.map(async (version) => {
      const executionSummary = await aggregateExecutionFeedback(db, version.version_id);
      const { status, confidence } = deriveExecutionFeedbackStatus(executionSummary);
      const validity = classifyVersionValidity({
        ...version,
        execution_feedback_status: status
      }, executionSummary);
      return {
        ...version,
        execution_summary: executionSummary,
        execution_feedback_status: status,
        execution_feedback_confidence: confidence,
        ...validity
      };
    })
  );
}

/**
 * 为版本列表补充发布状态字段
 * 通过 strategy_config_feedback.source_version_id -> strategy_configs.id 关联
 * @param {Object} db - 数据库连接
 * @param {Array} versions - 版本列表
 * @returns {Promise<Array>} 补充发布状态后的版本列表
 */
async function enrichVersionsWithPublishStatus(db, versions) {
  if (!versions || versions.length === 0) {
    return versions;
  }

  const versionIds = versions.map(v => v.version_id);
  const fallbackVersions = versions.map((version) => ({
    ...version,
    published_strategy_config_id: null,
    is_published_to_library: false
  }));

  // 查询已发布的版本映射（只查询公开策略）
  // 如果一个版本对应多个公开策略，返回最大的 strategy_config_id
  let publishedMap = [];
  try {
    publishedMap = await db.allPromise(`
      SELECT
        scf.source_version_id,
        MAX(sc.id) as strategy_config_id
      FROM strategy_config_feedback scf
      INNER JOIN strategy_configs sc ON scf.strategy_config_id = sc.id
      WHERE scf.source_version_id IN (${versionIds.map(() => '?').join(',')})
        AND sc.is_public = 1
      GROUP BY scf.source_version_id
    `, versionIds);
  } catch (error) {
    if (String(error.message || error).includes('no such table')) {
      return fallbackVersions;
    }
    throw error;
  }

  // 构建版本 ID -> 策略配置 ID 的映射
  const publishLookup = new Map();
  for (const row of publishedMap) {
    publishLookup.set(row.source_version_id, row.strategy_config_id);
  }

  // 为每个版本补充发布状态字段
  return versions.map(version => {
    const publishedConfigId = publishLookup.get(version.version_id) || null;
    return {
      ...version,
      published_strategy_config_id: publishedConfigId,
      is_published_to_library: publishedConfigId !== null
    };
  });
}

async function enrichVersionsWithTaskSnapshot(db, versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    return versions;
  }

  const versionIds = versions.map(v => v.version_id).filter(Boolean);
  if (versionIds.length === 0) {
    return versions;
  }

  let snapshots = [];
  try {
    snapshots = await db.allPromise(`
      SELECT task_id, status, result_summary_json
      FROM iteration_task_runs
      WHERE task_id IN (${versionIds.map(() => '?').join(',')})
    `, versionIds);
  } catch (error) {
    if (String(error.message || error).includes('no such table')) {
      return versions;
    }
    throw error;
  }

  const snapshotLookup = new Map();
  for (const row of snapshots) {
    snapshotLookup.set(row.task_id, row);
  }

  return versions.map((version) => {
    const snapshot = snapshotLookup.get(version.version_id);
    if (!snapshot) {
      return version;
    }

    const resultSummary = safeJsonParse(snapshot.result_summary_json, {}) || {};
    const invalidReason = normalizeInvalidResultReason(resultSummary.invalidReason);
    const snapshotStatus = String(snapshot.status || '').toLowerCase();
    const isFailedSnapshot = snapshotStatus === 'failed' || snapshotStatus === 'stopped';
    const hasInvalidResult = Boolean(resultSummary.invalidResult) || Boolean(invalidReason);

    if (!isFailedSnapshot && !hasInvalidResult) {
      return version;
    }

    const tradeCount = parseOptionalFiniteNumber(resultSummary.tradeCount);
    const invalidMessage = String(resultSummary.invalidMessage || '').trim() || formatInvalidResultMessage(
      invalidReason || 'invalid_optuna_result',
      {
        tradeCount,
        bestScore: parseOptionalFiniteNumber(version?.backtest_score ?? 0),
        scoreThreshold: parseOptionalFiniteNumber(resultSummary?.scoreThreshold ?? null)
      }
    );

    return {
      ...version,
      invalid_reason: invalidReason || 'invalid_optuna_result',
      invalid_message: invalidMessage,
      can_publish: false,
      publish_warning: null,
      publish_blocked_reason: invalidMessage
    };
  });
}

function ensureVersionFeedbackDefaults(version) {
  const executionSummary = version?.execution_summary && typeof version.execution_summary === 'object'
    ? version.execution_summary
    : { ...DEFAULT_EXECUTION_SUMMARY };

  return {
    ...version,
    execution_summary: executionSummary,
    execution_feedback_status: version?.execution_feedback_status || 'no_data',
    execution_feedback_confidence: version?.execution_feedback_confidence || 'none'
  };
}

/**
 * 获取版本历史
 * GET /api/iteration/versions/:strategyType
 */
router.get('/versions/:strategyType', async (req, res) => {
  try {
    const { strategyType } = req.params;
    const db = await getDatabase();
    await syncIterationTaskRunsToStrategyVersions(db, strategyType);

    const versions = await db.allPromise(`
      SELECT version_id, strategy_name, config_json, backtest_score,
             sharpe_ratio, max_drawdown, calmar_ratio,
             profit_loss_ratio, win_rate, total_return,
             created_at, parent_version, change_log
      FROM strategy_versions
      WHERE strategy_type = ?
      ORDER BY created_at DESC
      LIMIT 50
    `, [strategyType]);

    // 为每个版本添加 execution_summary 和 execution_feedback_status
    let versionsWithSummary = await enrichVersionsWithExecutionFeedback(db, versions);

    // 补充发布状态字段
    versionsWithSummary = await enrichVersionsWithPublishStatus(db, versionsWithSummary);
    // 对齐任务快照中的 invalid_reason / invalid_message，避免失败任务在版本列表中被误判为可用
    versionsWithSummary = await enrichVersionsWithTaskSnapshot(db, versionsWithSummary);
    versionsWithSummary = versionsWithSummary.map(ensureVersionFeedbackDefaults);
    const dedupedVersions = [];
    const seenDisplayNames = new Set();
    const seenSemanticKeys = new Set();

    for (const version of versionsWithSummary) {
      const displayKey = String(version.strategy_name || version.version_id || '').trim();
      const semanticKey = buildVersionSemanticKey(version);
      if (semanticKey && seenSemanticKeys.has(semanticKey)) {
        continue;
      }
      if (displayKey) {
        seenDisplayNames.add(displayKey);
      }
      if (semanticKey) {
        seenSemanticKeys.add(semanticKey);
      } else if (displayKey && seenDisplayNames.has(displayKey) && dedupedVersions.some(item => String(item.strategy_name || item.version_id || '').trim() === displayKey)) {
        continue;
      }
      dedupedVersions.push(version);
    }

    res.json({ success: true, versions: dedupedVersions });
  } catch (error) {
    console.error('[版本历史] 查询失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 策略版本对比
 * GET /api/iteration/compare?versionIds=v1,v2,v3
 */
router.get('/compare', async (req, res) => {
  try {
    const { versionIds } = req.query;

    if (!versionIds) {
      return res.status(400).json({
        success: false,
        error: '缺少 versionIds 参数'
      });
    }

    const db = await getDatabase();
    const ids = versionIds.split(',').map(id => id.trim());

    const versions = await Promise.all(
      ids.map(id => db.getPromise(`
        SELECT version_id, strategy_type, strategy_name, config_json,
               backtest_score, sharpe_ratio, max_drawdown, calmar_ratio,
               profit_loss_ratio, win_rate, total_return,
               created_at, parent_version, change_log
        FROM strategy_versions
        WHERE version_id = ?
      `, [id]))
    );

    const validVersions = versions.filter(v => v !== undefined);

    if (validVersions.length === 0) {
      return res.status(404).json({
        success: false,
        error: '未找到有效的版本记录'
      });
    }

    // 为每个版本添加 execution_summary 和 execution_feedback_status
    const versionsWithFeedback = (await enrichVersionsWithExecutionFeedback(db, validVersions)).map((version) => ({
      ...version,
      config_json: version.config_json ? JSON.parse(version.config_json) : {}
    }));

    // 对比分析
    const metrics = ['backtest_score', 'sharpe_ratio', 'max_drawdown', 'calmar_ratio', 'profit_loss_ratio', 'win_rate', 'total_return'];
    const comparison = {
      versions: versionsWithFeedback,
      metrics,
      best: validVersions.reduce((best, v) =>
        (v.backtest_score || 0) > (best.backtest_score || 0) ? v : best
      )
    };

    res.json({ success: true, comparison });
  } catch (error) {
    console.error('[版本对比] 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 执行优化
 * POST /api/iteration/optimize
 *
 * 使用网格搜索或贝叶斯优化寻找最优参数
 */
router.post('/optimize', async (req, res) => {
  try {
    const {
      strategyType,
      paramRanges,
      stocks,
      startDate,
      endDate,
      initialCash = 1000000,
      optimizationMethod = 'grid' // 'grid' or 'bayesian'
    } = req.body;

    if (!paramRanges || !stocks || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：paramRanges, stocks, startDate, endDate'
      });
    }

    console.log(`[优化器] 开始优化: ${strategyType || 'default'}`);
    console.log(`[优化器] 参数范围:`, JSON.stringify(paramRanges));
    console.log(`[优化器] 方法: ${optimizationMethod}`);

    // 执行网格搜索优化
    const results = await runGridSearch({
      paramRanges,
      stocks,
      startDate,
      endDate,
      initialCash,
      strategyType: strategyType || 'double_ma'
    });

    // 按综合得分排序
    results.sort((a, b) => b.score - a.score);

    const best = results[0];

    // 保存最优版本
    if (best) {
      const scorer = new StrategyScorer();
      const versionId = scorer.saveVersion({
        strategyType: strategyType || 'double_ma',
        strategyName: `优化版本 ${new Date().toISOString().slice(0, 10)}`,
        config: best.params,
        backtestScore: best.score,
        sharpeRatio: best.metrics.sharpeRatio,
        maxDrawdown: best.metrics.maxDrawdown,
        calmarRatio: best.metrics.calmarRatio,
        profitLossRatio: best.metrics.profitLossRatio,
        winRate: best.metrics.winRate,
        totalReturn: best.metrics.totalReturn,
        changeLog: `自动优化 - 得分: ${best.score.toFixed(2)}`
      });
      scorer.close();

      best.versionId = versionId;
    }

    res.json({
      success: true,
      data: {
        best,
        totalScenarios: results.length,
        topResults: results.slice(0, 5)
      }
    });
  } catch (error) {
    console.error('[优化器] 执行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 计算策略评分
 * POST /api/iteration/score
 */
router.post('/score', async (req, res) => {
  try {
    const {
      sharpeRatio,
      maxDrawdown,
      calmarRatio,
      profitLossRatio,
      winRate,
      totalReturn
    } = req.body;

    const metrics = {
      sharpeRatio: sharpeRatio || 0,
      maxDrawdown: maxDrawdown || 0,
      calmarRatio: calmarRatio || 0,
      profitLossRatio: profitLossRatio || 0,
      winRate: winRate || 0,
      totalReturn: totalReturn || 0
    };

    const scoreResult = quickScore(metrics);

    res.json({
      success: true,
      data: scoreResult
    });
  } catch (error) {
    console.error('[评分器] 计算失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 运行迭代任务（内部函数）
 */
async function runIterationTask(taskId) {
  const task = activeTasks.get(taskId);
  if (!task) return;

  task.status = 'running';
  task.resultSummary = buildTaskResultSummary(task);
  persistIterationTaskRun(task).catch(error => {
    console.error(`[迭代任务 ${taskId}] 运行快照保存失败:`, error);
  });
  console.log(`[迭代任务 ${taskId}] 开始执行，目标分数: ${task.scoreThreshold}`);

  const optimizationBackend = normalizeOptimizationBackend(task.optimizationBackend || task.inputSummary?.optimizationBackend);
  if (optimizationBackend === 'optuna') {
    await runOptunaIterationTask(task);
    return;
  }

  await runHeuristicIterationTask(task);
}

async function runOptunaIterationTask(task) {
  const { taskId, strategyType, stocks, startDate, endDate, maxIterations, config } = task;
  const scriptPath = path.resolve(__dirname, '../scripts/optuna_optimizer.py');
  const stocksArg = Array.isArray(stocks) ? stocks.join(',') : String(stocks || '');
  const args = [
    scriptPath,
    strategyType,
    '--stocks',
    stocksArg,
    '--start',
    startDate,
    '--end',
    endDate,
    '--n-trials',
    String(maxIterations)
  ];
  if (config && typeof config === 'object' && Object.keys(config).length > 0) {
    args.push('--seed-params', JSON.stringify(config));
  }

  console.log(`[迭代任务 ${taskId}] 启动 Optuna: python3 ${args.join(' ')}`);

  let childRef = null;
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      const child = spawn('python3', args, {
        cwd: path.resolve(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      childRef = child;
      task.optunaProcess = child;

      let stdout = '';
      let stderr = '';
      const updateOptunaProgress = (textChunk) => {
        if (!textChunk) return;
        const regex = /OPTUNA_PROGRESS:(\d+)\/(\d+)/g;
        let match;
        while ((match = regex.exec(textChunk)) !== null) {
          const completed = Number(match[1]);
          const total = Number(match[2]);
          if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) {
            continue;
          }
          task.currentIteration = Math.min(completed, total);
          task.progress = Math.max(0, Math.min(100, Math.round((task.currentIteration / total) * 100)));
          task.optunaTrialsRequested = total;
          task.optunaTrialsCompleted = task.currentIteration;
          persistIterationTaskRun(task).catch(error => {
            console.error(`[迭代任务 ${taskId}] Optuna 进度快照保存失败:`, error);
          });
        }
      };

      if (child.stdout) {
        child.stdout.on('data', chunk => {
          const text = chunk.toString();
          stdout += text;
          updateOptunaProgress(text);
        });
      }

      if (child.stderr) {
        child.stderr.on('data', chunk => {
          const text = chunk.toString();
          stderr += text;
          updateOptunaProgress(text);
        });
      }

      child.on('error', (error) => {
        if (task.status === 'stopped') {
          resolve({ stopped: true });
          return;
        }
        reject(error);
      });
      child.on('close', code => {
        if (task.status === 'stopped') {
          resolve({ stopped: true });
          return;
        }

        if (code !== 0) {
          const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
          reject(new Error(`Optuna 优化失败: ${detail}`));
          return;
        }

        const raw = stdout.trim();
        if (!raw) {
          reject(new Error('Optuna 优化失败: stdout 为空'));
          return;
        }

        try {
          const payload = JSON.parse(raw);
          resolve(payload);
        } catch (error) {
          reject(new Error(`Optuna 输出不是有效 JSON: ${error.message}`));
        }
      });
    });
  } finally {
    if (task.optunaProcess === childRef) {
      task.optunaProcess = null;
    }
  }

  if (result?.stopped) {
    return;
  }

  const bestScore = Number(result.best_score ?? result.bestScore ?? result.scoreTotal ?? 0);
  const bestParams = result.best_params ?? result.bestParams ?? null;
  const completedTrialsRaw = result.trials ?? result.completed_trials ?? result.completedTrials ?? result.n_trials ?? result.nTrials ?? maxIterations;
  const completedTrials = parseOptionalFiniteNumber(completedTrialsRaw);
  const bestMetrics = result.metrics && typeof result.metrics === 'object' ? { ...result.metrics } : {};
  const validation = result.validation && typeof result.validation === 'object' ? result.validation : null;
  const tradeCount = parseOptionalFiniteNumber(
    result.trade_count ??
    result.tradeCount ??
    result.total_trades ??
    result.totalTrades
  );
  if (tradeCount !== null) {
    if (bestMetrics.tradeCount === undefined) {
      bestMetrics.tradeCount = tradeCount;
    }
    if (bestMetrics.totalTrades === undefined) {
      bestMetrics.totalTrades = tradeCount;
    }
  }

  task.currentIteration = maxIterations;
  task.progress = 100;
  task.bestScore = Number.isFinite(bestScore) ? bestScore : 0;
  task.bestParams = bestParams;
  task.optunaTrialsRequested = maxIterations;
  task.optunaTrialsCompleted = completedTrials;
  task.history = [
    {
      iteration: completedTrials ?? maxIterations,
      score: task.bestScore,
      params: bestParams,
      metrics: bestMetrics,
      validation
    }
  ];
  task.error = null;
  task.validation = validation;

  if (!bestParams || typeof bestParams !== 'object') {
    finalizeTaskAsFailed(task, 'invalid_optuna_result');
  } else if (tradeCount === null) {
    finalizeTaskAsFailed(task, 'invalid_optuna_result', null, { tradeCount: 0 });
  } else if (tradeCount <= 0) {
    finalizeTaskAsFailed(task, 'no_trade_samples', null, { tradeCount });
  } else if (tradeCount < MIN_VALID_TRADE_SAMPLES) {
    finalizeTaskAsFailed(task, 'insufficient_trade_samples', null, { tradeCount });
  } else if (task.bestScore < task.scoreThreshold) {
    finalizeTaskAsFailed(task, 'threshold_not_reached');
  } else {
    task.invalidResult = false;
    task.invalidReason = null;
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.finishedAt = task.completedAt;
    task.resultSummary = buildTaskResultSummary(task);
  }

  persistIterationTaskRun(task).catch(error => {
    console.error(`[迭代任务 ${taskId}] Optuna 完成快照保存失败:`, error);
  });

  if (task.status === 'completed') {
    Promise.resolve(getDatabase())
      .then(db => ensureStrategyVersionFromTask(db, task))
      .catch(error => {
        console.error(`[迭代任务 ${taskId}] 策略版本同步失败:`, error);
      });
  }
}

async function runHeuristicIterationTask(task) {
  const { taskId, strategyType, config, stocks, startDate, endDate, maxIterations, scoreThreshold } = task;

  // 初始参数
  let currentParams = { ...config };
  let bestScore = 0;
  let bestParams = null;
  let validSampleCount = 0;
  let latestTradeCount = null;

  for (let i = 0; i < maxIterations; i++) {
    // 检查是否被停止
    if (task.status === 'stopped') {
      console.log(`[迭代任务 ${taskId}] 已停止`);
      return;
    }

    task.currentIteration = i + 1;
    task.progress = Math.round((i + 1) / maxIterations * 100);

    console.log(`[迭代任务 ${taskId}] 第 ${i + 1}/${maxIterations} 轮迭代`);

    try {
      // 运行回测
      const engine = new BacktestEngine({
        startDate,
        endDate,
        initialCash: 1000000,
        strategy: {
          type: strategyType,
          params: currentParams
        },
        stocks
      });

      await engine.run();
      const metrics = engine.metrics;
      const tradeCount = extractTradeCountFromMetrics(metrics);
      latestTradeCount = tradeCount;

      if (!hasValidIterationSample(metrics)) {
        task.history.push({
          iteration: i + 1,
          params: { ...currentParams },
          invalidResult: true,
          invalidReason: 'no_trade_samples',
          tradeCount: tradeCount ?? 0,
          timestamp: new Date().toISOString()
        });
        task.invalidResult = true;
        task.invalidReason = 'no_trade_samples';
        task.resultSummary = buildTaskResultSummary(task);
        persistIterationTaskRun(task).catch(error => {
          console.error(`[迭代任务 ${taskId}] 无交易快照保存失败:`, error);
        });
        continue;
      }
      validSampleCount += 1;

      // 计算评分
      const scoreResult = quickScore({
        sharpeRatio: metrics.sharpeRatio,
        maxDrawdown: metrics.maxDrawdown,
        calmarRatio: metrics.calmarRatio,
        profitLossRatio: metrics.profitLossRatio,
        winRate: metrics.winRate,
        totalReturn: metrics.returnRate
      });

      const score = scoreResult.scoreTotal;

      // 记录历史
      task.history.push({
        iteration: i + 1,
        params: { ...currentParams },
        score,
        metrics: {
          sharpeRatio: metrics.sharpeRatio,
          maxDrawdown: metrics.maxDrawdown,
          winRate: metrics.winRate,
          returnRate: metrics.returnRate,
          tradeCount: tradeCount ?? 0
        },
        timestamp: new Date().toISOString()
      });
      task.resultSummary = buildTaskResultSummary(task);
      persistIterationTaskRun(task).catch(error => {
        console.error(`[迭代任务 ${taskId}] 进度快照保存失败:`, error);
      });

      console.log(`[迭代任务 ${taskId}] 得分: ${score}, 等级: ${scoreResult.level}`);

      // 更新最佳结果
      if (score > bestScore) {
        bestScore = score;
        bestParams = { ...currentParams };
        task.bestScore = score;
        task.bestParams = bestParams;
        task.invalidResult = false;
        task.invalidReason = null;
      }

      // 检查是否达到目标
      const hasEnoughTradeSamples = hasSufficientTradeSamples(metrics);
      if (score >= scoreThreshold && hasEnoughTradeSamples) {
        console.log(`[迭代任务 ${taskId}] 达到目标分数 ${scoreThreshold}`);
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        task.finishedAt = task.completedAt;
        task.resultSummary = buildTaskResultSummary(task);
        persistIterationTaskRun(task).catch(error => {
          console.error(`[迭代任务 ${taskId}] 完成快照保存失败:`, error);
        });
        break;
      }

      // 调整参数（简单的梯度下降）
      currentParams = adjustParams(currentParams, scoreResult, metrics);

    } catch (error) {
      console.error(`[迭代任务 ${taskId}] 第 ${i + 1} 轮失败:`, error.message);
      task.history.push({
        iteration: i + 1,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      task.resultSummary = buildTaskResultSummary(task);
      persistIterationTaskRun(task).catch(persistError => {
        console.error(`[迭代任务 ${taskId}] 失败快照保存失败:`, persistError);
      });
    }
  }

  // 任务完成
  if (task.status === 'running') {
    if (validSampleCount <= 0) {
      finalizeTaskAsFailed(task, latestTradeCount === 0 ? 'no_trade_samples' : 'no_valid_samples', null, {
        tradeCount: latestTradeCount
      });
    } else if (latestTradeCount !== null && latestTradeCount < MIN_VALID_TRADE_SAMPLES) {
      finalizeTaskAsFailed(task, 'insufficient_trade_samples', null, { tradeCount: latestTradeCount });
    } else if (bestScore < scoreThreshold) {
      finalizeTaskAsFailed(task, 'threshold_not_reached');
    } else {
      task.invalidResult = false;
      task.invalidReason = null;
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      task.finishedAt = task.completedAt;
    }
  }
  task.resultSummary = buildTaskResultSummary(task);
  persistIterationTaskRun(task).catch(error => {
    console.error(`[迭代任务 ${taskId}] 收尾快照保存失败:`, error);
  });

  // 保存最优版本
  if (task.status === 'completed' && !task.invalidResult && bestParams && bestScore > 0) {
    try {
      const scorer = new StrategyScorer();
      scorer.saveVersion({
        strategyType,
        strategyName: `自动迭代版本 ${taskId}`,
        config: bestParams,
        backtestScore: bestScore,
        changeLog: `迭代任务 ${taskId} 完成，最终得分: ${bestScore.toFixed(2)}`
      });
      scorer.close();
    } catch (error) {
      console.error(`[迭代任务 ${taskId}] 保存版本失败:`, error);
    }
  }

  console.log(`[迭代任务 ${taskId}] 完成，最终得分: ${bestScore}`);
}

/**
 * 调整参数（简单启发式）
 */
function adjustParams(currentParams, scoreResult, metrics) {
  const newParams = { ...currentParams };

  // 根据评分结果调整参数
  if (scoreResult.scoreDrawdown < 60) {
    // 回撤过大，增加止损
    if (newParams.stop_loss) {
      newParams.stop_loss = Math.max(0.03, newParams.stop_loss - 0.01);
    }
  }

  if (scoreResult.scoreWinRate < 60) {
    // 胜率过低，调整均线周期
    if (newParams.fast_period) {
      newParams.fast_period = Math.min(30, newParams.fast_period + 2);
    }
    if (newParams.slow_period) {
      newParams.slow_period = Math.max(20, newParams.slow_period - 5);
    }
  }

  // 添加随机扰动
  for (const key of Object.keys(newParams)) {
    if (typeof newParams[key] === 'number') {
      const perturbation = (Math.random() - 0.5) * 0.1 * newParams[key];
      newParams[key] = newParams[key] + perturbation;
    }
  }

  return newParams;
}

/**
 * 网格搜索优化
 */
async function runGridSearch({ paramRanges, stocks, startDate, endDate, initialCash, strategyType }) {
  const results = [];

  // 生成参数组合
  const combinations = generateParamCombinations(paramRanges);
  console.log(`[网格搜索] 生成 ${combinations.length} 个参数组合`);

  for (let i = 0; i < combinations.length; i++) {
    const params = combinations[i];

    try {
      const engine = new BacktestEngine({
        startDate,
        endDate,
        initialCash,
        strategy: {
          type: strategyType,
          params
        },
        stocks
      });

      await engine.run();
      const metrics = engine.metrics;

      // 计算评分
      const scoreResult = quickScore({
        sharpeRatio: metrics.sharpeRatio,
        maxDrawdown: metrics.maxDrawdown,
        calmarRatio: metrics.calmarRatio,
        profitLossRatio: metrics.profitLossRatio,
        winRate: metrics.winRate,
        totalReturn: metrics.returnRate
      });

      results.push({
        params,
        score: scoreResult.scoreTotal,
        level: scoreResult.level,
        metrics: {
          sharpeRatio: metrics.sharpeRatio,
          maxDrawdown: metrics.maxDrawdown,
          calmarRatio: metrics.calmarRatio,
          profitLossRatio: metrics.profitLossRatio,
          winRate: metrics.winRate,
          totalReturn: metrics.returnRate
        }
      });

      console.log(`[网格搜索] ${i + 1}/${combinations.length} 完成，得分: ${scoreResult.scoreTotal}`);

    } catch (error) {
      console.error(`[网格搜索] 参数组合失败:`, error.message);
    }
  }

  return results;
}

/**
 * 生成参数组合
 */
function generateParamCombinations(paramRanges) {
  const combinations = [];
  const keys = Object.keys(paramRanges);

  if (keys.length === 0) return [{}];

  const values = keys.map(key => {
    const range = paramRanges[key];
    if (Array.isArray(range)) {
      return range;
    }
    if (range.min !== undefined && range.max !== undefined && range.step !== undefined) {
      const vals = [];
      for (let v = range.min; v <= range.max; v += range.step) {
        vals.push(v);
      }
      return vals;
    }
    return [range];
  });

  function generate(index, current) {
    if (index === keys.length) {
      combinations.push({ ...current });
      return;
    }

    for (const val of values[index]) {
      current[keys[index]] = val;
      generate(index + 1, current);
    }
  }

  generate(0, {});
  return combinations;
}

// 导出测试辅助函数
router.__test = {
  activeTasks,
  buildTaskResponse,
  buildTaskResultSummary,
  ensureIterationTaskRunsTable,
  persistIterationTaskRun,
  loadIterationTaskRun,
  aggregateExecutionFeedback,
  deriveExecutionFeedbackStatus,
  enrichVersionsWithExecutionFeedback,
  enrichVersionsWithPublishStatus,
  DEFAULT_EXECUTION_SUMMARY,
  generateIterationReportMarkdown
};

module.exports = router;
