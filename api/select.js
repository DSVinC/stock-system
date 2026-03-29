/**
 * API 模块：行业选股 (select.js)
 * 
 * 职责：负责行业方向数据的筛选和推荐
 * - 读取选股报告数据 (report/selection/)
 * - 计算四维度评分（社会经济趋势、政策方向、舆论热度、商业变现）
 * - 生成行业推荐列表和成分股 picks
 * 
 * 主要接口：
 * - GET /api/select - 获取行业方向推荐列表
 * - POST /api/select/report - 生成选股报告
 * 
 * 依赖：market-data.js (tushareRequest, getSelectionDatasets)
 */

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const express = require('express');
// express already required above
const Database = require('better-sqlite3');
const { MarketDataError, getSelectionDatasets, toNumber, tushareRequest } = require('./market-data');
const { saveSelectionReport, getSelectionHistory, getSelectionReport } = require('./selection-report');

// TASK_API_001: 导入 V4 决策引擎
const { HistoricalDecisionEngine, STRATEGY_CONFIG } = require('./backtest-decision');

// 数据库连接（单例）
const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
let dbCache = null;
function getDb() {
  if (!dbCache) {
    dbCache = new Database(DB_PATH, { readonly: true });
  }
  return dbCache;
}

const router = express.Router();
const REPORT_DIR = path.join(__dirname, '..', '..', 'report', 'selection');

const POLICY_KEYWORDS = {
  5: ['算力', '人工智能', '机器人', '创新药', '低空', '半导体', '芯片', '储能', '电网', '数据', '信创', '卫星', '军工'],
  4: ['医疗', '工业', '新能源', '智能', '新材料', '高端制造', '汽车', '消费电子', '光模块', '服务器', '云', '数字'],
};

function normalizeName(value) {
  return String(value || '').trim();
}

function keywordScore(name) {
  const normalized = normalizeName(name);
  if (!normalized) return 3;

  for (const keyword of POLICY_KEYWORDS[5]) {
    if (normalized.includes(keyword)) return 5;
  }
  for (const keyword of POLICY_KEYWORDS[4]) {
    if (normalized.includes(keyword)) return 4;
  }
  return 3;
}

function dimensionFromRaw(rawValue) {
  const normalized = Math.max(0, Math.min(100, rawValue));
  if (normalized >= 85) return 5;
  if (normalized >= 70) return 4;
  if (normalized >= 55) return 3;
  if (normalized >= 35) return 2;
  return 1;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSnapshotDimension(rawValue, fallback = 3) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  // 快照库维度字段当前主要是 0-10 口径，这里统一折算为前端展示使用的 1-5 区间。
  return Number((clamp(numeric, 0, 10) / 2).toFixed(1));
}

function shouldExcludeTsCode(tsCode, filters = {}) {
  const code = String(tsCode || '').trim().toUpperCase();
  if (!code) return false;

  const excludedMarkets = Array.isArray(filters.excludeMarkets)
    ? filters.excludeMarkets.map(item => String(item || '').trim().toUpperCase())
    : [];

  if (excludedMarkets.includes('BJ') && code.endsWith('.BJ')) {
    return true;
  }

  return false;
}

function normalizeWeightMap(input, keys, defaults) {
  const normalized = {};
  let sum = 0;

  for (const key of keys) {
    const raw = input && Object.prototype.hasOwnProperty.call(input, key)
      ? Number(input[key])
      : Number(defaults[key]);
    const value = Number.isFinite(raw) && raw > 0 ? raw : 0;
    normalized[key] = value;
    sum += value;
  }

  if (sum <= 0) {
    return { ...defaults };
  }

  for (const key of keys) {
    normalized[key] = normalized[key] / sum;
  }
  return normalized;
}

function toMarkdownTable(headers, rows) {
  const normalizedRows = rows.map((row) => row.map((cell) => String(cell).replace(/\|/g, '\\|').replace(/\n/g, '<br>')));
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...normalizedRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

async function buildDirectionPicks(direction, dailyBasicMap, stockBasicMap) {
  const members = await tushareRequest('ths_member', {
    ts_code: direction.ts_code,
  }, ['ts_code', 'con_code', 'con_name']);

  const picks = members
    .map((member) => {
      const quote = dailyBasicMap.get(member.con_code) || {};
      const basic = stockBasicMap.get(member.con_code) || {};
      const totalMv = toNumber(quote.total_mv) / 10000;
      const peTtm = toNumber(quote.pe_ttm);
      const turnoverRate = toNumber(quote.turnover_rate);
      const volumeRatio = toNumber(quote.volume_ratio);

      // 个股综合评分（100 分制）
      // 市值评分（40 分）：市值越大分数越高
      const mvScore = Math.min(40, Math.log10(totalMv + 1) * 8);
      // PE 评分（30 分）：PE 在 10-30 之间最佳
      let peScore = 30;
      if (peTtm > 0) {
        if (peTtm >= 10 && peTtm <= 30) peScore = 30;
        else if (peTtm < 10) peScore = 20;
        else if (peTtm > 30 && peTtm <= 50) peScore = 15;
        else peScore = 5;
      }
      // 换手率评分（15 分）：2-8% 最佳
      let turnoverScore = 15;
      if (turnoverRate >= 2 && turnoverRate <= 8) turnoverScore = 15;
      else if (turnoverRate < 2) turnoverScore = 8;
      else turnoverScore = 5;
      // 量比评分（15 分）：1-3 最佳
      let volumeScore = 15;
      if (volumeRatio >= 1 && volumeRatio <= 3) volumeScore = 15;
      else if (volumeRatio < 1) volumeScore = 8;
      else volumeScore = 5;

      const score = Math.round(mvScore + peScore + turnoverScore + volumeScore);

      return {
        ts_code: member.con_code,
        code: member.con_code, // 兼容决策生成阶段读取 s.code
        name: member.con_name,
        industry: basic.industry || '',
        total_mv: totalMv,
        turnover_rate: turnoverRate,
        volume_ratio: volumeRatio,
        pe_ttm: peTtm,
        score: score,
      };
    })
    .filter((item) => item.total_mv > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.total_mv !== left.total_mv) return right.total_mv - left.total_mv;
      return left.code.localeCompare(right.code, 'zh-CN');
    })
    .slice(0, 5);

  return picks;
}

