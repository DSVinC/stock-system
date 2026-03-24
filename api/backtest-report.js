/**
 * 回测绩效计算模块
 * TASK_V3_104 - 7 指标计算模块
 *
 * 计算 7 个核心绩效指标：
 * 1. 总收益率
 * 2. 年化收益率
 * 3. 夏普比率
 * 4. 最大回撤
 * 5. 波动率
 * 6. 胜率
 * 7. 交易次数
 */

/**
 * 绩效指标计算类
 */
class PerformanceMetrics {
  /**
   * @param {Array} trades - 交易记录数组
   * @param {number} initialCapital - 初始资金
   * @param {number} riskFreeRate - 无风险利率（年化，默认 0.03）
   */
  constructor(trades, initialCapital, riskFreeRate = 0.03) {
    this.trades = trades || [];
    this.initialCapital = initialCapital > 0 ? initialCapital : 1;
    this.riskFreeRate = riskFreeRate;

    // 从交易数据提取收益率序列
    this.tradeReturns = this.trades.map(t => t.return || 0);

    // 计算最终资金
    this.finalCapital = this.initialCapital;
    if (this.trades.length > 0) {
      const totalReturn = this.tradeReturns.reduce((a, b) => a + b, 0);
      this.finalCapital = this.initialCapital * (1 + totalReturn);
    }
  }

  /**
   * 计算总收益率
   * 公式: (期末值 - 期初值) / 期初值
   * @returns {number} 总收益率
   */
  calculateTotalReturn() {
    // 如果原始初始资金为 0 或负数，返回 0
    if (!this.initialCapital || this.initialCapital <= 0) return 0;
    return (this.finalCapital - this.initialCapital) / this.initialCapital;
  }

  /**
   * 计算年化收益率
   * 公式: (1 + 总收益率)^(365/天数) - 1
   * @param {number} tradingDays - 交易天数
   * @returns {number} 年化收益率
   */
  calculateAnnualizedReturn(tradingDays = 252) {
    if (tradingDays <= 0) return 0;

    const totalReturn = this.calculateTotalReturn();
    const years = tradingDays / 365;

    if (years <= 0) return 0;

    return Math.pow(1 + totalReturn, 1 / years) - 1;
  }

  /**
   * 计算夏普比率
   * 公式: (年化收益率 - 无风险利率) / 波动率
   * @param {Array} dailyReturns - 日收益率序列
   * @returns {number} 夏普比率
   */
  calculateSharpeRatio(dailyReturns = []) {
    if (!dailyReturns || dailyReturns.length === 0) return 0;

    const dailyRiskFreeRate = Math.pow(1 + this.riskFreeRate, 1 / 252) - 1;
    const excessReturns = dailyReturns.map(r => r - dailyRiskFreeRate);

    const meanExcessReturn = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const variance = excessReturns.reduce((sum, r) => sum + Math.pow(r - meanExcessReturn, 2), 0) / excessReturns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // 年化夏普比率
    return (meanExcessReturn / stdDev) * Math.sqrt(252);
  }

