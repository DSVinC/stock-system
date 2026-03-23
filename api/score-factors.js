/**
 * 7因子评分系统
 * 趋势因子、动能因子、估值因子、资金因子、业绩因子、波动率因子、舆情因子
 */

const fs = require('fs');
const path = require('path');
const {
  toNumber,
  getATR,
  getIndustryPeMedian,
  getStockPePercentile,
} = require('./market-data');

// 加载舆情因子模块
const { calculateSentimentFactor } = require('./sentiment-factor');

// 加载黑天鹅检测模块
const { checkBlackSwan } = require('./black-swan-check');

// 从配置文件加载权重
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const WEIGHTS_FILE = path.join(CONFIG_DIR, 'factor-weights.json');

// 默认权重（如果配置文件不存在）
const DEFAULT_WEIGHTS = {
  trend: 0.17,      // 趋势因子 17%
  momentum: 0.15,   // 动能因子 15%
  valuation: 0.15,  // 估值因子 15%
  capital: 0.13,    // 资金因子 13%
  earnings: 0.13,   // 业绩因子 13%
  volatility: 0.12, // 波动率因子 12%
  sentiment: 0.15   // 舆情因子 15%
};

// 加载配置文件中的权重
function loadFactorWeights() {
  try {
    if (fs.existsSync(WEIGHTS_FILE)) {
      const content = fs.readFileSync(WEIGHTS_FILE, 'utf8');
      const config = JSON.parse(content);
      
      // 验证权重总和
      const total = Object.entries(config)
        .filter(([key]) => !key.startsWith('_'))
        .reduce((sum, [_, value]) => sum + value, 0);
      
      // 权重总和必须在 0.99 到 1.01 之间（允许微小舍入误差）
      if (Math.abs(total - 1.0) > 0.01) {
        console.warn(`权重配置文件权重总和 ${total} 不等于 1.0，使用默认权重`);
        return DEFAULT_WEIGHTS;
      }
      
      return config;
    } else {
      console.warn(`权重配置文件不存在: ${WEIGHTS_FILE}，使用默认权重`);
      return DEFAULT_WEIGHTS;
    }
  } catch (error) {
    console.error(`加载权重配置文件失败: ${error.message}，使用默认权重`);
    return DEFAULT_WEIGHTS;
  }
}

// 导出权重配置（兼容旧版代码）
const FACTOR_WEIGHTS = loadFactorWeights();

// 评分范围：0.6 ~ 1.2，对应 1-5 分的 0.6-1.2 倍
const SCORE_MIN = 0.6;
const SCORE_MAX = 1.2;

/**
 * 计算趋势因子
 * 基于均线排列和斜率
 * @param {Object} technical - 技术分析数据
 * @returns {Object} { score, details }
 */
function calculateTrendFactor(technical) {
  const { ma5, ma10, ma20, ma60 } = technical.latest;
  const price = technical.price;

  const ma5Val = toNumber(ma5, price);
  const ma10Val = toNumber(ma10, price);
  const ma20Val = toNumber(ma20, price);
  const ma60Val = toNumber(ma60, price);

  // 均线多头排列得分
  let alignmentScore = 0;
  if (ma5Val > ma10Val) alignmentScore += 0.25;
  if (ma10Val > ma20Val) alignmentScore += 0.25;
  if (ma20Val > ma60Val) alignmentScore += 0.25;
  if (price > ma20Val) alignmentScore += 0.25;

  // 价格在均线上方得分
  const aboveMa20 = price > ma20Val ? 0.3 : 0;
  const aboveMa60 = price > ma60Val ? 0.2 : 0;

  // 综合得分映射到 0.6-1.2
  const rawScore = alignmentScore + aboveMa20 + aboveMa60;
  const score = SCORE_MIN + rawScore * (SCORE_MAX - SCORE_MIN);

  return {
    score: Math.min(score, SCORE_MAX),
    details: {
      alignmentScore,
      aboveMa20,
      aboveMa60,
      maSignal: technical.maSignal,
      rawScore
    }
  };
}

