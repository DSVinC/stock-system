/**
 * 回测模块
 * 支持历史数据回放、策略验证、收益统计
 * 安全修复版：接入真实历史数据
 * 策略扩展版：支持双均线、RSI、MACD、布林带策略
 */

const { getDatabase } = require('./db');
const { checkCondition } = require('./conditional-order');
const { normalizeToApi, normalizeToDb, normalizeArrayToDb } = require('../utils/format');
const { adjustBacktestDateRange } = require('./utils/trading-day');

/**
 * 计算简单移动平均线
 */
function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

/**
 * 计算 EMA
 */
function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

/**
 * 计算 RSI
 */
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50; // 默认返回中性值

  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * 计算 MACD
 */
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (prices.length < slowPeriod + signalPeriod) return null;

  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);
  const macdLine = emaFast - emaSlow;

  // 计算信号线（MACD 的 EMA）
  const macdHistory = [];
  for (let i = slowPeriod - 1; i < prices.length; i++) {
    const slicePrices = prices.slice(0, i + 1);
    const fast = calculateEMA(slicePrices, fastPeriod);
    const slow = calculateEMA(slicePrices, slowPeriod);
    macdHistory.push(fast - slow);
  }

  const signalLine = calculateEMA(macdHistory, signalPeriod);

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine
  };
}

/**
 * 计算布林带
 */
function calculateBollinger(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return null;

  const slice = prices.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const std = Math.sqrt(variance);

  return {
    middle: sma,
    upper: sma + stdDev * std,
    lower: sma - stdDev * std
  };
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRatio(value, fallback) {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }

  if (numeric > 1) {
    return fallback;
  }

  return numeric;
}

function normalizeScoreValue(value) {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric >= 0 && numeric <= 1) {
    return numeric;
  }

  if (numeric > 1 && numeric <= 10) {
    return numeric / 10;
  }

  if (numeric > 10 && numeric <= 100) {
    return numeric / 100;
  }

  return null;
}

function normalizeWeightMap(source, defaults) {
  const base = source && typeof source === 'object' ? source : {};
  const keys = Object.keys(defaults);
  const weighted = {};
  let sum = 0;

  for (const key of keys) {
    const value = toNumber(base[key]);
    const candidate = Number.isFinite(value) && value > 0 ? value : defaults[key];
    weighted[key] = candidate;
    sum += candidate;
  }

  if (!Number.isFinite(sum) || sum <= 0) {
    return { ...defaults };
  }

  const normalized = {};
  for (const key of keys) {
    normalized[key] = weighted[key] / sum;
  }
  return normalized;
}

function weightedNormalizedScore(scoreMap, weights) {
  let score = 0;
  let effectiveWeight = 0;

  for (const [key, weight] of Object.entries(weights || {})) {
    const normalized = normalizeScoreValue(scoreMap[key]);
    if (!Number.isFinite(normalized)) {
      continue;
    }
    score += normalized * weight;
    effectiveWeight += weight;
  }

  if (!Number.isFinite(effectiveWeight) || effectiveWeight <= 0) {
    return null;
  }

  return score / effectiveWeight;
}

async function loadConditionalOrdersForBacktest(db, strategy, accountId) {
  const params = strategy?.params || {};
  const orderId = params.orderId || params.order_id;
  let rows = [];

  if (orderId) {
    const row = await db.getPromise('SELECT * FROM conditional_order WHERE id = ?', [orderId]);
    if (row) {
      rows = [row];
    }
  } else if (accountId) {
    rows = await db.allPromise(`
      SELECT *
      FROM conditional_order
      WHERE account_id = ? AND status IN ('enabled', 'pending', 'triggered', 'expired')
      ORDER BY created_at ASC
    `, [accountId]);
  }

  return rows.map((row) => ({
    ...row,
    conditions: typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions
  }));
}

/**
 * 回测引擎类
 */
class BacktestEngine {
  constructor(config) {
    this.config = {
      startDate: config.startDate,
      endDate: config.endDate,
      initialCash: config.initialCash || 1000000,
      strategy: config.strategy, // 策略配置
      stocks: config.stocks || [], // 回测股票池
      ...config
    };

    // 回测状态
    this.state = {
      cash: this.config.initialCash,
      positions: {}, // {ts_code: {quantity, avgPrice, costAmount}}
      trades: [],
      dailyValues: [], // 每日资产变化
      currentDate: null,
      currentPrice: {}
    };

    // 历史价格缓存（用于技术指标计算）
    this.priceHistory = {}; // {ts_code: [prices]}
    this.factorHistory = {}; // {ts_code: [seven_factor_score]}
    this.conditionalOrders = Array.isArray(config.conditionalOrders) ? config.conditionalOrders : [];

    // 统计指标
    this.metrics = {
      totalReturn: 0,
      returnRate: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0
    };
  }
  
  /**
   * 运行回测
   */
  async run() {
    console.log('[回测] 开始运行...');
    console.log(`[回测] 时间范围: ${this.config.startDate} ~ ${this.config.endDate}`);
    console.log(`[回测] 初始资金: ¥${this.config.initialCash.toLocaleString()}`);
    
    // 获取历史数据
    const historicalData = await this.loadHistoricalData();
    
    // 按日期遍历
    const dates = Object.keys(historicalData).sort();
    
    for (const date of dates) {
      this.state.currentDate = date;
      const dayData = historicalData[date];
      
      // 更新当前价格
      for (const stock of dayData) {
        this.state.currentPrice[stock.ts_code] = stock;
      }
      
      // 执行策略
      await this.executeStrategy(dayData);
      
      // 记录每日资产
      this.recordDailyValue();
    }
    
    // 计算最终统计
    this.calculateMetrics();
    
    console.log('[回测] 运行完成');
    const report = this.generateReport();
    
    // 保存回测报告到数据库
    await saveBacktestReport(report);
    
    return report;
  }
  
  /**
   * 加载历史数据（从数据库获取真实数据）
   */
  async loadHistoricalData() {
    const dataByDate = {};
    const db = await getDatabase();

    // 从数据库获取历史行情数据
    for (const tsCode of this.config.stocks) {
      // 转换股票代码为数据库格式 (如 300308.SZ -> sz.300308)
      const dbCode = normalizeToDb(tsCode);

      const rows = await db.allPromise(`
        SELECT
          d.trade_date,
          d.ts_code,
          d.stock_name,
          d.close as price,
          d.pe,
          d.pb,
          d.market_cap,
          d.amount as turnover,
          s.social_score,
          s.policy_score_raw,
          s.public_score,
          s.business_score,
          s.trend_score,
          s.momentum_score,
          s.valuation_score,
          s.earnings_score,
          s.capital_score_raw,
          s.volatility_score,
          s.sentiment_score_raw,
          s.pe_ttm,
          s.netprofit_growth,
          s.seven_factor_score,
          s.industry_total_score
        FROM stock_daily d
        LEFT JOIN stock_factor_snapshot s
          ON s.ts_code = (
            CASE
              WHEN instr(d.ts_code, '.') = 3
                THEN substr(d.ts_code, 4) || '.' || upper(substr(d.ts_code, 1, 2))
              ELSE d.ts_code
            END
          )
         AND s.trade_date = replace(d.trade_date, '-', '')
        WHERE d.ts_code = ? AND d.trade_date BETWEEN ? AND ?
        ORDER BY d.trade_date ASC
      `, [dbCode, this.config.startDate, this.config.endDate]);
      
      if (rows.length === 0) {
        console.warn(`[回测] 警告: ${tsCode} 在指定日期范围内无历史数据，使用模拟数据`);
        // 降级到模拟数据
        this.generateMockDataForStock(tsCode, dataByDate);
        continue;
      }
      
      for (const row of rows) {
        const date = row.trade_date;
        if (!dataByDate[date]) {
          dataByDate[date] = [];
        }
        
        dataByDate[date].push({
          ts_code: normalizeToApi(row.ts_code),
          stock_name: row.stock_name || this.getStockName(tsCode),
          price: parseFloat(row.price) || 0,
          pe: parseFloat(row.pe) || 0,
          pb: parseFloat(row.pb) || 0,
          market_cap: parseFloat(row.market_cap) || 0,
          turnover: parseFloat(row.turnover) || 0,
          social_score: toNumber(row.social_score),
          policy_score_raw: toNumber(row.policy_score_raw),
          public_score: toNumber(row.public_score),
          business_score: toNumber(row.business_score),
          trend_score: toNumber(row.trend_score),
          momentum_score: toNumber(row.momentum_score),
          valuation_score: toNumber(row.valuation_score),
          earnings_score: toNumber(row.earnings_score),
          capital_score_raw: toNumber(row.capital_score_raw),
          volatility_score: toNumber(row.volatility_score),
          sentiment_score_raw: toNumber(row.sentiment_score_raw),
          pe_ttm: toNumber(row.pe_ttm),
          netprofit_growth: toNumber(row.netprofit_growth),
          seven_factor_score: toNumber(row.seven_factor_score),
          industry_total_score: toNumber(row.industry_total_score)
        });
      }
    }
    
    return dataByDate;
  }
  
