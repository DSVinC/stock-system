/**
 * RSI超买超卖策略（分钟线级别）
 * 基于RSI指标在超买超卖区域的交易策略
 */

class RSIStrategy {
  constructor(config = {}) {
    this.config = {
      rsiOverbought: config.rsiOverbought || 70,    // 超买阈值
      rsiOversold: config.rsiOversold || 30,        // 超卖阈值
      rsiPeriod: config.rsiPeriod || 14,            // RSI周期
      exitThreshold: config.exitThreshold || 50,    // 退出阈值
      useMACDConfirmation: config.useMACDConfirmation !== false, // 使用MACD确认
      useVolumeConfirmation: config.useVolumeConfirmation !== false, // 使用成交量确认
      positionSize: config.positionSize || 0.2,     // 仓位大小（资金比例）
      stopLoss: config.stopLoss || 0.05,            // 止损比例
      takeProfit: config.takeProfit || 0.1,         // 止盈比例
      maxHoldingPeriod: config.maxHoldingPeriod || 240, // 最大持仓时间（分钟）
      minRSIDivergence: config.minRSIDivergence || 5,   // 最小RSI背离幅度
      ...config
    };
    
    this.name = 'RSI超买超卖策略';
    this.description = '基于RSI指标的超买超卖区域进行交易，结合MACD和成交量确认';
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
   * 检测RSI背离
   * @param {Array} prices - 价格序列
   * @param {Array} rsiValues - RSI值序列
   * @returns {Object} 背离信息
   */
  detectRSIDivergence(prices, rsiValues) {
    if (prices.length < 10 || rsiValues.length < 10) {
      return { bullish: false, bearish: false, strength: 0 };
    }
    
    // 取最近10个数据点
    const recentPrices = prices.slice(-10);
    const recentRSI = rsiValues.slice(-10);
    
    // 寻找价格和RSI的极值点
    const priceHighs = [];
    const priceLows = [];
    const rsiHighs = [];
    const rsiLows = [];
    
    for (let i = 1; i < recentPrices.length - 1; i++) {
      // 价格高点
      if (recentPrices[i] > recentPrices[i-1] && recentPrices[i] > recentPrices[i+1]) {
        priceHighs.push({ index: i, value: recentPrices[i] });
      }
      // 价格低点
      if (recentPrices[i] < recentPrices[i-1] && recentPrices[i] < recentPrices[i+1]) {
        priceLows.push({ index: i, value: recentPrices[i] });
      }
      // RSI高点
      if (recentRSI[i] > recentRSI[i-1] && recentRSI[i] > recentRSI[i+1]) {
        rsiHighs.push({ index: i, value: recentRSI[i] });
      }
      // RSI低点
      if (recentRSI[i] < recentRSI[i-1] && recentRSI[i] < recentRSI[i+1]) {
        rsiLows.push({ index: i, value: recentRSI[i] });
      }
    }
    
    // 检测顶背离（价格创新高，RSI未创新高）
    let bearishDivergence = false;
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
      const lastPriceHigh = priceHighs[priceHighs.length - 1];
      const prevPriceHigh = priceHighs[priceHighs.length - 2];
      const lastRSIHigh = rsiHighs[rsiHighs.length - 1];
      const prevRSIHigh = rsiHighs[rsiHighs.length - 2];
      
      if (lastPriceHigh.value > prevPriceHigh.value && lastRSIHigh.value < prevRSIHigh.value) {
        bearishDivergence = true;
      }
    }
    
    // 检测底背离（价格创新低，RSI未创新低）
    let bullishDivergence = false;
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
      const lastPriceLow = priceLows[priceLows.length - 1];
      const prevPriceLow = priceLows[priceLows.length - 2];
      const lastRSILow = rsiLows[rsiLows.length - 1];
      const prevRSILow = rsiLows[rsiLows.length - 2];
      
      if (lastPriceLow.value < prevPriceLow.value && lastRSILow.value > prevRSILow.value) {
        bullishDivergence = true;
      }
    }
    
