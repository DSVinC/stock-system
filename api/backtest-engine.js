/**
 * 基于因子快照的日线回测引擎
 * 使用 stock_factor_snapshot 表进行选股，stock_daily 表获取价格
 * 支持 7 个绩效指标计算
 */

const { getDatabase } = require('./db');
const performance = require('./backtest-report');

class FactorSnapshotBacktest {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 1000000,
      commissionRate: config.commissionRate || 0.00025, // 万2.5
      minCommission: config.minCommission || 5,         // 最低5元
      positionLimit: config.positionLimit || 10,        // 最多10只
      stampDutyRate: config.stampDutyRate || 0.001,    // 印花税千1（仅卖出）
      slippageRate: config.slippageRate || 0,          // 滑点
      ...config
    };

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
    this.cash = this.config.initialCapital;
    this.dates = [];
    this.currentDate = null;
    this.stockNames = new Map(); // 股票名称缓存
    this.priceCache = new Map(); // 价格缓存
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

  /**
   * 获取股票的真实交易价格
   * 从 stock_daily 表获取收盘价作为交易价格
   */
  async getStockPrice(tsCode, date) {
    const cacheKey = `${tsCode}_${date}`;
    if (this.priceCache.has(cacheKey)) {
      return this.priceCache.get(cacheKey);
    }

    // 从 stock_daily 表获取收盘价作为交易价格
    // 注意：stock_daily 表中 trade_date 格式为 YYYY-MM-DD
    const dateDb = date.includes('-') ? date : `${date.substr(0, 4)}-${date.substr(4, 2)}-${date.substr(6, 2)}`;
    // 转换代码格式：000001.SZ -> sz.000001
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
      // 缓存股票名称
      if (row.stock_name) {
        this.stockNames.set(tsCode, row.stock_name);
      }
      return result;
    }

    // 价格缓存为未找到
    this.priceCache.set(cacheKey, null);
    return null;
  }

  /**
   * 转换股票代码格式
   * 000001.SZ -> sz.000001
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
  calculateStockScore(stock, industryWeights = {}) {
    const industryWeight = industryWeights[stock.industry] || 1.0;
    const industryScore = stock.industry_total_score || 0;
    const factorScore = stock.seven_factor_score || 0;
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
      compositeScore: this.calculateStockScore(stock, industryWeights)
    }));

    const filteredStocks = scoredStocks.filter(stock => {
      // 最低综合得分
      if (stock.compositeScore < minFactorScore) return false;
      // 最低7因子得分
      if (minSevenFactorScore > 0 && (stock.seven_factor_score || 0) < minSevenFactorScore) return false;
      // 最低行业得分
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
   * 执行买入操作
   */
  async executeBuy(stock, priceInfo, amount, date) {
    const { price, stockName } = priceInfo;

    if (price <= 0 || amount <= 0 || this.cash < amount) {
      return { success: false, reason: 'invalid_params' };
    }

    // 计算滑点后的买入价格
    const actualPrice = price * (1 + this.config.slippageRate);
    // 计算可买股数（A股以手为单位，1手=100股）
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

    // 更新现金
    this.cash -= totalCost;

    // 更新持仓
    const existingPosition = this.positions.get(stock.ts_code);
    if (existingPosition) {
      // 加仓：更新平均成本
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

    // 记录交易
    const trade = {
      ts_code: stock.ts_code,
      stockName: stockName || this.stockNames.get(stock.ts_code) || stock.ts_code,
      action: 'BUY',
      date,
      shares,
      price: actualPrice,
      amount: tradeAmount,
      commission,
      totalCost
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

    // 计算滑点后的卖出价格
    const actualPrice = price * (1 - this.config.slippageRate);
    const tradeAmount = sharesToSell * actualPrice;
    const commission = this.calculateCommission(tradeAmount, false);
    const stampDuty = this.calculateStampDuty(tradeAmount);
    const totalCost = commission + stampDuty;
    const netProceeds = tradeAmount - totalCost;

    // 计算收益
    const costPortion = currentPosition.costBasis * (sharesToSell / currentPosition.shares);
    const profit = tradeAmount - costPortion - totalCost;
    const profitRate = costPortion > 0 ? profit / costPortion : 0;

    // 更新持仓
    currentPosition.shares -= sharesToSell;
    currentPosition.costBasis -= costPortion;

    if (currentPosition.shares <= 0) {
      this.positions.delete(position.ts_code);
    }

    // 更新现金
    this.cash += netProceeds;

    // 记录交易
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
      exitDate: date
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

    // 需要卖出的股票
    const stocksToSell = currentStocks.filter(tsCode => !targetStocks.has(tsCode));

    // 先卖出不在目标持仓中的股票
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

    // 计算可用于买入的资金
    const availableCash = this.cash;
    const buyAmountPerStock = Math.floor(availableCash / stocksToBuy.length);

    // 买入新股
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
        // 使用成本价作为备选
        positionValue += position.shares * position.avgPrice;
      }
    }

    return this.cash + positionValue;
  }

  /**
   * 运行回测
   */
  async run(params = {}) {
    const {
      startDate,
      endDate,
      strategyConfig = {}
    } = params;

    // 重置状态
    this.reset();

    console.log(`[回测引擎] 开始回测: ${startDate} 到 ${endDate}`);
    const startTime = Date.now();

    // 获取交易日
    this.dates = await this.getTradingDates(startDate, endDate);
    if (this.dates.length === 0) {
      throw new Error(`在 ${startDate} 到 ${endDate} 范围内未找到交易日数据`);
    }

    console.log(`[回测引擎] 找到 ${this.dates.length} 个交易日`);

    // 每日循环
    for (let i = 0; i < this.dates.length; i++) {
      const date = this.dates[i];
      this.currentDate = date;

      // 获取当日股票快照
      const snapshot = await this.getSnapshotByDate(date);
      if (snapshot.length === 0) {
        // 无快照数据，保持当前持仓
        const totalAssets = await this.calculateTotalAssets(date);
        this.equityCurve.push(totalAssets);
        continue;
      }

      // 选股
      const selectedStocks = this.selectStocks(snapshot, strategyConfig);

      // 执行调仓
      if (selectedStocks.length > 0) {
        await this.executeDailyRebalance(date, selectedStocks, strategyConfig);
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
        console.log(`[回测引擎] 进度: ${progress}% (${i + 1}/${this.dates.length})`);
      }
    }

    const endTime = Date.now();
    console.log(`[回测引擎] 回测完成，耗时: ${(endTime - startTime) / 1000}秒`);

    // 生成回测结果
    return this.generateResults(params);
  }

  /**
   * 生成回测结果
   */
  generateResults(params) {
    const initialCapital = this.config.initialCapital;
    const finalCapital = this.equityCurve[this.equityCurve.length - 1] || initialCapital;
    const tradingDays = this.dates.length;

    // 为绩效报告准备交易数据（添加 return 属性，且仅包含卖出交易以计算胜率和次数）
    const sellTrades = this.trades
      .filter(t => t.action === 'SELL')
      .map(t => ({
        ...t,
        return: t.profitRate || 0
      }));

    // 计算绩效指标
    const performanceReport = performance.calculatePerformanceReport({
      equityCurve: this.equityCurve,
      dailyReturns: this.dailyReturns,
      trades: sellTrades,
      initialCapital,
      finalCapital,
      tradingDays
    });

    // 计算7个核心指标
    const sevenMetrics = {
      sharpe_ratio: performanceReport.sharpeRatio || 0,
      max_drawdown: performanceReport.maxDrawdown || 0,
      annualized_return: performanceReport.annualizedReturn || 0,
      total_return: performanceReport.totalReturn || 0,
      win_rate: performanceReport.winRate || 0,
      trade_count: performanceReport.tradeCount || 0,
      volatility: this.calculateVolatility()
    };

    return {
      success: true,
      params,
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
      sevenMetrics,
      details: {
        equityCurve: this.equityCurve,
        dailyReturns: this.dailyReturns,
        trades: this.trades,
        positions: Array.from(this.positions.values()),
        dates: this.dates
      },
      performance: performanceReport
    };
  }

  /**
   * 计算年化波动率
   */
  calculateVolatility() {
    if (this.dailyReturns.length < 2) return 0;

    const mean = this.dailyReturns.reduce((a, b) => a + b, 0) / this.dailyReturns.length;
    const variance = this.dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / this.dailyReturns.length;

    // 年化波动率 = 日波动率 * sqrt(252)
    return Math.sqrt(variance) * Math.sqrt(252);
  }

  /**
   * 批量运行回测（参数扫描）
   */
  async runBatch(baseParams, paramRanges) {
    const results = [];

    // 如果没有参数范围，运行单次回测
    if (!paramRanges || Object.keys(paramRanges).length === 0) {
      const result = await this.run(baseParams);
      results.push({
        params: baseParams,
        result
      });
      return results;
    }

    // 生成参数组合
    const paramCombinations = this.generateParamCombinations(paramRanges);

    console.log(`[批量回测] 共 ${paramCombinations.length} 组参数组合`);

    for (const paramCombo of paramCombinations) {
      try {
        // 重置引擎状态
        this.reset();

        const mergedParams = {
          ...baseParams,
          strategyConfig: {
            ...baseParams.strategyConfig,
            ...paramCombo
          }
        };

        const result = await this.run(mergedParams);

        results.push({
          params: paramCombo,
          summary: result.summary,
          sevenMetrics: result.sevenMetrics,
          success: true
        });
      } catch (error) {
        console.error(`[批量回测] 参数组合失败:`, paramCombo, error.message);
        results.push({
          params: paramCombo,
          error: error.message,
          success: false
        });
      }
    }

    // 按年化收益率排序
    results.sort((a, b) => {
      if (!a.success) return 1;
      if (!b.success) return -1;
      return (b.summary?.annualizedReturn || 0) - (a.summary?.annualizedReturn || 0);
    });

    return results;
  }

  /**
   * 生成参数组合
   */
  generateParamCombinations(paramRanges) {
    const keys = Object.keys(paramRanges);
    if (keys.length === 0) return [{}];

    const combinations = [];
    const firstKey = keys[0];
    const firstValues = Array.isArray(paramRanges[firstKey]) ? paramRanges[firstKey] : [paramRanges[firstKey]];

    if (keys.length === 1) {
      for (const value of firstValues) {
        combinations.push({ [firstKey]: value });
      }
      return combinations;
    }

    const restRanges = { ...paramRanges };
    delete restRanges[firstKey];
    const restCombinations = this.generateParamCombinations(restRanges);

    for (const value of firstValues) {
      for (const restCombo of restCombinations) {
        combinations.push({
          [firstKey]: value,
          ...restCombo
        });
      }
    }

    return combinations;
  }

  /**
   * 保存回测结果到数据库
   */
  async saveToDatabase() {
    const result = this.generateResults({});

    try {
      // 插入回测历史
      const insertHistory = `
        INSERT INTO backtest_history (
          name, strategy_config, start_date, end_date,
          initial_capital, final_capital, total_return,
          annualized_return, sharpe_ratio, max_drawdown,
          win_rate, trade_count, volatility, result_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const backtestName = `因子快照回测_${this.dates[0] || ''}_${this.dates[this.dates.length - 1] || ''}`;

      const historyResult = await this.db.runPromise(insertHistory, [
        backtestName,
        JSON.stringify({}),
        this.dates[0] || '',
        this.dates[this.dates.length - 1] || '',
        this.config.initialCapital,
        result.summary.finalCapital,
        result.summary.totalReturn,
        result.summary.annualizedReturn,
        result.summary.sharpeRatio,
        result.summary.maxDrawdown,
        result.summary.winRate,
        result.summary.totalTrades,
        result.sevenMetrics.volatility,
        JSON.stringify(result.summary)
      ]);

      const backtestId = historyResult.lastID;

      // 插入交易明细
      for (const trade of this.trades) {
        const insertDetail = `
          INSERT INTO backtest_trades (
            backtest_id, trade_date, ts_code, stock_name,
            action, quantity, price, amount, commission,
            profit, profit_rate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await this.db.runPromise(insertDetail, [
          backtestId,
          trade.date,
          trade.ts_code,
          trade.stockName,
          trade.action,
          trade.shares,
          trade.price,
          trade.amount,
          trade.commission || 0,
          trade.profit || 0,
          trade.profitRate || 0
        ]);
      }

      // 插入权益曲线
      for (let i = 0; i < this.dates.length; i++) {
        const insertEquity = `
          INSERT INTO backtest_equity_curve (
            backtest_id, trade_date, cash, position_value,
            total_value, daily_return, cumulative_return
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const dailyReturn = i > 0 && this.equityCurve[i - 1] > 0
          ? (this.equityCurve[i] - this.equityCurve[i - 1]) / this.equityCurve[i - 1]
          : 0;

        const cumulativeReturn = (this.equityCurve[i] - this.config.initialCapital) / this.config.initialCapital;

        await this.db.runPromise(insertEquity, [
          backtestId,
          this.dates[i],
          this.cash, // 注意：这是最终现金，不是每日快照
          this.equityCurve[i] - this.cash,
          this.equityCurve[i],
          dailyReturn,
          cumulativeReturn
        ]);
      }

      return { success: true, backtestId };
    } catch (error) {
      console.error('[回测引擎] 保存到数据库失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = FactorSnapshotBacktest;