function buildReason(direction) {
  const fragments = [
    `板块资金净流入 ${direction.metrics.netAmount.toFixed(2)} 亿元`,
    `近端热度排名 ${direction.metrics.hotRank ? `第 ${direction.metrics.hotRank} 名` : '暂无热榜数据'}`,
    `板块成分 ${direction.metrics.companyCount} 家`,
    `近一年相关 IPO ${direction.metrics.ipoMatches} 家`,
  ];

  return `${direction.name} 当前由真实市场数据筛出：${fragments.join('，')}，四维度综合得分 ${direction.score}。`;
}

// TASK_V4_FIX_001: 从历史快照数据构建选股 payload
async function buildSelectionPayloadFromSnapshot(date, strategy, filters) {
  const db = getDb();
  // 支持多种日期格式：2024-01-02, 2024/01/02
  const originalDate = String(date);
  const dateStamp = originalDate.replace(/[-/]/g, '');
  
  // 先检查该日期是否有数据
  const checkSql = `SELECT trade_date FROM stock_factor_snapshot WHERE trade_date = ? LIMIT 1`;
  let checkResult = db.prepare(checkSql).get(dateStamp);
  
  let adjustedDate = originalDate;
  let dateAdjusted = false;
  
  if (!checkResult) {
    // 日期无数据，找之前最后一个交易日（避免未来函数）
    const findSql = `SELECT trade_date FROM stock_factor_snapshot WHERE trade_date <= ? ORDER BY trade_date DESC LIMIT 1`;
    const prevTrade = db.prepare(findSql).get(dateStamp);
    
    if (prevTrade) {
      adjustedDate = String(prevTrade.trade_date).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      dateAdjusted = true;
      console.log(`[select.js] 日期 ${originalDate} 非交易日，调整至 ${adjustedDate}`);
    } else {
      return {
        tradeDate: originalDate,
        directions: [],
        message: `日期 ${originalDate} 附近无有效交易数据`
      };
    }
  }
  
  const finalDateStamp = adjustedDate.replace(/[-/]/g, '');
  
  console.log(`[select.js] 使用历史快照数据，日期：${adjustedDate} (${finalDateStamp})`);
  console.log(`[select.js] 筛选参数:`, JSON.stringify(filters));
  
  // 获取原始因子数据（包含七个因子）
  const factorSnapshot = db.prepare(`
    SELECT ts_code, industry, 
           trend_score, momentum_score, valuation_score, earnings_score,
           capital_score_raw, volatility_score, sentiment_score_raw,
           social_score, policy_score_raw, public_score, business_score,
           seven_factor_score, pe_ttm, pb, netprofit_growth, trade_date
    FROM stock_factor_snapshot
    WHERE trade_date = ?
    ORDER BY seven_factor_score DESC
  `).all(finalDateStamp);
  
  if (factorSnapshot.length === 0) {
    console.warn(`[select.js] 日期 ${adjustedDate} 无快照数据，返回空结果`);
    return {
      tradeDate: adjustedDate,
      directions: [],
      message: `日期 ${adjustedDate} 无快照数据`
    };
  }
  
  console.log(`[select.js] 获取到 ${factorSnapshot.length} 条因子快照记录`);
  
  // 从 stock_list 获取股票基本信息
  const stockBasic = db.prepare(`
    SELECT ts_code, stock_name as name
    FROM stock_list
  `).all();
  const stockBasicMap = new Map(stockBasic.map((item) => [item.ts_code, item]));
  
  // 如果有价格筛选，需要获取股票价格数据
  let priceMap = new Map();
  let priceDataAvailable = false;
  if (filters.maxPrice) {
    // 获取该日期的所有价格数据
    const priceSql = `SELECT ts_code, close FROM stock_daily WHERE trade_date = ?`;
    try {
      const prices = db.prepare(priceSql).all(finalDateStamp);
      if (prices.length > 0) {
        priceMap = new Map(prices.map(p => [p.ts_code, p.close]));
        priceDataAvailable = true;
        console.log(`[select.js] 获取到 ${prices.length} 条价格数据，筛选 maxPrice <= ${filters.maxPrice}`);
      } else {
        console.warn(`[select.js] 日期 ${adjustedDate} 无价格数据，跳过价格筛选`);
      }
    } catch (e) {
      console.warn(`[select.js] 获取价格数据失败：${e.message}`);
    }
  }
  
  // 构建个股评分列表（使用动态权重计算）
  const stockScores = factorSnapshot
    .map((row) => {
      // 转换 ts_code 格式：601728.SH -> sh.601728
      const normalizedTsCode = row.ts_code.toLowerCase().split('.').reverse().join('.');
      const stock = stockBasicMap.get(normalizedTsCode);
      const price = priceMap.get(row.ts_code);
      
      // 动态计算七因子评分（使用传入的权重）
      let dynamicScore = row.seven_factor_score; // 默认使用预计算值
      if (filters.factorWeights) {
        const w = normalizeWeightMap(
          filters.factorWeights,
          ['trend', 'momentum', 'valuation', 'earnings', 'capital', 'volatility', 'sentiment'],
          { trend: 0.14, momentum: 0.14, valuation: 0.14, earnings: 0.14, capital: 0.14, volatility: 0.15, sentiment: 0.15 }
        );
        dynamicScore = (
          (row.trend_score || 5) * (w.trend || 0.14) +
          (row.momentum_score || 5) * (w.momentum || 0.14) +
          (row.valuation_score || 5) * (w.valuation || 0.14) +
          (row.earnings_score || 5) * (w.earnings || 0.14) +
          (row.capital_score_raw || 5) * (w.capital || 0.14) +
          (row.volatility_score || 5) * (w.volatility || 0.15) +
          (row.sentiment_score_raw || 5) * (w.sentiment || 0.15)
        );
        console.log(`[select.js] ${row.ts_code} 动态评分：${dynamicScore.toFixed(2)} (原：${row.seven_factor_score})`);
      }
      
      return {
        ts_code: row.ts_code,
        name: stock?.name || row.ts_code,
        industry: row.industry || '',
        score: dynamicScore, // 使用动态计算的分数
        netprofitGrowth: row.netprofit_growth || 0, // 用于 PEG 计算
        snapshotDimensions: {
          social: toNumber(row.social_score),
          policy: toNumber(row.policy_score_raw),
          public: toNumber(row.public_score),
          business: toNumber(row.business_score),
          sentiment: toNumber(row.sentiment_score_raw),
        },
        factors: {
          pe: row.pe_ttm,
          pb: row.pb,
          price: price,
          sevenFactors: {
            trend: row.trend_score,
            momentum: row.momentum_score,
            valuation: row.valuation_score,
            earnings: row.earnings_score,
            capital: row.capital_score_raw,
            volatility: row.volatility_score,
            sentiment: row.sentiment_score_raw
          }
        }
      };
    })
    .filter(s => {
      // 应用筛选条件
      if (shouldExcludeTsCode(s.ts_code, filters)) return false;
      if (filters.minSevenFactorScore && s.score < filters.minSevenFactorScore) return false;
      if (filters.peMax && s.factors.pe && s.factors.pe > filters.peMax) return false;
      
      // PEG 筛选：PEG = PE / 净利润增长率（增长率单位为%，如 10 表示 10%）
      if (filters.pegMax) {
        const netprofitGrowth = s.netprofitGrowth || 0;
        // 只对有正增长且 PE 为正的股票计算 PEG
        const peg = s.factors.pe && netprofitGrowth > 0 ? s.factors.pe / netprofitGrowth : 999;
        if (peg > filters.pegMax) return false;
      }
      
      // 只在价格数据可用时应用价格筛选
      if (filters.maxPrice && priceDataAvailable && s.factors.price && s.factors.price > filters.maxPrice) return false;
      
      const minScoreThreshold = Number(filters.minSevenFactorScore || 0.75);
      return s.score >= minScoreThreshold;
    })
    .sort((a, b) => b.score - a.score);
  
  console.log(`[select.js] 筛选后剩余 ${stockScores.length} 只股票`);
  
  // 按行业分组，计算行业得分
  const industryMap = new Map();
  for (const stock of stockScores) {
    const industry = stock.industry || '其他';
    if (!industryMap.has(industry)) {
      industryMap.set(industry, {
        name: industry,
        stocks: [],
        totalScore: 0,
        dimensionTotals: { social: 0, policy: 0, public: 0, business: 0, sentiment: 0 },
        dimensionSamples: { social: new Set(), public: new Set() },
      });
    }
    const ind = industryMap.get(industry);
    ind.stocks.push(stock);
    ind.totalScore += stock.score;
    ind.dimensionTotals.social += stock.snapshotDimensions.social;
    ind.dimensionTotals.policy += stock.snapshotDimensions.policy;
    ind.dimensionTotals.public += stock.snapshotDimensions.public;
    ind.dimensionTotals.business += stock.snapshotDimensions.business;
    ind.dimensionTotals.sentiment += stock.snapshotDimensions.sentiment;
    if (Number.isFinite(stock.snapshotDimensions.social)) {
      ind.dimensionSamples.social.add(stock.snapshotDimensions.social);
    }
    if (Number.isFinite(stock.snapshotDimensions.public)) {
      ind.dimensionSamples.public.add(stock.snapshotDimensions.public);
    }
  }
  
  const dimensionWeights = normalizeWeightMap(
    filters.dimensionWeights,
    ['social', 'policy', 'public', 'business'],
    { social: 0.25, policy: 0.25, public: 0.25, business: 0.25 }
  );

  // 计算行业平均分并排序
  const industries = Array.from(industryMap.values())
    .map(ind => {
      const stockCount = ind.stocks.length;
      const avgScore = ind.totalScore / stockCount;
      const avgSocialRaw = ind.dimensionTotals.social / stockCount;
      const avgPolicyRaw = ind.dimensionTotals.policy / stockCount;
      const avgPublicRaw = ind.dimensionTotals.public / stockCount;
      const avgBusinessRaw = ind.dimensionTotals.business / stockCount;
      const avgSentimentRaw = ind.dimensionTotals.sentiment / stockCount;

      // 历史回填里 social/public 曾被写成常量占位值，这里在检测到无方差时做行业级回退。
      const socialFallbackRaw = clamp(4 + Math.min(stockCount, 50) * 0.05 + avgScore * 0.1, 0, 10);
      const socialDisplay = normalizeSnapshotDimension(
        ind.dimensionSamples.social.size > 1 ? avgSocialRaw : socialFallbackRaw,
        3
      );
      const publicDisplay = normalizeSnapshotDimension(
        ind.dimensionSamples.public.size > 1 ? avgPublicRaw : avgSentimentRaw,
        3
      );

      const weightedDimensionScore = (
        socialDisplay * dimensionWeights.social +
        normalizeSnapshotDimension(avgPolicyRaw, 3) * dimensionWeights.policy +
        publicDisplay * dimensionWeights.public +
        normalizeSnapshotDimension(avgBusinessRaw, 3) * dimensionWeights.business
      );
      // 维度权重开启后，行业排序分对齐“股票评分 + 行业维度”双口径，避免只改权重但结果不变。
      const rankScore = filters.dimensionWeights
        ? (avgScore * 0.5 + weightedDimensionScore * 0.5)
        : avgScore;

      return {
        ...ind,
        avgScore,
        rankScore,
        weightedDimensionScore,
        stockCount,
        dimensions: {
          social: socialDisplay,
          policy: normalizeSnapshotDimension(avgPolicyRaw, 3),
          public: publicDisplay,
          business: normalizeSnapshotDimension(avgBusinessRaw, 3),
        },
      };
    })
    .filter(ind => ind.stockCount >= 3)
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 10);
  
  console.log(`[select.js] 筛选出 ${industries.length} 个行业`);

  // 构建返回结果
  const directions = industries.map((ind, index) => ({
    ts_code: `IND_${index}`,
    name: ind.name,
    score: Math.round(ind.rankScore * 100),
    dimensions: ind.dimensions,
    metrics: {
      companyCount: ind.stockCount,
      avgScore: ind.avgScore,
      rankScore: ind.rankScore,
      weightedDimensionScore: ind.weightedDimensionScore
    },
    picks: ind.stocks.slice(0, 5).map(s => ({
      ts_code: s.ts_code,
      code: s.ts_code, // 兼容决策生成阶段读取 s.code
      name: s.name,
      industry: s.industry,
      score: s.score
    })),
    reason: `${ind.name} 行业综合得分 ${ind.rankScore.toFixed(2)}（股票均分 ${ind.avgScore.toFixed(2)}），共 ${ind.stockCount} 只股票`
  }));

  // TASK_API_001: 生成决策单
  // 为每个行业的 Top 股票生成决策建议（使用完整决策引擎）
  let decisions = [];
  const decisionEngine = new HistoricalDecisionEngine({ strategyType: 'short_term' });

  // 收集所有需要生成决策的股票（去重）
  const stocksNeedingDecisions = industries.flatMap(ind =>
    ind.stocks.slice(0, 3).map(s => ({
      ts_code: s.ts_code,
      name: s.name,
      industry: ind.name,
      seven_factor_score: s.score
    }))
  );

  // 取前10只股票生成决策
  const stocksToProcess = stocksNeedingDecisions.slice(0, 10);
  const tsCodesToProcess = [...new Set(stocksToProcess.map(s => s.ts_code))];

  // 计算预加载日期范围（需要60天历史数据）
  const preloadStartDate = new Date(adjustedDate);
  preloadStartDate.setDate(preloadStartDate.getDate() - 90); // 预留90天确保足够

  // 预加载价格数据
  try {
    const preloadStartStr = preloadStartDate.toISOString().split('T')[0].replace(/-/g, '');
    const preloadEndStr = finalDateStamp.replace(/-/g, '');

    await decisionEngine.preloadPrices(
      tsCodesToProcess,
      preloadStartStr,
      preloadEndStr
    );
    console.log(`[select.js] 预加载了 ${tsCodesToProcess.length} 只股票的价格数据`);
  } catch (e) {
    console.warn(`[select.js] 预加载价格数据失败:`, e.message);
  }

  // 为股票生成决策单（使用完整决策引擎）
  for (const stock of stocksToProcess) {
    try {
      // 获取快照数据
      const snapshotSql = `
        SELECT ts_code, seven_factor_score, pe_ttm, pb
        FROM stock_factor_snapshot
        WHERE ts_code = ? AND trade_date = ?
        LIMIT 1
      `;
      const snapshot = db.prepare(snapshotSql).get(stock.ts_code, finalDateStamp);

      if (snapshot) {
        // 使用完整决策引擎生成决策
        const fullDecision = await decisionEngine.generateDecision(
          stock.ts_code,
          finalDateStamp,
          {
            seven_factor_score: snapshot.seven_factor_score,
            pe_ttm: snapshot.pe_ttm,
            pb: snapshot.pb
          }
        );

        if (fullDecision) {
          // 合并完整决策和股票信息
          decisions.push({
            ts_code: stock.ts_code,
            name: stock.name,
            industry: stock.industry,
            decision: fullDecision.decision,
            entry_zone: fullDecision.entry_zone,
            stop_loss: fullDecision.stop_loss,
            target_prices: fullDecision.target_prices,
            position_suggest: fullDecision.position_suggest,
            valid_until: fullDecision.valid_until,
            seven_factor_score: fullDecision.seven_factor_score,
            pe_ttm: snapshot.pe_ttm,
            pb: snapshot.pb,
            technical_snapshot: fullDecision.technical_snapshot
          });
        } else {
          // 决策引擎返回 null（数据不足或停牌），使用简化版
          decisions.push({
            ts_code: stock.ts_code,
            name: stock.name,
            industry: stock.industry,
            decision: snapshot.seven_factor_score >= 0.75 ? 'buy' : 'hold',
            entry_zone: null,
            stop_loss: null,
            target_prices: null,
            position_suggest: calculatePositionSuggest(snapshot.seven_factor_score),
            valid_until: null,
            seven_factor_score: snapshot.seven_factor_score,
            pe_ttm: snapshot.pe_ttm,
            pb: snapshot.pb,
            warning: '数据不足，无法计算完整决策'
          });
        }
      }
    } catch (e) {
      console.warn(`[select.js] 生成决策失败: ${stock.ts_code}`, e.message);
    }
  }

  console.log(`[select.js] 生成了 ${decisions.length} 个决策单`);

  return {
    tradeDate: adjustedDate,
    methodology: {
      framework: '历史快照行业聚合',
      dimensions: ['社会经济趋势', '政策方向', '舆论热度', '商业变现'],
      sources: ['stock_factor_snapshot', 'stock_list', 'stock_daily'],
    },
    directions,
    decisions, // TASK_API_001: 新增决策字段
    isSnapshot: true,
    dateAdjusted,
    originalDate,
    filters: {
      ...filters,
      priceDataAvailable
    },
    weights: {
      dimension: filters.dimensionWeights || null,
      factor: filters.factorWeights || null
    }
  };
}