    return {
      bullish: bullishDivergence,
      bearish: bearishDivergence,
      strength: (bullishDivergence || bearishDivergence) ? 1 : 0
    };
  }
  
  /**
   * 分析成交量
   * @param {Array} volumes - 成交量序列
   * @returns {Object} 成交量分析结果
   */
  analyzeVolume(volumes) {
    if (volumes.length < 20) {
      return { avgVolume: 0, currentRatio: 1, isSpike: false };
    }
    
    // 计算20期平均成交量
    const avgVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
    const currentVolume = volumes[volumes.length - 1] || 0;
    const volumeRatio = currentVolume / (avgVolume || 1);
    
    // 判断成交量突变（超过平均值的1.5倍）
    const isSpike = volumeRatio > 1.5;
    
    return {
      avgVolume,
      currentVolume,
      volumeRatio,
      isSpike
    };
  }
  
  /**
   * 生成交易信号
   * @param {Object} stock - 股票数据
   * @param {Array} priceHistory - 价格历史序列
   * @param {Array} volumeHistory - 成交量历史序列
   * @param {Object} currentPosition - 当前持仓信息
   * @returns {Object} 交易信号
   */
  generateSignal(stock, priceHistory, volumeHistory, currentPosition = null) {
    if (priceHistory.length < this.config.rsiPeriod + 5) {
      return { action: 'hold', reason: '数据不足', confidence: 0 };
    }
    
    // 计算RSI
    const rsi = this.calculateRSI(priceHistory, this.config.rsiPeriod);
    
    // 计算MACD（如果需要确认）
    let macd = { histogram: 0 };
    if (this.config.useMACDConfirmation) {
      macd = this.calculateMACD(priceHistory);
    }
    
    // 分析成交量
    let volumeAnalysis = { isSpike: false, volumeRatio: 1 };
    if (this.config.useVolumeConfirmation) {
      volumeAnalysis = this.analyzeVolume(volumeHistory);
    }
    
    // 检测RSI背离
    const rsiValues = [];
    for (let i = this.config.rsiPeriod; i <= priceHistory.length; i++) {
      const slice = priceHistory.slice(0, i + 1);
      if (slice.length >= this.config.rsiPeriod + 1) {
        rsiValues.push(this.calculateRSI(slice, this.config.rsiPeriod));
      }
    }
    
    const divergence = this.detectRSIDivergence(priceHistory, rsiValues);
    
    // 生成信号逻辑
    let action = 'hold';
    let reason = '';
    let confidence = 0.5; // 基础置信度
    
    // 买入信号条件
    const buyConditions = [];
    if (rsi < this.config.rsiOversold) {
      buyConditions.push(`RSI超卖 (${rsi.toFixed(1)} < ${this.config.rsiOversold})`);
      confidence += 0.2;
    }
    if (this.config.useMACDConfirmation && macd.histogram > 0) {
      buyConditions.push(`MACD转强 (${macd.histogram.toFixed(4)} > 0)`);
      confidence += 0.15;
    }
    if (this.config.useVolumeConfirmation && volumeAnalysis.isSpike) {
      buyConditions.push(`成交量放大 (${volumeAnalysis.volumeRatio.toFixed(2)}倍)`);
      confidence += 0.1;
    }
    if (divergence.bullish) {
      buyConditions.push(`RSI底背离`);
      confidence += 0.15;
    }
    
    // 卖出信号条件
    const sellConditions = [];
    if (rsi > this.config.rsiOverbought) {
      sellConditions.push(`RSI超买 (${rsi.toFixed(1)} > ${this.config.rsiOverbought})`);
      confidence += 0.2;
    }
    if (this.config.useMACDConfirmation && macd.histogram < 0) {
      sellConditions.push(`MACD转弱 (${macd.histogram.toFixed(4)} < 0)`);
      confidence += 0.15;
    }
    if (divergence.bearish) {
      sellConditions.push(`RSI顶背离`);
      confidence += 0.15;
    }
    
    // 止损/止盈检查
    if (currentPosition) {
      const entryPrice = currentPosition.entryPrice;
      const currentPrice = stock.close;
      const returnRate = (currentPrice - entryPrice) / entryPrice;
      
      // 止损检查
      if (returnRate < -this.config.stopLoss) {
        action = 'sell';
        reason = `触发止损 (${(returnRate * 100).toFixed(1)}% < -${(this.config.stopLoss * 100)}%)`;
        confidence = 0.9;
      }
      // 止盈检查
      else if (returnRate > this.config.takeProfit) {
        action = 'sell';
        reason = `触发止盈 (${(returnRate * 100).toFixed(1)}% > ${(this.config.takeProfit * 100)}%)`;
        confidence = 0.9;
      }
      // 持仓时间检查
      else if (currentPosition.holdingMinutes > this.config.maxHoldingPeriod) {
        action = 'sell';
        reason = `达到最大持仓时间 (${currentPosition.holdingMinutes}分钟 > ${this.config.maxHoldingPeriod}分钟)`;
        confidence = 0.8;
      }
      // RSI退出信号
      else if (rsi > this.config.exitThreshold && rsi < this.config.rsiOverbought) {
        action = 'sell';
        reason = `RSI回升至中性区域 (${rsi.toFixed(1)} > ${this.config.exitThreshold})`;
        confidence = 0.7;
      }
    }
    
    // 如果没有止损/止盈信号，检查买入/卖出条件
    if (action === 'hold') {
      if (!currentPosition && buyConditions.length >= 2) {
        action = 'buy';
        reason = buyConditions.join(' + ');
        confidence = Math.min(0.9, confidence);
      } else if (currentPosition && sellConditions.length >= 2) {
        action = 'sell';
        reason = sellConditions.join(' + ');
        confidence = Math.min(0.9, confidence);
      }
    }
    
    // 计算仓位大小
    let positionSize = 0;
    if (action === 'buy') {
      // 根据信号强度调整仓位
      positionSize = this.config.positionSize * confidence;
    }
    
    return {
      action,
      reason,
      confidence: Math.min(0.95, Math.max(0.1, confidence)),
      indicators: {
        rsi,
        macd: macd.histogram,
        volumeRatio: volumeAnalysis.volumeRatio,
        divergence: divergence.strength
      },
      positionSize,
      stopLoss: this.config.stopLoss,
      takeProfit: this.config.takeProfit
    };
  }
  
  /**
   * 获取策略配置
   * @returns {Object} 策略配置
   */
  getConfig() {
    return {
      ...this.config,
      name: this.name,
      description: this.description
    };
  }
  
  /**
   * 更新策略配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }
  
  /**
   * 获取策略参数范围（用于参数优化）
   * @returns {Object} 参数范围
   */
  getParameterRanges() {
    return {
      rsiOverbought: { min: 60, max: 80, step: 2, default: 70 },
      rsiOversold: { min: 20, max: 40, step: 2, default: 30 },
      rsiPeriod: { min: 7, max: 21, step: 2, default: 14 },
      exitThreshold: { min: 40, max: 60, step: 5, default: 50 },
      positionSize: { min: 0.1, max: 0.5, step: 0.05, default: 0.2 },
      stopLoss: { min: 0.02, max: 0.1, step: 0.01, default: 0.05 },
      takeProfit: { min: 0.05, max: 0.2, step: 0.01, default: 0.1 },
      maxHoldingPeriod: { min: 60, max: 480, step: 30, default: 240 }
    };
  }
  
  /**
   * 验证策略参数
   * @param {Object} params - 参数
   * @returns {Object} 验证结果
   */
  validateParameters(params) {
    const errors = [];
    const warnings = [];
    
    if (params.rsiOverbought <= params.rsiOversold) {
      errors.push('超买阈值必须大于超卖阈值');
    }
    
    if (params.rsiOverbought >= 100 || params.rsiOverbought <= 0) {
      errors.push('超买阈值必须在0-100之间');
    }
    
    if (params.rsiOversold >= 100 || params.rsiOversold <= 0) {
      errors.push('超卖阈值必须在0-100之间');
    }
    
    if (params.positionSize > 1 || params.positionSize <= 0) {
      errors.push('仓位大小必须在0-1之间');
    }
    
    if (params.stopLoss >= params.takeProfit) {
      warnings.push('止损比例小于止盈比例可能影响策略收益');
    }
    
    if (params.rsiPeriod < 5) {
      warnings.push('RSI周期过短可能导致信号不稳定');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = RSIStrategy;

/**
 * RSI 策略信号生成函数（统一接口）
 * @param {Array} minuteData - 分钟线数据 [{open, high, low, close, volume, timestamp}]
 * @param {Object} options - 策略选项 {rsiOverbought, rsiOversold, rsiPeriod}
 * @returns {Array} 信号数组 [{type: 'buy'|'sell', price, timestamp, reason}]
 */
function generateSignals(minuteData, options = {}) {
  const { rsiOverbought = 70, rsiOversold = 30, rsiPeriod = 14 } = options;
  const signals = [];
  
  if (minuteData.length < rsiPeriod + 1) {
    return signals;
  }
  
  // 提取收盘价
  const closes = minuteData.map(d => d.close);
  
  // 计算 RSI
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= rsiPeriod; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }
  
  let avgGain = gains / rsiPeriod;
  let avgLoss = losses / rsiPeriod;
  const rsiValues = [50]; // 第一个 RSI 值
  
  // 计算 RSI 序列
  for (let i = rsiPeriod + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (rsiPeriod - 1) + change) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1)) / rsiPeriod;
    } else {
      avgGain = (avgGain * (rsiPeriod - 1)) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1) + Math.abs(change)) / rsiPeriod;
    }
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    rsiValues.push(rsi);
  }
  
  // 生成信号
  let inPosition = false;
  
  for (let i = rsiPeriod; i < minuteData.length; i++) {
    const rsi = rsiValues[i - rsiPeriod];
    const prevRsi = i > rsiPeriod ? rsiValues[i - rsiPeriod - 1] : 50;
    
    // RSI 从超卖区回升到 30 以上，买入
    if (!inPosition && prevRsi < rsiOversold && rsi >= rsiOversold) {
      signals.push({
        type: 'buy',
        price: minuteData[i].close,
        timestamp: minuteData[i].timestamp,
        reason: `RSI 超卖反弹 (RSI=${rsi.toFixed(1)} >= ${rsiOversold})`
      });
      inPosition = true;
    }
    // RSI 从超买区回落到 70 以下，卖出
    else if (inPosition && prevRsi > rsiOverbought && rsi <= rsiOverbought) {
      signals.push({
        type: 'sell',
        price: minuteData[i].close,
        timestamp: minuteData[i].timestamp,
        reason: `RSI 超买回落 (RSI=${rsi.toFixed(1)} <= ${rsiOverbought})`
      });
      inPosition = false;
    }
  }
  
  return signals;
}

module.exports.generateSignals = generateSignals;