/**
 * 计算动能因子
 * 基于MACD和RSI
 * @param {Object} technical - 技术分析数据
 * @returns {Object} { score, details }
 */
function calculateMomentumFactor(technical) {
  const { rsi, macd, macd_signal } = technical.latest;
  const macdSignal = technical.macdSignal;

  const rsiVal = toNumber(rsi, 50);
  const macdVal = toNumber(macd, 0);
  const macdSignalVal = toNumber(macd_signal, 0);

  // MACD得分
  let macdScore = 0;
  if (macdSignal.includes('金叉')) macdScore = 1;
  else if (macdSignal.includes('多头延续')) macdScore = 0.8;
  else if (macdSignal.includes('死叉')) macdScore = 0.2;
  else if (macdSignal.includes('空头')) macdScore = 0.3;
  else macdScore = 0.5;

  // RSI得分（40-60为中性，>60偏强，<40偏弱）
  let rsiScore = 0.5;
  if (rsiVal > 70) rsiScore = 0.7; // 超买
  else if (rsiVal > 60) rsiScore = 0.9;
  else if (rsiVal > 50) rsiScore = 0.7;
  else if (rsiVal > 40) rsiScore = 0.5;
  else if (rsiVal > 30) rsiScore = 0.3;
  else rsiScore = 0.2; // 超卖

  // MACD柱状线得分
  const histogram = macdVal - macdSignalVal;
  let histogramScore = 0.5;
  if (histogram > 0) {
    histogramScore = histogram > 0.5 ? 1 : 0.8;
  } else {
    histogramScore = histogram < -0.5 ? 0.2 : 0.4;
  }

  // 综合得分
  const rawScore = (macdScore * 0.4 + rsiScore * 0.35 + histogramScore * 0.25);
  const score = SCORE_MIN + rawScore * (SCORE_MAX - SCORE_MIN);

  return {
    score: Math.min(score, SCORE_MAX),
    details: {
      macdScore,
      rsiScore,
      histogramScore,
      macdSignal,
      rsi: rsiVal,
      histogram,
      rawScore
    }
  };
}

/**
 * 计算估值因子
 * 基于PE、行业PE、历史PE分位数
 * @param {Object} valuation - 估值数据
 * @param {string} industry - 行业名称
 * @param {Object} peHistory - 历史PE数据
 * @returns {Object} { score, details }
 */
async function calculateValuationFactor(valuation, industry, peHistory) {
  const pe = toNumber(valuation?.pe_ttm, 0);
  const pb = toNumber(valuation?.pb, 0);

  // 获取行业PE中位数
  let industryPeMedian = null;
  try {
    industryPeMedian = await getIndustryPeMedian(industry);
  } catch (e) {
    console.warn(`[ValuationFactor] Failed to get industry PE for ${industry}:`, e.message);
  }

  // 历史PE分位数
  const pePercentile5y = peHistory?.percentile5y ?? 0.5;

  // PE得分
  let peScore = 0.5;
  if (pe > 0 && pe < 15) peScore = 1;      // 极低估值
  else if (pe < 25) peScore = 0.9;         // 低估值
  else if (pe < 35) peScore = 0.7;         // 合理偏低
  else if (pe < 50) peScore = 0.5;         // 合理偏高
  else if (pe < 80) peScore = 0.3;         // 高估值
  else peScore = 0.1;                       // 极高估值

  // 相对行业PE得分
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

  // 历史分位数得分
  let percentileScore = 0.5;
  if (pePercentile5y < 0.1) percentileScore = 1;
  else if (pePercentile5y < 0.2) percentileScore = 0.9;
  else if (pePercentile5y < 0.3) percentileScore = 0.8;
  else if (pePercentile5y < 0.5) percentileScore = 0.6;
  else if (pePercentile5y < 0.7) percentileScore = 0.4;
  else if (pePercentile5y < 0.9) percentileScore = 0.2;
  else percentileScore = 0.1;

  // PB得分（辅助）
  let pbScore = 0.5;
  if (pb > 0 && pb < 2) pbScore = 1;
  else if (pb < 4) pbScore = 0.8;
  else if (pb < 6) pbScore = 0.6;
  else if (pb < 10) pbScore = 0.4;
  else pbScore = 0.2;

  // 综合得分
  const rawScore = (peScore * 0.4 + relativePeScore * 0.3 + percentileScore * 0.2 + pbScore * 0.1);
  const score = SCORE_MIN + rawScore * (SCORE_MAX - SCORE_MIN);

  return {
    score: Math.min(score, SCORE_MAX),
    details: {
      pe,
      pb,
      industryPeMedian,
      pePercentile5y,
      peScore,
      relativePeScore,
      percentileScore,
      pbScore,
      rawScore
    }
  };
}

