/**
 * TASK_V3_003 - Top3 行业内个股 7 因子评分
 *
 * 对行业内所有股票计算 7 因子评分：
 * - 技术面（RSI、MACD、均线）
 * - 基本面（ROE、营收增长、净利润增长）
 * - 资金面（主力净流入、换手率）
 * - 估值面（PE/PB 分位数）
 * - 市场情绪（行业热度）
 * - 风险控制（波动率、回撤）
 * - 舆情面（负面新闻、黑天鹅）
 */

const { createRequire } = require('node:module');

const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');

const {
  toNumber,
  tushareRequest,
  getDailyHistory,
  getLatestDailyBasic,
  getFinaIndicatorRows,
  getIncomeRows,
  getMoneyflowThsRows,
  getMoneyflowRows,
  getATR,
  getStockPePercentile,
  getIndustryPeMedian,
  calculateTechnicalIndicators,
  analyzeTechnical,
  formatDate
} = require('./market-data');

const {
  calculateTrendFactor,
  calculateMomentumFactor,
  calculateCapitalFactor,
  calculateEarningsFactor,
  calculateVolatilityFactor
} = require('./score-factors');

const { calculateSentimentFactor } = require('./sentiment-factor');
const { checkBlackSwan } = require('./black-swan-check');

const router = express.Router();

// 7 因子默认权重
const DEFAULT_FACTOR_WEIGHTS = {
  technical: 0.15,    // 技术面 15%
  fundamental: 0.15,  // 基本面 15%
  capital: 0.15,      // 资金面 15%
  valuation: 0.15,    // 估值面 15%
  sentiment: 0.15,    // 市场情绪 15%
  risk: 0.10,         // 风险控制 10%
  public: 0.15        // 舆情面 15%
};

/**
 * 获取行业成分股列表
 * @param {string} industryName - 行业名称
 * @returns {Promise<Array>} 股票列表
 */
async function getIndustryStocks(industryName) {
  try {
    // 从同花顺概念板块获取成分股
    const indexData = await tushareRequest('ths_index', {
      exchange: 'A',
      type: 'N'  // 概念板块
    }, ['ts_code', 'name', 'count', 'exchange', 'list_date', 'type']);

    // 匹配行业名称
    const matchedIndex = indexData.find(item =>
      item.name === industryName || item.name.includes(industryName) || industryName.includes(item.name)
    );

    if (!matchedIndex) {
      console.warn(`[getIndustryStocks] 未找到行业: ${industryName}`);
      return [];
    }

    // 获取成分股 - 使用 con_code 和 con_name 字段
    const members = await tushareRequest('ths_member', {
      ts_code: matchedIndex.ts_code
    }, ['ts_code', 'con_code', 'con_name', 'in_date', 'out_date']);

    // 过滤已退出的股票，并使用正确的字段名
    const today = formatDate(new Date());
    const activeMembers = members.filter(item => !item.out_date || item.out_date >= today);

    return activeMembers.map(item => ({
      ts_code: item.con_code,  // 成分股代码
      name: item.con_name,     // 成分股名称
      industry: industryName
    })).filter(item => {
      // 过滤有效的股票代码（格式：000001.SZ 或 600519.SH）
      return /^\d{6}\.(SH|SZ|BJ)$/.test(item.ts_code);
    });
  } catch (error) {
    console.warn(`[getIndustryStocks] 获取成分股失败: ${error.message}`);
    return [];
  }
}

/**
 * 计算技术面因子评分
 * @param {string} tsCode - 股票代码
 * @returns {Promise<Object>} 技术面评分结果
 */
async function calculateTechnicalScore(tsCode) {
  try {
    const dailyRows = await getDailyHistory(tsCode, 120);
    if (!dailyRows || dailyRows.length < 30) {
      return { score: 0.6, details: { message: '数据不足' } };
    }

    const indicatorRows = calculateTechnicalIndicators(dailyRows);
    const technical = analyzeTechnical(indicatorRows);

    // 趋势因子
    const trendResult = calculateTrendFactor(technical);

    // 动能因子
    const momentumResult = calculateMomentumFactor(technical);

    // 综合技术面得分
    const score = (trendResult.score + momentumResult.score) / 2;

    return {
      score: Math.round(score * 100) / 100,
      details: {
        trend: trendResult,
        momentum: momentumResult,
        maSignal: technical.maSignal,
        macdSignal: technical.macdSignal,
        rsiSignal: technical.rsiSignal
      }
    };
  } catch (error) {
    console.warn(`[calculateTechnicalScore] ${tsCode} 计算失败:`, error.message);
    return { score: 0.6, details: { error: error.message } };
  }
}