/**
 * TASK_API_001: 计算建议仓位
 * 根据七因子评分决定建议仓位比例
 */
function calculatePositionSuggest(sevenFactorScore) {
  if (sevenFactorScore >= 0.85) return 0.40;
  if (sevenFactorScore >= 0.75) return 0.30;
  if (sevenFactorScore >= 0.65) return 0.20;
  return 0.10;
}

// TASK_V4_FIX_001: 支持日期参数，使用历史快照数据
async function buildSelectionPayload(date, strategy, filters) {
  // 有日期参数：使用历史快照数据
  if (date) {
    return await buildSelectionPayloadFromSnapshot(date, strategy, filters);
  }
  // 无日期参数：使用最新数据
  let datasets;
  try {
    datasets = await getSelectionDatasets();
  } catch (error) {
    if (error instanceof MarketDataError && error.code === 'MISSING_TUSHARE_TOKEN') {
      const latestTradeDate = getDb().prepare(`
        SELECT MAX(trade_date) as latest_date FROM stock_factor_snapshot
      `).get().latest_date;

      if (latestTradeDate) {
        const fallbackDate = String(latestTradeDate).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        console.warn(`[select.js] 缺少 TUSHARE_TOKEN，降级到历史快照路径：${fallbackDate}`);
        return buildSelectionPayloadFromSnapshot(fallbackDate, strategy, filters || {});
      }
    }
    throw error;
  }
  const stockBasicMap = new Map(datasets.stockBasic.map((item) => [item.ts_code, item]));
  const dailyBasicMap = new Map(datasets.dailyBasic.map((item) => [item.ts_code, item]));
  const hotMap = new Map(
    datasets.conceptHot
      .filter((item) => normalizeName(item.ts_name))
      .map((item) => [normalizeName(item.ts_name), item])
  );

  const ipoIndustries = datasets.ipoRows
    .map((row) => stockBasicMap.get(row.ts_code))
    .filter(Boolean)
    .map((row) => normalizeName(row.industry));

  // 【回归初版】直接使用概念板块资金流数据
  const conceptFlows = datasets.conceptFlow.slice(0, 50);
  console.log(`[select.js] 使用概念板块资金流数据，共 ${conceptFlows.length} 个概念板块`);

  const candidateDirections = conceptFlows
    .map((flow) => {
      const name = normalizeName(flow.name);
      const hot = hotMap.get(name);
      const companyCount = toNumber(flow.company_num);
      const netAmount = toNumber(flow.net_mf_amount);
      const pctChange = toNumber(flow.pct_change);
      const hotRank = hot ? toNumber(hot.rank, 999) : 999;
      const hotValue = hot ? toNumber(hot.hot) : 0;
      const ipoMatches = ipoIndustries.filter((industry) => industry && (name.includes(industry) || industry.includes(name))).length;

      const social = dimensionFromRaw(Math.min(100, (companyCount * 0.6) + (ipoMatches * 22) + (pctChange > 0 ? 15 : 0)));
      const policy = keywordScore(name);
      // 修改：使用涨跌幅作为热度替代（conceptHot 名称不匹配）
      const publicHeat = dimensionFromRaw(Math.min(100, Math.max(pctChange, 0) * 12 + (hotRank < 999 ? (110 - hotRank * 3) : 0)));
      const business = dimensionFromRaw(Math.min(100, (Math.max(netAmount, 0) * 4) + (companyCount * 0.4) + (pctChange * 8)));
      const score = Math.round((average([social, policy, publicHeat, business]) / 5) * 100);

      return {
        ts_code: flow.ts_code,
        name,
        score,
        dimensions: {
          social,
          policy,
          public: publicHeat,
          business,
        },
        metrics: {
          companyCount,
          hotRank: hotRank === 999 ? null : hotRank,
          hotValue,
          ipoMatches,
          netAmount: netAmount / 100000000, // 转换为中心
          pctChange,
        },
        leadStock: '',
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.metrics.netAmount !== left.metrics.netAmount) return right.metrics.netAmount - left.metrics.netAmount;
      return left.name.localeCompare(right.name, 'zh-CN');
    })
    .slice(0, 10); // 改为返回 Top 10

  const directions = [];
  for (const direction of candidateDirections) {
    const picks = (await buildDirectionPicks(direction, dailyBasicMap, stockBasicMap))
      .filter((pick) => !shouldExcludeTsCode(pick.ts_code || pick.code, filters));
    directions.push({
      ...direction,
      picks,
      reason: buildReason(direction),
    });
  }

  // 保存选股报告到数据库
  try {
    const reportId = `SELECT_${datasets.tradeDate}_${Date.now()}`;
    const filterConfig = {
      industry_weights: { social: 0.25, policy: 0.25, public: 0.25, business: 0.25 },
      seven_factor_min_score: 0.75,
      valuation_limits: { pe_max: 60, peg_max: 2.0 },
      price_limit: { max_price: 150 }
    };
    const statistics = {
      total_candidates: conceptFlows.length,
      passed_industry_filter: candidateDirections.length,
      passed_seven_factor: directions.length,
      final_selected: directions.length
    };
    
    saveSelectionReport({
      reportId,
      tradeDate: datasets.tradeDate,
      filterConfig,
      selectedStocks: directions.map((d, i) => ({
        rank: i + 1,
        ts_code: d.ts_code,
        name: d.name,
        score: d.score
      })),
      statistics
    });
    console.log(`[select.js] 选股报告已保存：${reportId}`);
  } catch (error) {
    console.error('[select.js] 保存选股报告失败:', error.message);
  }

  // TASK_E2E_FIX_001: 为 Top 行业中的股票生成决策单
  const decisions = [];
  const decisionEngine = new HistoricalDecisionEngine({ strategyType: 'short_term' });
  
  // 确保数据库连接已初始化
  const db = getDb();
  
  // 收集所有需要生成决策的股票（每个行业取前 3 只）
  const stocksNeedingDecisions = directions.flatMap(dir =>
    dir.picks.slice(0, 3).map(s => ({
      ts_code: s.ts_code,
      name: s.name,
      industry: s.industry,
      seven_factor_score: s.score / 100 // 转换为 0-1 范围
    }))
  );
  
  // 取前 10 只股票生成决策
  const stocksToProcess = stocksNeedingDecisions.slice(0, 10);
  const tsCodesToProcess = [...new Set(stocksToProcess.map(s => s.ts_code))];
  
  console.log(`[select.js] 需要生成决策的股票：${stocksToProcess.length} 只`);
  console.log(`[select.js] 股票列表：${stocksToProcess.map(s => s.ts_code).join(', ')}`);
  
  // 获取数据库中最新的交易日（处理休市日）
  const latestTradeDate = db.prepare(`
    SELECT MAX(trade_date) as latest_date FROM stock_factor_snapshot
  `).get().latest_date;
  
  console.log(`[select.js] 数据库最新交易日：${latestTradeDate}`);
  
  // 预加载价格数据（需要 60 天历史数据）
  const preloadStartDate = new Date();
  preloadStartDate.setDate(preloadStartDate.getDate() - 90);
  const preloadStartStr = preloadStartDate.toISOString().split('T')[0].replace(/-/g, '');
  const preloadEndStr = latestTradeDate; // 使用数据库最新交易日
  
  console.log(`[select.js] 查询日期：${preloadEndStr}`);
  
  try {
    await decisionEngine.preloadPrices(tsCodesToProcess, preloadStartStr, preloadEndStr);
    console.log(`[select.js] 预加载了 ${tsCodesToProcess.length} 只股票的价格数据`);
  } catch (e) {
    console.warn(`[select.js] 预加载价格数据失败：${e.message}`);
  }
  
  // 为每只股票生成决策单
  for (const stock of stocksToProcess) {
    try {
      // 获取快照数据
      const snapshotSql = `
        SELECT ts_code, seven_factor_score, pe_ttm, pb
        FROM stock_factor_snapshot
        WHERE ts_code = ? AND trade_date = ?
        LIMIT 1
      `;
      console.log(`[select.js] 查询 ${stock.ts_code} 的快照数据，日期：${latestTradeDate}`);
      const snapshot = db.prepare(snapshotSql).get(stock.ts_code, latestTradeDate);
      
      if (snapshot) {
        console.log(`[select.js] 找到 ${stock.ts_code} 的快照数据，七因子评分：${snapshot.seven_factor_score}`);
        // 使用完整决策引擎生成决策
        const fullDecision = await decisionEngine.generateDecision(
          stock.ts_code,
          datasets.tradeDate.replace(/-/g, ''),
          {
            seven_factor_score: snapshot.seven_factor_score,
            pe_ttm: snapshot.pe_ttm,
            pb: snapshot.pb
          }
        );
        
        if (fullDecision) {
          decisions.push({
            ts_code: stock.ts_code,
            name: stock.name,
            industry: stock.industry,
            decision: fullDecision.decision,
            entry_zone: fullDecision.entry_zone,
            stop_loss: fullDecision.stop_loss,
            target_prices: fullDecision.target_prices,
            position_suggest: fullDecision.position_suggest,
            valid_until: fullDecision.valid_until,
            seven_factor_score: fullDecision.seven_factor_score,
            pe_ttm: snapshot.pe_ttm,
            pb: snapshot.pb,
            technical_snapshot: fullDecision.technical_snapshot
          });
        } else {
          // 决策引擎返回 null（数据不足或停牌），使用简化版
          decisions.push({
            ts_code: stock.ts_code,
            name: stock.name,
            industry: stock.industry,
            decision: snapshot.seven_factor_score >= 0.75 ? 'buy' : 'hold',
            entry_zone: '数据不足',
            stop_loss: '数据不足',
            target_prices: [],
            position_suggest: calculatePositionSuggest(snapshot.seven_factor_score),
            valid_until: datasets.tradeDate,
            seven_factor_score: snapshot.seven_factor_score,
            pe_ttm: snapshot.pe_ttm,
            pb: snapshot.pb
          });
        }
      }
    } catch (e) {
      console.warn(`[select.js] 生成 ${stock.ts_code} 决策单失败：${e.message}`);
    }
  }
  
  console.log(`[select.js] 生成了 ${decisions.length} 个决策单`);

  return {
    generatedAt: new Date().toISOString(),
    tradeDate: datasets.tradeDate,
    methodology: {
      framework: '自上而下行业筛选',
      dimensions: ['社会经济趋势', '政策方向', '舆论热度', '商业变现'],
      sources: ['Tushare stock_basic', 'Tushare ths_index', 'Tushare moneyflow_cnt_ths', 'Tushare ths_hot', 'Tushare new_share'],
    },
    directions,
    decisions, // TASK_E2E_FIX_001: 新增决策字段
    conclusions: directions.slice(0, 3).map((direction, index) => ({
      rank: index + 1,
      name: direction.name,
      score: direction.score,
      reason: direction.reason,
    })),
    risks: [
      '方向筛选反映的是最新板块热度和资金偏好，不等于个股买点已经成熟。',
      '概念板块存在轮动，若后续资金净流入转负，方向优先级会快速下修。',
      '最终交易前仍需在个股层面复核财报、估值和实时行情。',
    ],
  };
}