/**
 * 计算资金因子
 * 基于主力资金流向
 * @param {Object} thsFlow - 同花顺资金流向
 * @param {Object} flow - 资金流向
 * @returns {Object} { score, details }
 */
function calculateCapitalFactor(thsFlow, flow) {
  const netAmount = toNumber(thsFlow?.net_amount || flow?.net_mf_amount, 0);
  const mainForce = toNumber(thsFlow?.main_force || flow?.lg_amount, 0);
  const retailForce = toNumber(thsFlow?.retail_force || flow?.sm_amount, 0);

  // 净流入得分
  let netAmountScore = 0.5;
  if (netAmount > 5000) netAmountScore = 1;
  else if (netAmount > 2000) netAmountScore = 0.9;
  else if (netAmount > 1000) netAmountScore = 0.8;
  else if (netAmount > 500) netAmountScore = 0.7;
  else if (netAmount > 0) netAmountScore = 0.6;
  else if (netAmount > -500) netAmountScore = 0.4;
  else if (netAmount > -1000) netAmountScore = 0.3;
  else netAmountScore = 0.2;

  // 主力占比得分
  const totalForce = Math.abs(mainForce) + Math.abs(retailForce);
  let mainRatioScore = 0.5;
  if (totalForce > 0) {
    const mainRatio = mainForce / totalForce;
    if (mainRatio > 0.3) mainRatioScore = 1;
    else if (mainRatio > 0.2) mainRatioScore = 0.9;
    else if (mainRatio > 0.1) mainRatioScore = 0.7;
    else if (mainRatio > 0) mainRatioScore = 0.5;
    else if (mainRatio > -0.1) mainRatioScore = 0.3;
    else mainRatioScore = 0.2;
  }

  // 综合得分
  const rawScore = (netAmountScore * 0.6 + mainRatioScore * 0.4);
  const score = SCORE_MIN + rawScore * (SCORE_MAX - SCORE_MIN);

  return {
    score: Math.min(score, SCORE_MAX),
    details: {
      netAmount,
      mainForce,
      retailForce,
      netAmountScore,
      mainRatioScore,
      rawScore
    }
  };
}

/**
 * 计算业绩因子
 * 基于营收、净利润同比增速
 * @param {Object} fina - 财务指标
 * @param {Object} income - 利润表
 * @returns {Object} { score, details }
 */
