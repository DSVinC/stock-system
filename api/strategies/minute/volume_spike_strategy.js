/**
 * 成交量突变策略（5 分钟线）
 * 量比 > 2 时跟进（成交量显著放大）
 */

/**
 * 计算量比
 * @param {Array} volumes - 成交量数据
 * @param {number} period - 平均周期
 * @returns {Array} 量比数组
 */
function calculateVolumeRatio(volumes, period = 20) {
  const result = [];
  for (let i = 0; i < volumes.length; i++) {
    if (i < period) {
      result.push(1);
      continue;
    }
    const avgVolume = volumes.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    const ratio = avgVolume > 0 ? volumes[i] / avgVolume : 1;
    result.push(ratio);
  }
  return result;
}

/**
 * 生成买卖信号
 * @param {Array} minuteData - 分钟线数据 [{open, high, low, close, volume, timestamp}]
 * @param {Object} options - 策略选项
 * @returns {Array} 信号数组 [{type: 'buy'|'sell', price, timestamp, reason, volumeRatio}]
 */
function generateSignals(minuteData, options = {}) {
  const { volumeRatioThreshold = 2.0, period = 20 } = options;
  const signals = [];
  
  if (minuteData.length < period + 1) {
    return signals;
  }
  
  // 提取成交量和收盘价
  const volumes = minuteData.map(d => d.volume);
  const closes = minuteData.map(d => d.close);
  
  // 计算量比
  const volumeRatios = calculateVolumeRatio(volumes, period);
  
  // 检测成交量突变
  for (let i = period + 1; i < minuteData.length; i++) {
    const prevRatio = volumeRatios[i - 1];
    const currRatio = volumeRatios[i];
    
    // 量比突破阈值（从低于阈值到高于阈值）
    if (prevRatio < volumeRatioThreshold && currRatio >= volumeRatioThreshold) {
      // 价格上涨时买入，价格下跌时卖出
      const priceChange = closes[i] - closes[i - 1];
      if (priceChange > 0) {
        signals.push({
          type: 'buy',
          price: closes[i],
          timestamp: minuteData[i].timestamp,
          volumeRatio: currRatio,
          reason: `成交量突变 (量比${currRatio.toFixed(2)} > ${volumeRatioThreshold})`
        });
      } else {
        signals.push({
          type: 'sell',
          price: closes[i],
          timestamp: minuteData[i].timestamp,
          volumeRatio: currRatio,
          reason: `成交量突变 (量比${currRatio.toFixed(2)} > ${volumeRatioThreshold})`
        });
      }
    }
  }
  
  return signals;
}

module.exports = { generateSignals, calculateVolumeRatio };