function renderSelectionReport(payload) {
  const generatedAt = new Date(payload.generatedAt);
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? payload.generatedAt
    : generatedAt.toLocaleString('zh-CN', { hour12: false });

  const recommendationTable = toMarkdownTable(
    ['排名', '方向', '综合得分', '社会', '政策', '舆论', '商业', '推荐标的', '推荐理由'],
    payload.directions.map((direction, index) => [
      `TOP ${index + 1}`,
      direction.name,
      direction.score,
      direction.dimensions.social,
      direction.dimensions.policy,
      direction.dimensions.public,
      direction.dimensions.business,
      direction.picks.map((item) => `${item.name}(${item.code})`).join('、') || '-',
      direction.reason,
    ])
  );

  const details = payload.directions.map((direction, index) => [
    `### ${index + 1}. ${direction.name}`,
    `- 综合得分：${direction.score}`,
    `- 四维度评分：社会 ${direction.dimensions.social} / 政策 ${direction.dimensions.policy} / 舆论 ${direction.dimensions.public} / 商业 ${direction.dimensions.business}`,
    `- 板块资金：${direction.metrics.netAmount.toFixed(2)} 亿元`,
    `- 热度/IPO：${direction.metrics.hotRank ? `热榜第 ${direction.metrics.hotRank} 名` : '热榜缺失'} / 近一年 IPO ${direction.metrics.ipoMatches} 家`,
    `- 核心标的：${direction.picks.map((item) => `${item.name}(${item.code})`).join('、') || '-'}`,
    `- 推荐逻辑：${direction.reason}`,
  ].join('\n')).join('\n\n');

  return [
    '# A股行业筛选报告',
    '',
    `- 生成时间：${generatedLabel}`,
    `- 交易日：${payload.tradeDate}`,
    `- 方法论：${payload.methodology.framework}`,
    `- 数据来源：${payload.methodology.sources.join('、')}`,
    '',
    '## 1. 核心结论',
    ...payload.conclusions.map((item) => `${item.rank}. ${item.name}（${item.score}）: ${item.reason}`),
    '',
    '## 2. 完整推荐表',
    recommendationTable,
    '',
    '## 3. 方向详解',
    details,
    '',
    '## 4. 风险提示',
    ...payload.risks.map((risk) => `- ${risk}`),
    '- 若外部数据源异常，报告应视为失效，不使用回退假数据。',
    '',
  ].join('\n');
}

