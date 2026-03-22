/**
 * API 模块：个股分析报告 (analyze.js)
 * 
 * 职责：负责按行业方向筛选股票列表，以及生成个股深度分析报告
 * 
 * 接口分工：
 * 1. POST /api/analyze - 按行业方向筛选股票列表
 *    - 输入：directions (行业方向数组)
 *    - 输出：stocks (待分析的股票列表，含基础数据)
 *    - 用途：选股后获取成分股列表
 * 
 * 2. POST /api/analyze/report - 生成单只股票深度分析报告并落盘
 *    - 输入：stock_code, stock_name
 *    - 输出：分析报告 JSON（技术面、基本面、资金面、估值、策略建议）
 *    - 用途：生成个股深度分析报告
 * 
 * 依赖：market-data.js (技术分析、财务数据、资金流)
 *      score-factors.js (综合评分计算)
 */

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');
const selectRouter = require('./select');
const {
  MarketDataError,
  analyzeTechnical,
  calculateTechnicalIndicators,
  getATR,
  getDailyHistory,
  getFinaIndicatorRows,
  getHolderNumberRows,
  getIncomeRows,
  getLatestDailyBasic,
  getMoneyflowRows,
  getMoneyflowThsRows,
  getNorthMoneyRows,
  getRealtimeQuote,
  getStockPePercentile,
  searchStock,
  toNumber,
} = require('./market-data');
const { calculateCompositeScore } = require('./score-factors');

const router = express.Router();
const REPORT_DIR = path.join(__dirname, '..', '..', 'report', 'stockana');

// 报告缓存：code -> { payload, timestamp }
const reportCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30分钟缓存

function getAnalysisRouter() {
  return require('./analysis');
}

function getCachedReport(stockCode) {
  const cached = reportCache.get(stockCode);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    reportCache.delete(stockCode);
    return null;
  }
  return cached.payload;
}

function setCachedReport(stockCode, payload) {
  reportCache.set(stockCode, { payload, timestamp: Date.now() });
}

async function analyzeStockWithCache(stockCode) {
  // 先检查缓存
  const cached = getCachedReport(stockCode);
  if (cached) {
    return cached;
  }

  // 调用 analysis router 的 runAnalysis
  try {
    const payload = await getAnalysisRouter().runAnalysis(stockCode);
    setCachedReport(stockCode, payload);
    return payload;
  } catch (error) {
    console.error(`分析股票 ${stockCode} 失败:`, error.message);
    return null;
  }
}

function normalizeDirections(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((item) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object' && typeof item.name === 'string') return item.name.trim();
    return '';
  }).filter(Boolean))];
}