/**
 * 计算基本面因子评分
 * @param {string} tsCode - 股票代码
 * @returns {Promise<Object>} 基本面评分结果
 */
async function calculateFundamentalScore(tsCode) {
  try {
    const [fina, income] = await Promise.all([
      getFinaIndicatorRows(tsCode),
      getIncomeRows(tsCode)
    ]);

    const latestFina = fina[0] || {};
    const latestIncome = income[0] || {};

    // 使用 score-factors 的业绩因子计算
    const earningsResult = calculateEarningsFactor(latestFina, latestIncome);

    // ROE 评分
    const roe = toNumber(latestFina.roe, 0);
    let roeScore = 0.5;
    if (roe > 20) roeScore = 1;
    else if (roe > 15) roeScore = 0.9;
    else if (roe > 12) roeScore = 0.8;
    else if (roe > 10) roeScore = 0.7;
    else if (roe > 5) roeScore = 0.5;
    else if (roe > 0) roeScore = 0.3;
    else roeScore = 0.2;

    // 营收增长评分
    const trYoy = toNumber(latestFina.tr_yoy || latestIncome.tr_yoy, 0);
    let revenueScore = 0.5;
    if (trYoy > 50) revenueScore = 1;
    else if (trYoy > 30) revenueScore = 0.9;
    else if (trYoy > 20) revenueScore = 0.8;
    else if (trYoy > 10) revenueScore = 0.7;
    else if (trYoy > 0) revenueScore = 0.6;
    else if (trYoy > -10) revenueScore = 0.4;
    else revenueScore = 0.2;

    // 净利润增长评分
    const netprofitYoy = toNumber(latestFina.netprofit_yoy, 0);
    let profitScore = 0.5;
    if (netprofitYoy > 100) profitScore = 1;
    else if (netprofitYoy > 50) profitScore = 0.9;
    else if (netprofitYoy > 30) profitScore = 0.8;
    else if (netprofitYoy > 10) profitScore = 0.6;
    else if (netprofitYoy > 0) profitScore = 0.5;
    else if (netprofitYoy > -20) profitScore = 0.3;
    else profitScore = 0.2;

    // 综合基本面得分
    const score = earningsResult.score;

    return {
      score: Math.round(score * 100) / 100,
      details: {
        roe,
        trYoy,
        netprofitYoy,
        roeScore,
        revenueScore,
        profitScore,
        grossMargin: toNumber(latestFina.grossprofit_margin, 0)
      }
    };
  } catch (error) {
    console.warn(`[calculateFundamentalScore] ${tsCode} 计算失败:`, error.message);
    return { score: 0.6, details: { error: error.message } };
  }
}

/**
 * 计算资金面因子评分
 * @param {string} tsCode - 股票代码
 * @param {string} tradeDate - 交易日期
 * @returns {Promise<Object>} 资金面评分结果
 */
async function calculateCapitalScore(tsCode, tradeDate) {
  try {
    const [thsFlow, flow, dailyBasic] = await Promise.all([
      getMoneyflowThsRows(tsCode, tradeDate).catch(() => []),
      getMoneyflowRows(tsCode, tradeDate).catch(() => []),
      getLatestDailyBasic(tsCode)
    ]);

    const latestThsFlow = thsFlow[0] || {};
    const latestFlow = flow[0] || {};

    // 使用 score-factors 的资金因子计算
    const capitalResult = calculateCapitalFactor(latestThsFlow, latestFlow);

    // 换手率评分
    const turnoverRate = toNumber(dailyBasic?.turnover_rate, 0);
    let turnoverScore = 0.5;
    if (turnoverRate > 10) turnoverScore = 1;      // 活跃
    else if (turnoverRate > 5) turnoverScore = 0.8; // 较活跃
    else if (turnoverRate > 3) turnoverScore = 0.6; // 一般
    else if (turnoverRate > 1) turnoverScore = 0.4; // 不活跃
    else turnoverScore = 0.3;                       // 极不活跃

    // 综合资金面得分
    const score = (capitalResult.score * 0.7 + turnoverScore * 0.3);

    return {
      score: Math.round(score * 100) / 100,
      details: {
        netAmount: toNumber(latestThsFlow.net_amount || latestFlow.net_mf_amount, 0),
        turnoverRate,
        turnoverScore,
        capitalScore: capitalResult.score,
        ...capitalResult.details
      }
    };
  } catch (error) {
    console.warn(`[calculateCapitalScore] ${tsCode} 计算失败:`, error.message);
    return { score: 0.6, details: { error: error.message } };
  }
}