async function writeSelectionReport() {
  const payload = await buildSelectionPayload();
  const dateStamp = payload.generatedAt.slice(0, 10).replace(/-/g, '');
  const fileName = `selection_report_${dateStamp}.md`;
  const fullPath = path.join(REPORT_DIR, fileName);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(fullPath, renderSelectionReport(payload), 'utf8');

  return { payload, fileName, fullPath };
}

// TASK_V4_FIX_001: 接收日期参数
router.get('/', async (req, res) => {
  try {
    const date = req.query.date;
    const strategy = req.query.strategy;
    const limit = req.query.limit;
    const minScore = req.query.minScore;
    
    // 四维度七因子策略筛选参数
    const filters = {
      // 默认排除北交所股票，避免后续回测/迭代链路出现无行情样本导致的伪失败。
      excludeMarkets: ['BJ']
    };
    if (strategy === 'seven_factor') {
      if (req.query.minSevenFactorScore) filters.minSevenFactorScore = parseFloat(req.query.minSevenFactorScore);
      if (req.query.peMax) filters.peMax = parseFloat(req.query.peMax);
      if (req.query.pegMax) filters.pegMax = parseFloat(req.query.pegMax);
      if (req.query.maxPrice) filters.maxPrice = parseFloat(req.query.maxPrice);
      
      // 解析权重配置
      if (req.query.dimensionWeights) {
        try {
          filters.dimensionWeights = JSON.parse(req.query.dimensionWeights);
          console.log(`[select.js] 接收四维度权重:`, JSON.stringify(filters.dimensionWeights));
        } catch (e) {
          console.warn(`[select.js] 解析四维度权重失败：${e.message}`);
        }
      }
      if (req.query.factorWeights) {
        try {
          filters.factorWeights = JSON.parse(req.query.factorWeights);
          console.log(`[select.js] 接收七因子权重:`, JSON.stringify(filters.factorWeights));
        } catch (e) {
          console.warn(`[select.js] 解析七因子权重失败：${e.message}`);
        }
      }
      if (req.query.excludeMarkets) {
        filters.excludeMarkets = String(req.query.excludeMarkets)
          .split(',')
          .map(item => item.trim().toUpperCase())
          .filter(Boolean);
      }
    }
    
    res.json(await buildSelectionPayload(date, strategy, filters, limit, minScore));
  } catch (error) {
    const status = error instanceof MarketDataError ? error.status : 500;
    res.status(status).json({
      success: false,
      message: error.message,
      details: error instanceof MarketDataError ? error.details : null,
      directions: [],
    });
  }
});

router.post('/report', async (req, res) => {
  try {
    const { fileName } = await writeSelectionReport();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      report_path: `${baseUrl}/report/selection/${encodeURIComponent(fileName)}`,
    });
  } catch (error) {
    const status = error instanceof MarketDataError ? error.status : 500;
    res.status(status).json({
      success: false,
      message: error.message,
      details: error instanceof MarketDataError ? error.details : null,
    });
  }
});

module.exports = router;
module.exports.buildSelectionPayload = buildSelectionPayload;

if (require.main === module) {
  const app = express();
  const port = Number(process.env.PORT || 3000);
  app.get('/api/select', async (_req, res) => {
    try {
      res.json(await buildSelectionPayload());
    } catch (error) {
      res.status(error instanceof MarketDataError ? error.status : 500).json({
        success: false,
        message: error.message,
      });
    }
  });
  app.listen(port, () => {
    console.log(`select api listening on http://localhost:${port}/api/select`);
  });
}