function calculateEarningsFactor(fina, income) {
  const trYoy = toNumber(fina?.tr_yoy || income?.tr_yoy, 0);
  const netprofitYoy = toNumber(fina?.netprofit_yoy || income?.netprofit_yoy, 0);
  const roe = toNumber(fina?.roe, 0);
  const grossMargin = toNumber(fina?.grossprofit_margin, 0);

  // 营收增速得分
  let revenueScore = 0.5;
  if (trYoy > 50) revenueScore = 1;
  else if (trYoy > 30) revenueScore = 0.9;
  else if (trYoy > 20) revenueScore = 0.8;
  else if (trYoy > 10) revenueScore = 0.7;
  else if (trYoy > 0) revenueScore = 0.6;
  else if (trYoy > -10) revenueScore = 0.4;
  else revenueScore = 0.2;

  // 净利润增速得分
  let profitScore = 0.5;
  if (netprofitYoy > 100) profitScore = 1;
  else if (netprofitYoy > 50) profitScore = 0.9;
  else if (netprofitYoy > 30) profitScore = 0.8;
  else if (netprofitYoy > 20) profitScore = 0.7;
  else if (netprofitYoy > 10) profitScore = 0.6;
  else if (netprofitYoy > 0) profitScore = 0.5;
  else if (netprofitYoy > -20) profitScore = 0.3;
  else profitScore = 0.2;

  // ROE得分
  let roeScore = 0.5;
  if (roe > 20) roeScore = 1;
  else if (roe > 15) roeScore = 0.9;
  else if (roe > 12) roeScore = 0.8;
  else if (roe > 10) roeScore = 0.7;
  else if (roe > 8) roeScore = 0.6;
  else if (roe > 5) roeScore = 0.5;
  else if (roe > 0) roeScore = 0.3;
  else roeScore = 0.2;

  // 毛利率得分
  let marginScore = 0.5;
  if (grossMargin > 50) marginScore = 1;
  else if (grossMargin > 40) marginScore = 0.9;
  else if (grossMargin > 30) marginScore = 0.8;
  else if (grossMargin > 20) marginScore = 0.6;
  else if (grossMargin > 10) marginScore = 0.4;
  else marginScore = 0.2;

  // 综合得分
  const rawScore = (revenueScore * 0.3 + profitScore * 0.35 + roeScore * 0.2 + marginScore * 0.15);
  const score = SCORE_MIN + rawScore * (SCORE_MAX - SCORE_MIN);

  return {
    score: Math.min(score, SCORE_MAX),
    details: {
      trYoy,
      netprofitYoy,
      roe,
      grossMargin,
      revenueScore,
      profitScore,
      roeScore,
      marginScore,
      rawScore
    }
  };
}

/**
 * 计算波动率因子
 * 基于ATR和近期波动
 * @param {Object} technical - 技术分析数据
 * @param {number} atr20 - 20日ATR
 * @returns {Object} { score, details }
 */
function calculateVolatilityFactor(technical, atr20) {
  const price = technical.price;
  const atr = toNumber(atr20, price * 0.02); // 默认2%波动

  // ATR/价格比值
  const atrRatio = atr / price;

  // 波动率得分（适中为佳，过高过低都不好）
  let volatilityScore = 0.5;
  if (atrRatio > 0.08) volatilityScore = 0.3;  // 波动过大
  else if (atrRatio > 0.05) volatilityScore = 0.5; // 波动较大
  else if (atrRatio > 0.03) volatilityScore = 0.8; // 适中
  else if (atrRatio > 0.02) volatilityScore = 1;   // 理想
  else if (atrRatio > 0.01) volatilityScore = 0.7; // 波动较小
  else volatilityScore = 0.4; // 波动过小

  // 布林带宽度得分
  const { bb_upper, bb_lower } = technical.latest;
  const bbWidth = (toNumber(bb_upper, price * 1.1) - toNumber(bb_lower, price * 0.9)) / price;

  let bbScore = 0.5;
  if (bbWidth > 0.2) bbScore = 0.3;
  else if (bbWidth > 0.15) bbScore = 0.5;
  else if (bbWidth > 0.1) bbScore = 0.8;
  else if (bbWidth > 0.05) bbScore = 1;
  else bbScore = 0.6;

  // 综合得分
  const rawScore = (volatilityScore * 0.6 + bbScore * 0.4);
  const score = SCORE_MIN + rawScore * (SCORE_MAX - SCORE_MIN);

  return {
    score: Math.min(score, SCORE_MAX),
    details: {
      atr,
      atrRatio,
      bbWidth,
      volatilityScore,
      bbScore,
      rawScore
    }
  };
}