  /**
   * 计算最大回撤
   * 公式: max((峰值 - 谷值) / 峰值)
   * @param {Array} equityCurve - 权益曲线序列
   * @returns {number} 最大回撤（正数）
   */
  calculateMaxDrawdown(equityCurve = []) {
    if (!equityCurve || equityCurve.length === 0) return 0;

    let maxEquity = equityCurve[0];
    let maxDrawdown = 0;

    for (let i = 1; i < equityCurve.length; i++) {
      if (equityCurve[i] > maxEquity) {
        maxEquity = equityCurve[i];
      }

      const drawdown = (maxEquity - equityCurve[i]) / maxEquity;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * 计算波动率
   * 公式: std(日收益率) × √252
   * @param {Array} dailyReturns - 日收益率序列
   * @returns {number} 年化波动率
   */
  calculateVolatility(dailyReturns = []) {
    if (!dailyReturns || dailyReturns.length < 2) return 0;

    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);

    // 年化波动率
    return stdDev * Math.sqrt(252);
  }

  /**
   * 计算胜率
   * 公式: 盈利交易次数 / 总交易次数
   * @returns {number} 胜率 (0-1)
   */
  calculateWinRate() {
    if (this.trades.length === 0) return 0;

    const winCount = this.tradeReturns.filter(r => r > 0).length;
    return winCount / this.trades.length;
  }

  /**
   * 计算交易次数
   * @returns {number} 交易次数
   */
  calculateTradeCount() {
    return this.trades.length;
  }

  /**
   * 获取所有绩效指标
   * @param {Object} options - 计算选项
   * @param {number} options.tradingDays - 交易天数
   * @param {Array} options.dailyReturns - 日收益率序列
   * @param {Array} options.equityCurve - 权益曲线
   * @returns {Object} 所有绩效指标
   */
  getAllMetrics(options = {}) {
    const { tradingDays = 252, dailyReturns = [], equityCurve = [] } = options;

    return {
      totalReturn: this.calculateTotalReturn(),
      annualizedReturn: this.calculateAnnualizedReturn(tradingDays),
      sharpeRatio: this.calculateSharpeRatio(dailyReturns),
      maxDrawdown: this.calculateMaxDrawdown(equityCurve),
      volatility: this.calculateVolatility(dailyReturns),
      winRate: this.calculateWinRate(),
      tradeCount: this.calculateTradeCount()
    };
  }
}

// ==================== 辅助函数（保持向后兼容）====================

/**
 * 计算夏普比率
 * @param {Array} returns - 收益率序列（日收益率）
 * @param {number} riskFreeRate - 无风险利率（年化，默认0.03）
 * @returns {number} 夏普比率
 */
function calculateSharpeRatio(returns, riskFreeRate = 0.03) {
  if (!returns || returns.length === 0) return 0;

  const dailyRiskFreeRate = Math.pow(1 + riskFreeRate, 1 / 252) - 1;
  const excessReturns = returns.map(r => r - dailyRiskFreeRate);

  const meanExcessReturn = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
  const variance = excessReturns.reduce((sum, r) => sum + Math.pow(r - meanExcessReturn, 2), 0) / excessReturns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  return meanExcessReturn / stdDev * Math.sqrt(252);
}

/**
 * 计算最大回撤
 * @param {Array} equityCurve - 权益曲线序列
 * @returns {Object} 最大回撤信息 {maxDrawdown, startIndex, endIndex}
 */
function calculateMaxDrawdown(equityCurve) {
  if (!equityCurve || equityCurve.length === 0) {
    return { maxDrawdown: 0, startIndex: -1, endIndex: -1 };
  }

  let maxEquity = equityCurve[0];
  let maxDrawdown = 0;
  let drawdownStartIndex = 0;
  let drawdownEndIndex = 0;
  let currentStartIndex = 0;

  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i] > maxEquity) {
      maxEquity = equityCurve[i];
      currentStartIndex = i;
    }

    const drawdown = (maxEquity - equityCurve[i]) / maxEquity;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      drawdownStartIndex = currentStartIndex;
      drawdownEndIndex = i;
    }
  }

  return {
    maxDrawdown,
    startIndex: drawdownStartIndex,
    endIndex: drawdownEndIndex
  };
}

/**
 * 计算年化收益率
 * @param {number} totalReturn - 总收益率
 * @param {number} tradingDays - 交易天数
 * @returns {number} 年化收益率
 */
function calculateAnnualizedReturn(totalReturn, tradingDays) {
  if (tradingDays <= 0) return 0;

  const years = tradingDays / 365;
  if (years <= 0) return 0;

  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

/**
 * 计算波动率
 * @param {Array} dailyReturns - 日收益率序列
 * @returns {number} 年化波动率
 */
function calculateVolatility(dailyReturns) {
  if (!dailyReturns || dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  return stdDev * Math.sqrt(252);
}

/**
 * 计算胜率
 * @param {Array} tradeReturns - 每笔交易的收益率数组
 * @returns {Object} 胜率信息 {winRate, winCount, totalTrades}
 */
function calculateWinRate(tradeReturns) {
  if (!tradeReturns || tradeReturns.length === 0) {
    return { winRate: 0, winCount: 0, totalTrades: 0 };
  }

  const winCount = tradeReturns.filter(r => r > 0).length;
  const totalTrades = tradeReturns.length;
  const winRate = winCount / totalTrades;

  return { winRate, winCount, totalTrades };
}

/**
 * 计算盈亏比
 * @param {Array} tradeReturns - 每笔交易的收益率数组
 * @returns {Object} 盈亏比信息 {profitLossRatio, avgWin, avgLoss}
 */
function calculateProfitLossRatio(tradeReturns) {
  if (!tradeReturns || tradeReturns.length === 0) {
    return { profitLossRatio: 0, avgWin: 0, avgLoss: 0 };
  }

  const winningTrades = tradeReturns.filter(r => r > 0);
  const losingTrades = tradeReturns.filter(r => r < 0);

  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((a, b) => a + b, 0) / winningTrades.length
    : 0;

  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((a, b) => a + b, 0) / losingTrades.length)
    : 0;

  const profitLossRatio = avgLoss === 0 ? (avgWin > 0 ? Infinity : 0) : avgWin / avgLoss;

  return { profitLossRatio, avgWin, avgLoss };
}

/**
 * 计算卡玛比率
 * @param {number} annualizedReturn - 年化收益率
 * @param {number} maxDrawdown - 最大回撤
 * @returns {number} 卡玛比率
 */
function calculateCalmarRatio(annualizedReturn, maxDrawdown) {
  if (maxDrawdown === 0) return annualizedReturn > 0 ? Infinity : 0;
  return annualizedReturn / maxDrawdown;
}

/**
 * 计算索提诺比率
 * @param {Array} returns - 收益率序列
 * @param {number} targetReturn - 目标收益率（默认0）
 * @returns {number} 索提诺比率
 */
function calculateSortinoRatio(returns, targetReturn = 0) {
  if (!returns || returns.length === 0) return 0;

  const downsideReturns = returns
    .map(r => r - targetReturn)
    .filter(r => r < 0);

  if (downsideReturns.length === 0) return 0;

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const downsideVariance = downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);

  if (downsideDeviation === 0) return 0;

  return (meanReturn - targetReturn) / downsideDeviation * Math.sqrt(252);
}

