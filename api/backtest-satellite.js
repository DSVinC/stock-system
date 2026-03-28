/**
 * 卫星仓回测模块
 * TASK_V4_024 - 回测引擎支持核心仓 + 卫星仓联合回测
 *
 * 卫星仓策略特点：
 * - 网格交易策略
 * - 使用分钟线数据进行高频交易
 * - 震荡市获取超额收益
 * - 短线操作
 */

const { getDatabase } = require('./db');
const performance = require('./backtest-report');

// 支持的分钟线周期
const MINUTE_INTERVALS = {
  '1': 1,
  '5': 5,
  '15': 15,
  '30': 30,
  '60': 60
};

// 默认网格交易参数
const DEFAULT_GRID_CONFIG = {
  stepPercent: 1.0,       // 网格步长百分比（0.8-1.5）
  basePosition: 1000,     // 基础持仓量
  maxPosition: 5000,      // 最大持仓量
  minPosition: 0          // 最小持仓量
};

/**
 * 卫星仓回测引擎
 * 使用网格交易策略
 */
class SatelliteBacktestEngine {
  constructor(config = {}) {
    this.config = {
      // 资金配置
      initialCapital: config.initialCapital || 1000000,
      satelliteWeight: config.satelliteWeight || 0.3, // 卫星仓占比（默认30%）

      // 交易成本
      commissionRate: config.commissionRate || 0.00025, // 万2.5
      minCommission: config.minCommission || 5,
      slippageRate: config.slippageRate || 0.001,

      // 网格交易配置
      gridConfig: {
        ...DEFAULT_GRID_CONFIG,
        ...(config.gridConfig || {})
      },

      // 分钟线周期
      minuteInterval: config.minuteInterval || '5',

      // 持仓限制
      positionLimit: config.positionLimit || 5,
      maxDailyTrades: config.maxDailyTrades || 20,

      ...config
    };

    // 计算卫星仓资金
    this.satelliteCapital = this.config.initialCapital * this.config.satelliteWeight;

    this.db = getDatabase();
    this.reset();
  }

  /**
   * 重置回测状态
   */
  reset() {
    this.equityCurve = [];
    this.minuteReturns = [];
    this.trades = [];
    this.positions = new Map();
    this.cash = this.satelliteCapital;
    this.dates = [];
    this.currentTimestamp = null;
    this.dailyTradesCount = new Map();

    // 网格交易状态
    this.gridStates = new Map();

    // 技术指标缓存
    this.indicators = {
      rsi: new Map(),
      macd: new Map(),
      ma: new Map(),
      volume: new Map()
    };
  }

  /**
   * 初始化网格交易状态
   */
  initGridState(tsCode, basePrice, gridConfig = {}) {
    const config = { ...this.config.gridConfig, ...gridConfig };
    const stepPercent = config.stepPercent || 1.0;

    // 网格价格层级
    const gridLevels = [];
    const numLevels = 10;

    for (let i = -numLevels; i <= numLevels; i++) {
      gridLevels.push({
        price: basePrice * Math.pow(1 + stepPercent / 100, i),
        level: i
      });
    }

    this.gridStates.set(tsCode, {
      basePrice,
      stepPercent,
      gridLevels,
      currentLevel: 0,
      position: 0,
      avgCost: 0,
      totalProfit: 0,
      tradeCount: 0
    });
  }