/**
 * 计算估值面因子评分
 * @param {string} tsCode - 股票代码
 * @param {string} industry - 行业名称
 * @returns {Promise<Object>} 估值面评分结果
 */
async function calculateValuationScore(tsCode, industry) {
  try {
    const [dailyBasic, peHistory, industryPeMedian] = await Promise.all([
      getLatestDailyBasic(tsCode),
      getStockPePercentile(tsCode).catch(() => null),
      getIndustryPeMedian(industry).catch(() => null)
    ]);

    const pe = toNumber(dailyBasic?.pe_ttm || dailyBasic?.pe, 0);
    const pb = toNumber(dailyBasic?.pb, 0);

    // PE 评分
    let peScore = 0.5;
    if (pe > 0 && pe < 15) peScore = 1;
    else if (pe < 25) peScore = 0.9;
    else if (pe < 35) peScore = 0.7;
    else if (pe < 50) peScore = 0.5;
    else if (pe < 80) peScore = 0.3;
    else if (pe > 0) peScore = 0.1;
    else peScore = 0.5; // 亏损股

    // PB 评分
    let pbScore = 0.5;
    if (pb > 0 && pb < 2) pbScore = 1;
    else if (pb < 4) pbScore = 0.8;
    else if (pb < 6) pbScore = 0.6;
    else if (pb < 10) pbScore = 0.4;
    else if (pb > 0) pbScore = 0.2;
    else pbScore = 0.5;

    // 相对行业 PE 评分
    let relativePeScore = 0.5;
    if (industryPeMedian && pe > 0) {
      const peRatio = pe / industryPeMedian;
      if (peRatio < 0.6) relativePeScore = 1;
      else if (peRatio < 0.8) relativePeScore = 0.9;
      else if (peRatio < 1.0) relativePeScore = 0.7;
      else if (peRatio < 1.2) relativePeScore = 0.5;
      else if (peRatio < 1.5) relativePeScore = 0.3;
      else relativePeScore = 0.1;
    }

    // 历史分位数评分
    const pePercentile = peHistory?.percentile5y ?? 0.5;
    let percentileScore = 0.5;
    if (pePercentile < 0.1) percentileScore = 1;
    else if (pePercentile < 0.2) percentileScore = 0.9;
    else if (pePercentile < 0.3) percentileScore = 0.8;
    else if (pePercentile < 0.5) percentileScore = 0.6;
    else if (pePercentile < 0.7) percentileScore = 0.4;
    else if (pePercentile < 0.9) percentileScore = 0.2;
    else percentileScore = 0.1;

    // 综合估值得分
    const score = 0.6 + (peScore * 0.3 + relativePeScore * 0.3 + percentileScore * 0.25 + pbScore * 0.15) * 0.6;

    return {
      score: Math.round(Math.min(score, 1.2) * 100) / 100,
      details: {
        pe,
        pb,
        industryPeMedian,
        pePercentile,
        peScore,
        pbScore,
        relativePeScore,
        percentileScore
      }
    };
  } catch (error) {
    console.warn(`[calculateValuationScore] ${tsCode} 计算失败:`, error.message);
    return { score: 0.6, details: { error: error.message } };
  }
}

/**
 * 计算市场情绪因子评分（行业热度）
 * @param {string} tsCode - 股票代码
 * @param {string} industry - 行业名称
 * @returns {Promise<Object>} 市场情绪评分结果
 */
