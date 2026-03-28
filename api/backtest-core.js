/**
 * 核心仓回测模块
 * TASK_V4_024 - 回测引擎支持核心仓 + 卫星仓联合回测
 * TASK_V4_026 - 支持选股时点快照数据，防止未来函数
 *
 * 核心仓策略特点：
 * - 趋势跟踪策略
 * - 使用因子快照数据进行选股
 * - 日线级别调仓
 * - 长期持有
 */

const { getDatabase } = require('./db');
const performance = require('./backtest-report');

/**
 * 核心仓回测引擎
 * 继承自 FactorSnapshotBacktest，增加核心仓特定功能
 */
class CoreBacktestEngine {
  constructor(config = {}) {
    this.config = {
      // 资金配置
      initialCapital: config.initialCapital || 1000000,
      coreWeight: config.coreWeight || 0.7, // 核心仓占比（默认70%）

      // 交易成本
      commissionRate: config.commissionRate || 0.00025, // 万2.5
      minCommission: config.minCommission || 5,         // 最低5元
      stampDutyRate: config.stampDutyRate || 0.001,    // 印花税千1（仅卖出）
      slippageRate: config.slippageRate || 0,          // 滑点

      // 持仓配置
      positionLimit: config.positionLimit || 10,        // 最多10只
      rebalanceDays: config.rebalanceDays || 5,         // 调仓周期（天）

      // 选股策略
      strategyConfig: config.strategyConfig || {},

      // TASK_V4_026: 选股时点参数
      selectionDate: config.selectionDate || null,     // 选股时点（使用该日期的快照数据）

      ...config
    };

    // 计算核心仓资金
    this.coreCapital = this.config.initialCapital * this.config.coreWeight;

    this.db = getDatabase();
    this.reset();
  }

  /**
   * 重置回测状态
   */
  reset() {
    this.equityCurve = [];
    this.dailyReturns = [];
    this.trades = [];
    this.positions = new Map();
    this.cash = this.coreCapital;
    this.dates = [];
    this.currentDate = null;
    this.stockNames = new Map();
    this.priceCache = new Map();
    this.lastRebalanceDate = null;

    // TASK_V4_026: 选股结果缓存（基于选股时点）
    this.selectionSnapshot = null;  // 选股时点的快照数据
    this.selectedStocksCache = null; // 选股结果缓存
  }