  /**
   * 执行网格交易
   */
  executeGridTrade(tsCode, currentPrice, date, time) {
    const gridState = this.gridStates.get(tsCode);
    if (!gridState) {
      return { action: 'none', reason: 'grid_not_initialized' };
    }

    const config = this.config.gridConfig;
    const stepPercent = gridState.stepPercent;

    // 计算当前价格相对于基准价格的涨跌幅
    const priceChange = ((currentPrice - gridState.basePrice) / gridState.basePrice) * 100;

    // 计算应该持有的网格层级
    const expectedLevel = Math.round(priceChange / stepPercent);

    // 判断是否需要交易
    if (expectedLevel < gridState.currentLevel) {
      // 价格下跌，买入
      const buyLevels = gridState.currentLevel - expectedLevel;
      const sharesToBuy = config.basePosition * buyLevels;

      if (sharesToBuy > 0 && this.cash >= sharesToBuy * currentPrice) {
        const stock = { ts_code: tsCode, reason: 'grid_buy' };
        const success = this.executeBuy(stock, currentPrice, sharesToBuy, date, time);

        if (success) {
          gridState.currentLevel = expectedLevel;
          gridState.position += sharesToBuy;
          gridState.tradeCount++;

          return {
            action: 'buy',
            shares: sharesToBuy,
            price: currentPrice,
            newLevel: expectedLevel,
            reason: 'grid_buy'
          };
        }
      }
    } else if (expectedLevel > gridState.currentLevel) {
      // 价格上涨，卖出
      const sellLevels = expectedLevel - gridState.currentLevel;
      const sharesToSell = Math.min(
        config.basePosition * sellLevels,
        gridState.position
      );

      if (sharesToSell > 0) {
        const position = this.positions.get(tsCode);
        if (position) {
          const tempPosition = { ...position, ts_code: tsCode };
          const success = this.executeSell(tempPosition, currentPrice, date, time, 'grid_sell');

          if (success) {
            gridState.currentLevel = expectedLevel;
            gridState.position -= sharesToSell;
            gridState.tradeCount++;

            return {
              action: 'sell',
              shares: sharesToSell,
              price: currentPrice,
              newLevel: expectedLevel,
              reason: 'grid_sell'
            };
          }
        }
      }
    }

    return { action: 'hold', reason: 'no_trade_signal' };
  }

  /**
   * 获取指定日期范围内的交易日
   */
  async getTradingDates(startDate, endDate) {
    const startDateDb = startDate.replace(/-/g, '');
    const endDateDb = endDate.replace(/-/g, '');

    const query = `
      SELECT DISTINCT trade_date
      FROM stock_minute
      WHERE trade_date BETWEEN ? AND ?
      ORDER BY trade_date ASC
    `;

    const rows = await this.db.allPromise(query, [startDateDb, endDateDb]);

    return rows.map(row => {
      const dateStr = String(row.trade_date);
      if (dateStr.length === 8) {
        return `${dateStr.substr(0, 4)}-${dateStr.substr(4, 2)}-${dateStr.substr(6, 2)}`;
      }
      return dateStr;
    }).filter(date => date);
  }

  /**
   * 获取股票的首个价格
   */
  async getFirstPrice(tsCode, date) {
    try {
      const dateDb = date.replace(/-/g, '');
      const query = `
        SELECT close FROM stock_minute
        WHERE ts_code = ? AND trade_date >= ?
        ORDER BY trade_date ASC, trade_time ASC
        LIMIT 1
      `;

      const row = await this.db.getPromise(query, [tsCode, dateDb]);
      return row ? parseFloat(row.close) : null;
    } catch (error) {
      console.error(`[卫星仓回测] 获取首个价格失败:`, error.message);
      return null;
    }
  }