  /**
   * 生成模拟数据（降级方案）
   */
  generateMockDataForStock(tsCode, dataByDate) {
    const start = new Date(this.config.startDate);
    const end = new Date(this.config.endDate);
    const seed = tsCode.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    let basePrice = 50 + (seed % 200);
    let basePE = 15 + (seed % 30);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      
      const date = d.toISOString().split('T')[0];
      const change = (Math.random() - 0.5) * 0.06;
      basePrice = basePrice * (1 + change);
      basePE = basePE * (1 + change * 0.5);
      
      if (!dataByDate[date]) {
        dataByDate[date] = [];
      }
      
      dataByDate[date].push({
        ts_code: tsCode,
        stock_name: this.getStockName(tsCode),
        price: Math.round(basePrice * 100) / 100,
        pe: Math.round(basePE * 100) / 100,
        pb: Math.round((basePE / 3) * 100) / 100,
        market_cap: basePrice * 100000000,
        turnover: Math.random() * 100000000,
        _mock: true // 标记为模拟数据
      });
    }
  }
  
  /**
   * 获取股票名称
   */
  getStockName(tsCode) {
    const names = {
      '300308.SZ': '中际旭创',
      '000001.SZ': '平安银行',
      '000002.SZ': '万科A',
      '000858.SZ': '五粮液',
      '002415.SZ': '海康威视',
      '600519.SH': '贵州茅台'
    };
    return names[tsCode] || tsCode;
  }
  
  /**
   * 执行策略
   */
  async executeStrategy(dayData) {
    const strategy = this.config.strategy;
    const strategyType = strategy.type || 'basic';

    // 检查最大持仓数限制
    const maxPositions = strategy.maxPositions || 10;
    for (const stock of dayData) {
      // 更新价格历史
      if (!this.priceHistory[stock.ts_code]) {
        this.priceHistory[stock.ts_code] = [];
      }
      this.priceHistory[stock.ts_code].push(stock.price);
      if (!this.factorHistory[stock.ts_code]) {
        this.factorHistory[stock.ts_code] = [];
      }
      if (strategyType === 'seven_factor') {
        const decisionScore = this.getSevenFactorDecisionScore(stock, strategy.params).decisionScore;
        this.factorHistory[stock.ts_code].push(Number.isFinite(decisionScore) ? decisionScore : normalizeScoreValue(stock.seven_factor_score));
      } else {
        this.factorHistory[stock.ts_code].push(toNumber(stock.seven_factor_score));
      }

      const prices = this.priceHistory[stock.ts_code];
      let shouldBuy = false;
      let shouldSell = false;
      let orderConfig = null; // 在 switch 外声明，确保所有分支都能访问

      // 根据策略类型判断买卖信号
      switch (strategyType) {
        case 'double_ma':
          const maResult = this.evaluateDoubleMA(prices, strategy.params);
          shouldBuy = maResult.buy;
          shouldSell = maResult.sell;
          break;

        case 'rsi':
          const rsiResult = this.evaluateRSI(prices, strategy.params);
          shouldBuy = rsiResult.buy;
          shouldSell = rsiResult.sell;
          break;

        case 'macd':
          const macdResult = this.evaluateMACD(prices, strategy.params);
          shouldBuy = macdResult.buy;
          shouldSell = macdResult.sell;
          break;

        case 'bollinger':
          const bollResult = this.evaluateBollinger(prices, stock.price, strategy.params);
          shouldBuy = bollResult.buy;
          shouldSell = bollResult.sell;
          break;

        case 'seven_factor':
          const sevenFactorResult = this.evaluateSevenFactor(
            stock,
            prices,
            this.factorHistory[stock.ts_code],
            this.state.positions[stock.ts_code],
            strategy.params
          );
          shouldBuy = sevenFactorResult.buy;
          shouldSell = sevenFactorResult.sell;
          break;

        case 'conditional':
          ({ shouldBuy, shouldSell, orderConfig } = this.evaluateConditionalStrategy(stock, prices, strategy));
          break;

        default:
          // 基础策略：直接使用买卖条件
          if (strategy.buyCondition && !this.state.positions[stock.ts_code]) {
            shouldBuy = this.evaluateCondition(strategy.buyCondition, stock);
          }
          if (strategy.sellCondition && this.state.positions[stock.ts_code]) {
            shouldSell = this.evaluateCondition(strategy.sellCondition, stock);
          }
      }

      // 执行买入
      const currentPositions = Object.keys(this.state.positions).length;
      if (shouldBuy && !this.state.positions[stock.ts_code] && currentPositions < maxPositions) {
        // 使用条件单的 sizing 配置，如果没有则使用默认值
        let investRatio = 0.3;
        if (orderConfig) {
          if (orderConfig.orderType === 'position_percent' && orderConfig.positionPercent) {
            investRatio = orderConfig.positionPercent / 100;
          } else if (orderConfig.orderType === 'amount' && orderConfig.amount) {
            investRatio = orderConfig.amount / this.state.cash;
          }
        } else {
          investRatio = strategy.params?.invest_ratio || strategy.investRatio || 0.3;
        }
        await this.buy(stock.ts_code, stock.stock_name, stock.price, stock, investRatio);
      }

      // 执行卖出
      if (shouldSell && this.state.positions[stock.ts_code]) {
        // 卖出时使用条件单的 sizing 配置
        let sellRatio = 1.0; // 默认全部卖出
        if (orderConfig) {
          if (orderConfig.orderType === 'position_percent' && orderConfig.positionPercent) {
            sellRatio = orderConfig.positionPercent / 100;
          } else if (orderConfig.orderType === 'quantity' && orderConfig.quantity) {
            // 按数量卖出，在 sell 函数中处理
            sellRatio = null; // 标记为按数量卖出
          }
        }
        await this.sell(stock.ts_code, stock.stock_name, stock.price, sellRatio);
      }
    }
  }

  /**
   * 双均线策略评估
   */
  evaluateDoubleMA(prices, params) {
    const fastPeriod = params?.fast_period || 10;
    const slowPeriod = params?.slow_period || 60;

    if (prices.length < slowPeriod + 1) {
      return { buy: false, sell: false };
    }

    const fastMA = calculateSMA(prices, fastPeriod);
    const slowMA = calculateSMA(prices, slowPeriod);
    const prevFastMA = calculateSMA(prices.slice(0, -1), fastPeriod);
    const prevSlowMA = calculateSMA(prices.slice(0, -1), slowPeriod);

    // 金叉：快线上穿慢线
    const buy = prevFastMA <= prevSlowMA && fastMA > slowMA;
    // 死叉：快线下穿慢线
    const sell = prevFastMA >= prevSlowMA && fastMA < slowMA;

    return { buy, sell };
  }

  /**
   * RSI 策略评估
   */
  evaluateRSI(prices, params) {
    const period = params?.period || 14;
    const oversold = params?.oversold || 30;
    const overbought = params?.overbought || 70;

    if (prices.length < period + 1) {
      return { buy: false, sell: false };
    }

    const rsi = calculateRSI(prices, period);
    const prevRSI = calculateRSI(prices.slice(0, -1), period);

    // 超卖区域反弹
    const buy = prevRSI < oversold && rsi > oversold;
    // 超买区域回落
    const sell = prevRSI > overbought && rsi < overbought;

    return { buy, sell };
  }

  /**
   * MACD 策略评估
   */
  evaluateMACD(prices, params) {
    const fastPeriod = params?.fast_period || 12;
    const slowPeriod = params?.slow_period || 26;
    const signalPeriod = params?.signal_period || 9;

    if (prices.length < slowPeriod + signalPeriod + 1) {
      return { buy: false, sell: false };
    }

    const macd = calculateMACD(prices, fastPeriod, slowPeriod, signalPeriod);
    const prevMacd = calculateMACD(prices.slice(0, -1), fastPeriod, slowPeriod, signalPeriod);

    if (!macd || !prevMacd) {
      return { buy: false, sell: false };
    }

    // 金叉：MACD 上穿信号线
    const buy = prevMacd.histogram < 0 && macd.histogram > 0;
    // 死叉：MACD 下穿信号线
    const sell = prevMacd.histogram > 0 && macd.histogram < 0;

    return { buy, sell };
  }

  /**
   * 布林带策略评估
   */
  evaluateBollinger(prices, currentPrice, params) {
    const period = params?.period || 20;
    const stdDev = params?.std_dev || 2;

    if (prices.length < period) {
      return { buy: false, sell: false };
    }

    const boll = calculateBollinger(prices, period, stdDev);
    if (!boll) {
      return { buy: false, sell: false };
    }

    // 跌破下轨买入
    const buy = currentPrice <= boll.lower;
    // 突破上轨卖出
    const sell = currentPrice >= boll.upper;

    return { buy, sell };
  }

  evaluateSevenFactor(stock, prices, scoreHistory, position, params) {
    const { factorScore, decisionScore } = this.getSevenFactorDecisionScore(stock, params);
    if (!Number.isFinite(decisionScore)) {
      return { buy: false, sell: false };
    }
    const filters = params?.filters && typeof params.filters === 'object' ? params.filters : {};

    const buyThreshold = toNumber(
      params?.min_seven_factor_score ??
      params?.min_score ??
      filters?.minScore ??
      params?.buy_score_threshold ??
      params?.buyScoreThreshold
    ) ?? 0.75;
    const peMax = toNumber(
      params?.pe_max ??
      params?.peMax ??
      filters?.peMax
    );
    const pegMax = toNumber(
      params?.peg_max ??
      params?.pegMax ??
      filters?.pegMax
    );
    const maxPrice = toNumber(
      params?.max_price ??
      params?.maxPrice ??
      filters?.maxPrice
    );
    const scoreStopLossThreshold = toNumber(
      params?.score_stop_loss ??
      params?.scoreStopLoss ??
      params?.min_hold_score ??
      params?.minHoldScore
    ) ?? 0.65;
    const stopLossRatio = normalizeRatio(
      params?.stop_loss ??
      params?.stopLoss ??
      params?.risk?.stop_loss ??
      params?.riskControl?.stop_loss,
      0.08
    );
    const takeProfitRatio = normalizeRatio(
      params?.take_profit ??
      params?.takeProfit ??
      params?.risk?.take_profit ??
      params?.riskControl?.take_profit,
      0.15
    );

    const previousScore = Array.isArray(scoreHistory) && scoreHistory.length > 1
      ? toNumber(scoreHistory[scoreHistory.length - 2])
      : null;
    const trendConfirmPeriod = Math.max(1, Math.floor(toNumber(
      params?.trend_confirm_period ??
      params?.trendConfirmPeriod
    ) ?? 3));
    const breakoutMargin = Math.max(0, toNumber(
      params?.breakout_margin ??
      params?.breakoutMargin
    ) ?? 0);
    const shortMA = trendConfirmPeriod > 1 && prices.length >= trendConfirmPeriod
      ? calculateSMA(prices, trendConfirmPeriod)
      : null;
    const hasTrendConfirmation = !shortMA || stock.price >= shortMA;
    const isScoreBreakout = previousScore === null || previousScore < (buyThreshold - breakoutMargin);
    const effectivePe = toNumber(stock.pe_ttm) ?? toNumber(stock.pe);
    const growth = toNumber(stock.netprofit_growth);
    const peg = Number.isFinite(effectivePe) && Number.isFinite(growth) && growth > 0
      ? effectivePe / growth
      : null;
    const passesFilters = (
      (!Number.isFinite(maxPrice) || stock.price <= maxPrice) &&
      (!Number.isFinite(peMax) || (Number.isFinite(effectivePe) && effectivePe > 0 && effectivePe <= peMax)) &&
      (!Number.isFinite(pegMax) || (Number.isFinite(peg) && peg > 0 && peg <= pegMax))
    );

    const buy = !position
      && decisionScore >= buyThreshold
      && passesFilters
      && hasTrendConfirmation
      && isScoreBreakout;

    if (!position) {
      return { buy, sell: false };
    }

    const stopLossPrice = position.avgPrice * (1 - stopLossRatio);
    const takeProfitPrice = position.avgPrice * (1 + takeProfitRatio);
    const sell = factorScore <= scoreStopLossThreshold
      || stock.price <= stopLossPrice
      || stock.price >= takeProfitPrice;

    return { buy: false, sell };
  }

  getSevenFactorDecisionScore(stock, params) {
    const factorWeights = normalizeWeightMap(params?.factorWeights, {
      trend: 0.17,
      momentum: 0.15,
      valuation: 0.15,
      earnings: 0.13,
      capital: 0.13,
      volatility: 0.12,
      sentiment: 0.15
    });
    const dimensionWeights = normalizeWeightMap(params?.dimensionWeights, {
      social: 0.25,
      policy: 0.30,
      public: 0.20,
      business: 0.25
    });

    const factorScore = weightedNormalizedScore({
      trend: stock.trend_score,
      momentum: stock.momentum_score,
      valuation: stock.valuation_score,
      earnings: stock.earnings_score,
      capital: stock.capital_score_raw,
      volatility: stock.volatility_score,
      sentiment: stock.sentiment_score_raw
    }, factorWeights) ?? normalizeScoreValue(stock.seven_factor_score);

    const dimensionScore = weightedNormalizedScore({
      social: stock.social_score,
      policy: stock.policy_score_raw,
      public: stock.public_score,
      business: stock.business_score
    }, dimensionWeights) ?? normalizeScoreValue(stock.industry_total_score);

    const decisionScore = Number.isFinite(dimensionScore)
      ? (() => {
          const factorRatio = toNumber(
            params?.decision_factor_weight ??
            params?.decisionFactorWeight
          );
          const dimensionRatio = toNumber(
            params?.decision_dimension_weight ??
            params?.decisionDimensionWeight
          );
          const safeFactor = Number.isFinite(factorRatio) ? Math.max(0, factorRatio) : 0.7;
          const safeDimension = Number.isFinite(dimensionRatio) ? Math.max(0, dimensionRatio) : (1 - safeFactor);
          const weightSum = safeFactor + safeDimension;
          const factorWeight = weightSum > 0 ? safeFactor / weightSum : 0.7;
          const dimensionWeight = weightSum > 0 ? safeDimension / weightSum : 0.3;
          return (factorScore * factorWeight) + (dimensionScore * dimensionWeight);
        })()
      : factorScore;

    return {
      factorScore,
      dimensionScore,
      decisionScore
    };
  }
  
  /**
   * 评估条件
   */
  evaluateCondition(condition, stock) {
    const { type, operator, value } = condition;
    let actualValue;
    
    switch (type) {
      case 'price':
        actualValue = stock.price;
        break;
      case 'pe':
        actualValue = stock.pe;
        break;
      case 'pb':
        actualValue = stock.pb;
        break;
      case 'market_cap':
        actualValue = stock.market_cap;
        break;
      default:
        return false;
    }
    
    switch (operator) {
      case '<=': return actualValue <= value;
      case '>=': return actualValue >= value;
      case '<': return actualValue < value;
      case '>': return actualValue > value;
      case '=': return actualValue === value;
      default: return false;
    }
  }

  buildMarketData(stock, prices) {
    const previousPrice = prices.length > 1 ? prices[prices.length - 2] : null;
    return {
      price: stock.price,
      prevClose: previousPrice,
      pctChange: previousPrice && previousPrice > 0
        ? ((stock.price - previousPrice) / previousPrice) * 100
        : 0,
      volumeRatio: toNumber(stock.volume_ratio) || toNumber(stock.volumeRatio) || 0,
      pe: toNumber(stock.pe) || 0,
      pb: toNumber(stock.pb) || 0,
      market_cap: toNumber(stock.market_cap) || toNumber(stock.marketCap) || 0,
      turnover: toNumber(stock.turnover) || 0,
      mainForceNet: toNumber(stock.main_force_net) || toNumber(stock.mainForceNet) || 0
    };
  }

  buildTechnicalData(prices, relatedOrders) {
    const maPeriods = new Set();
    for (const order of relatedOrders) {
      const conditions = Array.isArray(order.conditions) ? order.conditions : [];
      for (const condition of conditions) {
        if (condition?.trigger_type === 'ma_golden_cross' || condition?.trigger_type === 'ma_death_cross') {
          const shortPeriod = Number(condition?.params?.ma_short);
          const longPeriod = Number(condition?.params?.ma_long);
          if (shortPeriod > 0) maPeriods.add(shortPeriod);
          if (longPeriod > 0) maPeriods.add(longPeriod);
        }
      }
    }

    const ma = {};
    const prevMa = {};
    for (const period of maPeriods) {
      ma[period] = calculateSMA(prices, period);
      prevMa[period] = calculateSMA(prices.slice(0, -1), period);
    }

    const macd = calculateMACD(prices);
    return {
      rsi: calculateRSI(prices),
      ma,
      prevMa,
      macdSignalValue: macd?.histogram,
      macdSignal: macd?.histogram
    };
  }

  evaluateConditionalStrategy(stock, prices, strategy) {
    const strategyOrders = Array.isArray(strategy?.params?.orders) && strategy.params.orders.length > 0
      ? strategy.params.orders
      : this.conditionalOrders;
    const relatedOrders = strategyOrders.filter((order) => order.ts_code === stock.ts_code);

    if (relatedOrders.length === 0) {
      return { shouldBuy: false, shouldSell: false };
    }

    const marketData = this.buildMarketData(stock, prices);
    const technicalData = this.buildTechnicalData(prices, relatedOrders);

    let shouldBuy = false;
    let shouldSell = false;
    let orderConfig = null; // 保存第一个触发的订单配置（用于 sizing）
    
    for (const order of relatedOrders) {
      // 【生命周期检查】检查订单是否已过期或达到最大触发次数
      const today = new Date().toISOString().slice(0, 10);
      if (order.end_date && order.end_date < today) {
        continue; // 已过期
      }
      if (order.start_date && order.start_date > today) {
        continue; // 尚未生效
      }
      if (order.max_trigger_count && order.trigger_count >= order.max_trigger_count) {
        continue; // 已达到最大触发次数
      }
      
      const matched = checkCondition(order, marketData, technicalData);
      if (!matched) {
        continue;
      }

      if (order.action === 'buy' && !this.state.positions[stock.ts_code]) {
        shouldBuy = true;
        if (!orderConfig) {
          orderConfig = {
            orderType: order.order_type,
            quantity: order.quantity,
            amount: order.amount,
            positionPercent: order.position_percent
          };
        }
      }
      if (order.action === 'sell' && this.state.positions[stock.ts_code]) {
        shouldSell = true;
        if (!orderConfig) {
          orderConfig = {
            orderType: order.order_type,
            quantity: order.quantity,
            amount: order.amount,
            positionPercent: order.position_percent
          };
        }
      }
    }

    return { shouldBuy, shouldSell, orderConfig };
  }
  
  /**
   * 买入股票
   */
  async buy(tsCode, stockName, price, dayData, investRatio = 0.3) {
    // 使用传入的资金比例
    const investAmount = this.state.cash * investRatio;
    const quantity = Math.floor(investAmount / price / 100) * 100;
    
    if (quantity < 100) return;
    
    // 检查资金充足性
    const amount = quantity * price;
    if (amount > this.state.cash) {
      console.log(`[回测] 资金不足，跳过买入 ${stockName}`);
      return;
    }
    
    // A股涨跌停检查（简化版：±10%）
    const prevClose = dayData.prevClose || price;
    const priceLimit = prevClose * 1.1;
    if (price >= priceLimit) {
      console.log(`[回测] ${stockName} 触及涨停，无法买入`);
      return;
    }
    
    // 更新现金
    this.state.cash -= amount;
    
    // 更新持仓
    this.state.positions[tsCode] = {
      quantity,
      avgPrice: price,
      costAmount: amount
    };
    
    // 记录交易
    this.state.trades.push({
      date: this.state.currentDate,
      ts_code: tsCode,
      stock_name: stockName,
      action: 'buy',
      quantity,
      price,
      amount
    });
    
    console.log(`[回测] ${this.state.currentDate} 买入 ${stockName} ${quantity}股 @ ${price}`);
  }
  
  /**
   * 卖出股票
   */
  async sell(tsCode, stockName, price) {
    const position = this.state.positions[tsCode];
    if (!position) return;
    
    const { quantity, avgPrice } = position;
    const amount = quantity * price;
    const profit = amount - position.costAmount;
    
    // 更新现金
    this.state.cash += amount;
    
    // 删除持仓
    delete this.state.positions[tsCode];
    
    // 记录交易
    this.state.trades.push({
      date: this.state.currentDate,
      ts_code: tsCode,
      stock_name: stockName,
      action: 'sell',
      quantity,
      price,
      amount,
      profit,
      profitRate: profit / position.costAmount
    });
    
    console.log(`[回测] ${this.state.currentDate} 卖出 ${stockName} ${quantity}股 @ ${price}, 盈亏: ${profit > 0 ? '+' : ''}${profit.toFixed(2)}`);
  }
  
  /**
   * 记录每日资产
   */
  recordDailyValue() {
    let stockValue = 0;
    for (const [tsCode, position] of Object.entries(this.state.positions)) {
      const currentPrice = this.state.currentPrice[tsCode]?.price || position.avgPrice;
      stockValue += position.quantity * currentPrice;
    }
    
    const totalValue = this.state.cash + stockValue;
    
    this.state.dailyValues.push({
      date: this.state.currentDate,
      cash: this.state.cash,
      stockValue,
      totalValue,
      returnRate: (totalValue - this.config.initialCash) / this.config.initialCash
    });
  }
  
  /**
   * 计算统计指标
   */
  calculateMetrics() {
    const initialCash = this.config.initialCash;
    const finalValue = this.state.dailyValues[this.state.dailyValues.length - 1]?.totalValue || initialCash;
    
    // 总收益
    this.metrics.totalReturn = finalValue - initialCash;
    this.metrics.returnRate = (finalValue - initialCash) / initialCash;
    
    // 年化收益率
    const startDate = new Date(this.config.startDate);
    const endDate = new Date(this.config.endDate);
    const days = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
    this.metrics.annualizedReturn = Math.pow(1 + this.metrics.returnRate, 365 / days) - 1;
    
    // 最大回撤
    let maxValue = initialCash;
    let maxDrawdown = 0;
    for (const day of this.state.dailyValues) {
      if (day.totalValue > maxValue) {
        maxValue = day.totalValue;
      }
      const drawdown = (maxValue - day.totalValue) / maxValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    this.metrics.maxDrawdown = maxDrawdown;
    
    // 交易统计
    const sellTrades = this.state.trades.filter(t => t.action === 'sell');
    this.metrics.tradeCount = sellTrades.length;
    this.metrics.winCount = sellTrades.filter(t => t.profit > 0).length;
    this.metrics.lossCount = sellTrades.filter(t => t.profit <= 0).length;
    this.metrics.winRate = this.metrics.tradeCount > 0 ? this.metrics.winCount / this.metrics.tradeCount : 0;
    
    // 夏普比率（简化版）
    const returns = [];
    for (let i = 1; i < this.state.dailyValues.length; i++) {
      const dailyReturn = (this.state.dailyValues[i].totalValue - this.state.dailyValues[i-1].totalValue) / this.state.dailyValues[i-1].totalValue;
      returns.push(dailyReturn);
    }
    
    if (returns.length > 0) {
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      this.metrics.sharpeRatio = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0;
    }
    
    // TASK_V4_FIX_004: 卡玛比率 = 年化收益 / 最大回撤
    this.metrics.calmarRatio = this.metrics.maxDrawdown > 0 ? this.metrics.annualizedReturn / this.metrics.maxDrawdown : 0;
    
    // TASK_V4_FIX_004: 盈亏比 = 平均盈利 / 平均亏损
    const winTrades = sellTrades.filter(t => t.profit > 0);
    const lossTrades = sellTrades.filter(t => t.profit <= 0);
    const avgWin = winTrades.length > 0 ? winTrades.reduce((sum, t) => sum + t.profit, 0) / winTrades.length : 0;
    const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((sum, t) => sum + t.profit, 0) / lossTrades.length) : 0;
    this.metrics.profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);
  }
  
  /**
   * 生成回测报告
   */
  generateReport() {
    return {
      config: this.config,
      metrics: this.metrics,
      trades: this.state.trades,
      dailyValues: this.state.dailyValues,
      summary: {
        startDate: this.config.startDate,
        endDate: this.config.endDate,
        initialCash: this.config.initialCash,
        finalValue: this.state.dailyValues[this.state.dailyValues.length - 1]?.totalValue || this.config.initialCash,
        // 回测指标（TASK_V4_FIX_004: 7 个核心指标）
        totalReturn: this.metrics.totalReturn,           // 总收益（元）
        returnRate: this.metrics.returnRate,             // 总收益率（%）
        annualizedReturn: this.metrics.annualizedReturn, // 年化收益率（%）
        maxDrawdown: this.metrics.maxDrawdown,           // 最大回撤（%）
        sharpeRatio: this.metrics.sharpeRatio,           // 夏普比率（风险调整后收益）
        calmarRatio: this.metrics.calmarRatio,           // 卡玛比率（年化收益/最大回撤）
        profitLossRatio: this.metrics.profitLossRatio,   // 盈亏比（平均盈利/平均亏损）
        winRate: this.metrics.winRate,                   // 胜率（%）
        tradeCount: this.metrics.tradeCount              // 交易次数
      }
    };
  }
}