/**
 * 计算交易统计
 * @param {Array} trades - 交易记录数组
 * @returns {Object} 交易统计信息
 */
function calculateTradeStatistics(trades) {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgTradeReturn: 0,
      avgHoldingDays: 0,
      totalCommission: 0
    };
  }

  const winningTrades = trades.filter(t => t.return > 0);
  const losingTrades = trades.filter(t => t.return < 0);

  const totalReturn = trades.reduce((sum, t) => sum + t.return, 0);
  const totalCommission = trades.reduce((sum, t) => sum + (t.commission || 0), 0);

  // 计算平均持仓天数
  const holdingDays = trades.map(t => {
    if (t.entryDate && t.exitDate) {
      const entry = new Date(t.entryDate);
      const exit = new Date(t.exitDate);
      return Math.max(1, Math.floor((exit - entry) / (1000 * 60 * 60 * 24)));
    }
    return 0;
  }).filter(d => d > 0);

  const avgHoldingDays = holdingDays.length > 0
    ? holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length
    : 0;

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgTradeReturn: totalReturn / trades.length,
    avgHoldingDays,
    totalCommission
  };
}

/**
 * 计算完整的回测绩效报告
 * @param {Object} backtestData - 回测数据
 * @param {Array} backtestData.equityCurve - 权益曲线
 * @param {Array} backtestData.dailyReturns - 日收益率序列
 * @param {Array} backtestData.trades - 交易记录
 * @param {number} backtestData.initialCapital - 初始资金
 * @param {number} backtestData.finalCapital - 最终资金
 * @param {number} backtestData.tradingDays - 交易天数
 * @returns {Object} 完整的绩效报告
 */
function calculatePerformanceReport(backtestData) {
  const {
    equityCurve = [],
    dailyReturns = [],
    trades = [],
    initialCapital = 1,
    finalCapital = 1,
    tradingDays = 252
  } = backtestData;

  // 基础收益计算
  const totalReturn = (finalCapital - initialCapital) / initialCapital;
  const annualizedReturn = calculateAnnualizedReturn(totalReturn, tradingDays);

  // 风险指标
  const maxDrawdownInfo = calculateMaxDrawdown(equityCurve);
  const sharpeRatio = calculateSharpeRatio(dailyReturns);
  const sortinoRatio = calculateSortinoRatio(dailyReturns);
  const calmarRatio = calculateCalmarRatio(annualizedReturn, maxDrawdownInfo.maxDrawdown);
  const volatility = calculateVolatility(dailyReturns);

  // 交易统计
  const tradeReturns = trades.map(t => t.return || 0);
  const winRateInfo = calculateWinRate(tradeReturns);
  const profitLossInfo = calculateProfitLossRatio(tradeReturns);
  const tradeStats = calculateTradeStatistics(trades);

  return {
    // 7 个核心指标
    totalReturn,
    annualizedReturn,
    sharpeRatio,
    maxDrawdown: maxDrawdownInfo.maxDrawdown,
    volatility,
    winRate: winRateInfo.winRate,
    tradeCount: trades.length,

    // 额外指标
    sortinoRatio,
    calmarRatio,
    profitLossRatio: profitLossInfo.profitLossRatio,
    avgWin: profitLossInfo.avgWin,
    avgLoss: profitLossInfo.avgLoss,
    dailyReturn: totalReturn / tradingDays,

    // 统计信息
    initialCapital,
    finalCapital,
    tradingDays,
    winningTrades: tradeStats.winningTrades,
    losingTrades: tradeStats.losingTrades,
    avgTradeReturn: tradeStats.avgTradeReturn,
    avgHoldingDays: tradeStats.avgHoldingDays,
    totalCommission: tradeStats.totalCommission,

    // 详细数据
    maxDrawdownInfo
  };
}

module.exports = {
  // 类
  PerformanceMetrics,

  // 函数式 API（向后兼容）
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateAnnualizedReturn,
  calculateVolatility,
  calculateWinRate,
  calculateProfitLossRatio,
  calculateCalmarRatio,
  calculateSortinoRatio,
  calculateTradeStatistics,
  calculatePerformanceReport
};