  /**
   * 加载分钟线数据
   */
  async loadMinuteData(tsCode, startDate, endDate, interval = '5') {
    const startDateDb = startDate.replace(/-/g, '');
    const endDateDb = endDate.replace(/-/g, '');

    const query = `
      SELECT
        trade_date,
        trade_time,
        open,
        high,
        low,
        close,
        vol,
        amount
      FROM stock_minute
      WHERE ts_code = ? AND trade_date BETWEEN ? AND ?
      ORDER BY trade_date ASC, trade_time ASC
    `;

    try {
      const rows = await this.db.allPromise(query, [tsCode, startDateDb, endDateDb]);
      const dataByDate = new Map();

      for (const row of rows) {
        const dateStr = String(row.trade_date);
        const date = dateStr.length === 8
          ? `${dateStr.substr(0, 4)}-${dateStr.substr(4, 2)}-${dateStr.substr(6, 2)}`
          : dateStr;

        if (!dataByDate.has(date)) {
          dataByDate.set(date, []);
        }
        dataByDate.get(date).push({
          trade_time: row.trade_time,
          open: parseFloat(row.open) || 0,
          high: parseFloat(row.high) || 0,
          low: parseFloat(row.low) || 0,
          close: parseFloat(row.close) || 0,
          vol: parseFloat(row.vol) || 0,
          amount: parseFloat(row.amount) || 0
        });
      }

      // 根据周期聚合数据
      const intervalNum = MINUTE_INTERVALS[interval] || 5;
      if (intervalNum > 1) {
        for (const [date, bars] of dataByDate) {
          dataByDate.set(date, this.aggregateBars(bars, intervalNum));
        }
      }

      return dataByDate;
    } catch (error) {
      console.error(`[卫星仓回测] 加载分钟线数据失败:`, error.message);
      return new Map();
    }
  }

  /**
   * 聚合K线数据
   */
  aggregateBars(bars, interval) {
    if (!bars || bars.length === 0 || interval <= 1) {
      return bars;
    }

    const aggregated = [];
    const groups = new Map();

    for (const bar of bars) {
      const time = bar.trade_time;
      const [hours, minutes] = time.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes;
      const groupIndex = Math.floor(totalMinutes / interval);
      const groupStartMinutes = groupIndex * interval;
      const groupHours = Math.floor(groupStartMinutes / 60);
      const groupMinutes = groupStartMinutes % 60;
      const groupKey = `${String(groupHours).padStart(2, '0')}:${String(groupMinutes).padStart(2, '0')}:00`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(bar);
    }

    for (const [time, groupBars] of groups) {
      if (groupBars.length === 0) continue;

      aggregated.push({
        trade_time: time,
        open: groupBars[0].open,
        high: Math.max(...groupBars.map(b => b.high)),
        low: Math.min(...groupBars.map(b => b.low)),
        close: groupBars[groupBars.length - 1].close,
        vol: groupBars.reduce((sum, b) => sum + b.vol, 0),
        amount: groupBars.reduce((sum, b) => sum + b.amount, 0)
      });
    }

    return aggregated.sort((a, b) => a.trade_time.localeCompare(b.trade_time));
  }

  /**
   * 计算手续费
   */
  calculateCommission(amount, isBuy = true) {
    const commission = amount * this.config.commissionRate;
    return Math.max(commission, this.config.minCommission);
  }

  /**
   * 执行买入操作
   */
  executeBuy(stock, price, shares, date, time) {
    if (shares <= 0 || price <= 0) {
      return false;
    }

    const amount = price * shares;

    // 检查每日交易次数限制
    const dailyCount = this.dailyTradesCount.get(date) || 0;
    if (dailyCount >= this.config.maxDailyTrades) {
      return false;
    }

    // 检查持仓限制
    if (this.positions.size >= this.config.positionLimit && !this.positions.has(stock.ts_code)) {
      return false;
    }

    // 考虑滑点
    const actualPrice = price * (1 + this.config.slippageRate);
    const actualAmount = actualPrice * shares;
    const commission = this.calculateCommission(actualAmount, true);
    const totalCost = actualAmount + commission;

    if (this.cash < totalCost) {
      return false;
    }

    // 更新现金
    this.cash -= totalCost;

    // 创建或更新持仓
    if (this.positions.has(stock.ts_code)) {
      const position = this.positions.get(stock.ts_code);
      const totalShares = position.shares + shares;
      const totalCostValue = position.cost + actualAmount;
      position.shares = totalShares;
      position.cost = totalCostValue;
      position.entryPrice = totalCostValue / totalShares;
      position.commission += commission;
    } else {
      this.positions.set(stock.ts_code, {
        ts_code: stock.ts_code,
        shares: shares,
        cost: actualAmount,
        entryPrice: actualPrice,
        entryDate: date,
        entryTime: time,
        commission: commission
      });
    }

    // 记录交易
    this.trades.push({
      ts_code: stock.ts_code,
      action: 'BUY',
      date,
      time,
      price: actualPrice,
      shares,
      amount: actualAmount,
      commission,
      reason: stock.reason || 'grid_strategy',
      portfolio: 'satellite'
    });

    // 更新每日交易计数
    this.dailyTradesCount.set(date, dailyCount + 1);

    return true;
  }