/**
 * 运行回测（API入口）
 */
async function runBacktest(req, res) {
  try {
    const { startDate, endDate, initialCash, strategy, stocks, account_id } = req.body;
    const db = await getDatabase();
    
    if (!startDate || !endDate || !strategy) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：startDate, endDate, strategy'
      });
    }

    // 调整日期到最近的交易日
    let dateAdjustment = null;
    try {
      dateAdjustment = adjustBacktestDateRange({ startDate, endDate });
      console.log('[回测] 日期调整：' + startDate + ' -> ' + dateAdjustment.startDate + ', ' + endDate + ' -> ' + dateAdjustment.endDate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // 使用调整后的日期
    const adjustedStartDate = dateAdjustment.startDate;
    const adjustedEndDate = dateAdjustment.endDate;

    let conditionalOrders = [];
    // 规范化股票代码格式（转换为数据库格式）
    let normalizedStocks = normalizeArrayToDb(Array.isArray(stocks) ? stocks : []);

    if (strategy.type === 'conditional') {
      conditionalOrders = await loadConditionalOrdersForBacktest(db, strategy, account_id || strategy?.params?.account_id);
      if (conditionalOrders.length === 0) {
        return res.status(400).json({
          success: false,
          error: '未找到可用于回测的条件单'
        });
      }

      if (normalizedStocks.length === 0) {
        normalizedStocks = normalizeArrayToDb(
          [...new Set(conditionalOrders.map((order) => order.ts_code).filter(Boolean))]
        );
      }
    }

    if (normalizedStocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: stocks'
      });
    }
    
    const engine = new BacktestEngine({
      startDate: adjustedStartDate,
      endDate: adjustedEndDate,
      initialCash: initialCash || 1000000,
      strategy,
      stocks: normalizedStocks,
      conditionalOrders,
      dateAdjustment
    });
    
    const report = await engine.run();
    
    res.json({
      success: true,
      data: report,
      dateAdjustment: dateAdjustment
    });
  } catch (error) {
    console.error('[回测] 运行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取回测历史
 */
async function getBacktestHistory(req, res) {
  try {
    const db = await getDatabase();
    const rows = await db.allPromise(`
      SELECT * FROM backtest_report 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('[回测] 获取历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取回测详情
 */
async function getBacktestDetail(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    const row = await db.getPromise('SELECT * FROM backtest_report WHERE id = ?', [id]);
    
    if (!row) {
      return res.status(404).json({
        success: false,
        error: '回测记录不存在'
      });
    }
    
    res.json({
      success: true,
      data: {
        ...row,
        report_data: JSON.parse(row.report_data || '{}')
      }
    });
  } catch (error) {
    console.error('[回测] 获取详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 保存回测报告到数据库
 */
async function saveBacktestReport(report) {
  try {
    const db = await getDatabase();
    await db.runPromise(`
      INSERT INTO backtest_report (
        name, start_date, end_date, initial_cash, final_value,
        total_return, return_rate, max_drawdown, sharpe_ratio,
        win_rate, trade_count, report_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      report.config.strategy.name || '未命名策略',
      report.config.startDate,
      report.config.endDate,
      report.config.initialCash,
      report.summary.finalValue,
      report.metrics.totalReturn,
      report.metrics.returnRate,
      report.metrics.maxDrawdown,
      report.metrics.sharpeRatio,
      report.metrics.winRate,
      report.metrics.tradeCount,
      JSON.stringify(report)
    ]);
  } catch (error) {
    console.error('[回测] 保存报告失败:', error);
  }
}

// ========== TASK_BACKTEST_004: 参数扫描功能 ==========

/**
 * 参数扫描回测
 * 对双均线策略进行网格搜索，找出最优参数
 */
async function scanParameters(req, res) {
  try {
    const { startDate, endDate, initialCash, stocks, strategyType } = req.body;
    
    if (!startDate || !endDate || !stocks || stocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：startDate, endDate, stocks'
      });
    }
    
    // 定义参数网格（双均线策略）
    const fastParams = [5, 10, 20];
    const slowParams = [20, 30, 60];
    
    const results = [];
    
    console.log(`🔬 开始参数扫描 - ${fastParams.length} x ${slowParams.length} = ${fastParams.length * slowParams.length} 组参数`);
    
    for (const fast of fastParams) {
      for (const slow of slowParams) {
        if (fast >= slow) continue; // 快线必须小于慢线
        
        try {
          const db = await getDatabase();
          const engine = new BacktestEngine({
            startDate,
            endDate,
            initialCash: initialCash || 1000000,
            strategy: {
              type: 'double_ma',
              name: `双均线 (快${fast}/慢${slow})`,
              params: { fast_period: fast, slow_period: slow }
            },
            stocks
          });
          
          const report = await engine.run();
          
          results.push({
            params: { fast, slow },
            metrics: {
              returnRate: report.metrics.returnRate,
              sharpeRatio: report.metrics.sharpeRatio,
              maxDrawdown: report.metrics.maxDrawdown,
              winRate: report.metrics.winRate,
              tradeCount: report.metrics.tradeCount
            },
            summary: {
              finalValue: report.summary.finalValue,
              totalReturn: report.metrics.totalReturn
            }
          });
        } catch (error) {
          console.error(`参数 (${fast},${slow}) 回测失败:`, error.message);
        }
      }
    }
    
    // 按收益率排序，找出最优参数
    results.sort((a, b) => b.metrics.returnRate - a.metrics.returnRate);
    
    const bestParams = results.length > 0 ? results[0] : null;
    
    res.json({
      success: true,
      data: {
        all: results,
        best: bestParams,
        total: results.length
      }
    });
  } catch (error) {
    console.error('[参数扫描] 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ========== TASK_BACKTEST_003: HTML 报告生成 ==========

/**
 * 生成 HTML 回测报告
 */
function generateHtmlReport(report) {
  const { config, summary, metrics, trades } = report;
  
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>回测报告 - ${config.strategy.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
           background: #1a1a2e; color: #eee; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #00d9ff; margin-bottom: 10px; }
    h2 { color: #00d9ff; margin: 30px 0 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
    .card { background: #16213e; border-radius: 10px; padding: 20px; margin: 15px 0; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .metric { background: #0f3460; padding: 15px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 28px; font-weight: bold; color: #00d9ff; }
    .metric-label { font-size: 14px; color: #888; margin-top: 5px; }
    .positive { color: #00ff88; }
    .negative { color: #ff4757; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #0f3460; color: #00d9ff; }
    tr:hover { background: #1a1a2e; }
    .summary { font-size: 18px; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 回测报告</h1>
    <p style="color:#888;margin:10px 0 30px;">策略：${config.strategy.name} | 
       时间：${config.startDate} ~ ${config.endDate} | 
       初始资金：¥${config.initialCash.toLocaleString()}</p>
    
    <h2>📈 核心指标</h2>
    <div class="card">
      <div class="metrics-grid">
        <div class="metric">
          <div class="metric-value ${metrics.returnRate >= 0 ? 'positive' : 'negative'}">
            ${(metrics.returnRate * 100).toFixed(2)}%
          </div>
          <div class="metric-label">累计收益率</div>
        </div>
        <div class="metric">
          <div class="metric-value ${metrics.annualizedReturn >= 0 ? 'positive' : 'negative'}">
            ${(metrics.annualizedReturn * 100).toFixed(2)}%
          </div>
          <div class="metric-label">年化收益率</div>
        </div>
        <div class="metric">
          <div class="metric-value">${metrics.sharpeRatio.toFixed(2)}</div>
          <div class="metric-label">夏普比率</div>
        </div>
        <div class="metric">
          <div class="metric-value negative">${(metrics.maxDrawdown * 100).toFixed(2)}%</div>
          <div class="metric-label">最大回撤</div>
        </div>
        <div class="metric">
          <div class="metric-value">${(metrics.winRate * 100).toFixed(1)}%</div>
          <div class="metric-label">胜率</div>
        </div>
        <div class="metric">
          <div class="metric-value">${metrics.tradeCount}</div>
          <div class="metric-label">交易次数</div>
        </div>
      </div>
    </div>
    
    <h2>📋 回测概要</h2>
    <div class="card">
      <div class="summary">
        <p>• 初始资金：<strong>¥${config.initialCash.toLocaleString()}</strong></p>
        <p>• 最终价值：<strong class="${summary.finalValue >= config.initialCash ? 'positive' : 'negative'}">
            ¥${summary.finalValue.toLocaleString(undefined, {maximumFractionDigits: 0})}
          </strong></p>
        <p>• 绝对收益：<strong class="${metrics.totalReturn >= 0 ? 'positive' : 'negative'}">
            ¥${metrics.totalReturn.toLocaleString(undefined, {maximumFractionDigits: 0})}
          </strong></p>
      </div>
    </div>
    
    <h2>💼 交易记录（前 20 条）</h2>
    <div class="card">
      <table>
        <thead>
          <tr><th>日期</th><th>股票</th><th>操作</th><th>数量</th><th>价格</th><th>金额</th></tr>
        </thead>
        <tbody>
          ${(trades || []).slice(0, 20).map(trade => `
            <tr>
              <td>${trade.date}</td>
              <td>${trade.ts_code}</td>
              <td class="${trade.action === 'BUY' ? 'positive' : 'negative'}">${trade.action}</td>
              <td>${trade.quantity}</td>
              <td>¥${trade.price.toFixed(2)}</td>
              <td>¥${(trade.quantity * trade.price).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <p style="text-align:center;color:#666;margin-top:40px;">
      报告生成时间：${new Date().toLocaleString('zh-CN')}
    </p>
  </div>
</body>
</html>`;
}

/**
 * 生成 Markdown 回测报告
 */
function generateMarkdownReport(report) {
  const { config, summary, metrics, trades } = report;
  
  return `# 📊 回测报告

## 策略信息
- **策略名称**: ${config.strategy.name}
- **回测时间**: ${config.startDate} ~ ${config.endDate}
- **初始资金**: ¥${config.initialCash.toLocaleString()}

## 📈 核心指标

| 指标 | 数值 |
|------|------|
| 累计收益率 | ${(metrics.returnRate * 100).toFixed(2)}% |
| 年化收益率 | ${(metrics.annualizedReturn * 100).toFixed(2)}% |
| 夏普比率 | ${metrics.sharpeRatio.toFixed(2)} |
| 最大回撤 | ${(metrics.maxDrawdown * 100).toFixed(2)}% |
| 胜率 | ${(metrics.winRate * 100).toFixed(1)}% |
| 交易次数 | ${metrics.tradeCount} |

## 📋 回测概要

- **初始资金**: ¥${config.initialCash.toLocaleString()}
- **最终价值**: ¥${summary.finalValue.toLocaleString(undefined, {maximumFractionDigits: 0})}
- **绝对收益**: ¥${metrics.totalReturn.toLocaleString(undefined, {maximumFractionDigits: 0})}

## 💼 交易记录（前 20 条）

| 日期 | 股票 | 操作 | 数量 | 价格 | 金额 |
|------|------|------|------|------|------|
${(trades || []).slice(0, 20).map(trade => 
  `| ${trade.date} | ${trade.ts_code} | ${trade.action} | ${trade.quantity} | ¥${trade.price.toFixed(2)} | ¥${(trade.quantity * trade.price).toLocaleString(undefined, {maximumFractionDigits: 0})} |`
).join('\n')}

---
*报告生成时间：${new Date().toLocaleString('zh-CN')}*
`;
}

/**
 * 生成回测报告文件（TASK_BACKTEST_003）
 */
async function generateBacktestReport(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    const row = await db.getPromise('SELECT * FROM backtest_report WHERE id = ?', [id]);
    
    if (!row) {
      return res.status(404).json({
        success: false,
        error: '回测记录不存在'
      });
    }
    
    const report = JSON.parse(row.report_data || '{}');
    
    // 生成 HTML 报告
    const htmlContent = generateHtmlReport(report);
    const htmlPath = `report/backtest/${id}/report.html`;
    
    // 生成 Markdown 报告
    const mdContent = generateMarkdownReport(report);
    const mdPath = `report/backtest/${id}/report.md`;
    
    // 确保目录存在
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    
    // 保存文件
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    fs.writeFileSync(mdPath, mdContent, 'utf8');
    
    res.json({
      success: true,
      data: {
        html_path: htmlPath,
        md_path: mdPath
      }
    });
  } catch (error) {
    console.error('[报告生成] 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 批量回测（TASK_100）
 * 对参数范围内的所有组合进行回测，返回最优参数
 */
async function runBatchBacktest(req, res) {
  try {
    const { 
      startDate, 
      endDate, 
      initialCash, 
      strategy, 
      stocks, 
      paramRange,
      account_id 
    } = req.body;
    
    const db = await getDatabase();
    
    if (!startDate || !endDate || !strategy || !paramRange) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：startDate, endDate, strategy, paramRange'
      });
    }
    
    if (!paramRange.fastMin || !paramRange.fastMax || !paramRange.slowMin || !paramRange.slowMax || !paramRange.step) {
      return res.status(400).json({
        success: false,
        error: '参数范围不完整：需要 fastMin, fastMax, slowMin, slowMax, step'
      });
    }
    
    // 规范化股票代码格式
    let normalizedStocks = normalizeArrayToDb(Array.isArray(stocks) ? stocks : []);
    
    if (normalizedStocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：stocks'
      });
    }
    
    // 生成参数组合
    const paramCombinations = [];
    for (let fast = paramRange.fastMin; fast <= paramRange.fastMax; fast += paramRange.step) {
      for (let slow = paramRange.slowMin; slow <= paramRange.slowMax; slow += paramRange.step) {
        // 确保快线 < 慢线
        if (fast < slow) {
          paramCombinations.push({
            fastPeriod: fast,
            slowPeriod: slow
          });
        }
      }
    }
    
    if (paramCombinations.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有有效的参数组合（确保快线最大值 < 慢线最小值）'
      });
    }
    
    console.log(`[批量回测] 开始执行，共 ${paramCombinations.length} 个参数组合`);
    
    // 并行执行所有回测
    const results = [];
    for (const params of paramCombinations) {
      try {
        const strategyConfig = {
          ...strategy,
          params: {
            ...strategy.params,
            fastPeriod: params.fastPeriod,
            slowPeriod: params.slowPeriod
          }
        };
        
        const engine = new BacktestEngine({
          startDate,
          endDate,
          initialCash: initialCash || 1000000,
          strategy: strategyConfig,
          stocks: normalizedStocks,
          conditionalOrders: []
        });
        
        const report = await engine.run();
        
        results.push({
          params: params,
          report: report,
          metrics: {
            returnRate: report.metrics.returnRate,
            annualizedReturn: report.metrics.annualizedReturn,
            sharpeRatio: report.metrics.sharpeRatio,
            maxDrawdown: report.metrics.maxDrawdown,
            winRate: report.metrics.winRate,
            tradeCount: report.metrics.tradeCount
          }
        });
        
        console.log(`[批量回测] 完成参数组合：快线=${params.fastPeriod}, 慢线=${params.slowPeriod}, 收益率=${(report.metrics.returnRate * 100).toFixed(2)}%`);
      } catch (error) {
        console.error(`[批量回测] 参数组合失败：快线=${params.fastPeriod}, 慢线=${params.slowPeriod}`, error.message);
        results.push({
          params: params,
          error: error.message
        });
      }
    }
    
    // 找出最优参数（按收益率排序）
    const validResults = results.filter(r => r.metrics && r.metrics.returnRate !== undefined);
    validResults.sort((a, b) => b.metrics.returnRate - a.metrics.returnRate);
    
    const bestParams = validResults.length > 0 ? {
      fastPeriod: validResults[0].params.fastPeriod,
      slowPeriod: validResults[0].params.slowPeriod,
      returnRate: validResults[0].metrics.returnRate,
      sharpeRatio: validResults[0].metrics.sharpeRatio,
      maxDrawdown: validResults[0].metrics.maxDrawdown
    } : null;
    
    res.json({
      success: true,
      data: {
        totalCombinations: paramCombinations.length,
        validResults: validResults.length,
        bestParams: bestParams,
        allResults: results,
        recommended: bestParams ? {
          fastPeriod: bestParams.fastPeriod,
          slowPeriod: bestParams.slowPeriod,
          description: `最优参数：快线${bestParams.fastPeriod}日，慢线${bestParams.slowPeriod}日，收益率${(bestParams.returnRate * 100).toFixed(2)}%`
        } : null
      }
    });
  } catch (error) {
    console.error('[批量回测] 运行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================
// 因子快照回测功能 (TASK_V3_101)
// ============================

const FactorSnapshotBacktest = require('./backtest-engine');

/**
 * 运行基于因子快照的回测
 * POST /api/backtest/factor-snapshot/run
 * TASK_V4_026: 支持 selectionDate 参数
 * TASK_API_003: 默认启用决策引擎
 */
async function runFactorSnapshotBacktest(req, res) {
  try {
    const {
      startDate,
      endDate,
      initialCapital = 1000000,
      commissionRate = 0.00025,
      minCommission = 5,
      positionLimit = 10,
      stampDutyRate = 0.001,
      slippageRate = 0,
      strategy = {},
      // TASK_V4_026: 选股时点参数
      selectionDate = null,
      // TASK_API_003: 决策引擎参数（默认启用）
      useDecisionEngine = true,
      strategyType = 'short_term'
    } = req.body;

    // 参数验证
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '必须提供 startDate 和 endDate 参数'
      });
    }

    // 验证日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        success: false,
        error: '日期格式必须为 YYYY-MM-DD'
      });
    }

    // TASK_V4_026: 验证 selectionDate 格式
    if (selectionDate && !dateRegex.test(selectionDate)) {
      return res.status(400).json({
        success: false,
        error: 'selectionDate 日期格式必须为 YYYY-MM-DD'
      });
    }

    // TASK_V4_026: 验证 selectionDate 不能晚于 startDate
    if (selectionDate && new Date(selectionDate) > new Date(startDate)) {
      return res.status(400).json({
        success: false,
        error: 'selectionDate 不能晚于 startDate'
      });
    }

    console.log(`[因子快照回测] 开始运行: ${startDate} 到 ${endDate}`);
    if (selectionDate) {
      console.log(`[因子快照回测] 选股时点: ${selectionDate} (使用该日期的快照数据进行选股)`);
    }
    console.log(`[因子快照回测] 初始资金: ${initialCapital}, 手续费率: ${commissionRate}`);
    console.log(`[因子快照回测] 策略配置:`, JSON.stringify(strategy, null, 2));

    // 创建回测引擎
    const backtest = new FactorSnapshotBacktest({
      initialCapital,
      commissionRate,
      minCommission,
      positionLimit,
      stampDutyRate,
      slippageRate,
      selectionDate
    });

    // 运行回测
    const result = await backtest.run({
      startDate,
      endDate,
      strategyConfig: strategy,
      selectionDate
    });

    // 保存回测结果到数据库
    const saveResult = await backtest.saveToDatabase();
    const backtestId = saveResult.backtestId;

    // 返回结果
    res.json({
      success: true,
      data: {
        backtestId,
        ...result
      }
    });

  } catch (error) {
    console.error('[因子快照回测] 运行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取因子快照回测历史
 * GET /api/backtest/factor-snapshot/history
 */
async function getFactorSnapshotBacktestHistory(req, res) {
  try {
    const db = require('./db').getDatabase();
    const { limit = 50, offset = 0 } = req.query;

    const rows = await db.allPromise(`
      SELECT
        id,
        name,
        start_date,
        end_date,
        initial_capital,
        final_capital,
        total_return,
        annualized_return,
        sharpe_ratio,
        max_drawdown,
        win_rate,
        trade_count,
        volatility,
        strategy_config,
        result_summary,
        created_at
      FROM backtest_history
      WHERE name LIKE '%因子快照%'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);

    const totalRow = await db.getPromise(`
      SELECT COUNT(*) as count
      FROM backtest_history
      WHERE name LIKE '%因子快照%'
    `);

    const total = totalRow ? totalRow.count : 0;

    const history = rows.map(row => ({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      initialCapital: row.initial_capital,
      finalCapital: row.final_capital,
      strategyConfig: row.strategy_config ? JSON.parse(row.strategy_config) : {},
      resultSummary: row.result_summary ? JSON.parse(row.result_summary) : {},
      sevenMetrics: {
        sharpe_ratio: row.sharpe_ratio,
        max_drawdown: row.max_drawdown,
        annualized_return: row.annualized_return,
        total_return: row.total_return,
        win_rate: row.win_rate,
        trade_count: row.trade_count,
        volatility: row.volatility
      },
      createdAt: row.created_at
    }));

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    });

  } catch (error) {
    console.error('[获取回测历史] 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取回测详情
 * GET /api/backtest/factor-snapshot/:id
 */
async function getFactorSnapshotBacktestDetail(req, res) {
  try {
    const { id } = req.params;
    const db = require('./db').getDatabase();

    // 获取回测基本信息
    const row = await db.getPromise(`
      SELECT
        id,
        name,
        start_date,
        end_date,
        initial_capital,
        final_capital,
        total_return,
        annualized_return,
        sharpe_ratio,
        max_drawdown,
        win_rate,
        trade_count,
        volatility,
        strategy_config,
        result_summary,
        created_at
      FROM backtest_history
      WHERE id = ?
    `, [id]);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: '回测记录不存在'
      });
    }

    // 获取交易明细
    const trades = await db.allPromise(`
      SELECT
        id,
        trade_date,
        ts_code,
        stock_name,
        action,
        quantity,
        price,
        amount,
        commission,
        profit,
        profit_rate
      FROM backtest_trades
      WHERE backtest_id = ?
      ORDER BY trade_date ASC, id ASC
    `, [id]);

    // 获取权益曲线
    const equityCurve = await db.allPromise(`
      SELECT
        trade_date,
        cash,
        position_value,
        total_value,
        daily_return,
        cumulative_return
      FROM backtest_equity_curve
      WHERE backtest_id = ?
      ORDER BY trade_date ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        startDate: row.start_date,
        endDate: row.end_date,
        initialCapital: row.initial_capital,
        finalCapital: row.final_capital,
        strategyConfig: row.strategy_config ? JSON.parse(row.strategy_config) : {},
        resultSummary: row.result_summary ? JSON.parse(row.result_summary) : {},
        sevenMetrics: {
          sharpe_ratio: row.sharpe_ratio,
          max_drawdown: row.max_drawdown,
          annualized_return: row.annualized_return,
          total_return: row.total_return,
          win_rate: row.win_rate,
          trade_count: row.trade_count,
          volatility: row.volatility
        },
        trades: trades.map(t => ({
          date: t.trade_date,
          tsCode: t.ts_code,
          stockName: t.stock_name,
          action: t.action,
          quantity: t.quantity,
          price: t.price,
          amount: t.amount,
          commission: t.commission,
          profit: t.profit,
          profitRate: t.profit_rate
        })),
        equityCurve: equityCurve.map(e => ({
          date: e.trade_date,
          cash: e.cash,
          positionValue: e.position_value,
          totalValue: e.total_value,
          dailyReturn: e.daily_return,
          cumulativeReturn: e.cumulative_return
        })),
        createdAt: row.created_at
      }
    });

  } catch (error) {
    console.error('[获取回测详情] 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 参数扫描（批量回测）
 * POST /api/backtest/factor-snapshot/scan
 */
async function scanFactorSnapshotParameters(req, res) {
  try {
    const {
      startDate,
      endDate,
      initialCapital = 1000000,
      commissionRate = 0.00025,
      minCommission = 5,
      positionLimit = 10,
      baseStrategy = {},
      paramRanges = {}
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '必须提供 startDate 和 endDate 参数'
      });
    }

    if (!paramRanges || Object.keys(paramRanges).length === 0) {
      return res.status(400).json({
        success: false,
        error: '必须提供 paramRanges 参数进行参数扫描'
      });
    }

    console.log(`[因子快照参数扫描] 开始: ${startDate} 到 ${endDate}`);
    console.log(`[因子快照参数扫描] 参数范围:`, JSON.stringify(paramRanges, null, 2));

    // 创建回测引擎
    const backtest = new FactorSnapshotBacktest({
      initialCapital,
      commissionRate,
      minCommission,
      positionLimit
    });

    // 运行批量回测
    const results = await backtest.runBatch(
      { startDate, endDate, strategyConfig: baseStrategy },
      paramRanges
    );

    // 统计结果
    const validResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);

    // 按年化收益率排序
    const sortedResults = [...validResults].sort((a, b) =>
      (b.summary?.annualizedReturn || 0) - (a.summary?.annualizedReturn || 0)
    );

    const bestResult = sortedResults[0];

    res.json({
      success: true,
      data: {
        totalScenarios: results.length,
        validScenarios: validResults.length,
        failedScenarios: failedResults.length,
        bestStrategy: bestResult ? {
          params: bestResult.params,
          summary: bestResult.summary,
          sevenMetrics: bestResult.sevenMetrics
        } : null,
        allResults: results.map(r => ({
          params: r.params,
          summary: r.summary,
          sevenMetrics: r.sevenMetrics,
          success: r.success,
          error: r.error
        }))
      }
    });

  } catch (error) {
    console.error('[因子快照参数扫描] 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================
// 联合回测功能 (TASK_V4_024)
// ============================

const CoreBacktestEngine = require('./backtest-core');
const SatelliteBacktestEngine = require('./backtest-satellite');
const { calculateJointEquity, calculateSharpeRatio, calculateMaxDrawdown, calculateAnnualizedReturn } = require('./joint-optimizer');

/**
 * 联合回测引擎
 * 支持核心仓 + 卫星仓的联合回测
 * TASK_API_003: 支持决策引擎配置
 */
class JointBacktestEngine {
  constructor(config = {}) {
    this.config = {
      // 资金配置
      initialCapital: config.initialCapital || 1000000,

      // 投资组合配置
      coreWeight: config.coreWeight || 0.7,      // 核心仓占比（默认70%）
      satelliteWeight: config.satelliteWeight || 0.3, // 卫星仓占比（默认30%）

      // 交易成本
      commissionRate: config.commissionRate || 0.00025,
      minCommission: config.minCommission || 5,
      stampDutyRate: config.stampDutyRate || 0.001,
      slippageRate: config.slippageRate || 0,

      // 核心仓策略配置
      coreStrategy: config.coreStrategy || {},

      // 卫星仓网格交易配置
      gridConfig: config.gridConfig || {},

      // TASK_API_003: 决策引擎配置
      useDecisionEngine: config.useDecisionEngine !== false, // 默认启用
      strategyType: config.strategyType || 'short_term',

      ...config
    };

    // 验证权重配置
    const totalWeight = this.config.coreWeight + this.config.satelliteWeight;
    if (Math.abs(totalWeight - 1) > 0.001) {
      console.warn(`[联合回测] 权重配置不等于100%，自动调整: ${this.config.coreWeight} + ${this.config.satelliteWeight} = ${totalWeight}`);
      // 归一化
      this.config.coreWeight = this.config.coreWeight / totalWeight;
      this.config.satelliteWeight = this.config.satelliteWeight / totalWeight;
    }

    // 创建子引擎
    // TASK_API_003: 传递决策引擎配置
    this.coreEngine = new CoreBacktestEngine({
      ...this.config,
      coreWeight: this.config.coreWeight,
      useDecisionEngine: this.config.useDecisionEngine,
      strategyType: this.config.strategyType
    });

    this.satelliteEngine = new SatelliteBacktestEngine({
      ...this.config,
      satelliteWeight: this.config.satelliteWeight
    });

    this.results = null;
  }

  /**
   * 运行联合回测
   * TASK_V4_026: 支持 selectionDate 参数
   */
  async run(params = {}) {
    const {
      startDate,
      endDate,
      // 核心仓配置
      coreStrategy = {},
      // 卫星仓配置
      satelliteStock,
      gridConfig = {},
      interval = '5',
      // TASK_V4_026: 选股时点参数
      selectionDate = null
    } = params;

    console.log(`[联合回测] 开始联合回测: ${startDate} 到 ${endDate}`);
    if (selectionDate) {
      console.log(`[联合回测] 选股时点: ${selectionDate} (使用该日期的快照数据进行选股)`);
    }
    console.log(`[联合回测] 初始资金: ${this.config.initialCapital.toLocaleString()}`);
    console.log(`[联合回测] 核心仓占比: ${(this.config.coreWeight * 100).toFixed(0)}%`);
    console.log(`[联合回测] 卫星仓占比: ${(this.config.satelliteWeight * 100).toFixed(0)}%`);
    console.log(`[联合回测] 卫星仓股票: ${satelliteStock || '未指定'}`);

    const startTime = Date.now();

    // 并行运行核心仓和卫星仓回测
    const [coreResult, satelliteResult] = await Promise.allSettled([
      // 核心仓回测
      this.coreEngine.run({
        startDate,
        endDate,
        strategyConfig: {
          ...this.config.coreStrategy,
          ...coreStrategy
        },
        selectionDate
      }),
      // 卫星仓回测（如果指定了股票）
      satelliteStock
        ? this.satelliteEngine.run({
            startDate,
            endDate,
            tsCode: satelliteStock,
            gridConfig: {
              ...this.config.gridConfig,
              ...gridConfig
            },
            interval
          })
        : Promise.resolve(this.generateEmptySatelliteResult())
    ]);

    // 处理结果
    const coreData = coreResult.status === 'fulfilled' ? coreResult.value : this.generateEmptyCoreResult();
    const satelliteData = satelliteResult.status === 'fulfilled' ? satelliteResult.value : this.generateEmptySatelliteResult();

    // 记录错误
    if (coreResult.status === 'rejected') {
      console.error(`[联合回测] 核心仓回测失败:`, coreResult.reason);
    }
    if (satelliteResult.status === 'rejected') {
      console.error(`[联合回测] 卫星仓回测失败:`, satelliteResult.reason);
    }

    // 合并结果
    this.results = this.mergeResults(coreData, satelliteData, selectionDate);

    const endTime = Date.now();
    console.log(`[联合回测] 回测完成，耗时: ${(endTime - startTime) / 1000}秒`);

    return this.results;
  }

  /**
   * 生成空的核心仓结果
   */
  generateEmptyCoreResult() {
    const coreCapital = this.config.initialCapital * this.config.coreWeight;
    return {
      portfolio: 'core',
      coreWeight: this.config.coreWeight,
      initialCapital: coreCapital,
      finalCapital: coreCapital,
      summary: {
        initialCapital: coreCapital,
        finalCapital: coreCapital,
        totalReturn: 0,
        annualizedReturn: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        totalTrades: 0,
        tradingDays: 0
      },
      details: {
        equityCurve: [coreCapital],
        trades: [],
        dates: []
      }
    };
  }

  /**
   * 生成空的卫星仓结果
   */
  generateEmptySatelliteResult() {
    const satelliteCapital = this.config.initialCapital * this.config.satelliteWeight;
    return {
      portfolio: 'satellite',
      satelliteWeight: this.config.satelliteWeight,
      initialCapital: satelliteCapital,
      finalCapital: satelliteCapital,
      summary: {
        initialCapital: satelliteCapital,
        finalCapital: satelliteCapital,
        totalReturn: 0,
        annualizedReturn: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        totalTrades: 0,
        tradingDays: 0
      },
      details: {
        equityCurve: [satelliteCapital],
        trades: []
      }
    };
  }

  /**
   * 合并核心仓和卫星仓的回测结果
   * TASK_V4_026: 记录选股时点信息
   */
  mergeResults(coreResult, satelliteResult, selectionDate = null) {
    const initialCapital = this.config.initialCapital;
    const coreWeight = this.config.coreWeight;
    const satelliteWeight = this.config.satelliteWeight;

    // 计算联合净值曲线
    const coreEquity = coreResult.details.equityCurve || [];
    const satelliteEquity = satelliteResult.details.equityCurve || [];

    // 对齐时间轴（取较短的对齐）
    const minLength = Math.min(coreEquity.length, satelliteEquity.length);

    // 计算联合权益曲线
    const jointEquityCurve = [];
    for (let i = 0; i < minLength; i++) {
      // 如果两者长度一致，直接加权
      if (coreEquity[i] !== undefined && satelliteEquity[i] !== undefined) {
        jointEquityCurve.push(coreEquity[i] + satelliteEquity[i]);
      } else if (coreEquity[i] !== undefined) {
        // 只有核心仓数据
        const satelliteValue = satelliteEquity[satelliteEquity.length - 1] || 0;
        jointEquityCurve.push(coreEquity[i] + satelliteValue);
      }
    }

    // 如果核心仓数据更长，补充剩余部分
    for (let i = minLength; i < coreEquity.length; i++) {
      const satelliteValue = satelliteEquity[satelliteEquity.length - 1] || 0;
      jointEquityCurve.push(coreEquity[i] + satelliteValue);
    }

    // 如果联合权益曲线为空，使用初始资金
    if (jointEquityCurve.length === 0) {
      jointEquityCurve.push(initialCapital);
    }

    // 计算联合收益率序列
    const jointReturns = [];
    for (let i = 1; i < jointEquityCurve.length; i++) {
      if (jointEquityCurve[i - 1] > 0) {
        jointReturns.push((jointEquityCurve[i] - jointEquityCurve[i - 1]) / jointEquityCurve[i - 1]);
      }
    }

    // 计算联合绩效指标
    const finalCapital = jointEquityCurve[jointEquityCurve.length - 1];
    const totalReturn = (finalCapital - initialCapital) / initialCapital;
    const tradingDays = Math.max(
      coreResult.summary.tradingDays || 0,
      satelliteResult.summary.tradingDays || 0
    );
    const annualizedReturn = calculateAnnualizedReturn(totalReturn, tradingDays);
    const maxDrawdown = calculateMaxDrawdown(jointEquityCurve);
    const sharpeRatio = calculateSharpeRatio(jointReturns, 0.02, 252);

    // 合并交易记录
    const allTrades = [
      ...(coreResult.details.trades || []),
      ...(satelliteResult.details.trades || [])
    ];

    return {
      success: true,
      portfolio: 'joint',
      config: {
        initialCapital,
        coreWeight,
        satelliteWeight,
        coreWeightPercent: `${(coreWeight * 100).toFixed(0)}%`,
        satelliteWeightPercent: `${(satelliteWeight * 100).toFixed(0)}%`
      },

      // TASK_V4_026: 添加选股时点和回测区间信息
      backtestInfo: {
        selectionDate: selectionDate || null,
        backtestStartDate: coreResult.backtestInfo?.backtestStartDate || coreResult.details.dates[0],
        backtestEndDate: coreResult.backtestInfo?.backtestEndDate || coreResult.details.dates[coreResult.details.dates.length - 1],
        actualTradingDays: tradingDays,
        futureFunctionProtection: !!selectionDate,
        selectionSnapshotCount: coreResult.backtestInfo?.selectionSnapshotCount || 0
      },

      // 联合结果
      summary: {
        initialCapital,
        finalCapital,
        totalReturn,
        returnRate: totalReturn, // P0-4: 兼容前端字段名
        annualizedReturn,
        maxDrawdown,
        sharpeRatio,
        totalTrades: allTrades.filter(t => t.action === 'SELL').length,
        tradeCount: allTrades.filter(t => t.action === 'SELL').length, // P0-4: 兼容前端字段名
        winRate: allTrades.length > 0 ? allTrades.filter(t => t.profit > 0).length / allTrades.filter(t => t.action === 'SELL').length : 0,
        tradingDays
      },

      // 核心仓结果
      core: {
        weight: coreWeight,
        initialCapital: coreResult.initialCapital,
        finalCapital: coreResult.finalCapital,
        totalReturn: coreResult.summary.totalReturn,
        annualizedReturn: coreResult.summary.annualizedReturn,
        maxDrawdown: coreResult.summary.maxDrawdown,
        sharpeRatio: coreResult.summary.sharpeRatio,
        totalTrades: coreResult.summary.totalTrades,
        trades: coreResult.details.trades,
        // TASK_V4_026: 添加选股结果
        selectedStocks: coreResult.details.selectedStocks || []
      },

      // 卫星仓结果
      satellite: {
        weight: satelliteWeight,
        initialCapital: satelliteResult.initialCapital,
        finalCapital: satelliteResult.finalCapital,
        totalReturn: satelliteResult.summary.totalReturn,
        annualizedReturn: satelliteResult.summary.annualizedReturn,
        maxDrawdown: satelliteResult.summary.maxDrawdown,
        sharpeRatio: satelliteResult.summary.sharpeRatio,
        totalTrades: satelliteResult.summary.totalTrades,
        gridStats: satelliteResult.summary.gridStats,
        trades: satelliteResult.details.trades
      },

      // 详细数据
      details: {
        jointEquityCurve,
        jointReturns,
        coreEquityCurve: coreResult.details.equityCurve,
        satelliteEquityCurve: satelliteResult.details.equityCurve,
        allTrades,
        dates: coreResult.details.dates || satelliteResult.details.dates || []
      },

      // 原始结果
      rawResults: {
        core: coreResult,
        satellite: satelliteResult
      }
    };
  }

  /**
   * 获取回测结果
   */
  getResults() {
    return this.results;
  }
}

/**
 * 运行联合回测 API
 * POST /api/backtest/joint/run
 * TASK_V4_026: 支持 selectionDate 参数
 * TASK_API_003: 默认启用决策引擎
 */
async function runJointBacktest(req, res) {
  try {
    const {
      startDate,
      endDate,
      initialCapital = 1000000,
      coreWeight = 0.7,
      satelliteWeight = 0.3,
      coreStrategy = {},
      satelliteStock,
      gridConfig = {},
      interval = '5',
      // TASK_V4_026: 选股时点参数
      selectionDate = null,
      // TASK_API_003: 决策引擎参数（默认启用）
      useDecisionEngine = true,
      strategyType = 'short_term'
    } = req.body;

    // 参数验证
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: '必须提供 startDate 和 endDate 参数'
      });
    }

    // satelliteStock 为可选参数，未提供时仅运行核心仓回测
    if (!satelliteStock) {
      console.log(`[联合回测] 仅核心仓回测模式`);
    }

    // 验证日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        success: false,
        error: '日期格式必须为 YYYY-MM-DD'
      });
    }

    // TASK_V4_026: 验证 selectionDate 格式
    if (selectionDate && !dateRegex.test(selectionDate)) {
      return res.status(400).json({
        success: false,
        error: 'selectionDate 日期格式必须为 YYYY-MM-DD'
      });
    }

    // TASK_V4_026: 验证 selectionDate 不能晚于 startDate
    if (selectionDate && new Date(selectionDate) > new Date(startDate)) {
      return res.status(400).json({
        success: false,
        error: 'selectionDate 不能晚于 startDate'
      });
    }

    console.log(`[联合回测API] 开始运行: ${startDate} 到 ${endDate}`);
    if (selectionDate) {
      console.log(`[联合回测API] 选股时点: ${selectionDate} (使用该日期的快照数据进行选股)`);
    }
    // TASK_API_003: 输出决策引擎配置
    console.log(`[联合回测API] 决策引擎: ${useDecisionEngine ? '启用' : '禁用'}, 策略类型: ${strategyType}`);
    console.log(`[联合回测API] 核心仓占比: ${(coreWeight * 100).toFixed(0)}%, 卫星仓占比: ${(satelliteWeight * 100).toFixed(0)}%`);

    // 创建联合回测引擎
    // TASK_API_003: 传递决策引擎配置
    const engine = new JointBacktestEngine({
      initialCapital,
      coreWeight,
      satelliteWeight,
      coreStrategy,
      gridConfig,
      selectionDate,
      // TASK_API_003: 决策引擎配置
      useDecisionEngine,
      strategyType
    });

    // 运行回测
    const result = await engine.run({
      startDate,
      endDate,
      coreStrategy,
      satelliteStock,
      gridConfig,
      interval,
      selectionDate
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[联合回测] 运行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取联合回测默认配置 API
 * GET /api/backtest/joint/config
 */
async function getJointBacktestConfig(req, res) {
  try {
    res.json({
      success: true,
      data: {
        defaultWeights: {
          core: 0.7,
          satellite: 0.3
        },
        gridConfig: {
          stepPercent: { min: 0.5, max: 2.0, default: 1.0, label: '网格步长(%)' },
          basePosition: { min: 100, max: 5000, default: 1000, label: '基础持仓量' },
          maxPosition: { min: 1000, max: 10000, default: 5000, label: '最大持仓量' }
        },
        intervals: ['1', '5', '15', '30', '60']
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  BacktestEngine,
  runBacktest,
  runBatchBacktest,
  getBacktestHistory,
  getBacktestDetail,
  saveBacktestReport,
  scanParameters,
  generateBacktestReport,
  runFactorSnapshotBacktest,
  getFactorSnapshotBacktestHistory,
  getFactorSnapshotBacktestDetail,
  scanFactorSnapshotParameters,

  // TASK_V4_024: 联合回测
  JointBacktestEngine,
  CoreBacktestEngine,
  SatelliteBacktestEngine,
  runJointBacktest,
  getJointBacktestConfig
};
