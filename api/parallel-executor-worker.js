/**
 * 并行执行器 Worker 脚本
 * TASK_V3_302
 *
 * 功能：
 * - 执行回测任务
 * - 支持进度报告
 * - 内存管理
 */

const { parentPort, workerData } = require('worker_threads');
const MinuteBacktest = require('./backtest-minute');

/**
 * Worker 主函数
 */
async function runWorker() {
  const { tasks, options, workerIndex } = workerData;

  console.log(`[Worker ${workerIndex}] 启动，任务数: ${tasks.length}`);

  const results = [];
  let completed = 0;

  for (const task of tasks) {
    try {
      // 执行回测任务
      const result = await executeBacktestTask(task, options);

      completed++;
      results.push(result);

      // 报告进度
      if (completed % 10 === 0 || completed === tasks.length) {
        parentPort.postMessage({
          type: 'progress',
          data: {
            completed,
            total: tasks.length,
            percentage: ((completed / tasks.length) * 100).toFixed(1)
          }
        });
      }
    } catch (error) {
      completed++;
      results.push({
        success: false,
        error: error.message,
        task
      });
    }
  }

  // 返回结果
  parentPort.postMessage({
    type: 'result',
    data: results,
    memoryUsage: process.memoryUsage()
  });

  console.log(`[Worker ${workerIndex}] 完成，结果数: ${results.length}`);
}

/**
 * 执行单个回测任务
 * @param {Object} task - 回测任务
 * @param {Object} options - 执行选项
 * @returns {Promise<Object>} 回测结果
 */
async function executeBacktestTask(task, options = {}) {
  const {
    startDate,
    endDate,
    tsCode,
    phase,
    // 选股参数
    maShort,
    maLong,
    rsiPeriod,
    rsiThreshold,
    volumeRatio,
    // 网格参数
    gridStep,
    positionRatio,
    gridCount
  } = task;

  // 创建回测引擎
  const backtest = new MinuteBacktest({
    initialCapital: options.initialCapital || 1000000,
    commissionRate: options.commissionRate || 0.00025,
    minCommission: options.minCommission || 5,
    slippageRate: options.slippageRate || 0.001,
    allowIntradayTrade: true
  });

  // 构建策略配置
  const strategyConfig = {
    maShort: maShort || 5,
    maLong: maLong || 20,
    rsiPeriod: rsiPeriod || 14,
    rsiThreshold: rsiThreshold || 70,
    volumeRatio: volumeRatio || 1.5,
    gridStep: gridStep || 1.0,
    positionRatio: (positionRatio || 30) / 100,
    gridCount: gridCount || 10
  };

  try {
    // 根据阶段注入不同的策略
    if (phase === 1) {
      // 阶段 1：选股策略
      backtest.generateTradeSignal = (stock, indicators, config) => {
        return generateSelectionSignal(stock, indicators, config);
      };
    } else if (phase === 2) {
      // 阶段 2：网格策略
      backtest.generateTradeSignal = (stock, indicators, config) => {
        return generateGridSignal(stock, indicators, config, backtest.positions);
      };
    }

    // 执行回测
    const result = await backtest.run({
      startDate,
      endDate,
      strategyConfig,
      symbols: tsCode ? [tsCode] : []
    });

    return {
      success: true,
      params: {
        phase,
        maShort,
        maLong,
        rsiPeriod,
        rsiThreshold,
        volumeRatio,
        gridStep,
        positionRatio,
        gridCount
      },
      metrics: {
        totalReturn: result.summary.totalReturn,
        annualizedReturn: result.summary.annualizedReturn,
        sharpeRatio: result.summary.sharpeRatio,
        maxDrawdown: result.summary.maxDrawdown,
        winRate: result.summary.winRate,
        totalTrades: result.summary.totalTrades
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      params: {
        phase,
        maShort,
        maLong,
        rsiPeriod,
        rsiThreshold,
        volumeRatio,
        gridStep,
        positionRatio,
        gridCount
      }
    };
  }
}

/**
 * 生成选股信号（阶段 1）
 */
function generateSelectionSignal(stock, indicators, config) {
  const {
    maShort = 5,
    maLong = 20,
    rsiPeriod = 14,
    rsiThreshold = 70,
    volumeRatio = 1.5
  } = config;

  // 获取指标值
  const shortMA = indicators[`ma${maShort}`];
  const longMA = indicators[`ma${maLong}`];
  const rsi = indicators[`rsi${rsiPeriod}`];
  const avgVolume = indicators.avgVolume;

  if (!shortMA || !longMA || !rsi || !avgVolume) {
    return 'hold';
  }

  // 均线金叉
  const goldenCross = shortMA > longMA && stock.close > shortMA;

  // RSI 不超买
  const rsiOk = rsi < rsiThreshold;

  // 放量
  const volumeSpike = stock.volume > avgVolume * volumeRatio;

  if (goldenCross && rsiOk && volumeSpike) {
    return 'buy';
  }

  // 止损条件
  if (stock.close < longMA * 0.95) {
    return 'sell';
  }

  return 'hold';
}

/**
 * 生成网格交易信号（阶段 2）
 */
let gridReferencePrice = null;

function generateGridSignal(stock, indicators, config, positions) {
  const { gridStep = 1.0, positionRatio = 0.3, gridCount = 10 } = config;
  const position = positions.get(stock.ts_code);

  // 初始化网格参考价格
  if (!gridReferencePrice) {
    gridReferencePrice = stock.close;
  }

  // 计算价格变动百分比
  const priceChange = ((stock.close - gridReferencePrice) / gridReferencePrice) * 100;

  const gridTrigger = gridStep;

  if (!position) {
    // 无持仓，价格下跌超过网格步长则买入
    if (priceChange <= -gridTrigger) {
      gridReferencePrice = stock.close;
      return 'buy';
    }
  } else {
    // 有持仓
    const entryPrice = position.entryPrice;
    const holdingReturn = ((stock.close - entryPrice) / entryPrice) * 100;

    // 价格上涨超过网格步长则卖出
    if (holdingReturn >= gridTrigger) {
      return 'sell';
    }

    // 价格继续下跌，加仓
    if (priceChange <= -gridTrigger * 2) {
      gridReferencePrice = stock.close;
      return 'buy';
    }
  }

  return 'hold';
}

// 启动 Worker
runWorker().catch(error => {
  parentPort.postMessage({
    type: 'error',
    error: error.message
  });
});