  /**
   * 执行卖出操作
   */
  executeSell(position, price, date, time, reason = 'grid_strategy') {
    if (position.shares <= 0 || price <= 0) {
      return false;
    }

    // 检查每日交易次数限制
    const dailyCount = this.dailyTradesCount.get(date) || 0;
    if (dailyCount >= this.config.maxDailyTrades) {
      return false;
    }

    // 考虑滑点
    const actualPrice = price * (1 - this.config.slippageRate);
    const amount = actualPrice * position.shares;
    const commission = this.calculateCommission(amount, false);
    const netProceeds = amount - commission;

    // 更新持仓
    this.positions.delete(position.ts_code);

    // 更新现金
    this.cash += netProceeds;

    // 计算收益
    const costPortion = position.cost;
    const returnAmount = amount - costPortion - commission;
    const returnRate = costPortion > 0 ? returnAmount / costPortion : 0;

    // 记录交易
    this.trades.push({
      ts_code: position.ts_code,
      action: 'SELL',
      date,
      time,
      price: actualPrice,
      shares: position.shares,
      amount,
      commission,
      return: returnRate,
      returnAmount,
      entryDate: position.entryDate,
      entryTime: position.entryTime,
      exitDate: date,
      exitTime: time,
      holdingPeriod: this.calculateHoldingPeriod(position.entryDate, position.entryTime, date, time),
      reason,
      portfolio: 'satellite'
    });

    // 更新每日交易计数
    this.dailyTradesCount.set(date, dailyCount + 1);

    return true;
  }

  /**
   * 计算持仓周期（分钟数）
   */
  calculateHoldingPeriod(entryDate, entryTime, exitDate, exitTime) {
    try {
      const entry = new Date(`${entryDate.replace(/-/g, '/')} ${entryTime}`);
      const exit = new Date(`${exitDate.replace(/-/g, '/')} ${exitTime}`);
      return Math.round((exit - entry) / (1000 * 60));
    } catch (error) {
      return 0;
    }
  }

  /**
   * 计算单只股票的总资产
   */
  calculateTotalAssetsForStock(tsCode, currentPrice) {
    const position = this.positions.get(tsCode);
    const positionValue = position ? position.shares * currentPrice : 0;
    return this.cash + positionValue;
  }

