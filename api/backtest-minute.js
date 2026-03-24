/**
 * 基于分钟线数据的短线回测引擎
 * 使用 stock_minute 表进行回测
 * 支持 5 分钟线级别回测和日内交易（T+0 模拟）
 */

const { getDatabase } = require('./db');
const performance = require('./backtest-report');

class MinuteBacktest {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 1000000, // 初始资金：100万
      commissionRate: config.commissionRate || 0.00025, // 手续费率：万2.5
      minCommission: config.minCommission || 5, // 最低手续费：5元
      slippageRate: config.slippageRate || 0.001, // 滑点率：千分之一
      positionLimit: config.positionLimit || 5, // 持仓限制：最多5只股票
      minuteInterval: config.minuteInterval || 5, // 分钟线间隔：5分钟
      allowIntradayTrade: config.allowIntradayTrade !== false, // 允许日内交易
      maxDailyTrades: config.maxDailyTrades || 10, // 每日最大交易次数
      ...config
    };
    
    this.db = getDatabase();
    this.equityCurve = [];
    this.minuteReturns = [];
    this.trades = [];
    this.positions = new Map(); // 当前持仓：ts_code -> {shares, cost, entryTime, entryPrice, commission}
    this.cash = this.config.initialCapital;
    this.dates = [];
    this.minuteTimestamps = []; // 所有分钟时间戳
    this.currentTimestamp = null;
    this.dailyTradesCount = new Map(); // 记录每日交易次数：date -> count
    
    // 技术指标缓存
    this.indicators = {
      rsi: new Map(), // ts_code -> RSI值
      macd: new Map(), // ts_code -> {macd, signal, histogram}
      ma: new Map(),   // ts_code -> {ma5, ma10, ma20}
      volume: new Map() // ts_code -> 成交量相关指标
    };
  }
  
  /**
   * 获取指定日期范围内的交易日
   * @param {string} startDate - 开始日期 YYYY-MM-DD
   * @param {string} endDate - 结束日期 YYYY-MM-DD
   * @returns {Array} 交易日数组
   */
  async getTradingDates(startDate, endDate) {
    try {
      // 转换日期格式 YYYY-MM-DD -> YYYYMMDD
      const startDateDb = startDate.replace(/-/g, '');
      const endDateDb = endDate.replace(/-/g, '');
      
      const query = `
        SELECT DISTINCT trade_date 
        FROM stock_minute 
        WHERE trade_date BETWEEN ? AND ?
        ORDER BY trade_date ASC
      `;
      
      console.log(`[分钟回测] 查询交易日: ${startDateDb} 到 ${endDateDb}`);
      const rows = await this.db.allPromise(query, [startDateDb, endDateDb]);
      console.log(`[分钟回测] 查询结果: 找到 ${rows.length} 个交易日`);
      
      // 转换回 YYYY-MM-DD 格式
      return rows.map(row => {
        const dateStr = String(row.trade_date);
        if (dateStr.length === 8) {
          return `${dateStr.substr(0, 4)}-${dateStr.substr(4, 2)}-${dateStr.substr(6, 2)}`;
        }
        return dateStr;
      }).filter(date => date);
    } catch (error) {
      console.error(`[分钟回测] 查询交易日失败:`, error.message);
      return [];
    }
  }
  
  /**
   * 获取指定日期和时间的分钟线数据
   * @param {string} date - 日期 YYYY-MM-DD
   * @param {string} time - 时间 HH:MM:SS (可选)
   * @returns {Array} 分钟线数据
   */
  async getMinuteData(date, time = null) {
    try {
      // 转换日期格式 YYYY-MM-DD -> YYYYMMDD
      const dateDb = date.replace(/-/g, '');
      
      let query = `
        SELECT 
          ts_code,
          trade_date,
          trade_time,
          open,
          high,
          low,
          close,
          pre_close,
          change,
          pct_change,
          vol,
          amount
        FROM stock_minute 
        WHERE trade_date = ?
      `;
      
      const params = [dateDb];
      
      if (time) {
        query += ` AND trade_time = ?`;
        params.push(time);
      }
      
      query += ` ORDER BY trade_time ASC`;
      
      const rows = await this.db.allPromise(query, params);
      return rows || [];
    } catch (error) {
      console.error(`[分钟回测] 获取分钟线数据失败 (${date}${time ? ' ' + time : ''}):`, error.message);
      return [];
    }
  }
  
  /**
   * 获取指定股票的历史分钟线数据（用于技术指标计算）
   * @param {string} tsCode - 股票代码
   * @param {string} date - 日期 YYYY-MM-DD
   * @param {string} time - 时间 HH:MM:SS
   * @param {number} lookback - 回溯周期数
   * @returns {Array} 历史分钟线数据
   */
  async getHistoricalMinuteData(tsCode, date, time, lookback = 20) {
    try {
      const dateDb = date.replace(/-/g, '');
      
      // 获取当前时间点之前的最近N条数据
      const query = `
        SELECT 
          trade_time,
          close,
          vol,
          amount
        FROM stock_minute 
        WHERE ts_code = ? 
          AND trade_date = ?
          AND trade_time <= ?
        ORDER BY trade_time DESC
        LIMIT ?
      `;
      
      const rows = await this.db.allPromise(query, [tsCode, dateDb, time, lookback]);
      return rows.reverse() || []; // 反转以保持时间顺序
    } catch (error) {
      console.error(`[分钟回测] 获取历史数据失败 (${tsCode} ${date} ${time}):`, error.message);
      return [];
    }
  }
  
  /**
   * 计算分钟线技术指标
   * @param {string} tsCode - 股票代码
   * @param {Array} prices - 价格序列
   * @param {Array} volumes - 成交量序列
   * @param {Object} config - 指标配置
   * @returns {Object} 技术指标
   */
  calculateTechnicalIndicators(tsCode, prices, volumes, config = {}) {
    if (prices.length < 20) {
      return {
        rsi: 50,
        macd: { macd: 0, signal: 0, histogram: 0 },
        ma: { ma5: prices[prices.length - 1] || 0, ma10: prices[prices.length - 1] || 0, ma20: prices[prices.length - 1] || 0 },
        volume: { avgVolume: volumes[volumes.length - 1] || 0, volumeRatio: 1 }
      };
    }
    
    // 1. 计算RSI (14周期)
    const rsiPeriod = config.rsiPeriod || 14;
    const rsi = this.calculateRSI(prices, rsiPeriod);
    
    // 2. 计算MACD (12, 26, 9)
    const macd = this.calculateMACD(prices);
    
    // 3. 计算移动平均线
    const ma = {
      ma5: this.calculateMA(prices, 5),
      ma10: this.calculateMA(prices, 10),
      ma20: this.calculateMA(prices, 20)
    };
    
    // 4. 计算成交量指标
    const volume = {
      avgVolume: this.calculateMA(volumes, 20),
      volumeRatio: volumes[volumes.length - 1] / (this.calculateMA(volumes, 20) || 1)
    };
    
    return { rsi, macd, ma, volume };
  }
  
  /**
   * 计算RSI指标
   * @param {Array} prices - 价格序列
   * @param {number} period - 周期
   * @returns {number} RSI值
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    // 计算第一期
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // 计算后续
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        avgGain = (avgGain * (period - 1) + change) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
      }
    }
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  /**
   * 计算MACD指标
   * @param {Array} prices - 价格序列
   * @returns {Object} MACD指标
   */
  calculateMACD(prices) {
    if (prices.length < 35) {
      return { macd: 0, signal: 0, histogram: 0 };
    }
    
    // 计算EMA12
    let ema12 = prices[0];
    const alpha12 = 2 / (12 + 1);
    for (let i = 1; i < prices.length; i++) {
      ema12 = prices[i] * alpha12 + ema12 * (1 - alpha12);
    }
    
    // 计算EMA26
    let ema26 = prices[0];
    const alpha26 = 2 / (26 + 1);
    for (let i = 1; i < prices.length; i++) {
      ema26 = prices[i] * alpha26 + ema26 * (1 - alpha26);
    }
    
    // 计算MACD线
    const macd = ema12 - ema26;
    
    // 计算信号线（EMA9 of MACD）
    const macdValues = [];
    let tempEma12 = prices[0];
    let tempEma26 = prices[0];
    for (let i = 1; i < prices.length; i++) {
      tempEma12 = prices[i] * alpha12 + tempEma12 * (1 - alpha12);
      tempEma26 = prices[i] * alpha26 + tempEma26 * (1 - alpha26);
      macdValues.push(tempEma12 - tempEma26);
    }
    
    let signal = macdValues[0] || 0;
    const alphaSignal = 2 / (9 + 1);
    for (let i = 1; i < macdValues.length; i++) {
      signal = macdValues[i] * alphaSignal + signal * (1 - alphaSignal);
    }
    
    const histogram = macd - signal;
    
    return { macd, signal, histogram };
  }
  
  /**
   * 计算移动平均线
   * @param {Array} values - 数值序列
   * @param {number} period - 周期
   * @returns {number} 移动平均值
   */
  calculateMA(values, period) {
    if (values.length < period) {
      return values.length > 0 ? values[values.length - 1] : 0;
    }
    
    const slice = values.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }
  
  /**
   * 计算手续费
   * @param {number} amount - 交易金额
   * @param {boolean} isBuy - 是否为买入
   * @returns {number} 手续费
   */
  calculateCommission(amount, isBuy = true) {
    const commission = amount * this.config.commissionRate;
    return Math.max(commission, this.config.minCommission);
  }
  
  /**
   * 执行买入操作
   * @param {Object} stock - 股票信息
   * @param {number} price - 买入价格
   * @param {number} shares - 买入股数
   * @param {string} date - 交易日期
   * @param {string} time - 交易时间
   */
  executeBuy(stock, price, shares, date, time) {
    if (shares <= 0 || price <= 0) {
      return false;
    }
    
    const amount = price * shares;
    
    // 检查每日交易次数限制
    const dailyCount = this.dailyTradesCount.get(date) || 0;
    if (dailyCount >= this.config.maxDailyTrades) {
      console.log(`[分钟回测] ${date} 已达到每日最大交易次数限制 (${this.config.maxDailyTrades})`);
      return false;
    }
    
    // 检查持仓限制
    if (this.positions.size >= this.config.positionLimit && !this.positions.has(stock.ts_code)) {
      console.log(`[分钟回测] 已达到最大持仓限制 (${this.config.positionLimit})`);
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
      reason: stock.reason || 'minute_strategy'
    });
    
    // 更新每日交易计数
    this.dailyTradesCount.set(date, dailyCount + 1);
    
    return true;
  }
  
  /**
   * 执行卖出操作
   * @param {Object} position - 持仓信息
   * @param {number} price - 卖出价格
   * @param {string} date - 交易日期
   * @param {string} time - 交易时间
   * @param {string} reason - 卖出原因
   */
  executeSell(position, price, date, time, reason = 'minute_strategy') {
    if (position.shares <= 0 || price <= 0) {
      return false;
    }
    
    // 检查每日交易次数限制
    const dailyCount = this.dailyTradesCount.get(date) || 0;
    if (dailyCount >= this.config.maxDailyTrades) {
      console.log(`[分钟回测] ${date} 已达到每日最大交易次数限制 (${this.config.maxDailyTrades})`);
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
      reason
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
      return Math.round((exit - entry) / (1000 * 60)); // 返回分钟数
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * 根据策略生成交易信号
   * @param {Object} stock - 股票数据
   * @param {Object} indicators - 技术指标
   * @param {Object} strategy - 策略配置
   * @returns {string} 交易信号: 'buy', 'sell', 'hold'
   */
  generateTradeSignal(stock, indicators, strategy) {
    // 这里调用具体的策略模块
    // 默认实现：基于RSI的超买超卖策略
    const rsi = indicators.rsi;
    const macd = indicators.macd;
    
    // RSI策略
    if (rsi < 30 && macd.histogram > 0) {
      return 'buy';
    } else if (rsi > 70 && macd.histogram < 0) {
      return 'sell';
    }
    
    return 'hold';
  }
  
  /**
   * 计算当日资产总值
   * @param {Object} minuteData - 当前分钟线数据
   * @returns {number} 资产总值
   */
  calculateTotalAssets(minuteData) {
    let positionValue = 0;
    
    // 计算持仓价值
    for (const [tsCode, position] of this.positions) {
      // 查找该股票的当前价格
      const stockData = minuteData.find(item => item.ts_code === tsCode);
      if (stockData) {
        positionValue += stockData.close * position.shares;
      } else {
        // 如果没有当前价格，使用最近的价格（简化处理）
        positionValue += position.entryPrice * position.shares;
      }
    }
    
    return this.cash + positionValue;
  }
  
  /**
   * 运行分钟线回测
   * @param {Object} params - 回测参数
   * @returns {Object} 回测结果
   */
  async run(params = {}) {
    const {
      startDate,
      endDate,
      strategyConfig = {},
      symbols = [] // 指定股票代码，为空则使用所有可用股票
    } = params;
    
    console.log(`[分钟回测] 开始分钟线回测: ${startDate} 到 ${endDate}`);
    console.log(`[分钟回测] 策略配置:`, JSON.stringify(strategyConfig, null, 2));
    
    // 获取交易日
    this.dates = await this.getTradingDates(startDate, endDate);
    if (this.dates.length === 0) {
      throw new Error(`在 ${startDate} 到 ${endDate} 范围内未找到交易日数据`);
    }
    
    console.log(`[分钟回测] 找到 ${this.dates.length} 个交易日`);
    
    // 重置状态
    this.reset();
    
    // 遍历每个交易日
    for (let dayIdx = 0; dayIdx < this.dates.length; dayIdx++) {
      const date = this.dates[dayIdx];
      this.dailyTradesCount.set(date, 0); // 初始化每日交易计数
      
      // 获取该交易日所有时间点
      const minuteTimes = await this.getMinuteTimes(date);
      if (minuteTimes.length === 0) {
        console.warn(`[分钟回测] ${date} 无分钟线数据，跳过`);
        continue;
      }
      
      console.log(`[分钟回测] ${date} 有 ${minuteTimes.length} 个分钟时间点`);
      
      // 遍历每个分钟时间点
      for (let timeIdx = 0; timeIdx < minuteTimes.length; timeIdx++) {
        const time = minuteTimes[timeIdx];
        this.currentTimestamp = { date, time };
        
        // 获取当前分钟线的所有股票数据
        const minuteData = await this.getMinuteData(date, time);
        if (minuteData.length === 0) {
          continue;
        }
        
        // 过滤指定的股票代码
        const filteredData = symbols.length > 0 
          ? minuteData.filter(item => symbols.includes(item.ts_code))
          : minuteData;
        
        // 处理每只股票
        for (const stock of filteredData) {
          // 获取历史数据计算技术指标
          const historicalData = await this.getHistoricalMinuteData(stock.ts_code, date, time, 50);
          if (historicalData.length < 20) {
            continue; // 数据不足，跳过
          }
          
          const prices = historicalData.map(d => d.close);
          const volumes = historicalData.map(d => d.vol);
          
          // 计算技术指标
          const indicators = this.calculateTechnicalIndicators(stock.ts_code, prices, volumes, strategyConfig);
          
          // 生成交易信号
          const signal = this.generateTradeSignal(stock, indicators, strategyConfig);
          
          // 执行交易
          const position = this.positions.get(stock.ts_code);
          
          if (signal === 'buy' && !position) {
            // 买入信号且无持仓
            const shares = Math.floor((this.cash * 0.2) / stock.close); // 使用20%资金
            if (shares > 0) {
              this.executeBuy(stock, stock.close, shares, date, time);
            }
          } else if (signal === 'sell' && position) {
            // 卖出信号且有持仓
            this.executeSell(position, stock.close, date, time, 'strategy_signal');
          }
        }
        
        // 记录权益曲线（每分钟记录一次）
        const totalAssets = this.calculateTotalAssets(minuteData);
        this.equityCurve.push(totalAssets);
        
        // 计算分钟收益率
        if (this.equityCurve.length > 1) {
          const minuteReturn = (totalAssets - this.equityCurve[this.equityCurve.length - 2]) / this.equityCurve[this.equityCurve.length - 2];
          this.minuteReturns.push(minuteReturn);
        }
      }
      
      // 收盘前强制平仓（如果不允许隔夜持仓）
      if (strategyConfig.closePositionAtEOD !== false) {
        await this.closeAllPositionsAtEOD(date, minuteTimes[minuteTimes.length - 1]);
      }
      
      // 进度日志
      const progress = ((dayIdx + 1) / this.dates.length * 100).toFixed(1);
      if (dayIdx % 5 === 0 || dayIdx === this.dates.length - 1) {
        console.log(`[分钟回测] 进度: ${progress}% (${dayIdx + 1}/${this.dates.length})`);
        console.log(`[分钟回测] 当前持仓: ${this.positions.size} 只股票`);
        console.log(`[分钟回测] 当前现金: ${this.cash.toLocaleString()} 元`);
      }
    }
    
    // 生成回测结果
    return this.generateResults(params);
  }
  
  /**
   * 获取交易日所有分钟时间点
   * @param {string} date - 日期
   * @returns {Array} 时间点数组
   */
  async getMinuteTimes(date) {
    try {
      const dateDb = date.replace(/-/g, '');
      const query = `
        SELECT DISTINCT trade_time 
        FROM stock_minute 
        WHERE trade_date = ?
        ORDER BY trade_time ASC
      `;
      
      const rows = await this.db.allPromise(query, [dateDb]);
      return rows.map(row => row.trade_time);
    } catch (error) {
      console.error(`[分钟回测] 获取分钟时间点失败 (${date}):`, error.message);
      return [];
    }
  }
  
  /**
   * 收盘前强制平仓
   * @param {string} date - 日期
   * @param {string} lastTime - 最后时间点
   */
  async closeAllPositionsAtEOD(date, lastTime) {
    const positionsToClose = Array.from(this.positions.values());
    
    // 获取最后时间点的价格数据
    const lastMinuteData = await this.getMinuteData(date, lastTime);
    const priceMap = new Map();
    lastMinuteData.forEach(stock => {
      priceMap.set(stock.ts_code, stock.close);
    });
    
    // 平仓所有持仓
    for (const position of positionsToClose) {
      const price = priceMap.get(position.ts_code) || position.entryPrice;
      this.executeSell(position, price, date, lastTime, 'eod_close');
    }
  }
  
  /**
   * 重置回测状态
   */
  reset() {
    this.equityCurve = [this.config.initialCapital];
    this.minuteReturns = [];
    this.trades = [];
    this.positions.clear();
    this.cash = this.config.initialCapital;
    this.dates = [];
    this.minuteTimestamps = [];
    this.currentTimestamp = null;
    this.dailyTradesCount.clear();
    
    // 重置技术指标缓存
    this.indicators.rsi.clear();
    this.indicators.macd.clear();
    this.indicators.ma.clear();
    this.indicators.volume.clear();
  }
  
  /**
   * 生成回测结果
   * @param {Object} params - 回测参数
   * @returns {Object} 回测结果
   */
  generateResults(params) {
    const initialCapital = this.config.initialCapital;
    const finalCapital = this.equityCurve[this.equityCurve.length - 1] || initialCapital;
    const tradingMinutes = this.minuteReturns.length;
    const tradingDays = this.dates.length;
    
    // 计算绩效指标
    const performanceReport = performance.calculatePerformanceReport({
      equityCurve: this.equityCurve,
      dailyReturns: this.minuteReturns, // 使用分钟收益率
      trades: this.trades,
      initialCapital,
      finalCapital,
      tradingDays: Math.ceil(tradingMinutes / 240) // 估算交易日数（假设每天240分钟）
    });
    
    // 计算分钟线特有的指标
    const minuteStats = this.calculateMinuteStats();
    
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
        totalTrades: performanceReport.totalTrades,
        tradingDays,
        tradingMinutes,
        avgDailyTrades: this.calculateAvgDailyTrades(),
        avgHoldingPeriod: this.calculateAvgHoldingPeriod(),
        intradayTrades: this.countIntradayTrades(),
        ...minuteStats
      },
      details: {
        equityCurve: this.equityCurve,
        minuteReturns: this.minuteReturns,
        trades: this.trades,
        positions: Array.from(this.positions.values()),
        dates: this.dates,
        minuteTimestamps: this.minuteTimestamps
      },
      performance: performanceReport
    };
  }
  
  /**
   * 计算分钟线特有的统计指标
   */
  calculateMinuteStats() {
    if (this.trades.length === 0) {
      return {
        avgTradeDuration: 0,
        winRateByDuration: {},
        profitByTimeOfDay: {}
      };
    }
    
    // 计算平均交易持续时间（分钟）
    const durations = this.trades
      .filter(t => t.holdingPeriod)
      .map(t => t.holdingPeriod);
    const avgDuration = durations.length > 0 
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
      : 0;
    
    // 按持续时间分类的胜率
    const winRateByDuration = {};
    const durationGroups = {
      '超短线(<30分钟)': t => t.holdingPeriod < 30,
      '短线(30-120分钟)': t => t.holdingPeriod >= 30 && t.holdingPeriod < 120,
      '中线(2-4小时)': t => t.holdingPeriod >= 120 && t.holdingPeriod < 240,
      '全天持仓': t => t.holdingPeriod >= 240
    };
    
    for (const [groupName, filterFn] of Object.entries(durationGroups)) {
      const groupTrades = this.trades.filter(t => t.exitDate && filterFn(t));
      if (groupTrades.length > 0) {
        const winningTrades = groupTrades.filter(t => t.return > 0);
        winRateByDuration[groupName] = winningTrades.length / groupTrades.length;
      }
    }
    
    // 按交易时间分析收益
    const profitByTimeOfDay = {};
    this.trades.forEach(trade => {
      if (trade.time) {
        const hour = parseInt(trade.time.split(':')[0]);
        const timeSlot = `${hour}:00-${hour + 1}:00`;
        profitByTimeOfDay[timeSlot] = (profitByTimeOfDay[timeSlot] || 0) + (trade.returnAmount || 0);
      }
    });
    
    return {
      avgTradeDuration: avgDuration,
      winRateByDuration,
      profitByTimeOfDay
    };
  }
  
  /**
   * 计算平均每日交易次数
   */
  calculateAvgDailyTrades() {
    const days = Array.from(this.dailyTradesCount.keys());
    if (days.length === 0) return 0;
    
    const totalTrades = Array.from(this.dailyTradesCount.values())
      .reduce((sum, count) => sum + count, 0);
    return totalTrades / days.length;
  }
  
  /**
   * 计算平均持仓周期
   */
  calculateAvgHoldingPeriod() {
    const tradesWithHoldingPeriod = this.trades.filter(t => t.holdingPeriod);
    if (tradesWithHoldingPeriod.length === 0) return 0;
    
    const totalMinutes = tradesWithHoldingPeriod
      .reduce((sum, t) => sum + t.holdingPeriod, 0);
    return totalMinutes / tradesWithHoldingPeriod.length;
  }
  
  /**
   * 统计日内交易数量
   */
  countIntradayTrades() {
    return this.trades.filter(t => 
      t.entryDate === t.exitDate && t.holdingPeriod < 240
    ).length;
  }
  
  /**
   * 批量运行回测（参数扫描）
   * @param {Object} baseParams - 基础参数
   * @param {Object} paramRanges - 参数范围
   * @returns {Array} 批量回测结果
   */
  async runBatch(baseParams, paramRanges) {
    const results = [];
    
    // 这里实现参数扫描逻辑
    // 暂时返回单个结果
    const result = await this.run(baseParams);
    results.push(result);
    
    return results;
  }
}

module.exports = MinuteBacktest;

/**
 * 分钟线回测快捷函数
 * @param {Object} config - 回测配置
 * @returns {Promise<Object>} 回测结果
 */
async function runMinuteBacktest(config) {
  const engine = new MinuteBacktest(config);
  return engine.run({
    startDate: config.startDate,
    endDate: config.endDate,
    strategyConfig: config.strategy,
    symbols: config.stocks,
    ...config
  });
}

module.exports.runMinuteBacktest = runMinuteBacktest;