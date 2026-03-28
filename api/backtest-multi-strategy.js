/**
 * 多策略回测引擎
 * 支持加载多个策略模板，按权重分配资金，独立运行回测并合并结果
 *
 * TASK_V4_025 - 回测引擎支持多策略模板
 */

const { getDatabase } = require('./db');
const performance = require('./backtest-report');
const { getTemplateById, getDefaultTemplate } = require('../utils/strategy-template-loader');

/**
 * 策略权重配置
 * @typedef {Object} StrategyAllocation
 * @property {string} templateId - 策略模板ID
 * @property {number} weight - 权重 (0-1)
 * @property {Object} [customParams] - 自定义参数覆盖
 */

/**
 * 多策略回测引擎
 */
class MultiStrategyBacktestEngine {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 1000000,
      commissionRate: config.commissionRate || 0.00025,
      minCommission: config.minCommission || 5,
      positionLimit: config.positionLimit || 10,
      stampDutyRate: config.stampDutyRate || 0.001,
      slippageRate: config.slippageRate || 0,
      ...config
    };

    this.db = getDatabase();
    this.strategies = [];
    this.strategyResults = [];
    this.mergedResult = null;
  }

  /**
   * 添加策略配置
   * @param {StrategyAllocation} allocation - 策略配置
   */
  addStrategy(allocation) {
    if (!allocation.templateId) {
      throw new Error('策略配置必须包含 templateId');
    }
    if (typeof allocation.weight !== 'number' || allocation.weight <= 0 || allocation.weight > 1) {
      throw new Error('策略权重必须在 0-1 之间');
    }

    this.strategies.push({
      templateId: allocation.templateId,
      weight: allocation.weight,
      customParams: allocation.customParams || {}
    });
  }

  /**
   * 设置策略列表
   * @param {StrategyAllocation[]} allocations - 策略配置数组
   */
  setStrategies(allocations) {
    this.strategies = [];
    for (const alloc of allocations) {
      this.addStrategy(alloc);
    }
    this._validateWeights();
  }

  /**
   * 验证权重总和
   */
  _validateWeights() {
    const totalWeight = this.strategies.reduce((sum, s) => sum + s.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      // 自动归一化
      for (const s of this.strategies) {
        s.weight = s.weight / totalWeight;
      }
      console.log(`[多策略引擎] 权重已归一化，原始总和: ${totalWeight.toFixed(4)}`);
    }
  }

  /**
   * 加载策略模板
   * @param {string} templateId - 模板ID
   * @returns {Object} 策略参数
   */
  loadStrategyTemplate(templateId) {
    let template;
    if (templateId === 'DEFAULT' || !templateId) {
      template = getDefaultTemplate();
    } else {
      template = getTemplateById(templateId);
    }

    if (!template) {
      throw new Error(`策略模板不存在: ${templateId}`);
    }

    console.log(`[多策略引擎] 加载策略模板: ${template.name} (${templateId})`);

    return {
      templateId: template.template_id,
      name: template.name,
      description: template.description,
      params: this._convertTemplateParams(template.params)
    };
  }

  /**
   * 转换模板参数为回测引擎格式
   */
  _convertTemplateParams(templateParams) {
    return {
      // 行业权重映射
      industryWeights: {
        social: templateParams.industry_weights?.social || 0.25,
        policy: templateParams.industry_weights?.policy || 0.25,
        sentiment: templateParams.industry_weights?.sentiment || 0.25,
        commercial: templateParams.industry_weights?.commercial || 0.25
      },
      // 因子权重映射
      factorWeights: templateParams.factor_weights || {},
      // 选股参数
      selection: {
        industryTopN: templateParams.selection?.industry_top_n || 5,
        stockTopNPerIndustry: templateParams.selection?.stock_top_n_per_industry || 3,
        minSevenFactorScore: templateParams.selection?.min_seven_factor_score || 0.75,
        peMax: templateParams.selection?.pe_max || 60,
        pegMax: templateParams.selection?.peg_max || 2.0,
        revenueGrowthMin: templateParams.selection?.revenue_growth_min || 0.20,
        grossMarginMin: templateParams.selection?.gross_margin_min || 0.25
      },
      // 仓位配置
      position: {
        coreRatio: templateParams.position?.core_ratio || 0.75,
        satelliteRatio: templateParams.position?.satellite_ratio || 0.25,
        satelliteCount: templateParams.position?.satellite_count || 3
      },
      // 网格配置
      grid: {
        step: templateParams.grid?.step || 0.012,
        priceRange: templateParams.grid?.price_range || '3_months',
        singleAmount: templateParams.grid?.single_amount || 30000,
        trendFilter: templateParams.grid?.trend_filter !== false
      },
      // 风控参数
      riskControl: {
        maxDrawdown: templateParams.risk_control?.max_drawdown || -0.20,
        minAnnualReturn: templateParams.risk_control?.min_annual_return || 0.15,
        minWinRate: templateParams.risk_control?.min_win_rate || 0.55
      },
      // 资金流参数 (如果有)
      moneyflow: templateParams.moneyflow || null,
      // 轮动参数 (如果有)
      rotation: templateParams.rotation || null
    };
  }

  /**
   * 应用自定义参数覆盖
   */
  applyCustomParams(baseParams, customParams) {
    if (!customParams || Object.keys(customParams).length === 0) {
      return baseParams;
    }

    return {
      ...baseParams,
      industryWeights: { ...baseParams.industryWeights, ...customParams.industryWeights },
      factorWeights: { ...baseParams.factorWeights, ...customParams.factorWeights },
      selection: { ...baseParams.selection, ...customParams.selection },
      position: { ...baseParams.position, ...customParams.position },
      grid: { ...baseParams.grid, ...customParams.grid },
      riskControl: { ...baseParams.riskControl, ...customParams.riskControl },
      moneyflow: customParams.moneyflow ? { ...baseParams.moneyflow, ...customParams.moneyflow } : baseParams.moneyflow,
      rotation: customParams.rotation ? { ...baseParams.rotation, ...customParams.rotation } : baseParams.rotation
    };
  }

  /**
   * 运行多策略回测
   * @param {Object} params - 回测参数
   * @param {string} params.startDate - 开始日期
   * @param {string} params.endDate - 结束日期
   * @returns {Object} 合并后的回测结果
   */
  async run(params) {
    const { startDate, endDate } = params;
    const startTime = Date.now();

    console.log(`[多策略引擎] 开始多策略回测: ${startDate} 到 ${endDate}`);
    console.log(`[多策略引擎] 策略数量: ${this.strategies.length}`);

    if (this.strategies.length === 0) {
      // 默认使用单策略
      this.addStrategy({ templateId: 'DEFAULT', weight: 1.0 });
    }

    this.strategyResults = [];

    // 并行运行各策略回测
    const backtestPromises = this.strategies.map(async (strategy) => {
      const strategyCapital = this.config.initialCapital * strategy.weight;
      const template = this.loadStrategyTemplate(strategy.templateId);
      const finalParams = this.applyCustomParams(template.params, strategy.customParams);

      console.log(`[多策略引擎] 运行策略: ${template.name}, 分配资金: ${strategyCapital.toFixed(2)}, 权重: ${(strategy.weight * 100).toFixed(1)}%`);

      try {
        const result = await this._runSingleStrategy({
          templateId: strategy.templateId,
          name: template.name,
          params: finalParams,
          capital: strategyCapital,
          weight: strategy.weight,
          startDate,
          endDate
        });

        return {
          success: true,
          templateId: strategy.templateId,
          name: template.name,
          weight: strategy.weight,
          capital: strategyCapital,
          result
        };
      } catch (error) {
        console.error(`[多策略引擎] 策略 ${template.name} 回测失败:`, error.message);
        return {
          success: false,
          templateId: strategy.templateId,
          name: template.name,
          weight: strategy.weight,
          error: error.message
        };
      }
    });

    this.strategyResults = await Promise.all(backtestPromises);

    // 合并结果
    this.mergedResult = this._mergeResults(params);

    const endTime = Date.now();
    console.log(`[多策略引擎] 多策略回测完成，耗时: ${(endTime - startTime) / 1000}秒`);

    return this.mergedResult;
  }

  /**
   * 运行单个策略回测
   */
  async _runSingleStrategy(config) {
    const { templateId, name, params, capital, weight, startDate, endDate } = config;

    // 获取交易日
    const dates = await this._getTradingDates(startDate, endDate);
    if (dates.length === 0) {
      throw new Error(`在 ${startDate} 到 ${endDate} 范围内未找到交易日数据`);
    }

    // 初始化回测状态
    const state = {
      cash: capital,
      positions: new Map(),
      trades: [],
      equityCurve: [],
      dailyReturns: [],
      stockNames: new Map(),
      priceCache: new Map()
    };

    console.log(`[策略回测] ${name}: 找到 ${dates.length} 个交易日`);

    // 每日循环
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];

      // 获取当日股票快照
      const snapshot = await this._getSnapshotByDate(date);

      if (snapshot.length === 0) {
        // 无快照数据，保持当前持仓
        const totalAssets = await this._calculateTotalAssets(state, date);
        state.equityCurve.push(totalAssets);
        continue;
      }

      // 选股
      const selectedStocks = this._selectStocks(snapshot, params);

      // 执行调仓
      if (selectedStocks.length > 0) {
        await this._executeDailyRebalance(state, selectedStocks, date);
      }

      // 记录权益
      const totalAssets = await this._calculateTotalAssets(state, date);
      state.equityCurve.push(totalAssets);

      // 计算日收益率
      if (i > 0 && state.equityCurve[i - 1] > 0) {
        const dailyReturn = (totalAssets - state.equityCurve[i - 1]) / state.equityCurve[i - 1];
        state.dailyReturns.push(dailyReturn);
      }

      // 进度日志
      if (i % 50 === 0 || i === dates.length - 1) {
        const progress = ((i + 1) / dates.length * 100).toFixed(1);
        console.log(`[策略回测] ${name}: 进度 ${progress}%`);
      }
    }

    // 生成结果
    return this._generateSingleResult(state, capital, dates, params);
  }

  /**
   * 生成单个策略结果
   */
  _generateSingleResult(state, initialCapital, dates, params) {
    const finalCapital = state.equityCurve[state.equityCurve.length - 1] || initialCapital;
    const tradingDays = dates.length;

    // 卖出交易用于计算胜率
    const sellTrades = state.trades
      .filter(t => t.action === 'SELL')
      .map(t => ({ ...t, return: t.profitRate || 0 }));

    // 计算绩效
    const performanceReport = performance.calculatePerformanceReport({
      equityCurve: state.equityCurve,
      dailyReturns: state.dailyReturns,
      trades: sellTrades,
      initialCapital,
      finalCapital,
      tradingDays
    });

    return {
      summary: {
        initialCapital,
        finalCapital,
        totalReturn: performanceReport.totalReturn,
        annualizedReturn: performanceReport.annualizedReturn,
        maxDrawdown: performanceReport.maxDrawdown,
        sharpeRatio: performanceReport.sharpeRatio,
        winRate: performanceReport.winRate,
        totalTrades: performanceReport.tradeCount
      },
      details: {
        equityCurve: state.equityCurve,
        dailyReturns: state.dailyReturns,
        trades: state.trades,
        tradingDays
      },
      performance: performanceReport
    };
  }

  /**
   * 合并多个策略结果
   */
  _mergeResults(params) {
    const successfulResults = this.strategyResults.filter(r => r.success);

    if (successfulResults.length === 0) {
      return {
        success: false,
        error: '所有策略回测均失败',
        strategyResults: this.strategyResults
      };
    }

    // 计算合并后的权益曲线
    const maxLength = Math.max(...successfulResults.map(r => r.result.details.equityCurve.length));
    const mergedEquityCurve = [];

    for (let i = 0; i < maxLength; i++) {
      let totalEquity = 0;
      for (const sr of successfulResults) {
        const equity = sr.result.details.equityCurve[i];
        if (equity !== undefined) {
          totalEquity += equity;
        }
      }
      mergedEquityCurve.push(totalEquity);
    }

    // 计算合并后的日收益率
    const mergedDailyReturns = [];
    for (let i = 1; i < mergedEquityCurve.length; i++) {
      if (mergedEquityCurve[i - 1] > 0) {
        mergedDailyReturns.push((mergedEquityCurve[i] - mergedEquityCurve[i - 1]) / mergedEquityCurve[i - 1]);
      }
    }

    // 合并所有交易
    const allTrades = [];
    for (const sr of successfulResults) {
      for (const trade of sr.result.details.trades) {
        allTrades.push({
          ...trade,
          strategyName: sr.name,
          strategyWeight: sr.weight
        });
      }
    }

    // 按日期排序
    allTrades.sort((a, b) => a.date.localeCompare(b.date));

    // 计算合并绩效
    const initialCapital = this.config.initialCapital;
    const finalCapital = mergedEquityCurve[mergedEquityCurve.length - 1] || initialCapital;
    const tradingDays = maxLength;

    const sellTrades = allTrades
      .filter(t => t.action === 'SELL')
      .map(t => ({ ...t, return: t.profitRate || 0 }));

    const mergedPerformance = performance.calculatePerformanceReport({
      equityCurve: mergedEquityCurve,
      dailyReturns: mergedDailyReturns,
      trades: sellTrades,
      initialCapital,
      finalCapital,
      tradingDays
    });

    // 计算策略贡献度
    const strategyContributions = successfulResults.map(sr => ({
      templateId: sr.templateId,
      name: sr.name,
      weight: sr.weight,
      allocatedCapital: sr.capital,
      finalValue: sr.result.summary.finalCapital,
      return: sr.result.summary.totalReturn,
      contribution: (sr.result.summary.finalCapital - sr.capital) / initialCapital
    }));

    return {
      success: true,
      params,
      summary: {
        initialCapital,
        finalCapital,
        totalReturn: mergedPerformance.totalReturn,
        annualizedReturn: mergedPerformance.annualizedReturn,
        maxDrawdown: mergedPerformance.maxDrawdown,
        sharpeRatio: mergedPerformance.sharpeRatio,
        calmarRatio: mergedPerformance.calmarRatio,
        winRate: mergedPerformance.winRate,
        profitLossRatio: mergedPerformance.profitLossRatio,
        totalTrades: mergedPerformance.tradeCount,
        tradingDays
      },
      strategyContributions,
      strategyDetails: successfulResults.map(sr => ({
        templateId: sr.templateId,
        name: sr.name,
        weight: sr.weight,
        summary: sr.result.summary
      })),
      details: {
        equityCurve: mergedEquityCurve,
        dailyReturns: mergedDailyReturns,
        trades: allTrades,
        strategyResults: this.strategyResults
      },
      performance: mergedPerformance
    };
  }

  // ==================== 以下为内部辅助方法 ====================

  async _getTradingDates(startDate, endDate) {
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

  async _getSnapshotByDate(date) {
    const dateDb = date.replace(/-/g, '');

    const query = `
      SELECT
        ts_code, industry, policy_score, commercialization_score,
        sentiment_score, capital_score, roe, revenue_growth, netprofit_growth,
        pe_ttm, pb, rsi, macd_signal, main_flow_in, industry_total_score, seven_factor_score
      FROM stock_factor_snapshot
      WHERE trade_date = ?
      ORDER BY seven_factor_score DESC
    `;

    return await this.db.allPromise(query, [dateDb]) || [];
  }

  _selectStocks(stocks, params) {
    const {
      industryWeights = {},
      selection = {}
    } = params;

    const {
      industryTopN = 5,
      stockTopNPerIndustry = 3,
      minSevenFactorScore = 0.75,
      peMax = 60
    } = selection;

    // 计算综合得分
    const scoredStocks = stocks.map(stock => {
      const industryWeight = industryWeights[stock.industry] || 1.0;
      const industryScore = stock.industry_total_score || 0;
      const factorScore = stock.seven_factor_score || 0;
      return {
        ...stock,
        compositeScore: industryWeight * industryScore + factorScore
      };
    });

    // 筛选
    const filteredStocks = scoredStocks.filter(stock => {
      if ((stock.seven_factor_score || 0) < minSevenFactorScore) return false;
      if (stock.pe_ttm && stock.pe_ttm > peMax) return false;
      return true;
    });

    // 按行业分组，取每行业 top N
    const byIndustry = {};
    for (const stock of filteredStocks) {
      const ind = stock.industry || 'unknown';
      if (!byIndustry[ind]) byIndustry[ind] = [];
      byIndustry[ind].push(stock);
    }

    // 行业内排序取前 N
    const selected = [];
    for (const stocks of Object.values(byIndustry)) {
      stocks.sort((a, b) => b.compositeScore - a.compositeScore);
      selected.push(...stocks.slice(0, stockTopNPerIndustry));
    }

    // 全局排序取前 industryTopN * stockTopNPerIndustry
    selected.sort((a, b) => b.compositeScore - a.compositeScore);
    return selected.slice(0, industryTopN * stockTopNPerIndustry);
  }

  async _executeDailyRebalance(state, selectedStocks, date) {
    const targetStocks = new Set(selectedStocks.map(s => s.ts_code));
    const currentStocks = Array.from(state.positions.keys());

    // 卖出不在目标中的股票
    for (const tsCode of currentStocks) {
      if (!targetStocks.has(tsCode)) {
        const position = state.positions.get(tsCode);
        if (position) {
          const priceInfo = await this._getStockPrice(tsCode, date);
          if (priceInfo && priceInfo.price > 0) {
            await this._executeSell(state, position, priceInfo, 1.0, date);
          }
        }
      }
    }

    // 买入新股票
    const stocksToBuy = selectedStocks.filter(s => !state.positions.has(s.ts_code));
    if (stocksToBuy.length === 0) return;

    const availableCash = state.cash;
    const buyAmountPerStock = Math.floor(availableCash / stocksToBuy.length);

    for (const stock of stocksToBuy) {
      const priceInfo = await this._getStockPrice(stock.ts_code, date);
      if (priceInfo && priceInfo.price > 0) {
        await this._executeBuy(state, stock, priceInfo, buyAmountPerStock, date);
      }
    }
  }

  async _getStockPrice(tsCode, date) {
    const cacheKey = `${tsCode}_${date}`;
    if (this._priceCache && this._priceCache.has(cacheKey)) {
      return this._priceCache.get(cacheKey);
    }

    const dateDb = date.includes('-') ? date : `${date.substr(0, 4)}-${date.substr(4, 2)}-${date.substr(6, 2)}`;
    const dbCode = this._convertToDbCode(tsCode);

    const query = `SELECT close, stock_name FROM stock_daily WHERE ts_code = ? AND trade_date = ? LIMIT 1`;
    const row = await this.db.getPromise(query, [dbCode, dateDb]);

    if (!this._priceCache) this._priceCache = new Map();

    if (row) {
      const result = { price: parseFloat(row.close) || 0, stockName: row.stock_name || tsCode };
      this._priceCache.set(cacheKey, result);
      return result;
    }

    this._priceCache.set(cacheKey, null);
    return null;
  }

  _convertToDbCode(tsCode) {
    if (!tsCode) return tsCode;
    if (tsCode.includes('.')) {
      const [code, market] = tsCode.split('.');
      return `${market.toLowerCase()}.${code}`;
    }
    return tsCode;
  }

  async _executeBuy(state, stock, priceInfo, amount, date) {
    const { price, stockName } = priceInfo;
    if (price <= 0 || amount <= 0 || state.cash < amount) return { success: false };

    const actualPrice = price * (1 + this.config.slippageRate);
    const shares = Math.floor(amount / actualPrice / 100) * 100;
    if (shares < 100) return { success: false };

    const tradeAmount = shares * actualPrice;
    const commission = Math.max(tradeAmount * this.config.commissionRate, this.config.minCommission);
    const totalCost = tradeAmount + commission;

    if (state.cash < totalCost) return { success: false };

    state.cash -= totalCost;

    const existing = state.positions.get(stock.ts_code);
    if (existing) {
      existing.shares += shares;
      existing.costBasis += tradeAmount;
      existing.avgPrice = existing.costBasis / existing.shares;
    } else {
      state.positions.set(stock.ts_code, {
        ts_code: stock.ts_code,
        shares,
        avgPrice: actualPrice,
        costBasis: tradeAmount,
        entryDate: date,
        stockName
      });
    }

    state.trades.push({
      ts_code: stock.ts_code,
      stockName,
      action: 'BUY',
      date,
      shares,
      price: actualPrice,
      amount: tradeAmount,
      commission
    });

    return { success: true };
  }

  async _executeSell(state, position, priceInfo, sellRatio, date) {
    const { price, stockName } = priceInfo;
    if (price <= 0 || !state.positions.has(position.ts_code)) return { success: false };

    const pos = state.positions.get(position.ts_code);
    const sharesToSell = Math.floor(pos.shares * sellRatio / 100) * 100;
    if (sharesToSell <= 0) return { success: false };

    const actualPrice = price * (1 - this.config.slippageRate);
    const tradeAmount = sharesToSell * actualPrice;
    const commission = Math.max(tradeAmount * this.config.commissionRate, this.config.minCommission);
    const stampDuty = tradeAmount * this.config.stampDutyRate;
    const totalCost = commission + stampDuty;
    const netProceeds = tradeAmount - totalCost;

    const costPortion = pos.costBasis * (sharesToSell / pos.shares);
    const profit = tradeAmount - costPortion - totalCost;
    const profitRate = costPortion > 0 ? profit / costPortion : 0;

    pos.shares -= sharesToSell;
    pos.costBasis -= costPortion;

    if (pos.shares <= 0) {
      state.positions.delete(position.ts_code);
    }

    state.cash += netProceeds;

    state.trades.push({
      ts_code: position.ts_code,
      stockName: stockName || pos.stockName,
      action: 'SELL',
      date,
      shares: sharesToSell,
      price: actualPrice,
      amount: tradeAmount,
      commission,
      stampDuty,
      profit,
      profitRate
    });

    return { success: true };
  }

  async _calculateTotalAssets(state, date) {
    let positionValue = 0;

    for (const [tsCode, position] of state.positions) {
      const priceInfo = await this._getStockPrice(tsCode, date);
      if (priceInfo && priceInfo.price > 0) {
        positionValue += position.shares * priceInfo.price;
      } else {
        positionValue += position.shares * position.avgPrice;
      }
    }

    return state.cash + positionValue;
  }
}

module.exports = MultiStrategyBacktestEngine;