/**
 * 均线金叉死叉策略（5 分钟线）
 * 金叉买入：短均线上穿长均线
 * 死叉卖出：短均线下穿长均线
 */

/**
 * 计算简单移动平均
 * @param {Array} data - 价格数据
 * @param {number} period - 周期
 * @returns {Array} MA 值数组
 */
function calculateSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

/**
 * 生成买卖信号
 * @param {Array} minuteData - 分钟线数据 [{open, high, low, close, volume, timestamp}]
 * @param {Object} options - 策略选项
 * @returns {Array} 信号数组 [{type: 'buy'|'sell', price, timestamp, reason}]
 */
function generateSignals(minuteData, options = {}) {
  const { shortPeriod = 5, longPeriod = 20 } = options;
  const signals = [];
  
  if (minuteData.length < longPeriod) {
    return signals;
  }
  
  // 提取收盘价
  const closes = minuteData.map(d => d.close);
  
  // 计算均线
  const shortMA = calculateSMA(closes, shortPeriod);
  const longMA = calculateSMA(closes, longPeriod);
  
  // 检测金叉死叉
  for (let i = longPeriod; i < minuteData.length; i++) {
    const prevShortMA = shortMA[i - 1];
    const prevLongMA = longMA[i - 1];
    const currShortMA = shortMA[i];
    const currLongMA = longMA[i];
    
    if (prevShortMA && prevLongMA && currShortMA && currLongMA) {
      // 金叉：短均线上穿长均线
      if (prevShortMA <= prevLongMA && currShortMA > currLongMA) {
        signals.push({
          type: 'buy',
          price: minuteData[i].close,
          timestamp: minuteData[i].timestamp,
          reason: `均线金叉 (${shortPeriod}上穿${longPeriod})`
        });
      }
      // 死叉：短均线下穿长均线
      else if (prevShortMA >= prevLongMA && currShortMA < currLongMA) {
        signals.push({
          type: 'sell',
          price: minuteData[i].close,
          timestamp: minuteData[i].timestamp,
          reason: `均线死叉 (${shortPeriod}下穿${longPeriod})`
        });
      }
    }
  }
  
  return signals;
}

module.exports = { generateSignals, calculateSMA };