/**
 * 计算加权总分（7因子）
 * @param {Object} factors - 各因子得分对象
 * @param {Object} weights - 权重配置（可选，默认使用配置文件权重）
 * @returns {number} 加权总分
 */
function calculateWeightedScore(factors, weights = FACTOR_WEIGHTS) {
  const {
    trend = 0.6,
    momentum = 0.6,
    valuation = 0.6,
    capital = 0.6,
    earnings = 0.6,
    volatility = 0.6,
    sentiment = 0.6
  } = factors;

  // 验证权重
  const validWeights = { ...DEFAULT_WEIGHTS, ...weights };
  
  // 计算加权总分
  const weightedScore =
    trend * validWeights.trend +
    momentum * validWeights.momentum +
    valuation * validWeights.valuation +
    capital * validWeights.capital +
    earnings * validWeights.earnings +
    volatility * validWeights.volatility +
    sentiment * validWeights.sentiment;

  return weightedScore;
}

/**
 * 计算综合评分（7因子）
 * @param {Object} params - 评分所需参数
 * @param {string} stockCode - 股票代码（用于舆情因子）
 * @returns {Object} 完整评分结果
 */
async function calculateCompositeScore(params, stockCode = null) {
  const {
    technical,
    valuation,
    industry,
    thsFlow,
    flow,
    fina,
    income,
    atr20,
    peHistory
  } = params;

  // 计算 6 个基础因子
  const trend = calculateTrendFactor(technical);
  const momentum = calculateMomentumFactor(technical);
  const valuationResult = await calculateValuationFactor(valuation, industry, peHistory);
  const capital = calculateCapitalFactor(thsFlow, flow);
  const earnings = calculateEarningsFactor(fina, income);
  const volatility = calculateVolatilityFactor(technical, atr20);

  // 计算舆情因子（如果提供了股票代码）
  let sentiment = { score: 0.6, details: { message: '未提供股票代码，使用默认舆情分' } };
  if (stockCode) {
    try {
      sentiment = await calculateSentimentFactor(stockCode);
    } catch (error) {
      console.warn(`计算舆情因子失败(${stockCode}):`, error.message);
      sentiment = { score: 0.6, details: { error: error.message } };
    }
  }

  // 计算加权总分
  const weightedScore = calculateWeightedScore({
    trend: trend.score,
    momentum: momentum.score,
    valuation: valuationResult.score,
    capital: capital.score,
    earnings: earnings.score,
    volatility: volatility.score,
    sentiment: sentiment.score
  });

  // 映射到 0-10 分（原 weightedScore 范围 0.6-1.2，映射到 1-5 后 ×2 得 0-10）
  const reportScore = Math.min(10, Math.max(0, weightedScore * 2));

  // 【黑天鹅一票否决】检查黑天鹅事件
  let blackSwanEvent = null;
  if (stockCode) {
    try {
      const blackSwanResult = await checkBlackSwan(stockCode, 30);
      if (blackSwanResult.hasBlackSwan) {
        blackSwanEvent = blackSwanResult.events[0];
      }
    } catch (error) {
      console.warn(`黑天鹅检查失败 (${stockCode}):`, error.message);
    }
  }

  // 决策建议：黑天鹅事件一票否决
  let decision = '回避';
  if (blackSwanEvent) {
    decision = '回避'; // 黑天鹅直接否决
  } else if (reportScore >= 8.4) {
    decision = '买入';
  } else if (reportScore >= 6.4) {
    decision = '观望';
  }

  return {
    reportScore,
    decision,
    weightedScore,
    blackSwanEvent,
    factors: {
      trend: { ...trend, weight: FACTOR_WEIGHTS.trend },
      momentum: { ...momentum, weight: FACTOR_WEIGHTS.momentum },
      valuation: { ...valuationResult, weight: FACTOR_WEIGHTS.valuation },
      capital: { ...capital, weight: FACTOR_WEIGHTS.capital },
      earnings: { ...earnings, weight: FACTOR_WEIGHTS.earnings },
      volatility: { ...volatility, weight: FACTOR_WEIGHTS.volatility },
      sentiment: { ...sentiment, weight: FACTOR_WEIGHTS.sentiment }
    },
    weights: FACTOR_WEIGHTS
  };
}