function slugify(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'stock';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(2)}%`;
}

function formatYuan(value) {
  return `${toNumber(value).toFixed(2)} 元`;
}

function formatYi(valueInWan) {
  return `${(toNumber(valueInWan) / 10000).toFixed(2)} 亿元`;
}

function formatYiFromYuan(value) {
  return `${(toNumber(value) / 100000000).toFixed(2)} 亿元`;
}

function toStars(score) {
  return '★'.repeat(clamp(Math.round(score), 1, 5)) + '☆'.repeat(5 - clamp(Math.round(score), 1, 5));
}

function deriveDecision(reportScore) {
  if (reportScore >= 4.2) return '买入';
  if (reportScore >= 3.2) return '观望';
  return '回避';
}

function safeLatest(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function toMarkdownTable(headers, rows) {
  const normalizedRows = rows.map((row) => row.map((cell) => String(cell).replace(/\|/g, '\\|').replace(/\n/g, '<br>')));
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...normalizedRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

async function buildAnalyzeList(directions) {
  const selectionPayload = await selectRouter.buildSelectionPayload();
  const matchedDirections = selectionPayload.directions.filter((item) => directions.includes(item.name));
  const resultMap = new Map();

  // 收集所有需要分析的股票
  const stocksToAnalyze = [];
  matchedDirections.forEach((direction) => {
    direction.picks.forEach((pick, index) => {
      const current = resultMap.get(pick.code);
      if (!current) {
        resultMap.set(pick.code, {
          name: pick.name,
          code: pick.code,
          industry: pick.industry,
          matchedDirections: [direction.name],
          total_mv: pick.total_mv,
          rank: index + 1,
        });
        stocksToAnalyze.push(pick.code);
      } else {
        current.matchedDirections.push(direction.name);
        current.rank = Math.min(current.rank, index + 1);
      }
    });
  });

  // 并行分析所有股票（使用缓存）
  const analysisResults = await Promise.all(
    stocksToAnalyze.map(async (code) => {
      const payload = await analyzeStockWithCache(code);
      return { code, payload };
    })
  );

  // 更新结果Map中的评分和决策
  analysisResults.forEach(({ code, payload }) => {
    const stock = resultMap.get(code);
    if (stock && payload) {
      stock.score = payload.summary?.report_score || 3;
      stock.decision = payload.summary?.decision || '观望';
      stock.reportPayload = payload; // 保存完整报告数据供后续使用
    } else if (stock) {
      // 分析失败时使用默认评分
      stock.score = 3;
      stock.decision = '观望';
    }
  });

  return Array.from(resultMap.values())
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.total_mv !== left.total_mv) return right.total_mv - left.total_mv;
      return left.code.localeCompare(right.code, 'zh-CN');
    })
    .slice(0, 12)
    .map(({ matchedDirections, total_mv, rank, reportPayload, ...stock }) => stock);
}

function buildTargetPrices(technical, decision) {
  const base = technical.price;
  const shortBias = decision === '买入' ? 1.08 : decision === '观望' ? 1.04 : 0.97;
  const midBias = decision === '买入' ? 1.16 : decision === '观望' ? 1.09 : 0.94;
  const longBias = decision === '买入' ? 1.28 : decision === '观望' ? 1.14 : 0.92;
  return [
    { period: '1个月', price: Math.max(base * shortBias, toNumber(technical.latest.ma10, base)), logic: '修复到 MA10/短线情绪溢价', rise: ((Math.max(base * shortBias, toNumber(technical.latest.ma10, base)) / base) - 1) * 100 },
    { period: '3个月', price: Math.max(base * midBias, toNumber(technical.latest.ma20, base)), logic: '景气与估值中枢同步修复', rise: ((Math.max(base * midBias, toNumber(technical.latest.ma20, base)) / base) - 1) * 100 },
    { period: '6个月', price: Math.max(base * longBias, toNumber(technical.latest.bb_upper, base)), logic: '业绩验证后估值扩张', rise: ((Math.max(base * longBias, toNumber(technical.latest.bb_upper, base)) / base) - 1) * 100 },
    { period: '乐观情景', price: base * (decision === '买入' ? 1.42 : 1.18), logic: '超预期订单/产品获批/行业催化集中兑现', rise: (((base * (decision === '买入' ? 1.42 : 1.18)) / base) - 1) * 100 },
  ];
}

// 计算建仓区间：基于技术面和估值综合
function calculateBuyZone(technical, valuation, industry) {
  const { ma20, ma60, bb_lower, bb_middle } = technical.latest;
  const price = technical.price;

  // 技术支撑区间
  const techLow = Math.min(toNumber(ma60, price * 0.9), toNumber(bb_lower, price * 0.92));
  const techHigh = toNumber(ma20, price * 1.05);

  // 估值区间（简化版，后续可引入行业PE中位数）
  const pe = toNumber(valuation?.pe_ttm, 0);
  let valueLow = price * 0.9;
  let valueHigh = price * 1.1;

  if (pe > 0 && pe < 20) {
    // 低估值，区间上移
    valueLow = price * 0.95;
    valueHigh = price * 1.15;
  } else if (pe > 40) {
    // 高估值，区间下移
    valueLow = price * 0.85;
    valueHigh = price * 1.05;
  }

  // 综合建仓区间
  let buyLow = Math.max(techLow, valueLow);
  let buyHigh = Math.min(techHigh, valueHigh);

  // 确保区间合理
  if (buyLow > buyHigh) {
    buyLow = Math.min(techLow, valueLow);
    buyHigh = Math.max(techLow, valueLow) * 1.05;
  }

  // 确保建仓区间不超过当前价格的±15%
  buyLow = Math.max(buyLow, price * 0.85);
  buyHigh = Math.min(buyHigh, price * 1.15);

  return [buyLow, buyHigh];
}

// 计算止损点：基于建仓区间下限
function calculateStopLoss(technical, buyZone, decision) {
  const [buyLow] = buyZone;
  const price = technical.price;

  if (decision === '回避') {
    // 回避情况下，止损点设为当前价格下方8%
    return price * 0.92;
  }

  // 止损点：建仓下限的95% 或 当前价格的92%，取较低者
  const stopFromBuyZone = buyLow * 0.95;
  const stopFromCurrent = price * 0.92;
  return Math.min(stopFromBuyZone, stopFromCurrent);
}

// 计算目标价：基于评分动态调整
function calculateTargetPrice(technical, buyZone, reportScore, decision) {
  const [, buyHigh] = buyZone;
  const price = technical.price;
  const { bb_upper } = technical.latest;

  if (decision === '回避') {
    return price * 1.05; // 回避情况下，目标价保守
  }

  // 基于评分确定目标倍数
  const targetMultiplier = reportScore >= 4.5 ? 1.25 :
                           reportScore >= 3.5 ? 1.15 : 1.08;

  // 目标价：建仓区间上限 × 倍数 或 布林上轨，取较高者
  const targetFromZone = buyHigh * targetMultiplier;
  const targetFromTech = toNumber(bb_upper, price * 1.1);

  return Math.max(targetFromZone, targetFromTech);
}

// 构建结构化策略数据
function buildStructuredStrategy(decision, technical, buyZone, stopLoss, targetPrice) {
  const [buyLow, buyHigh] = buyZone;
  const price = technical.price;

  // 确定风险偏好
  let riskProfile = "balanced";
  if (decision === "买入") {
    riskProfile = "balanced"; // 默认稳健型
  } else if (decision === "观望") {
    riskProfile = "conservative"; // 观望时偏保守
  } else { // 回避
    riskProfile = "conservative";
  }

  // 确定首次建仓比例和最大仓位
  let firstBuyPercent, maxPosition;
  const params = STRATEGY_PARAMS[riskProfile];

  if (decision === "买入") {
    firstBuyPercent = 0.05; // 首次建仓5%
    maxPosition = params.maxPosition;
  } else if (decision === "观望") {
    firstBuyPercent = 0.025; // 观望时轻仓2.5%
    maxPosition = params.maxPosition * 0.5; // 最大仓位减半
  } else {
    firstBuyPercent = 0; // 回避时不建仓
    maxPosition = 0;
  }

  // 构建加仓条件
  const addOnConditions = [];
  if (decision === "买入") {
    // 价格突破建仓区间上限时加仓5%
    addOnConditions.push({
      type: "price",
      value: buyHigh,
      percent: 0.05
    });
    // 放量突破布林上轨时加仓5%
    addOnConditions.push({
      type: "breakout",
      condition: "放量突破布林上轨",
      percent: 0.05
    });
  }

  return {
    firstBuyPercent,
    maxPosition,
    addOnConditions,
    riskProfile
  };
}

// 策略参数配置：根据风险偏好动态调整仓位上限和止损幅度
const STRATEGY_PARAMS = {
  aggressive: { maxPosition: 0.2, stopLossPercent: 0.08, requireVolume: true },
  balanced: { maxPosition: 0.15, stopLossPercent: 0.06, requireVolume: false },
  conservative: { maxPosition: 0.1, stopLossPercent: 0.04, requireVolume: false }
};

// 量化判断：放量定义为量比 > 1.5
function isHighVolume(volumeRatio) {
  return toNumber(volumeRatio) > 1.5;
}

// 量化判断：MACD改善定义为金叉或柱线由负转正
function isMacdImproving(macdSignal) {
  return macdSignal.includes('金叉') || macdSignal.includes('多头延续');
}

function buildStrategy(decision, technical, buyZone = null, stopLoss = null, targetPrice = null) {
  const { ma10, ma20, bb_upper, bb_middle, bb_lower, volume_ratio, macdSignal } = technical.latest;
  const price = technical.price;
  const volumeHint = isHighVolume(volume_ratio) ? '当前已放量' : '需等待放量确认';

  // 如果没有传入建仓区间，使用技术位置作为参考
  const [buyLow, buyHigh] = buyZone || [bb_lower, bb_middle];
  const stop = stopLoss || buyLow * 0.95;
  const target = targetPrice || price * 1.15;

  // 根据 decision 返回不同策略
  if (decision === '买入') {
    return {
      aggressive: `可在建仓区间 ${formatYuan(buyLow)}~${formatYuan(buyHigh)} 内分批建仓，激进者可于 ${formatYuan(ma10)} 附近先试仓 5%~10%（最大仓位 ${(STRATEGY_PARAMS.aggressive.maxPosition * 100).toFixed(0)}%）。${volumeHint}突破 ${formatYuan(bb_upper)} 可追加 5%。止损设于 ${formatYuan(stop)}（-${(STRATEGY_PARAMS.aggressive.stopLossPercent * 100).toFixed(0)}%），第一目标看 ${formatYuan(target)}。`,
      balanced: `建议等待价格站稳 ${formatYuan(ma20)} 且位于建仓区间 ${formatYuan(buyLow)}~${formatYuan(buyHigh)} 内时，分两笔建仓，每笔 5%，合计不超过 ${(STRATEGY_PARAMS.balanced.maxPosition * 100).toFixed(0)}%。止损 ${formatYuan(stop)}（-${(STRATEGY_PARAMS.balanced.stopLossPercent * 100).toFixed(0)}%），目标 ${formatYuan(target)}。`,
      conservative: `待 MACD 确认金叉（目前${isMacdImproving(macdSignal) ? '已改善' : '未确认'}）且财报基本面同步改善后，在 ${formatYuan(buyLow)} 附近轻仓试水 ${(STRATEGY_PARAMS.conservative.maxPosition * 50).toFixed(0)}%（即总仓位 ${(STRATEGY_PARAMS.conservative.maxPosition * 100 / 2).toFixed(0)}%），止损设于 ${formatYuan(stop)}（-${(STRATEGY_PARAMS.conservative.stopLossPercent * 100).toFixed(0)}%）下方。若无明确信号，建议观望。`,
    };
  } else if (decision === '观望') {
    return {
      aggressive: `暂不建议积极建仓。若股价放量突破 ${formatYuan(bb_upper)} 且站稳 ${formatYuan(ma20)}，可考虑右侧跟进，但需快进快出。关注建仓区间 ${formatYuan(buyLow)}~${formatYuan(buyHigh)} 的支撑力度。`,
      balanced: `等待价格重新站稳 ${formatYuan(ma20)} 且成交量温和放大（量比>1.5），同时关注建仓区间 ${formatYuan(buyLow)}~${formatYuan(buyHigh)} 的支撑，若出现企稳信号可轻仓试错（不超过 ${(STRATEGY_PARAMS.balanced.maxPosition * 50).toFixed(0)}%）。`,
      conservative: `MACD 信号未明朗（${macdSignal}），建议继续观察。除非财报或资金面出现显著改善，否则不参与。`,
    };
  } else { // 回避
    return {
      aggressive: `风险较高，建议规避，不宜追价。若已持仓，考虑在 ${formatYuan(ma20)} 下方减仓。`,
      balanced: `暂不符合建仓条件，保持观望。等待价格企稳并重新站上 ${formatYuan(ma20)} 后再评估。`,
      conservative: `各项指标偏弱，优先控制风险，不建议参与。当前止损参考位 ${formatYuan(stop)}。`,
    };
  }
}

async function buildReportData(basicInfo, realtimeQuote, technical, valuation, incomeRows, finaRows, moneyflowThsRows, moneyflowRows, holderRows, northMoneyRows) {
  const latestDailyBasic = valuation || {};
  const latestIncome = safeLatest(incomeRows);
  const latestFina = safeLatest(finaRows);
  const latestThsFlow = safeLatest(moneyflowThsRows);
  const latestFlow = safeLatest(moneyflowRows);
  const latestHolder = safeLatest(holderRows);
  const latestNorthMoney = safeLatest(northMoneyRows);

  // 获取ATR和历史PE数据
  const atrData = await getATR(basicInfo.ts_code);
  const peHistory = await getStockPePercentile(basicInfo.ts_code);

  // 使用新的6因子评分系统
  const scoreResult = await calculateCompositeScore({
    technical,
    valuation: latestDailyBasic,
    industry: basicInfo.industry,
    thsFlow: latestThsFlow,
    flow: latestFlow,
    fina: latestFina,
    income: latestIncome,
    atr20: atrData?.atr20,
    peHistory
  });

  const reportScore = scoreResult.reportScore;
  const decision = scoreResult.decision;
  const scoreFactors = scoreResult.factors;

  const basicSummary = [
    `所属行业为 ${basicInfo.industry || '未披露'}，上市日期 ${basicInfo.list_date || '未披露'}。`,
    latestIncome ? `最近一期营业总收入 ${formatYiFromYuan(latestIncome.total_revenue)}，净利润 ${formatYiFromYuan(latestIncome.n_income)}。` : '利润表最新口径暂缺，基本面判断需要结合后续财报。 ',
    latestFina ? `ROE ${formatPercent(latestFina.roe)}、毛利率 ${formatPercent(latestFina.grossprofit_margin)}、资产负债率 ${formatPercent(latestFina.debt_to_assets)}。` : '财务指标样本不足，成长与盈利质量需要继续确认。',
    `总市值 ${formatYi(latestDailyBasic.total_mv)}，所在市场 ${basicInfo.market || '未披露'}。`,
  ];

  const bullPoints = [
    `当前价格 ${formatYuan(technical.price)}，${technical.maSignal}，技术面没有继续摆烂。`,
    `${technical.macdSignal}，RSI ${toNumber(technical.latest.rsi).toFixed(2)}，说明动能仍有跟踪价值。`,
    `PE(TTM) ${toNumber(latestDailyBasic.pe_ttm).toFixed(2)}、PB ${toNumber(latestDailyBasic.pb).toFixed(2)}，估值处在 ${toNumber(latestDailyBasic.pe_ttm) > 0 && toNumber(latestDailyBasic.pe_ttm) < 40 ? '可讨论区间' : '偏高区间'}。`,
    `最新主力净流入 ${latestThsFlow ? `${toNumber(latestThsFlow.net_amount).toFixed(2)} 万元` : `${toNumber(latestFlow?.net_mf_amount).toFixed(2)} 万元`}，资金面至少不是完全躺平。`,
    latestFina ? `最新财务指标显示营收同比 ${formatPercent(latestFina.tr_yoy)}、净利润同比 ${formatPercent(latestFina.netprofit_yoy)}。` : '财务指标样本有限，需结合下期财报继续确认。',
  ];

  const bearPoints = [
    `若股价重新跌破 ${formatYuan(technical.latest.ma20)}，趋势确认会被打回原形。`,
    `RSI ${toNumber(technical.latest.rsi).toFixed(2)} 与布林带信号显示短线并非无脑上车区间。`,
    `估值中枢仍受 ${basicInfo.industry || '行业'} 景气波动影响，一旦预期降温，回撤会来得很快。`,
    latestHolder ? `股东户数 ${toNumber(latestHolder.holder_num).toLocaleString('zh-CN')}，筹码集中度变化还需继续观察。` : '筹码数据不完整，资金风格切换时容易误判。',
    '实时行情依赖新浪财经 MCP，若外部数据源中断，盘中判断会失真。',
  ];

  const committeeOpinion = decision === '买入'
    ? '风险管理委员会意见：可进入重点跟踪和分批建仓名单，但必须以实时资金与后续财报验证为前提。'
    : decision === '观望'
      ? '风险管理委员会意见：暂列观察池，等待技术面和资金面给出更明确确认。'
      : '风险管理委员会意见：当前不建议参与，优先等待估值或趋势重新修复。';

  const finalSuggestion = decision === '买入'
    ? `${basicInfo.name} 当前属于“有逻辑、但要讲纪律”的标的，适合在支撑位附近水灵灵地分批布局，不适合追涨上头。`
    : decision === '观望'
      ? `${basicInfo.name} 目前更像“有故事但确认还不够”的状态，先观察价格、量能和财务数据是否同向改善。`
      : `${basicInfo.name} 当前赔率与胜率都不占优，先别让仓位去接飞刀。`;

  const watchPoints = [
    `实时价格能否稳定运行在 ${formatYuan(technical.latest.ma20)} 上方。`,
    `下一期财报中营收同比 ${latestFina ? formatPercent(latestFina.tr_yoy) : 'N/A'} 与净利润同比 ${latestFina ? formatPercent(latestFina.netprofit_yoy) : 'N/A'} 是否继续改善。`,
    `主力资金净流入和 5 日资金净额是否持续转强。`,
    `${basicInfo.industry || '所属行业'} 的政策、招标、订单或新产品进展。`,
    `北向资金（日度市场口径 ${latestNorthMoney ? `${toNumber(latestNorthMoney.north_money).toFixed(2)} 百万元` : 'N/A'}）是否维持风险偏好。`,
  ];

  const targetPrices = buildTargetPrices(technical, decision);

  // 计算建仓区间、止损点和目标价
  const buyZone = calculateBuyZone(technical, latestDailyBasic, basicInfo.industry);
  const stopLoss = calculateStopLoss(technical, buyZone, decision);
  const targetPrice = calculateTargetPrice(technical, buyZone, reportScore, decision);

  return {
    generatedAt: new Date().toISOString(),
    stock: basicInfo,
    reportScore,
    decision,
    technical,
    realtimeQuote,
    valuation: latestDailyBasic,
    basicSummary,
    latestIncome,
    latestFina,
    latestThsFlow,
    latestFlow,
    latestHolder,
    latestNorthMoney,
    bullPoints,
    bearPoints,
    committeeOpinion,
    finalSuggestion,
    watchPoints,
    buyZone,
    stopLoss,
    targetPrice,
    strategies: buildStrategy(decision, technical, buyZone, stopLoss, targetPrice),
    strategy: buildStructuredStrategy(decision, technical, buyZone, stopLoss, targetPrice),
    targetPrices,
    scoreFactors: scoreResult,
  };
}

async function buildReportPayload(query) {
  const basicInfo = await searchStock(query);
  let realtimeQuote;
  try {
    realtimeQuote = await getRealtimeQuote(basicInfo.ts_code);
  } catch (error) {
    throw new MarketDataError(`新浪财经实时行情不可用：${error.message}`, {
      code: 'REALTIME_QUOTE_UNAVAILABLE',
      status: 503,
      details: error.details || null,
    });
  }

  const dailyRows = await getDailyHistory(basicInfo.ts_code);
  const indicatorRows = calculateTechnicalIndicators(dailyRows);
  const technical = analyzeTechnical(indicatorRows, realtimeQuote);
  const tradeDate = technical.latest.trade_date;

  const [valuation, incomeRows, finaRows, moneyflowThsRows, moneyflowRows, holderRows, northMoneyRows] = await Promise.all([
    getLatestDailyBasic(basicInfo.ts_code),
    getIncomeRows(basicInfo.ts_code),
    getFinaIndicatorRows(basicInfo.ts_code),
    getMoneyflowThsRows(basicInfo.ts_code, tradeDate).catch(() => []),
    getMoneyflowRows(basicInfo.ts_code, tradeDate).catch(() => []),
    getHolderNumberRows(basicInfo.ts_code).catch(() => []),
    getNorthMoneyRows(tradeDate).catch(() => []),
  ]);

  return await buildReportData(basicInfo, realtimeQuote, technical, valuation, incomeRows, finaRows, moneyflowThsRows, moneyflowRows, holderRows, northMoneyRows);
}

function renderMetricTable(payload) {
  return toMarkdownTable(
    ['指标', '数值', '判断'],
    [
      ['MA5', formatYuan(payload.technical.latest.ma5), payload.technical.price >= toNumber(payload.technical.latest.ma5) ? '股价在 MA5 上方' : '股价跌破 MA5'],
      ['MA10', formatYuan(payload.technical.latest.ma10), payload.technical.price >= toNumber(payload.technical.latest.ma10) ? '股价在 MA10 上方' : '股价跌破 MA10'],
      ['MA20', formatYuan(payload.technical.latest.ma20), payload.technical.maSignal],
      ['MA60', formatYuan(payload.technical.latest.ma60), payload.technical.price >= toNumber(payload.technical.latest.ma60) ? '中长期趋势尚稳' : '中长期趋势承压'],
      ['MACD DIF', toNumber(payload.technical.latest.macd_dif).toFixed(4), payload.technical.macdSignal],
      ['MACD DEA', toNumber(payload.technical.latest.macd_dea).toFixed(4), toNumber(payload.technical.latest.macd_dif) >= toNumber(payload.technical.latest.macd_dea) ? '多头占优' : '空头占优'],
      ['MACD 柱', toNumber(payload.technical.latest.macd_bar).toFixed(4), toNumber(payload.technical.latest.macd_bar) >= 0 ? '红柱' : '绿柱'],
      ['RSI(14)', toNumber(payload.technical.latest.rsi).toFixed(2), payload.technical.rsiSignal],
      ['布林上轨', formatYuan(payload.technical.latest.bb_upper), '短线压力位'],
      ['布林中轨', formatYuan(payload.technical.latest.bb_middle), payload.technical.bollSignal],
      ['布林下轨', formatYuan(payload.technical.latest.bb_lower), '短线支撑位'],
    ]
  );
}

function renderStockReport(payload) {
  const generatedAt = new Date(payload.generatedAt);
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? payload.generatedAt
    : generatedAt.toLocaleString('zh-CN', { hour12: false });

  const valuationTable = toMarkdownTable(
    ['指标', '数值', '判断'],
    [
      ['PE(TTM)', toNumber(payload.valuation.pe_ttm).toFixed(2), toNumber(payload.valuation.pe_ttm) > 50 ? '偏高' : toNumber(payload.valuation.pe_ttm) > 0 ? '合理' : '暂无'],
      ['PB', toNumber(payload.valuation.pb).toFixed(2), toNumber(payload.valuation.pb) > 5 ? '偏高' : '合理'],
      ['PS', toNumber(payload.valuation.ps).toFixed(2), toNumber(payload.valuation.ps) > 6 ? '偏高' : '可接受'],
      ['股息率(TTM)', `${toNumber(payload.valuation.dv_ttm).toFixed(2)}%`, toNumber(payload.valuation.dv_ttm) > 0 ? '有分红支撑' : '分红支撑较弱'],
      ['总市值', formatYi(payload.valuation.total_mv), toNumber(payload.valuation.total_mv) > 0 ? '真实 Tushare 最新口径' : '暂无'],
    ]
  );

  const fundTable = toMarkdownTable(
    ['指标', '数值'],
    [
      ['换手率', `${toNumber(payload.valuation.turnover_rate).toFixed(2)}%`],
      ['量比', toNumber(payload.valuation.volume_ratio).toFixed(2)],
      ['同花顺主力净流入', payload.latestThsFlow ? `${toNumber(payload.latestThsFlow.net_amount).toFixed(2)} 万元` : '暂无'],
      ['5日主力净额', payload.latestThsFlow ? `${toNumber(payload.latestThsFlow.net_d5_amount).toFixed(2)} 万元` : '暂无'],
      ['Tushare 净流入额', payload.latestFlow ? `${toNumber(payload.latestFlow.net_mf_amount).toFixed(2)} 万元` : '暂无'],
      ['股东人数', payload.latestHolder ? `${toNumber(payload.latestHolder.holder_num).toLocaleString('zh-CN')} 户` : '暂无'],
      ['北向资金（市场口径）', payload.latestNorthMoney ? `${toNumber(payload.latestNorthMoney.north_money).toFixed(2)} 百万元` : '暂无'],
    ]
  );

  const targetTable = toMarkdownTable(
    ['时间', '目标价', '对应逻辑', '预期涨幅'],
    payload.targetPrices.map((item) => [
      item.period,
      formatYuan(item.price),
      item.logic,
      `${item.rise.toFixed(2)}%`,
    ])
  );

  return [
    `# ${payload.stock.name} 分析报告`,
    '',
    `- 生成时间：${generatedLabel}`,
    `- 数据来源：新浪财经 MCP 实时行情 + Tushare Pro 历史/财务/资金数据`,
    '',
    '## 1. 核心信息',
    `- 股票名称：${payload.stock.name}`,
    `- 股票代码：${payload.stock.ts_code}`,
    `- 当前价格：${formatYuan(payload.technical.price)}`,
    `- 行业：${payload.stock.industry || '-'}`,
    `- 研究评级：${toStars(payload.reportScore)}（${payload.reportScore.toFixed(1)} / 5）`,
    `- 最终决策：${payload.decision}`,
    `- 实时行情：今日涨跌 ${payload.technical.change.toFixed(2)} 元（${payload.technical.pctChange.toFixed(2)}%），开盘 ${formatYuan(payload.technical.open)}，最高 ${formatYuan(payload.technical.high)}，最低 ${formatYuan(payload.technical.low)}`,
    '',
    '## 2. 关键技术指标',
    renderMetricTable(payload),
    '',
    '## 3. 基本面分析',
    ...payload.basicSummary.map((item) => `- ${item.trim()}`),
    '',
    '## 4. 估值分析',
    valuationTable,
    '',
    '## 5. 资金面数据',
    fundTable,
    '',
    '## 6. 核心争议点（多方 vs 空方）',
    '**多方观点**',
    ...payload.bullPoints.map((item) => `- ${item}`),
    '',
    '**空方观点**',
    ...payload.bearPoints.map((item) => `- ${item}`),
    '',
    '## 7. 风险管理委员会决策意见',
    payload.committeeOpinion,
    '',
    '## 8. 关键观察点',
    ...payload.watchPoints.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## 9. 最终建议',
    payload.finalSuggestion,
    '',
    '## 10. 操作建议（量化版）',
    `- 建仓区间：${formatYuan(payload.buyZone[0])} ~ ${formatYuan(payload.buyZone[1])}`,
    `- 止损点：${formatYuan(payload.stopLoss)}（-${((1 - payload.stopLoss / payload.technical.price) * 100).toFixed(2)}%）`,
    `- 目标价：${formatYuan(payload.targetPrice)}（+${((payload.targetPrice / payload.technical.price - 1) * 100).toFixed(2)}%）`,
    `- 盈亏比：约 ${((payload.targetPrice - payload.technical.price) / (payload.technical.price - payload.stopLoss)).toFixed(2)} : 1`,
    '',
    '## 11. 适合你的策略（按风险偏好）',
    `### 激进型\n- ${payload.strategies.aggressive}`,
    '',
    `### 稳健型\n- ${payload.strategies.balanced}`,
    '',
    `### 保守型\n- ${payload.strategies.conservative}`,
    '',
    '## 12. 操作建议（时间维度）',
    `- 短线（1周）：围绕 ${formatYuan(payload.technical.latest.ma10)} 至 ${formatYuan(payload.technical.latest.ma20)} 区间观察承接，失守支撑则降低仓位。`,
    '- 中线（1-3个月）：重点看业绩、资金和价格能否同步抬升，只有三者共振才考虑加仓。',
    `- 长线（6个月以上）：继续跟踪 ${payload.stock.industry || '行业'} 逻辑、产品兑现和估值中枢变化。`,
    '',
    '## 13. 目标价格测算',
    targetTable,
    '',
    '## 14. 风险控制',
    `- 硬止损：若价格跌破 ${formatYuan(payload.stopLoss)}（建仓区间下限下方），应果断止损。`,
    `- 动态止损：若股价重新跌破 ${formatYuan(payload.technical.latest.ma20)}，趋势确认会被打回原形。`,
    '- 时间止损：若后续财报不能延续营收/利润改善，估值修复逻辑会被打脸。',
    `- 止盈策略：第一目标看 ${formatYuan(payload.targetPrice)}，第二目标看 3-6 个月区间，超预期情景按乐观目标执行移动止盈。`,
    '- 数据源风险：若新浪财经 MCP 或 Tushare 数据源异常，盘中判断与报告刷新都应暂停，避免拿旧数据硬控自己。',
    '',
  ].join('\n');
}