async function calculateSentimentScore(tsCode, industry) {
  try {
    // 获取行业热度排名
    const today = formatDate(new Date());
    const hotData = await tushareRequest('ths_hot', {
      trade_date: today,
      market: '概念板块'
    }, ['trade_date', 'ts_code', 'ts_name', 'rank', 'hot', 'rank_reason']).catch(() => []);

    // 匹配行业热度
    const industryHot = hotData.find(item =>
      item.ts_name === industry || item.ts_name.includes(industry) || industry.includes(item.ts_name)
    );

    const hotRank = industryHot ? toNumber(industryHot.rank, 100) : 100;
    const hotValue = industryHot ? toNumber(industryHot.hot, 0) : 0;

    // 行业排名评分（排名越靠前越好）
    let rankScore = 0.5;
    if (hotRank <= 5) rankScore = 1;
    else if (hotRank <= 10) rankScore = 0.9;
    else if (hotRank <= 20) rankScore = 0.8;
    else if (hotRank <= 50) rankScore = 0.6;
    else if (hotRank <= 100) rankScore = 0.4;
    else rankScore = 0.3;

    // 热度值评分
    let hotValueScore = 0.5;
    if (hotValue > 10000) hotValueScore = 1;
    else if (hotValue > 5000) hotValueScore = 0.9;
    else if (hotValue > 2000) hotValueScore = 0.7;
    else if (hotValue > 1000) hotValueScore = 0.5;
    else hotValueScore = 0.4;

    // 综合情绪得分
    const score = 0.6 + (rankScore * 0.6 + hotValueScore * 0.4) * 0.6;

    return {
      score: Math.round(Math.min(score, 1.2) * 100) / 100,
      details: {
        industry,
        hotRank: hotRank <= 100 ? hotRank : null,
        hotValue,
        rankScore,
        hotValueScore
      }
    };
  } catch (error) {
    console.warn(`[calculateSentimentScore] ${tsCode} 计算失败:`, error.message);
    return { score: 0.6, details: { error: error.message } };
  }
}

/**
 * 计算风险控制因子评分
 * @param {string} tsCode - 股票代码
 * @returns {Promise<Object>} 风险控制评分结果
 */
async function calculateRiskScore(tsCode) {
  try {
    const [dailyRows, atrData] = await Promise.all([
      getDailyHistory(tsCode, 60),
      getATR(tsCode).catch(() => null)
    ]);

    if (!dailyRows || dailyRows.length < 20) {
      return { score: 0.6, details: { message: '数据不足' } };
    }

    // 按日期排序
    const sorted = [...dailyRows].sort((a, b) =>
      String(a.trade_date).localeCompare(String(b.trade_date))
    );

    // 计算波动率
    const returns = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevClose = toNumber(sorted[i - 1].close);
      const currClose = toNumber(sorted[i].close);
      if (prevClose > 0) {
        returns.push((currClose - prevClose) / prevClose);
      }
    }

    // 标准差（波动率）
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252);  // 年化波动率

    // 波动率评分（适中为佳）
    let volatilityScore = 0.5;
    if (volatility < 0.2) volatilityScore = 0.8;      // 低波动
    else if (volatility < 0.3) volatilityScore = 1;    // 适中
    else if (volatility < 0.4) volatilityScore = 0.7;  // 较高
    else if (volatility < 0.5) volatilityScore = 0.5;  // 高
    else volatilityScore = 0.3;                         // 极高

    // 计算最大回撤
    let maxDrawdown = 0;
    let peak = -Infinity;
    for (const row of sorted) {
      const close = toNumber(row.close);
      if (close > peak) peak = close;
      const drawdown = (peak - close) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // 回撤评分
    let drawdownScore = 0.5;
    if (maxDrawdown < 0.1) drawdownScore = 1;
    else if (maxDrawdown < 0.2) drawdownScore = 0.9;
    else if (maxDrawdown < 0.3) drawdownScore = 0.7;
    else if (maxDrawdown < 0.4) drawdownScore = 0.5;
    else if (maxDrawdown < 0.5) drawdownScore = 0.3;
    else drawdownScore = 0.2;

    // ATR 评分
    const atr = atrData?.atr20 || 0;
    const lastClose = toNumber(sorted[sorted.length - 1].close);
    const atrRatio = atr && lastClose ? atr / lastClose : 0.03;

    let atrScore = 0.5;
    if (atrRatio < 0.02) atrScore = 1;
    else if (atrRatio < 0.03) atrScore = 0.8;
    else if (atrRatio < 0.05) atrScore = 0.6;
    else atrScore = 0.4;

    // 综合风险得分
    const score = 0.6 + (volatilityScore * 0.4 + drawdownScore * 0.4 + atrScore * 0.2) * 0.6;

    return {
      score: Math.round(Math.min(score, 1.2) * 100) / 100,
      details: {
        volatility: Math.round(volatility * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        atr: Math.round(atr * 100) / 100,
        atrRatio: Math.round(atrRatio * 100) / 100,
        volatilityScore,
        drawdownScore,
        atrScore
      }
    };
  } catch (error) {
    console.warn(`[calculateRiskScore] ${tsCode} 计算失败:`, error.message);
    return { score: 0.6, details: { error: error.message } };
  }
}