/**
 * 行情阶段识别
 * @param {Object} technical - 技术分析数据
 * @returns {Object} { phase, phaseName, description }
 */
function identifyMarketPhase(technical) {
  const { ma5, ma10, ma20, ma60 } = technical.latest;
  const price = technical.price;

  const ma5Val = toNumber(ma5, price);
  const ma10Val = toNumber(ma10, price);
  const ma20Val = toNumber(ma20, price);
  const ma60Val = toNumber(ma60, price);

  // 加载配置
  const PHASE_FILE = path.join(CONFIG_DIR, 'market-phase.json');
  let config = { phases: {}, thresholds: {} };
  if (fs.existsSync(PHASE_FILE)) {
    config = JSON.parse(fs.readFileSync(PHASE_FILE, 'utf8'));
  }

  const { near_ma20_percent = 0.02 } = config.thresholds;

  // 判断均线排列
  const isBullishAlignment = ma5Val > ma10Val && ma10Val > ma20Val && ma20Val > ma60Val;
  const isBearishAlignment = ma5Val < ma10Val && ma10Val < ma20Val && ma20Val < ma60Val;
  const priceAboveAllMa = price > ma5Val && price > ma10Val && price > ma20Val && price > ma60Val;
  const ma60AboveMa20 = ma60Val > ma20Val;
  const priceNearMa20 = Math.abs(price - ma20Val) / ma20Val <= near_ma20_percent;

  // 行情阶段判断
  if (ma60AboveMa20 && priceAboveAllMa && !isBullishAlignment) {
    // 底部反弹：MA60>MA20，股价突破所有均线，但均线未完全多头排列
    return {
      phase: 'bottom_rebound',
      phaseName: '底部反弹',
      description: 'MA60>MA20，股价突破所有均线，反弹初期',
      confidence: 0.8
    };
  }

  if (isBullishAlignment && price > ma20Val) {
    // 趋势确立：MA5>MA10>MA20>MA60，多头排列
    return {
      phase: 'trend_established',
      phaseName: '趋势确立',
      description: 'MA5>MA10>MA20>MA60，多头排列，趋势成熟',
      confidence: 0.9
    };
  }

  if (priceNearMa20 && price > ma60Val && !isBullishAlignment) {
    // 高位震荡：股价在 MA20 附近反复穿越
    return {
      phase: 'high_consolidation',
      phaseName: '高位震荡',
      description: '股价在 MA20 附近震荡，方向未明',
      confidence: 0.7
    };
  }

  if (price < ma60Val || isBearishAlignment) {
    // 趋势反转：跌破 MA60，均线空头排列
    return {
      phase: 'trend_reversal',
      phaseName: '趋势反转',
      description: '跌破 MA60，均线空头排列，趋势转弱',
      confidence: 0.85
    };
  }

  // 默认：震荡
  return {
    phase: 'unknown',
    phaseName: '未知',
    description: '无法明确识别行情阶段',
    confidence: 0.5
  };
}

module.exports = {
  calculateTrendFactor,
  calculateMomentumFactor,
  calculateValuationFactor,
  calculateCapitalFactor,
  calculateEarningsFactor,
  calculateVolatilityFactor,
  calculateCompositeScore,
  calculateWeightedScore,
  loadFactorWeights,
  FACTOR_WEIGHTS,
  SCORE_MIN,
  SCORE_MAX,
  identifyMarketPhase
};