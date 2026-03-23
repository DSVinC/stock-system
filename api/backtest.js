/**
 * 回测模块
 * 支持历史数据回放、策略验证、收益统计
 * 安全修复版：接入真实历史数据
 * 策略扩展版：支持双均线、RSI、MACD、布林带策略
 */

const { getDatabase } = require('./db');
const { checkCondition } = require('./conditional-order');

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
      const rows = await db.allPromise(`
        SELECT trade_date, ts_code, stock_name, close as price, pe, pb, market_cap, amount as turnover
        FROM stock_daily 
        WHERE ts_code = ? AND trade_date BETWEEN ? AND ?
        ORDER BY trade_date ASC
      `, [tsCode, this.config.startDate, this.config.endDate]);
      
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
          ts_code: row.ts_code,
          stock_name: row.stock_name || this.getStockName(tsCode),
          price: parseFloat(row.price) || 0,
          pe: parseFloat(row.pe) || 0,
          pb: parseFloat(row.pb) || 0,
          market_cap: parseFloat(row.market_cap) || 0,
          turnover: parseFloat(row.turnover) || 0
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

      const prices = this.priceHistory[stock.ts_code];
      let shouldBuy = false;
      let shouldSell = false;

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
        totalReturn: this.metrics.totalReturn,
        returnRate: this.metrics.returnRate,
        maxDrawdown: this.metrics.maxDrawdown,
        sharpeRatio: this.metrics.sharpeRatio,
        winRate: this.metrics.winRate,
        tradeCount: this.metrics.tradeCount
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
        error: '缺少必要参数: startDate, endDate, strategy'
      });
    }

    let conditionalOrders = [];
    let normalizedStocks = Array.isArray(stocks) ? [...stocks] : [];

    if (strategy.type === 'conditional') {
      conditionalOrders = await loadConditionalOrdersForBacktest(db, strategy, account_id || strategy?.params?.account_id);
      if (conditionalOrders.length === 0) {
        return res.status(400).json({
          success: false,
          error: '未找到可用于回测的条件单'
        });
      }

      if (normalizedStocks.length === 0) {
        normalizedStocks = [...new Set(conditionalOrders.map((order) => order.ts_code).filter(Boolean))];
      }
    }

    if (normalizedStocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: stocks'
      });
    }
    
    const engine = new BacktestEngine({
      startDate,
      endDate,
      initialCash: initialCash || 1000000,
      strategy,
      stocks: normalizedStocks,
      conditionalOrders
    });
    
    const report = await engine.run();
    
    res.json({
      success: true,
      data: report
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
              <td>¥${(trade.qty * trade.price).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
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
  `| ${trade.date} | ${trade.ts_code} | ${trade.action} | ${trade.quantity} | ¥${trade.price.toFixed(2)} | ¥${(trade.qty * trade.price).toLocaleString(undefined, {maximumFractionDigits: 0})} |`
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

module.exports = {
  BacktestEngine,
  runBacktest,
  getBacktestHistory,
  getBacktestDetail,
  saveBacktestReport,
  scanParameters,
  generateBacktestReport
};
