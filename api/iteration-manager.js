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
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();
const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

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

function parseOptionalFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveDeploymentReadiness(task) {
  const scoreThreshold = parseOptionalFiniteNumber(task.scoreThreshold) ?? 75;
  const bestScore = parseOptionalFiniteNumber(task.bestScore) ?? 0;
  const summary = task.resultSummary && typeof task.resultSummary === 'object' ? task.resultSummary : {};
  const history = Array.isArray(task.history) ? task.history : [];
  const metricCarrier = history.find(item => item && item.metrics && typeof item.metrics === 'object');
  const metrics = metricCarrier?.metrics || {};
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
  const history = Array.isArray(task.history) ? task.history : [];
  const deploymentReadiness = deriveDeploymentReadiness(task);

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

  const metricCarrier = history.find(item => item && item.metrics && typeof item.metrics === 'object');
  const metrics = metricCarrier?.metrics || {};
  const maxDrawdown = parseOptionalFiniteNumber(metrics.maxDrawdown);
  const winRate = parseOptionalFiniteNumber(metrics.winRate);
  const tradeCount = parseOptionalFiniteNumber(metrics.tradeCount ?? metrics.totalTrades);

  if (maxDrawdown !== null && maxDrawdown <= -0.2) {
    return {
      action: 'tighten_risk_limits',
      title: '收紧风险阈值后重跑',
      reason: `最大回撤 ${Math.abs(maxDrawdown * 100).toFixed(1)}% 偏高，建议收紧止损或下调仓位上限。`
    };
  }

  if (winRate !== null && winRate < 0.45) {
    return {
      action: 'switch_strategy_template',
      title: '切换策略模板',
      reason: `胜率 ${((winRate || 0) * 100).toFixed(1)}% 偏低，建议切换策略模板或因子组合。`
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
  const nextActionSuggestion = deriveNextActionSuggestion(task);
  const deploymentReadiness = deriveDeploymentReadiness(task);

  return {
    status: task.status || null,
    optimizationBackend,
    bestScore: task.bestScore ?? null,
    bestParams: task.bestParams ?? null,
    finishedAt: task.completedAt || task.finishedAt || null,
    history: Array.isArray(task.history) ? task.history.slice(-10) : [],
    error: task.error || null,
    stoppedAt: task.stoppedAt || null,
    stopReason: task.stopReason || null,
    completedAt: task.completedAt || null,
    nextActionSuggestion,
    deploymentReadiness,
    ...(optimizationBackend === 'optuna'
      ? {
          requestedTrials,
          completedTrials,
          trialCount: completedTrials
        }
      : {})
  };
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

  lines.push('', `> 报告生成时间: ${new Date().toISOString()}`);
  return lines.join('\n');
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

    // 创建任务记录
    const task = {
      taskId,
      strategyType,
      optimizationBackend: normalizedOptimizationBackend,
      config: config || {},
      inputSummary: {
        stocks,
        startDate,
        endDate,
        config: config || {},
        parallelTasks: normalizedParallelTasks,
        optimizationBackend: normalizedOptimizationBackend
      },
      maxIterations: normalizedMaxIterations,
      scoreThreshold: normalizedScoreThreshold,
      stocks,
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
        t.status = 'failed';
        t.error = err.message;
        t.resultSummary = buildTaskResultSummary(t);
        persistIterationTaskRun(t).catch(persistError => {
          console.error(`[迭代任务 ${taskId}] 失败快照保存失败:`, persistError);
        });
      }
    });

    res.json({
      success: true,
      taskId,
      message: '迭代任务已启动'
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
 * GET /api/iteration/report/:taskId?format=markdown
 */
router.get('/report/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const format = String(req.query.format || 'markdown').toLowerCase();

  if (format !== 'markdown') {
    return res.status(400).json({
      success: false,
      error: '仅支持 format=markdown'
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

  const markdown = generateIterationReportMarkdown(taskPayload);
  return res.json({
    success: true,
    data: {
      taskId,
      format: 'markdown',
      fileName: `${taskId}_report.md`,
      generatedAt: new Date().toISOString(),
      markdown
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
      return {
        ...version,
        execution_summary: executionSummary,
        execution_feedback_status: status,
        execution_feedback_confidence: confidence
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

/**
 * 获取版本历史
 * GET /api/iteration/versions/:strategyType
 */
router.get('/versions/:strategyType', async (req, res) => {
  try {
    const { strategyType } = req.params;
    const db = await getDatabase();

    const versions = await db.allPromise(`
      SELECT version_id, strategy_name, backtest_score,
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

    res.json({ success: true, versions: versionsWithSummary });
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
  const { taskId, strategyType, stocks, startDate, endDate, maxIterations } = task;
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

      if (child.stdout) {
        child.stdout.on('data', chunk => {
          stdout += chunk.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', chunk => {
          stderr += chunk.toString();
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

  task.currentIteration = maxIterations;
  task.progress = 100;
  task.bestScore = Number.isFinite(bestScore) ? bestScore : 0;
  task.bestParams = bestParams;
  task.optunaTrialsRequested = maxIterations;
  task.optunaTrialsCompleted = completedTrials;
  task.status = 'completed';
  task.completedAt = new Date().toISOString();
  task.error = null;
  task.resultSummary = buildTaskResultSummary(task);
  persistIterationTaskRun(task).catch(error => {
    console.error(`[迭代任务 ${taskId}] Optuna 完成快照保存失败:`, error);
  });
}

async function runHeuristicIterationTask(task) {
  const { taskId, strategyType, config, stocks, startDate, endDate, maxIterations, scoreThreshold } = task;

  // 初始参数
  let currentParams = { ...config };
  let bestScore = 0;
  let bestParams = null;

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
          returnRate: metrics.returnRate
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
      }

      // 检查是否达到目标
      if (score >= scoreThreshold) {
        console.log(`[迭代任务 ${taskId}] 达到目标分数 ${scoreThreshold}`);
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
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
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
  }
  task.resultSummary = buildTaskResultSummary(task);
  persistIterationTaskRun(task).catch(error => {
    console.error(`[迭代任务 ${taskId}] 收尾快照保存失败:`, error);
  });

  // 保存最优版本
  if (bestParams && bestScore > 0) {
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