/**
 * 计算舆情面因子评分
 * @param {string} tsCode - 股票代码
 * @returns {Promise<Object>} 舆情面评分结果
 */
async function calculatePublicScore(tsCode) {
  try {
    // 舆情因子
    const sentimentResult = await calculateSentimentFactor(tsCode);

    // 黑天鹅检测
    const blackSwanResult = await checkBlackSwan(tsCode, 30);

    // 黑天鹅事件严重扣分
    if (blackSwanResult.isBlackSwan) {
      const severityPenalty = blackSwanResult.severity === 'critical' ? 0.5 : 0.3;
      return {
        score: Math.round((sentimentResult.score - severityPenalty) * 100) / 100,
        details: {
          sentimentScore: sentimentResult.score,
          blackSwan: true,
          blackSwanReason: blackSwanResult.reason,
          blackSwanSeverity: blackSwanResult.severity,
          ...sentimentResult.details
        }
      };
    }

    return {
      score: Math.round(sentimentResult.score * 100) / 100,
      details: {
        blackSwan: false,
        sentimentScore: sentimentResult.score,
        ...sentimentResult.details
      }
    };
  } catch (error) {
    console.warn(`[calculatePublicScore] ${tsCode} 计算失败:`, error.message);
    return { score: 0.6, details: { error: error.message } };
  }
}

/**
 * 计算单只股票的 7 因子综合评分
 * @param {string} tsCode - 股票代码
 * @param {string} stockName - 股票名称
 * @param {string} industry - 行业名称
 * @param {Object} weights - 权重配置
 * @returns {Promise<Object>} 综合评分结果
 */
async function calculateStockScore(tsCode, stockName, industry, weights = DEFAULT_FACTOR_WEIGHTS) {
  const tradeDate = formatDate(new Date());

  // 并行计算各因子
  const [
    technical,
    fundamental,
    capital,
    valuation,
    sentiment,
    risk,
    publicOpinion
  ] = await Promise.all([
    calculateTechnicalScore(tsCode),
    calculateFundamentalScore(tsCode),
    calculateCapitalScore(tsCode, tradeDate),
    calculateValuationScore(tsCode, industry),
    calculateSentimentScore(tsCode, industry),
    calculateRiskScore(tsCode),
    calculatePublicScore(tsCode)
  ]);

  // 计算加权总分
  const totalScore =
    technical.score * weights.technical +
    fundamental.score * weights.fundamental +
    capital.score * weights.capital +
    valuation.score * weights.valuation +
    sentiment.score * weights.sentiment +
    risk.score * weights.risk +
    publicOpinion.score * weights.public;

  // 映射到 0-100 分
  const normalizedScore = Math.round(((totalScore - 0.6) / 0.6) * 100);

  return {
    ts_code: tsCode,
    name: stockName,
    industry,
    totalScore: Math.min(100, Math.max(0, normalizedScore)),
    factors: {
      technical,
      fundamental,
      capital,
      valuation,
      sentiment,
      risk,
      public: publicOpinion
    },
    weights,
    blackSwan: publicOpinion.details.blackSwan || false
  };
}

/**
 * 获取行业内 Top N 个股
 * @param {string} industry - 行业名称
 * @param {number} limit - 返回数量（默认 10）
 * @returns {Promise<Object>} Top N 个股列表
 */