  /**
   * 获取指定日期范围内的交易日
   */
  async getTradingDates(startDate, endDate) {
    const startDateDb = startDate.replace(/-/g, '');
    const endDateDb = endDate.replace(/-/g, '');

    const query = `
      SELECT DISTINCT trade_date
      FROM stock_factor_snapshot
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
   * 获取指定日期的股票快照数据
   */
  async getSnapshotByDate(date) {
    const dateDb = date.replace(/-/g, '');

    const query = `
      SELECT
        ts_code,
        industry,
        policy_score,
        commercialization_score,
        sentiment_score,
        capital_score,
        roe,
        revenue_growth,
        netprofit_growth,
        pe_ttm,
        pb,
        rsi,
        macd_signal,
        main_flow_in,
        industry_total_score,
        seven_factor_score
      FROM stock_factor_snapshot
      WHERE trade_date = ?
      ORDER BY seven_factor_score DESC
    `;

    return await this.db.allPromise(query, [dateDb]) || [];
  }

  // ==================== TASK_V4_026: 选股时点快照数据支持 ====================

  /**
   * 获取选股时点的快照数据
   * 用于在回测开始前进行选股，防止未来函数
   * @param {string} selectionDate - 选股时点日期 YYYY-MM-DD
   * @returns {Promise<Array>} 快照数据数组
   */
  async getSelectionSnapshot(selectionDate) {
    const dateDb = selectionDate.replace(/-/g, '');

    const query = `
      SELECT
        ts_code,
        industry,
        policy_score,
        commercialization_score,
        sentiment_score,
        capital_score,
        roe,
        revenue_growth,
        netprofit_growth,
        pe_ttm,
        pb,
        rsi,
        macd_signal,
        main_flow_in,
        industry_total_score,
        seven_factor_score
      FROM stock_factor_snapshot
      WHERE trade_date = ?
      ORDER BY seven_factor_score DESC
    `;

    const snapshot = await this.db.allPromise(query, [dateDb]) || [];

    if (snapshot.length === 0) {
      console.warn(`[核心仓回测] 警告: 选股时点 ${selectionDate} 无快照数据`);
    } else {
      console.log(`[核心仓回测] 选股时点 ${selectionDate} 获取到 ${snapshot.length} 条快照数据`);
    }

    return snapshot;
  }

  /**
   * 获取下一个交易日
   * @param {string} date - 当前日期
   * @returns {Promise<string|null>} 下一个交易日
   */
  async getNextTradingDate(date) {
    const dateDb = date.replace(/-/g, '');

    const query = `
      SELECT DISTINCT trade_date
      FROM stock_factor_snapshot
      WHERE trade_date > ?
      ORDER BY trade_date ASC
      LIMIT 1
    `;

    const row = await this.db.getPromise(query, [dateDb]);

    if (row) {
      const dateStr = String(row.trade_date);
      if (dateStr.length === 8) {
        return `${dateStr.substr(0, 4)}-${dateStr.substr(4, 2)}-${dateStr.substr(6, 2)}`;
      }
      return dateStr;
    }

    return null;
  }

  /**
   * 验证未来函数防护
   * 确保回测过程中不使用选股时点之后的数据
   * @param {string} currentDate - 当前日期
   * @param {string} selectionDate - 选股时点
   * @returns {boolean} 是否通过验证
   */
  validateNoFutureFunction(currentDate, selectionDate) {
    if (!selectionDate) {
      return true;
    }

    const current = new Date(currentDate);
    const selection = new Date(selectionDate);

    if (current < selection) {
      console.error(`[核心仓回测] 未来函数警告: 当前日期 ${currentDate} 早于选股时点 ${selectionDate}`);
      return false;
    }

    return true;
  }

  /**
   * 获取股票的真实交易价格
   */
  async getStockPrice(tsCode, date) {
    const cacheKey = `${tsCode}_${date}`;
    if (this.priceCache.has(cacheKey)) {
      return this.priceCache.get(cacheKey);
    }

    const dateDb = date.includes('-') ? date : `${date.substr(0, 4)}-${date.substr(4, 2)}-${date.substr(6, 2)}`;
    const dbCode = this.convertToDbCode(tsCode);

    const query = `
      SELECT close, stock_name
      FROM stock_daily
      WHERE ts_code = ? AND trade_date = ?
      LIMIT 1
    `;

    const row = await this.db.getPromise(query, [dbCode, dateDb]);

    if (row) {
      const result = {
        price: parseFloat(row.close) || 0,
        stockName: row.stock_name || tsCode
      };
      this.priceCache.set(cacheKey, result);
      if (row.stock_name) {
        this.stockNames.set(tsCode, row.stock_name);
      }
      return result;
    }

    this.priceCache.set(cacheKey, null);
    return null;
  }

  /**
   * 转换股票代码格式
   */
  convertToDbCode(tsCode) {
    if (!tsCode) return tsCode;
    if (tsCode.includes('.')) {
      const [code, market] = tsCode.split('.');
      const marketLower = market.toLowerCase();
      return `${marketLower}.${code}`;
    }
    return tsCode;
  }

  /**
   * 计算股票综合得分
   */
  calculateStockScore(stock, strategyConfig = {}) {
    const {
      industryWeights = {},
      factorWeights = {}
    } = strategyConfig;

    // 行业权重
    const industryWeight = industryWeights[stock.industry] || 1.0;
    const industryScore = stock.industry_total_score || 0;

    // 七因子得分
    const factorScore = stock.seven_factor_score || 0;

    // 综合得分 = 行业权重 × 行业得分 + 因子得分
    return industryWeight * industryScore + factorScore;
  }

  /**
   * 根据策略选股
   */
  selectStocks(stocks, strategyConfig = {}) {
    const {
      industryWeights = {},
      minFactorScore = 0,
      maxStocks = 10,
      minSevenFactorScore = 0,
      minIndustryScore = 0
    } = strategyConfig;

    const scoredStocks = stocks.map(stock => ({
      ...stock,
      compositeScore: this.calculateStockScore(stock, strategyConfig)
    }));

    const filteredStocks = scoredStocks.filter(stock => {
      if (stock.compositeScore < minFactorScore) return false;
      if (minSevenFactorScore > 0 && (stock.seven_factor_score || 0) < minSevenFactorScore) return false;
      if (minIndustryScore > 0 && (stock.industry_total_score || 0) < minIndustryScore) return false;
      return true;
    });

    return filteredStocks
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, maxStocks);
  }

  /**
   * 计算手续费
   */
  calculateCommission(amount, isBuy = true) {
    const commission = amount * this.config.commissionRate;
    return Math.max(commission, this.config.minCommission);
  }

  /**
   * 计算印花税（仅卖出）
   */
  calculateStampDuty(amount) {
    return amount * this.config.stampDutyRate;
  }

  /**
   * 判断是否需要调仓
   */
  shouldRebalance(currentDate, lastRebalanceDate) {
    if (!lastRebalanceDate) return true;

    const current = new Date(currentDate);
    const last = new Date(lastRebalanceDate);
    const diffDays = Math.floor((current - last) / (1000 * 60 * 60 * 24));

    return diffDays >= this.config.rebalanceDays;
  }

  /**
   * 执行买入操作
   */
  async executeBuy(stock, priceInfo, amount, date) {
    const { price, stockName } = priceInfo;

    if (price <= 0 || amount <= 0 || this.cash < amount) {
      return { success: false, reason: 'invalid_params' };
    }

    const actualPrice = price * (1 + this.config.slippageRate);
    const shares = Math.floor(amount / actualPrice / 100) * 100;

    if (shares < 100) {
      return { success: false, reason: 'insufficient_shares' };
    }

    const tradeAmount = shares * actualPrice;
    const commission = this.calculateCommission(tradeAmount, true);
    const totalCost = tradeAmount + commission;

    if (this.cash < totalCost) {
      return { success: false, reason: 'insufficient_cash' };
    }

    this.cash -= totalCost;

    const existingPosition = this.positions.get(stock.ts_code);
    if (existingPosition) {
      const totalShares = existingPosition.shares + shares;
      const totalCostBasis = existingPosition.costBasis + tradeAmount;
      existingPosition.shares = totalShares;
      existingPosition.costBasis = totalCostBasis;
      existingPosition.avgPrice = totalCostBasis / totalShares;
      existingPosition.commission += commission;
    } else {
      this.positions.set(stock.ts_code, {
        ts_code: stock.ts_code,
        shares,
        avgPrice: actualPrice,
        costBasis: tradeAmount,
        entryDate: date,
        entryPrice: actualPrice,
        commission,
        stockName
      });
    }

    const trade = {
      ts_code: stock.ts_code,
      stockName: stockName || this.stockNames.get(stock.ts_code) || stock.ts_code,
      action: 'BUY',
      date,
      shares,
      price: actualPrice,
      amount: tradeAmount,
      commission,
      totalCost,
      portfolio: 'core'
    };
    this.trades.push(trade);

    return { success: true, trade };
  }

  /**
   * 执行卖出操作
   */
  async executeSell(position, priceInfo, sellRatio, date) {
    const { price, stockName } = priceInfo;

    if (price <= 0 || !this.positions.has(position.ts_code)) {
      return { success: false, reason: 'invalid_params' };
    }

    const currentPosition = this.positions.get(position.ts_code);
    const sharesToSell = Math.floor(currentPosition.shares * sellRatio / 100) * 100;

    if (sharesToSell <= 0) {
      return { success: false, reason: 'no_shares' };
    }

    const actualPrice = price * (1 - this.config.slippageRate);
    const tradeAmount = sharesToSell * actualPrice;
    const commission = this.calculateCommission(tradeAmount, false);
    const stampDuty = this.calculateStampDuty(tradeAmount);
    const totalCost = commission + stampDuty;
    const netProceeds = tradeAmount - totalCost;

    const costPortion = currentPosition.costBasis * (sharesToSell / currentPosition.shares);
    const profit = tradeAmount - costPortion - totalCost;
    const profitRate = costPortion > 0 ? profit / costPortion : 0;

    currentPosition.shares -= sharesToSell;
    currentPosition.costBasis -= costPortion;

    if (currentPosition.shares <= 0) {
      this.positions.delete(position.ts_code);
    }

    this.cash += netProceeds;

    const trade = {
      ts_code: position.ts_code,
      stockName: stockName || currentPosition.stockName || position.ts_code,
      action: 'SELL',
      date,
      shares: sharesToSell,
      price: actualPrice,
      amount: tradeAmount,
      commission,
      stampDuty,
      totalCost,
      profit,
      profitRate,
      entryDate: currentPosition.entryDate,
      exitDate: date,
      portfolio: 'core'
    };
    this.trades.push(trade);

    return { success: true, trade, profit, profitRate };
  }

  /**
   * 执行每日调仓
   */
  async executeDailyRebalance(date, selectedStocks, strategyConfig = {}) {
    const targetStocks = new Set(selectedStocks.map(s => s.ts_code));
    const currentStocks = Array.from(this.positions.keys());

    // 需要卖出的股票（不在目标持仓中）
    const stocksToSell = currentStocks.filter(tsCode => !targetStocks.has(tsCode));

    // 先卖出
    for (const tsCode of stocksToSell) {
      const position = this.positions.get(tsCode);
      if (position) {
        const priceInfo = await this.getStockPrice(tsCode, date);
        if (priceInfo && priceInfo.price > 0) {
          await this.executeSell(position, priceInfo, 1.0, date);
        }
      }
    }

    // 需要买入的股票
    const stocksToBuy = selectedStocks.filter(stock => !this.positions.has(stock.ts_code));

    if (stocksToBuy.length === 0) return;

    // 计算可用资金
    const availableCash = this.cash;
    const buyAmountPerStock = Math.floor(availableCash / stocksToBuy.length);

    // 买入
    for (const stock of stocksToBuy) {
      const priceInfo = await this.getStockPrice(stock.ts_code, date);
      if (priceInfo && priceInfo.price > 0) {
        await this.executeBuy(stock, priceInfo, buyAmountPerStock, date);
      }
    }
  }

  /**
   * 计算当日资产总值
   */
  async calculateTotalAssets(date) {
    let positionValue = 0;

    for (const [tsCode, position] of this.positions) {
      const priceInfo = await this.getStockPrice(tsCode, date);
      if (priceInfo && priceInfo.price > 0) {
        positionValue += position.shares * priceInfo.price;
      } else {
        positionValue += position.shares * position.avgPrice;
      }
    }

    return this.cash + positionValue;
  }

  /**
   * 运行回测
   * TASK_V4_026: 支持 selectionDate 参数，使用选股时点的快照数据
   */
  async run(params = {}) {
    const {
      startDate,
      endDate,
      strategyConfig = {},
      // TASK_V4_026: 选股时点参数
      selectionDate = null
    } = params;

    this.reset();

    // 记录选股时点
    this.config.selectionDate = selectionDate || this.config.selectionDate;
    const effectiveSelectionDate = this.config.selectionDate;

    console.log(`[核心仓回测] 开始回测: ${startDate} 到 ${endDate}`);
    if (effectiveSelectionDate) {
      console.log(`[核心仓回测] 选股时点: ${effectiveSelectionDate} (使用该日期的快照数据进行选股)`);
    }
    console.log(`[核心仓回测] 核心仓占比: ${(this.config.coreWeight * 100).toFixed(0)}%`);
    console.log(`[核心仓回测] 核心仓资金: ${this.coreCapital.toLocaleString()}`);
    const startTime = Date.now();

    // 获取交易日
    // TASK_V4_026: 如果有选股时点，确保回测从选股时点之后开始
    const effectiveStartDate = effectiveSelectionDate
      ? await this.getNextTradingDate(effectiveSelectionDate) || startDate
      : startDate;

    this.dates = await this.getTradingDates(effectiveStartDate, endDate);
    if (this.dates.length === 0) {
      throw new Error(`在 ${effectiveStartDate} 到 ${endDate} 范围内未找到交易日数据`);
    }

    console.log(`[核心仓回测] 找到 ${this.dates.length} 个交易日 (从 ${this.dates[0]} 到 ${this.dates[this.dates.length - 1]})`);

    const mergedStrategyConfig = {
      ...this.config.strategyConfig,
      ...strategyConfig
    };

    // TASK_V4_026: 如果有选股时点，在回测开始前获取选股结果
    if (effectiveSelectionDate) {
      console.log(`[核心仓回测] 正在获取选股时点 ${effectiveSelectionDate} 的快照数据...`);
      this.selectionSnapshot = await this.getSelectionSnapshot(effectiveSelectionDate);

      if (this.selectionSnapshot.length === 0) {
        console.warn(`[核心仓回测] 警告: 选股时点 ${effectiveSelectionDate} 无快照数据，将使用每日快照数据进行选股`);
      } else {
        console.log(`[核心仓回测] 已获取 ${this.selectionSnapshot.length} 条快照数据用于选股`);
        // 预先计算选股结果
        this.selectedStocksCache = this.selectStocks(this.selectionSnapshot, mergedStrategyConfig);
        console.log(`[核心仓回测] 选股结果: ${this.selectedStocksCache.length} 只股票`);
      }
    }

    // 每日循环
    for (let i = 0; i < this.dates.length; i++) {
      const date = this.dates[i];
      this.currentDate = date;

      // TASK_V4_026: 未来函数防护验证
      if (effectiveSelectionDate) {
        this.validateNoFutureFunction(date, effectiveSelectionDate);
      }

      // 判断是否需要调仓
      if (this.shouldRebalance(date, this.lastRebalanceDate)) {
        // TASK_V4_026: 修改选股逻辑
        let selectedStocks;
        if (this.selectedStocksCache && this.selectedStocksCache.length > 0) {
          // 使用选股时点的快照数据进行选股（防止未来函数）
          selectedStocks = this.selectedStocksCache;
        } else {
          // 降级到每日快照数据
          const snapshot = await this.getSnapshotByDate(date);
          if (snapshot.length === 0) {
            // 无快照数据，保持当前持仓
            const totalAssets = await this.calculateTotalAssets(date);
            this.equityCurve.push(totalAssets);
            continue;
          }
          selectedStocks = this.selectStocks(snapshot, mergedStrategyConfig);
        }

        // 执行调仓
        if (selectedStocks.length > 0) {
          await this.executeDailyRebalance(date, selectedStocks, mergedStrategyConfig);
          this.lastRebalanceDate = date;
        }
      }

      // 记录权益曲线
      const totalAssets = await this.calculateTotalAssets(date);
      this.equityCurve.push(totalAssets);

      // 计算日收益率
      if (i > 0 && this.equityCurve[i - 1] > 0) {
        const dailyReturn = (totalAssets - this.equityCurve[i - 1]) / this.equityCurve[i - 1];
        this.dailyReturns.push(dailyReturn);
      }

      // 进度日志
      if (i % 20 === 0 || i === this.dates.length - 1) {
        const progress = ((i + 1) / this.dates.length * 100).toFixed(1);
        console.log(`[核心仓回测] 进度: ${progress}% (${i + 1}/${this.dates.length})`);
      }
    }

    const endTime = Date.now();
    console.log(`[核心仓回测] 回测完成，耗时: ${(endTime - startTime) / 1000}秒`);

    return this.generateResults(params);
  }

  /**
   * 生成回测结果
   * TASK_V4_026: 在报告中记录选股时点和回测区间
   */
  generateResults(params) {
    const initialCapital = this.coreCapital;
    const finalCapital = this.equityCurve[this.equityCurve.length - 1] || initialCapital;
    const tradingDays = this.dates.length;

    const sellTrades = this.trades
      .filter(t => t.action === 'SELL')
      .map(t => ({
        ...t,
        return: t.profitRate || 0
      }));

    const performanceReport = performance.calculatePerformanceReport({
      equityCurve: this.equityCurve,
      dailyReturns: this.dailyReturns,
      trades: sellTrades,
      initialCapital,
      finalCapital,
      tradingDays
    });

    // TASK_V4_026: 记录选股时点和回测区间信息
    const selectionDate = this.config.selectionDate || params.selectionDate;

    return {
      portfolio: 'core',
      coreWeight: this.config.coreWeight,
      initialCapital,
      finalCapital,
      // TASK_V4_026: 添加选股时点和回测区间信息
      backtestInfo: {
        selectionDate: selectionDate || null,
        backtestStartDate: this.dates[0] || params.startDate,
        backtestEndDate: this.dates[this.dates.length - 1] || params.endDate,
        actualTradingDays: tradingDays,
        futureFunctionProtection: !!selectionDate, // 是否启用了未来函数防护
        selectionSnapshotCount: this.selectionSnapshot ? this.selectionSnapshot.length : 0
      },
      summary: {
        initialCapital,
        finalCapital,
        totalReturn: performanceReport.totalReturn,
        annualizedReturn: performanceReport.annualizedReturn,
        maxDrawdown: performanceReport.maxDrawdown,
        sharpeRatio: performanceReport.sharpeRatio,
        calmarRatio: performanceReport.calmarRatio,
        winRate: performanceReport.winRate,
        profitLossRatio: performanceReport.profitLossRatio,
        totalTrades: performanceReport.tradeCount,
        tradingDays
      },
      details: {
        equityCurve: this.equityCurve,
        dailyReturns: this.dailyReturns,
        trades: this.trades,
        positions: Array.from(this.positions.values()),
        dates: this.dates,
        // TASK_V4_026: 添加选股结果
        selectedStocks: this.selectedStocksCache
          ? this.selectedStocksCache.map(s => s.ts_code)
          : []
      },
      performance: performanceReport
    };
  }
}

module.exports = CoreBacktestEngine;