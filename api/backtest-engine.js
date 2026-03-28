/**
 * 基于因子快照的日线回测引擎
 * 使用 stock_factor_snapshot 表进行选股，stock_daily 表获取价格
 * 支持 7 个绩效指标计算
 *
 * TASK_V3_203 - 增加分钟线数据加载支持
 * TASK_V4_026 - 支持选股时点快照数据，防止未来函数
 * TASK_INTEGRATE_001 - 集成 V4 决策引擎
 */

const { getDatabase } = require('./db');
const performance = require('./backtest-report');
// TASK_INTEGRATE_001: 导入 V4 决策引擎
const { HistoricalDecisionEngine, DataInsufficientError, StockSuspendedError, STRATEGY_CONFIG } = require('./backtest-decision');

// 支持的分钟线周期
const MINUTE_INTERVALS = {
  '1': 1,    // 1分钟
  '5': 5,    // 5分钟
  '15': 15,  // 15分钟
  '30': 30,  // 30分钟
  '60': 60   // 60分钟
};

class FactorSnapshotBacktest {
  constructor(config = {}) {
    // TASK_INTEGRATE_006: 策略类型与持有周期自动映射
    const strategyType = config.strategyType || 'short_term';
    const strategyConfig = STRATEGY_CONFIG[strategyType] || STRATEGY_CONFIG.short_term;

    this.config = {
      initialCapital: config.initialCapital || 1000000,
      commissionRate: config.commissionRate || 0.00025, // 万2.5
      minCommission: config.minCommission || 5,         // 最低5元
      positionLimit: config.positionLimit || 10,        // 最多10只
      stampDutyRate: config.stampDutyRate || 0.001,    // 印花税千1（仅卖出）
      slippageRate: config.slippageRate || 0,          // 滑点
      // TASK_V4_026: 选股时点参数
      selectionDate: config.selectionDate || null,     // 选股时点（使用该日期的快照数据）
      // TASK_INTEGRATE_001: 决策引擎配置
      strategyType: strategyType,                      // 策略类型：short_term|mid_term|long_term
      holdingPeriod: config.holdingPeriod || strategyConfig.holding_period, // 持有周期：short|mid|long（自动映射）
      useDecisionEngine: config.useDecisionEngine !== false, // 是否启用决策引擎（默认启用）
      ...config
    };

    this.db = getDatabase();

    // TASK_INTEGRATE_001: 初始化 V4 决策引擎
    this.decisionEngine = new HistoricalDecisionEngine({
      strategyType: this.config.strategyType
    });

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

    // TASK_V4_026: 选股结果缓存（基于选股时点）
    this.selectionSnapshot = null;  // 选股时点的快照数据
    this.selectedStocksByDate = new Map(); // 每日选股结果缓存

    // TASK_INTEGRATE_001: 决策引擎状态
    this.activeDecisions = new Map(); // 活跃决策单 Map<ts_code, decision>
    this.decisionStats = {
      totalDecisions: 0,
      buyDecisions: 0,
      sellDecisions: 0,
      stopLossTriggered: 0,
      targetReached: 0,
      skippedStocks: 0
    };
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
      console.warn(`[回测引擎] 警告: 选股时点 ${selectionDate} 无快照数据`);
    } else {
      console.log(`[回测引擎] 选股时点 ${selectionDate} 获取到 ${snapshot.length} 条快照数据`);
    }