async function getIndustryTopStocks(industry, limit = 10) {
  const startTime = Date.now();

  console.log(`[getIndustryTopStocks] 开始计算行业 "${industry}" 的个股评分`);

  // 1. 获取行业成分股
  const stocks = await getIndustryStocks(industry);

  if (stocks.length === 0) {
    return {
      success: false,
      message: `未找到行业 "${industry}" 的成分股`,
      industry,
      stocks: [],
      elapsed_ms: Date.now() - startTime
    };
  }

  console.log(`[getIndustryTopStocks] 找到 ${stocks.length} 只成分股`);

  // 2. 计算每只股票的 7 因子评分（限制并发数）
  const CONCURRENCY_LIMIT = 5;
  const results = [];

  for (let i = 0; i < stocks.length; i += CONCURRENCY_LIMIT) {
    const batch = stocks.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.all(
      batch.map(stock => calculateStockScore(stock.ts_code, stock.name, industry))
    );
    results.push(...batchResults);
    console.log(`[getIndustryTopStocks] 已计算 ${Math.min(i + CONCURRENCY_LIMIT, stocks.length)}/${stocks.length} 只股票`);
  }

  // 3. 排序（总分降序，黑天鹅股票排最后）
  const sortedResults = results.sort((a, b) => {
    // 黑天鹅股票排最后
    if (a.blackSwan && !b.blackSwan) return 1;
    if (!a.blackSwan && b.blackSwan) return -1;
    // 按总分降序
    return b.totalScore - a.totalScore;
  });

  // 4. 取 Top N
  const topStocks = sortedResults.slice(0, limit);

  const elapsed = Date.now() - startTime;
  console.log(`[getIndustryTopStocks] 计算完成，耗时 ${elapsed}ms`);

  return {
    success: true,
    industry,
    tradeDate: formatDate(new Date()),
    totalStocks: stocks.length,
    analyzedStocks: results.length,
    elapsed_ms: elapsed,
    weights: DEFAULT_FACTOR_WEIGHTS,
    topStocks: topStocks.map((stock, index) => ({
      rank: index + 1,
      ts_code: stock.ts_code,
      name: stock.name,
      totalScore: stock.totalScore,
      blackSwan: stock.blackSwan,
      factors: {
        technical: stock.factors.technical.score,
        fundamental: stock.factors.fundamental.score,
        capital: stock.factors.capital.score,
        valuation: stock.factors.valuation.score,
        sentiment: stock.factors.sentiment.score,
        risk: stock.factors.risk.score,
        public: stock.factors.public.score
      }
    })),
    allStocks: sortedResults.map((stock, index) => ({
      rank: index + 1,
      ts_code: stock.ts_code,
      name: stock.name,
      totalScore: stock.totalScore,
      blackSwan: stock.blackSwan
    }))
  };
}

/**
 * GET /api/industry/:industry/top-stocks
 * 获取行业内 Top N 个股
 *
 * 路径参数：
 * - industry: 行业名称（如"储能"、"人工智能"）
 *
 * 查询参数：
 * - limit: 返回数量（默认 10，最大 50）
 */
router.get('/:industry/top-stocks', async (req, res) => {
  try {
    const { industry } = req.params;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));

    console.log(`[industry-top-stocks] 请求行业: ${industry}, limit: ${limit}`);

    if (!industry) {
      return res.status(400).json({
        success: false,
        message: '缺少行业名称参数'
      });
    }

    const result = await getIndustryTopStocks(industry, limit);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[industry-top-stocks] 错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取行业内个股评分失败'
    });
  }
});

/**
 * GET /api/industry/:industry/stocks/:tsCode
 * 获取单只股票的详细评分
 */
router.get('/:industry/stocks/:tsCode', async (req, res) => {
  try {
    const { industry, tsCode } = req.params;

    console.log(`[industry-top-stocks] 请求股票详情: ${tsCode}, 行业: ${industry}`);

    const result = await calculateStockScore(tsCode, '', industry);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[industry-top-stocks] 错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取股票评分失败'
    });
  }
});

// 导出
module.exports = router;
module.exports.getIndustryTopStocks = getIndustryTopStocks;
module.exports.calculateStockScore = calculateStockScore;
module.exports.DEFAULT_FACTOR_WEIGHTS = DEFAULT_FACTOR_WEIGHTS;