async function writeStockReport(query) {
  const payload = await buildReportPayload(query);
  const dateStamp = payload.generatedAt.slice(0, 10).replace(/-/g, '');
  const fileName = `${slugify(payload.stock.name)}_分析报告_${dateStamp}.md`;
  const fullPath = path.join(REPORT_DIR, fileName);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(fullPath, renderStockReport(payload), 'utf8');
  return { payload, fileName, fullPath };
}

async function analyzeHandler(req, res) {
  const directions = normalizeDirections(req.body && req.body.directions);
  if (directions.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'directions is required',
      stocks: [],
    });
  }

  try {
    const stocks = await buildAnalyzeList(directions);
    return res.json({ success: true, stocks });
  } catch (error) {
    return res.status(error instanceof MarketDataError ? error.status : 500).json({
      success: false,
      message: error.message,
      details: error instanceof MarketDataError ? error.details : null,
      stocks: [],
    });
  }
}

router.post('/', analyzeHandler);

router.post('/report', async (req, res) => {
  const stockName = typeof req.body?.stock_name === 'string' ? req.body.stock_name.trim() : '';
  const stockCode = typeof req.body?.stock_code === 'string' ? req.body.stock_code.trim() : '';
  const query = stockCode || stockName;

  if (!query) {
    return res.status(400).json({
      success: false,
      message: 'stock_name or stock_code is required',
    });
  }

  try {
    const report = await writeStockReport(query);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({
      success: true,
      report_path: `${baseUrl}/report/analysis/${encodeURIComponent(report.fileName)}`,
      stock: {
        name: report.payload.stock.name,
        code: report.payload.stock.ts_code,
        decision: report.payload.decision,
        current_price: report.payload.technical.price,
      },
    });
  } catch (error) {
    return res.status(error instanceof MarketDataError ? error.status : 500).json({
      success: false,
      message: error.message,
      details: error instanceof MarketDataError ? error.details : null,
    });
  }
});

router.analyzeHandler = analyzeHandler;
router.buildReportPayload = buildReportPayload;
module.exports = router;

if (require.main === module) {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  app.use(express.json());
  app.use('/api/analyze', router);
  app.listen(port, () => {
    console.log(`analyze api listening on http://localhost:${port}/api/analyze`);
  });
}