  /**
   * 运行网格交易策略回测
   */
  async run(params = {}) {
    const {
      startDate,
      endDate,
      tsCode,
      basePrice,
      gridConfig = {},
      interval = '5'
    } = params;

    console.log(`[卫星仓回测] 开始网格交易回测: ${tsCode}`);
    console.log(`[卫星仓回测] 卫星仓占比: ${(this.config.satelliteWeight * 100).toFixed(0)}%`);
    console.log(`[卫星仓回测] 卫星仓资金: ${this.satelliteCapital.toLocaleString()}`);
    console.log(`[卫星仓回测] 时间范围: ${startDate} 到 ${endDate}`);

    this.reset();

    const mergedGridConfig = {
      ...this.config.gridConfig,
      ...gridConfig
    };

    console.log(`[卫星仓回测] 网格步长: ${mergedGridConfig.stepPercent}%`);

    // 获取交易日
    this.dates = await this.getTradingDates(startDate, endDate);
    if (this.dates.length === 0) {
      throw new Error(`在 ${startDate} 到 ${endDate} 范围内未找到交易日数据`);
    }

    // 初始化网格状态
    const actualBasePrice = basePrice || await this.getFirstPrice(tsCode, startDate);
    if (!actualBasePrice) {
      throw new Error(`无法获取 ${tsCode} 的初始价格`);
    }

    this.initGridState(tsCode, actualBasePrice, mergedGridConfig);

    // 加载分钟线数据
    const minuteDataByDate = await this.loadMinuteData(tsCode, startDate, endDate, interval);

    const startTime = Date.now();

    // 遍历每个交易日
    for (let dayIdx = 0; dayIdx < this.dates.length; dayIdx++) {
      const date = this.dates[dayIdx];
      this.dailyTradesCount.set(date, 0);

      const minuteData = minuteDataByDate.get(date) || [];
      if (minuteData.length === 0) {
        continue;
      }

      // 遍历每个分钟K线
      for (const bar of minuteData) {
        const time = bar.trade_time;

        // 执行网格交易
        this.executeGridTrade(tsCode, bar.close, date, time);

        // 记录权益曲线
        const totalAssets = this.calculateTotalAssetsForStock(tsCode, bar.close);
        this.equityCurve.push(totalAssets);

        // 计算分钟收益率
        if (this.equityCurve.length > 1) {
          const prevAssets = this.equityCurve[this.equityCurve.length - 2];
          const minuteReturn = (totalAssets - prevAssets) / prevAssets;
          this.minuteReturns.push(minuteReturn);
        }
      }

      // 进度日志
      if (dayIdx % 5 === 0 || dayIdx === this.dates.length - 1) {
        const progress = ((dayIdx + 1) / this.dates.length * 100).toFixed(1);
        console.log(`[卫星仓回测] 进度: ${progress}% (${dayIdx + 1}/${this.dates.length})`);
      }
    }

    const endTime = Date.now();
    console.log(`[卫星仓回测] 回测完成，耗时: ${(endTime - startTime) / 1000}秒`);

    return this.generateResults(params);
  }

  /**
   * 生成回测结果
   */
  generateResults(params) {
    const initialCapital = this.satelliteCapital;
    const finalCapital = this.equityCurve[this.equityCurve.length - 1] || initialCapital;
    const tradingDays = this.dates.length;

    // 使用分钟线特有指标计算
    const minuteMetrics = performance.calculateMinuteMetrics(this.trades);
    const gridStats = performance.calculateGridStatistics(this.trades, this.config.gridConfig);

    // 计算绩效报告
    const performanceReport = performance.calculateMinutePerformanceReport({
      equityCurve: this.equityCurve,
      dailyReturns: this.minuteReturns,
      trades: this.trades,
      initialCapital,
      finalCapital,
      tradingDays
    });

    return {
      portfolio: 'satellite',
      satelliteWeight: this.config.satelliteWeight,
      initialCapital,
      finalCapital,
      summary: {
        initialCapital,
        finalCapital,
        totalReturn: performanceReport.totalReturn,
        annualizedReturn: performanceReport.annualizedReturn,
        maxDrawdown: performanceReport.maxDrawdown,
        sharpeRatio: performanceReport.sharpeRatio,
        winRate: performanceReport.winRate,
        totalTrades: this.trades.filter(t => t.action === 'SELL').length,
        tradingDays,
        // 分钟线特有指标
        ...minuteMetrics,
        // 网格交易统计
        gridStats
      },
      details: {
        equityCurve: this.equityCurve,
        trades: this.trades,
        dates: this.dates,
        gridStates: Array.from(this.gridStates.entries()).map(([code, state]) => ({
          tsCode: code,
          ...state
        }))
      },
      performance: performanceReport
    };
  }
}

module.exports = SatelliteBacktestEngine;
module.exports.DEFAULT_GRID_CONFIG = DEFAULT_GRID_CONFIG;
module.exports.MINUTE_INTERVALS = MINUTE_INTERVALS;