    return snapshot;
  }

  /**
   * 使用选股时点的快照数据进行选股
   * 防止未来函数：只使用 selectionDate 及之前的数据
   * @param {string} selectionDate - 选股时点
   * @param {Object} strategyConfig - 策略配置
   * @returns {Promise<Array>} 选中的股票列表
   */
  async selectStocksAtTime(selectionDate, strategyConfig = {}) {
    // 检查是否已缓存选股结果
    const cacheKey = selectionDate;
    if (this.selectedStocksByDate.has(cacheKey)) {
      return this.selectedStocksByDate.get(cacheKey);
    }

    // 获取选股时点的快照数据
    const snapshot = await this.getSelectionSnapshot(selectionDate);

    if (snapshot.length === 0) {
      return [];
    }

    // 使用策略进行选股
    const selectedStocks = this.selectStocks(snapshot, strategyConfig);

    // 缓存选股结果
    this.selectedStocksByDate.set(cacheKey, selectedStocks);

    console.log(`[回测引擎] 选股时点 ${selectionDate} 选出 ${selectedStocks.length} 只股票`);

    return selectedStocks;
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
      // 未指定选股时点，跳过验证
      return true;
    }

    const current = new Date(currentDate);
    const selection = new Date(selectionDate);

    if (current < selection) {
      console.error(`[回测引擎] 未来函数警告: 当前日期 ${currentDate} 早于选股时点 ${selectionDate}`);
      return false;
    }

    return true;
  }

  /**
   * 获取回测时间范围内的可用交易日
   * 确保只返回选股时点之后的交易日
   * @param {string} startDate - 开始日期
   * @param {string} endDate - 结束日期
   * @param {string} selectionDate - 选股时点（可选）
   * @returns {Promise<Array>} 交易日数组
   */
  async getTradingDatesWithSelection(startDate, endDate, selectionDate = null) {
    // 如果有选股时点，确保回测从选股时点之后开始
    const effectiveStart = selectionDate
      ? this.getNextTradingDate(selectionDate) || startDate
      : startDate;

    return await this.getTradingDates(effectiveStart, endDate);
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
   *
   * TASK_ENGINE_001: 集成决策引擎
   * TASK_ENGINE_002: 集成止损/止盈逻辑
   * TASK_ENGINE_003: 使用决策单价格
   * TASK_ENGINE_004: 三层错误处理
   *
   * @param {string} date - 交易日期
   * @param {Array} selectedStocks - 选中的股票列表
   * @param {Object} strategyConfig - 策略配置
   */
  async executeDailyRebalance(date, selectedStocks, strategyConfig = {}) {
    const targetStocks = new Set(selectedStocks.map(s => s.ts_code));
    const currentStocks = Array.from(this.positions.keys());

    // ============================================================
    // 步骤 1: 检查现有持仓的止损/止盈 (TASK_ENGINE_002)
    // ============================================================
    for (const tsCode of currentStocks) {
      const position = this.positions.get(tsCode);
      if (!position) continue;

      // 获取当前价格
      const priceInfo = await this.getStockPrice(tsCode, date);
      if (!priceInfo || priceInfo.price <= 0) {
        // Level 1: 数据不足，跳过
        console.warn(`[调仓] ${tsCode} 无法获取价格数据，跳过检查`);
        continue;
      }

      const currentPrice = priceInfo.price;

      // 获取该持仓的决策单（如果有）
      const decision = this.activeDecisions.get(tsCode);

      if (decision) {
        // 检查止损
        const stopLossResult = await this.checkStopLoss(position, currentPrice, decision, date);
        if (stopLossResult.triggered) {
          this.decisionStats.stopLossTriggered++;
          console.log(`[调仓] ${tsCode} 触发止损: ${stopLossResult.trade?.reason || 'unknown'}`);
          continue; // 已卖出，跳过后续检查
        }

        // 检查止盈
        const targetResult = await this.checkTargetPrice(position, currentPrice, decision, date);
        if (targetResult.triggered) {
          this.decisionStats.targetReached++;
          console.log(`[调仓] ${tsCode} 触发止盈`);
          continue;
        }
      }

      // 不在目标持仓中，且未触发止损/止盈，执行卖出
      if (!targetStocks.has(tsCode)) {
        await this.executeSell(position, priceInfo, 1.0, date);
      }
    }

    // ============================================================
    // 步骤 2: 为目标股票生成决策单并买入 (TASK_ENGINE_001, TASK_ENGINE_003)
    // ============================================================
    const stocksToBuy = selectedStocks.filter(stock => !this.positions.has(stock.ts_code));

    if (stocksToBuy.length === 0) return;

    // 预加载价格数据（用于决策引擎计算技术指标）
    if (this.config.useDecisionEngine) {
      const ts_codes = stocksToBuy.map(s => s.ts_code);
      const endDate = date;
      const startDate = this.getDateBefore(date, 70);
      await this.decisionEngine.preloadPrices(ts_codes, startDate, endDate);
    }

    // 计算可用于买入的资金
    const availableCash = this.cash;
    const buyAmountPerStock = Math.floor(availableCash / stocksToBuy.length);

    // 生成决策单并执行买入
    for (const stock of stocksToBuy) {
      try {
        let buyPrice = null;
        let positionSuggest = 0.1;

        if (this.config.useDecisionEngine) {
          // 使用决策引擎生成决策单
          const snapshot = await this.getSnapshot(stock.ts_code, date);
          const decision = await this.decisionEngine.generateDecision(
            stock.ts_code,
            date,
            snapshot
          );

          if (!decision) {
            // Level 1: 决策引擎返回 null（数据不足或停牌）
            this.decisionStats.skippedStocks++;
            console.warn(`[调仓] ${stock.ts_code} 决策引擎跳过（数据不足或停牌）`);
            continue;
          }

          this.decisionStats.totalDecisions++;

          // TASK_ENGINE_003: 使用决策单的建仓区间价格
          if (decision.decision === 'buy') {
            buyPrice = decision.entry_zone[0]; // 使用第一建仓价
            positionSuggest = decision.position_suggest || 0.1;

            // 保存活跃决策单（用于后续止损/止盈检查）
            this.activeDecisions.set(stock.ts_code, decision);
          } else {
            // 决策为 hold，跳过买入
            console.log(`[调仓] ${stock.ts_code} 决策为 hold，跳过买入`);
            continue;
          }
        } else {
          // 不使用决策引擎，使用当前价格
          const priceInfo = await this.getStockPrice(stock.ts_code, date);
          if (priceInfo && priceInfo.price > 0) {
            buyPrice = priceInfo.price;
          }
        }

        if (!buyPrice) {
          console.warn(`[调仓] ${stock.ts_code} 无法确定买入价格，跳过`);
          continue;
        }

        // 获取当前市场价格作为参考
        const marketPriceInfo = await this.getStockPrice(stock.ts_code, date);
        if (!marketPriceInfo || marketPriceInfo.price <= 0) {
          // Level 1: 无法获取市场价格，跳过
          console.warn(`[调仓] ${stock.ts_code} 无法获取市场价格，跳过`);
          continue;
        }

        // TASK_ENGINE_003: 使用决策价格和市场价格的较低值作为实际成交价
        const actualBuyPrice = this.config.useDecisionEngine
          ? Math.min(buyPrice, marketPriceInfo.price)
          : marketPriceInfo.price;

        // 计算买入金额
        const buyAmount = Math.floor(buyAmountPerStock * (positionSuggest / 0.1));

        // 执行买入
        const result = await this.executeBuy(
          stock,
          { price: actualBuyPrice, stockName: marketPriceInfo.stockName },
          buyAmount,
          date
        );

        if (result.success) {
          this.decisionStats.buyDecisions++;
          console.log(`[调仓] 买入 ${stock.ts_code} @ ${actualBuyPrice.toFixed(2)}, 金额: ${buyAmount.toFixed(0)}`);
        }

      } catch (error) {
        // TASK_ENGINE_004: 三层错误处理
        if (error.name === 'DataInsufficientError' || error.name === 'StockSuspendedError') {
          // Level 1: 数据不足/停牌，跳过该股票
          console.warn(`[调仓] ${stock.ts_code} ${error.message}，跳过`);
          this.decisionStats.skippedStocks++;
        } else {
          // Level 3: 系统错误，记录并继续（不终止整个调仓）
          console.error(`[调仓] ${stock.ts_code} 处理失败:`, error.message);
        }
      }
    }
  }

  // ==================== TASK_INTEGRATE_002: 决策引擎集成 ====================

  /**
   * 使用决策引擎执行交易
   *
   * 核心方法：根据决策单执行买入/卖出操作
   *
   * @param {string} date - 交易日期 (YYYY-MM-DD)
   * @param {Array} selectedStocks - 选中的股票列表
   * @param {Object} portfolioWeights - 投资组合权重 Map<ts_code, weight>
   * @returns {Promise<Array>} 交易流水数组
   */
  async executeWithDecisions(date, selectedStocks, portfolioWeights = {}) {
    const trades = [];

    if (!selectedStocks || selectedStocks.length === 0) {
      return trades;
    }

    console.log(`[决策引擎] ${date} 开始执行决策，共 ${selectedStocks.length} 只股票`);

    try {
      // ============================================================
      // 步骤 1: 预加载价格数据
      // ============================================================
      const ts_codes = selectedStocks.map(s => s.ts_code);
      // 预加载 60 天的价格数据（用于 MA60 计算）
      const endDate = date;
      const startDate = this.getDateBefore(date, 70);
      await this.decisionEngine.preloadPrices(ts_codes, startDate, endDate);

      // ============================================================
      // 步骤 2: 检查现有持仓的止损/止盈
      // ============================================================
      const positionsToCheck = Array.from(this.positions.entries());
      for (const [ts_code, position] of positionsToCheck) {
        const decision = this.activeDecisions.get(ts_code);
        if (!decision) continue;

        const currentPriceInfo = await this.getStockPrice(ts_code, date);
        if (!currentPriceInfo || currentPriceInfo.price <= 0) continue;

        const currentPrice = currentPriceInfo.price;

        // TASK_INTEGRATE_003: 检查止损
        const stopLossResult = await this.checkStopLoss(position, currentPrice, decision, date);
        if (stopLossResult.triggered) {
          trades.push(stopLossResult.trade);
          this.decisionStats.stopLossTriggered++;
          continue;
        }

        // 检查止盈
        const targetResult = await this.checkTargetPrice(position, currentPrice, decision, date);
        if (targetResult.triggered) {
          trades.push(targetResult.trade);
          this.decisionStats.targetReached++;
          continue;
        }
      }

      // ============================================================
      // 步骤 3: 为每只股票生成决策单
      // ============================================================
      const decisions = [];
      for (const stock of selectedStocks) {
        // 获取快照数据
        const snapshot = await this.getSnapshot(stock.ts_code, date);

        // 生成决策单
        const decision = await this.decisionEngine.generateDecision(
          stock.ts_code,
          date,
          snapshot
        );

        if (decision) {
          decisions.push({
            ...decision,
            stockInfo: stock
          });
          this.decisionStats.totalDecisions++;
        } else {
          this.decisionStats.skippedStocks++;
        }
      }

      // ============================================================
      // 步骤 4: 根据决策单执行交易
      // ============================================================
      for (const decision of decisions) {
        const { ts_code, decision: action, entry_zone, position_suggest, stockInfo } = decision;

        // 计算仓位
        const weight = portfolioWeights[ts_code] || position_suggest || 0.1;
        const buyAmount = this.calculatePositionAmount(weight, position_suggest);

        // 检查是否已有持仓
        const existingPosition = this.positions.get(ts_code);

        if (action === 'buy' && !existingPosition) {
          // 买入：使用决策单的建仓区间
          const entryPrice = entry_zone[0]; // 使用第一建仓价

          // 获取当前价格作为实际成交价
          const priceInfo = await this.getStockPrice(ts_code, date);
          if (priceInfo && priceInfo.price > 0) {
            // 使用决策价格和当前价格的较低值
            const actualPrice = Math.min(entryPrice, priceInfo.price);

            const result = await this.executeBuy(
              { ts_code, ...stockInfo },
              { price: actualPrice, stockName: priceInfo.stockName },
              buyAmount,
              date
            );

            if (result.success) {
              trades.push(result.trade);
              this.decisionStats.buyDecisions++;

              // 保存活跃决策单（用于后续止损/止盈检查）
              this.activeDecisions.set(ts_code, decision);

              console.log(`[决策引擎] 买入: ${ts_code} @ ${actualPrice.toFixed(2)}, 金额: ${buyAmount.toFixed(0)}`);
            }
          }
        } else if (action === 'sell' && existingPosition) {
          // 卖出
          const priceInfo = await this.getStockPrice(ts_code, date);
          if (priceInfo && priceInfo.price > 0) {
            const result = await this.executeSell(existingPosition, priceInfo, 1.0, date);
            if (result.success) {
              trades.push(result.trade);
              this.decisionStats.sellDecisions++;

              // 移除活跃决策单
              this.activeDecisions.delete(ts_code);

              console.log(`[决策引擎] 卖出: ${ts_code} @ ${priceInfo.price.toFixed(2)}`);
            }
          }
        }
        // action === 'hold' 时不执行任何操作
      }

      return trades;

    } catch (error) {
      console.error(`[决策引擎] executeWithDecisions 执行失败:`, error.message);
      throw error;
    }
  }

  // ==================== TASK_INTEGRATE_003: 止损触发逻辑 ====================

  /**
   * 检查止损条件
   *
   * @param {Object} position - 持仓信息
   * @param {number} currentPrice - 当前价格
   * @param {Object} decision - 决策单
   * @param {string} date - 当前日期
   * @returns {Promise<Object>} { triggered: boolean, trade?: Object }
   */
  async checkStopLoss(position, currentPrice, decision, date) {
    const result = { triggered: false, trade: null };

    if (!decision || !decision.stop_loss) {
      return result;
    }

    const stopLossPrice = decision.stop_loss;

    // 条件 1: 硬止损 - 价格跌破 MA60（止损价）
    if (currentPrice <= stopLossPrice) {
      console.log(`[止损触发] ${decision.ts_code} 当前价 ${currentPrice.toFixed(2)} <= 止损价 ${stopLossPrice.toFixed(2)}`);

      // 获取真实价格，如果失败则使用传入的 currentPrice（支持测试环境）
      let priceInfo = await this.getStockPrice(decision.ts_code, date);
      if (!priceInfo || priceInfo.price <= 0) {
        priceInfo = { price: currentPrice, stockName: position.stockName || decision.ts_code };
      }

      if (this.positions.has(decision.ts_code)) {
        const sellResult = await this.executeSell(position, priceInfo, 1.0, date);
        if (sellResult.success) {
          result.triggered = true;
          result.trade = {
            ...sellResult.trade,
            reason: 'stop_loss',
            stopLossPrice
          };

          // 移除活跃决策单
          this.activeDecisions.delete(decision.ts_code);
        }
      }

      return result;
    }

    // 条件 2: 时间止损 - 超过决策单有效期未上涨
    const validUntil = decision.valid_until;
    if (validUntil && date > validUntil) {
      // 检查是否盈利
      const profitRate = (currentPrice - position.avgPrice) / position.avgPrice;
      if (profitRate < 0.02) { // 未盈利超过 2%
        console.log(`[时间止损] ${decision.ts_code} 超过有效期 ${validUntil} 且未盈利`);

        const priceInfo = await this.getStockPrice(decision.ts_code, date);
        if (priceInfo && priceInfo.price > 0 && this.positions.has(decision.ts_code)) {
          const sellResult = await this.executeSell(position, priceInfo, 1.0, date);
          if (sellResult.success) {
            result.triggered = true;
            result.trade = {
              ...sellResult.trade,
              reason: 'time_stop_loss',
              validUntil
            };

            this.activeDecisions.delete(decision.ts_code);
          }
        }
      }
    }

    // 条件 3: 评分止损 - 七因子评分跌破阈值（需要重新获取评分）
    // 这里简化处理，因为评分止损需要实时评分数据
    // 如果快照中有评分，且低于 0.65，触发止损
    if (decision.seven_factor_score && decision.seven_factor_score < 0.65) {
      console.log(`[评分止损] ${decision.ts_code} 评分 ${decision.seven_factor_score.toFixed(2)} < 0.65`);

      const priceInfo = await this.getStockPrice(decision.ts_code, date);
      if (priceInfo && priceInfo.price > 0 && this.positions.has(decision.ts_code)) {
        const sellResult = await this.executeSell(position, priceInfo, 1.0, date);
        if (sellResult.success) {
          result.triggered = true;
          result.trade = {
            ...sellResult.trade,
            reason: 'score_stop_loss',
            sevenFactorScore: decision.seven_factor_score
          };

          this.activeDecisions.delete(decision.ts_code);
        }
      }
    }

    return result;
  }

  /**
   * 检查止盈条件
   *
   * @param {Object} position - 持仓信息
   * @param {number} currentPrice - 当前价格
   * @param {Object} decision - 决策单
   * @param {string} date - 当前日期
   * @returns {Promise<Object>} { triggered: boolean, trade?: Object }
   */
  async checkTargetPrice(position, currentPrice, decision, date) {
    const result = { triggered: false, trade: null };

    if (!decision || !decision.target_prices) {
      return result;
    }

    // 根据持有周期选择止盈价
    const holdingPeriod = this.config.holdingPeriod || 'short';
    const targetPrice = decision.target_prices[holdingPeriod];

    if (!targetPrice) {
      return result;
    }

    // 检查是否达到止盈价
    if (currentPrice >= targetPrice) {
      console.log(`[止盈触发] ${decision.ts_code} 当前价 ${currentPrice.toFixed(2)} >= 止盈价 ${targetPrice.toFixed(2)}`);

      // 获取真实价格，如果失败则使用传入的 currentPrice（支持测试环境）
      let priceInfo = await this.getStockPrice(decision.ts_code, date);
      if (!priceInfo || priceInfo.price <= 0) {
        priceInfo = { price: currentPrice, stockName: position.stockName || decision.ts_code };
      }

      if (this.positions.has(decision.ts_code)) {
        const sellResult = await this.executeSell(position, priceInfo, 1.0, date);
        if (sellResult.success) {
          result.triggered = true;
          result.trade = {
            ...sellResult.trade,
            reason: 'target_reached',
            targetPrice
          };

          // 移除活跃决策单
          this.activeDecisions.delete(decision.ts_code);
        }
      }
    }

    return result;
  }

  // ==================== 辅助方法 ====================

  /**
   * 获取指定日期的股票快照数据
   *
   * @param {string} ts_code - 股票代码
   * @param {string} date - 日期 (YYYY-MM-DD)
   * @returns {Promise<Object>} 快照数据
   */
  async getSnapshot(ts_code, date) {
    const dateDb = date.replace(/-/g, '');

    const query = `
      SELECT
        ts_code,
        industry,
        seven_factor_score,
        pe_ttm,
        pb,
        peg,
        policy_score,
        commercialization_score,
        sentiment_score,
        capital_score
      FROM stock_factor_snapshot
      WHERE ts_code = ? AND trade_date = ?
      LIMIT 1
    `;

    // 转换股票代码格式
    const dbCode = this.convertToDbCode(ts_code);

    try {
      const row = await this.db.getPromise(query, [dbCode, dateDb]);
      return row || {
        ts_code,
        seven_factor_score: 0.5,
        pe_ttm: null,
        pb: null,
        peg: null
      };
    } catch (error) {
      console.error(`[决策引擎] 获取快照失败: ${ts_code} @ ${date}`, error.message);
      return {
        ts_code,
        seven_factor_score: 0.5,
        pe_ttm: null,
        pb: null,
        peg: null
      };
    }
  }

  /**
   * 计算买入金额
   *
   * @param {number} weight - 投资组合权重 (0-1)
   * @param {number} positionSuggest - 建议仓位 (0-1)
   * @returns {number} 买入金额
   */
  calculatePositionAmount(weight, positionSuggest) {
    // 取权重和建议仓位的较小值
    const effectiveWeight = Math.min(weight, positionSuggest || 0.3);
    // 计算买入金额
    return Math.floor(this.config.initialCapital * effectiveWeight);
  }

  /**
   * 获取指定日期之前的日期
   *
   * @param {string} date - 日期 (YYYY-MM-DD)
   * @param {number} days - 提前天数
   * @returns {string} 之前的日期
   */
  getDateBefore(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }

  /**
   * 获取决策统计信息
   *
   * @returns {Object} 决策统计
   */
  getDecisionStats() {
    return {
      ...this.decisionStats,
      cacheStats: this.decisionEngine.getCacheStats()
    };
  }

  // ==================== TASK_INTEGRATE_006: 策略参数映射 ====================

  /**
   * 获取策略配置
   *
   * @param {string} strategyType - 策略类型：short_term|mid_term|long_term
   * @returns {Object} 策略配置
   */
  getStrategyConfig(strategyType) {
    return STRATEGY_CONFIG[strategyType] || STRATEGY_CONFIG.short_term;
  }

  /**
   * 根据策略类型获取止盈价格键
   *
   * @param {string} strategyType - 策略类型
   * @returns {string} 止盈价格键：short|mid|long
   */
  getTargetPriceKey(strategyType) {
    const config = this.getStrategyConfig(strategyType);
    return config.holding_period;
  }

  /**
   * 根据策略类型获取有效期天数
   *
   * @param {string} strategyType - 策略类型
   * @returns {number} 有效期天数
   */
  getValidDays(strategyType) {
    const config = this.getStrategyConfig(strategyType);
    return config.valid_days;
  }

  /**
   * 更新策略类型（同步更新持有周期）
   *
   * @param {string} strategyType - 策略类型：short_term|mid_term|long_term
   */
  updateStrategyType(strategyType) {
    const config = this.getStrategyConfig(strategyType);
    this.config.strategyType = strategyType;
    this.config.holdingPeriod = config.holding_period;

    // 更新决策引擎配置
    if (this.decisionEngine) {
      this.decisionEngine.config.strategyType = strategyType;
    }

    console.log(`[回测引擎] 更新策略类型: ${strategyType}, 持有周期: ${config.holding_period}, 有效期: ${config.valid_days}天`);
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
   * TASK_V4_026: 支持 selectionDate 参数，使用选股时点的快照数据
   */
  async run(params = {}) {
    const {
      startDate,
      endDate,
      strategyConfig = {},
      // TASK_V4_026: 选股时点参数
      selectionDate = null  // 选股时点，使用该日期的快照数据进行选股
    } = params;

    // 重置状态
    this.reset();

    // 记录选股时点
    this.config.selectionDate = selectionDate || this.config.selectionDate;

    const effectiveSelectionDate = this.config.selectionDate;

    console.log(`[回测引擎] 开始回测: ${startDate} 到 ${endDate}`);
    if (effectiveSelectionDate) {
      console.log(`[回测引擎] 选股时点: ${effectiveSelectionDate} (使用该日期的快照数据进行选股)`);
    }
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

    console.log(`[回测引擎] 找到 ${this.dates.length} 个交易日 (从 ${this.dates[0]} 到 ${this.dates[this.dates.length - 1]})`);

    // TASK_V4_026: 如果有选股时点，在回测开始前获取选股结果
    if (effectiveSelectionDate) {
      console.log(`[回测引擎] 正在获取选股时点 ${effectiveSelectionDate} 的快照数据...`);
      this.selectionSnapshot = await this.getSelectionSnapshot(effectiveSelectionDate);

      if (this.selectionSnapshot.length === 0) {
        console.warn(`[回测引擎] 警告: 选股时点 ${effectiveSelectionDate} 无快照数据，将使用每日快照数据进行选股`);
      } else {
        console.log(`[回测引擎] 已获取 ${this.selectionSnapshot.length} 条快照数据用于选股`);
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

      // TASK_V4_026: 修改选股逻辑
      let selectedStocks;
      if (this.selectionSnapshot && this.selectionSnapshot.length > 0) {
        // 使用选股时点的快照数据进行选股（防止未来函数）
        selectedStocks = this.selectStocks(this.selectionSnapshot, strategyConfig);
      } else {
        // 降级到每日快照数据
        const snapshot = await this.getSnapshotByDate(date);
        if (snapshot.length === 0) {
          // 无快照数据，保持当前持仓
          const totalAssets = await this.calculateTotalAssets(date);
          this.equityCurve.push(totalAssets);
          continue;
        }
        selectedStocks = this.selectStocks(snapshot, strategyConfig);
      }

      // TASK_INTEGRATE_005: 根据配置选择交易执行方式
      if (selectedStocks.length > 0) {
        if (this.config.useDecisionEngine) {
          // 使用决策引擎执行交易
          const trades = await this.executeWithDecisions(
            date,
            selectedStocks,
            strategyConfig.portfolioWeights || {}
          );
          // 交易已在 executeWithDecisions 中记录
        } else {
          // 原有逻辑（保持兼容性）
          await this.executeDailyRebalance(date, selectedStocks, strategyConfig);
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
   * TASK_V4_026: 在报告中记录选股时点和回测区间
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

    // TASK_V4_026: 记录选股时点和回测区间信息
    const selectionDate = this.config.selectionDate || params.selectionDate;

    return {
      success: true,
      params,
      // TASK_V4_026: 添加选股时点和回测区间信息
      backtestInfo: {
        selectionDate: selectionDate || null,
        backtestStartDate: this.dates[0] || params.startDate,
        backtestEndDate: this.dates[this.dates.length - 1] || params.endDate,
        actualTradingDays: tradingDays,
        futureFunctionProtection: !!selectionDate, // 是否启用了未来函数防护
        selectionSnapshotCount: this.selectionSnapshot ? this.selectionSnapshot.length : 0
      },
      // TASK_INTEGRATE_006: 添加决策引擎配置信息
      decisionEngineConfig: {
        useDecisionEngine: this.config.useDecisionEngine,
        strategyType: this.config.strategyType,
        holdingPeriod: this.config.holdingPeriod,
        validDays: STRATEGY_CONFIG[this.config.strategyType]?.valid_days || 1
      },
      // TASK_INTEGRATE_006: 添加决策统计信息
      decisionStats: this.config.useDecisionEngine ? this.getDecisionStats() : null,
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
        dates: this.dates,
        // TASK_V4_026: 添加选股结果
        selectedStocks: this.selectionSnapshot
          ? this.selectStocks(this.selectionSnapshot, params.strategyConfig || {}).map(s => s.ts_code)
          : []
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

  // ==================== 分钟线数据支持（TASK_V3_203）====================

  /**
   * 获取分钟线数据
   * @param {string} tsCode - 股票代码
   * @param {string} date - 日期 YYYY-MM-DD
   * @param {string} interval - 分钟周期 (1/5/15/30/60)
   * @returns {Promise<Array>} 分钟线数据数组
   */
  async getMinuteData(tsCode, date, interval = '5') {
    const cacheKey = `minute_${tsCode}_${date}_${interval}`;
    if (this.minuteCache && this.minuteCache.has(cacheKey)) {
      return this.minuteCache.get(cacheKey);
    }

    const dateDb = date.replace(/-/g, '');
    const dbCode = this.convertToDbCode(tsCode);

    // 根据周期计算时间过滤条件
    const intervalNum = MINUTE_INTERVALS[interval] || 5;

    const query = `
      SELECT
        trade_time,
        open,
        high,
        low,
        close,
        vol,
        amount,
        pct_change
      FROM stock_minute
      WHERE ts_code = ? AND trade_date = ?
      ORDER BY trade_time ASC
    `;

    try {
      const rows = await this.db.allPromise(query, [dbCode, dateDb]);

      // 根据周期聚合数据
      const aggregatedData = this.aggregateMinuteData(rows || [], intervalNum);

      if (!this.minuteCache) {
        this.minuteCache = new Map();
      }
      this.minuteCache.set(cacheKey, aggregatedData);

      return aggregatedData;
    } catch (error) {
      console.error(`[回测引擎] 获取分钟线数据失败 (${tsCode} ${date}):`, error.message);
      return [];
    }
  }

  /**
   * 聚合分钟线数据到指定周期
   * @param {Array} minuteData - 原始分钟线数据
   * @param {number} interval - 目标周期（分钟）
   * @returns {Array} 聚合后的数据
   */
  aggregateMinuteData(minuteData, interval) {
    if (!minuteData || minuteData.length === 0) {
      return [];
    }

    // 对于1分钟线，直接返回
    if (interval === 1) {
      return minuteData;
    }

    const aggregated = [];
    const timeGroups = new Map();

    // 按时间间隔分组
    for (const bar of minuteData) {
      const time = bar.trade_time;
      if (!time) continue;

      // 解析时间并计算所属的聚合时间段
      const [hours, minutes] = time.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes;
      const groupIndex = Math.floor(totalMinutes / interval);
      const groupStartMinutes = groupIndex * interval;
      const groupHours = Math.floor(groupStartMinutes / 60);
      const groupMinutes = groupStartMinutes % 60;
      const groupKey = `${String(groupHours).padStart(2, '0')}:${String(groupMinutes).padStart(2, '0')}:00`;

      if (!timeGroups.has(groupKey)) {
        timeGroups.set(groupKey, []);
      }
      timeGroups.get(groupKey).push(bar);
    }

    // 对每个时间段进行聚合
    for (const [time, bars] of timeGroups) {
      if (bars.length === 0) continue;

      const open = bars[0].open;
      const close = bars[bars.length - 1].close;
      const high = Math.max(...bars.map(b => b.high));
      const low = Math.min(...bars.map(b => b.low));
      const vol = bars.reduce((sum, b) => sum + (parseFloat(b.vol) || 0), 0);
      const amount = bars.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);

      // 计算涨跌幅
      const prevClose = bars[0].pre_close || open;
      const pctChange = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;

      aggregated.push({
        trade_time: time,
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
        vol,
        amount,
        pct_change: pctChange
      });
    }

    // 按时间排序
    return aggregated.sort((a, b) => a.trade_time.localeCompare(b.trade_time));
  }

  /**
   * 获取分钟线时间点列表
   * @param {string} date - 日期
   * @param {string} interval - 分钟周期
   * @returns {Promise<Array>} 时间点数组
   */
  async getMinuteTimes(date, interval = '5') {
    const dateDb = date.replace(/-/g, '');

    try {
      const query = `
        SELECT DISTINCT trade_time
        FROM stock_minute
        WHERE trade_date = ?
        ORDER BY trade_time ASC
      `;

      const rows = await this.db.allPromise(query, [dateDb]);
      const times = rows.map(r => r.trade_time);

      // 根据周期过滤时间点
      const intervalNum = MINUTE_INTERVALS[interval] || 5;
      const filteredTimes = times.filter(time => {
        const [hours, minutes] = time.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;
        return totalMinutes % intervalNum === 0;
      });

      return filteredTimes.length > 0 ? filteredTimes : times;
    } catch (error) {
      console.error(`[回测引擎] 获取分钟时间点失败 (${date}):`, error.message);
      return [];
    }
  }

  /**
   * 加载分钟线数据用于回测
   * @param {string} tsCode - 股票代码
   * @param {string} startDate - 开始日期
   * @param {string} endDate - 结束日期
   * @param {string} interval - 分钟周期
   * @returns {Promise<Object>} 分钟线数据 { date -> [bar] }
   */
  async loadMinuteDataForBacktest(tsCode, startDate, endDate, interval = '5') {
    const startDateDb = startDate.replace(/-/g, '');
    const endDateDb = endDate.replace(/-/g, '');
    const dbCode = this.convertToDbCode(tsCode);

    const query = `
      SELECT
        trade_date,
        trade_time,
        open,
        high,
        low,
        close,
        vol,
        amount,
        pct_change,
        pre_close
      FROM stock_minute
      WHERE ts_code = ? AND trade_date BETWEEN ? AND ?
      ORDER BY trade_date ASC, trade_time ASC
    `;

    try {
      const rows = await this.db.allPromise(query, [dbCode, startDateDb, endDateDb]);
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
          amount: parseFloat(row.amount) || 0,
          pct_change: parseFloat(row.pct_change) || 0,
          pre_close: parseFloat(row.pre_close) || 0
        });
      }

      // 对每个日期的数据进行周期聚合
      const intervalNum = MINUTE_INTERVALS[interval] || 5;
      for (const [date, bars] of dataByDate) {
        dataByDate.set(date, this.aggregateMinuteData(bars, intervalNum));
      }

      return dataByDate;
    } catch (error) {
      console.error(`[回测引擎] 加载分钟线数据失败:`, error.message);
      return new Map();
    }
  }

  /**
   * 清除分钟线缓存
   */
  clearMinuteCache() {
    if (this.minuteCache) {
      this.minuteCache.clear();
    }
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