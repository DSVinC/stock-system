/**
 * 个股 Top10 自动筛选 API
 * TASK_V3_004
 *
 * 功能：
 * - 全市场范围内按 7 因子评分排序
 * - 返回 Top10 股票列表
 * - 支持配置 Top N（默认 10，范围 1-20）
 */

'use strict';

const { createRequire } = require('node:module');

const express = require('express');
// express already required above

const {
  MarketDataError,
  getSelectionDatasets,
  getDailyHistory,
  getLatestDailyBasic,
  getMoneyflowThsRows,
  getMoneyflowRows,
  getFinaIndicatorRows,
  getIncomeRows,
  getATR,
  getStockPePercentile,
  toNumber,
  calculateATR,
  analyzeTechnical,
  calculateTechnicalIndicators
} = require('./market-data');

const {
  calculateCompositeScore,
  FACTOR_WEIGHTS
} = require('./score-factors');

const router = express.Router();

/**
 * 计算单只股票的 7 因子评分
 * @param {string} tsCode - 股票代码
 * @param {string} tradeDate - 交易日期
 * @returns {Promise<Object|null>} 评分结果
 */
async function calculateStockScore(tsCode, tradeDate) {
  try {
    // 获取历史行情数据（技术分析）
    const dailyRows = await getDailyHistory(tsCode, 120);
    if (!dailyRows || dailyRows.length < 60) {
      return null;
    }

    // 计算技术指标
    const indicatorRows = calculateTechnicalIndicators(dailyRows);
    const technical = analyzeTechnical(indicatorRows);

    // 获取估值数据
    const dailyBasic = await getLatestDailyBasic(tsCode);

    // 获取资金流向
    let thsFlow = null;
    let flow = null;
    try {
      const thsFlowRows = await getMoneyflowThsRows(tsCode, tradeDate);
      thsFlow = thsFlowRows[0] || null;
    } catch (_e) { /* 忽略 */ }

    try {
      const flowRows = await getMoneyflowRows(tsCode, tradeDate);
      flow = flowRows[0] || null;
    } catch (_e) { /* 忽略 */ }

    // 获取财务指标
    let fina = null;
    let income = null;
    try {
      const finaRows = await getFinaIndicatorRows(tsCode);
      fina = finaRows[0] || null;
    } catch (_e) { /* 忽略 */ }

    try {
      const incomeRows = await getIncomeRows(tsCode);
      income = incomeRows[0] || null;
    } catch (_e) { /* 忽略 */ }

    // 获取 ATR
    let atr20 = null;
    try {
      const atrData = await getATR(tsCode, tradeDate);
      atr20 = atrData?.atr20 || null;
    } catch (_e) { /* 忽略 */ }

    // 如果没有缓存，实时计算
    if (!atr20) {
      const atrResult = calculateATR(dailyRows, 20);
      atr20 = atrResult?.atr_20 || null;
    }

    // 获取 PE 历史
    let peHistory = null;
    try {
      peHistory = await getStockPePercentile(tsCode);
    } catch (_e) { /* 忽略 */ }

    // 计算综合评分
    const scoreResult = await calculateCompositeScore({
      technical,
      valuation: dailyBasic ? {
        pe_ttm: dailyBasic.pe_ttm,
        pb: dailyBasic.pb
      } : null,
      industry: null,
      thsFlow,
      flow,
      fina,
      income,
      atr20,
      peHistory
    }, tsCode);

    return {
      ts_code: tsCode,
      reportScore: scoreResult.reportScore,
      decision: scoreResult.decision,
      factors: scoreResult.factors
    };
  } catch (error) {
    console.warn(`[stock-select] 计算评分失败 ${tsCode}:`, error.message);
    return null;
  }
}

/**
 * 筛选 Top N 股票
 * @param {number} limit - 筛选数量（默认 10，范围 1-20）
 * @returns {Promise<Object>} 筛选结果
 */
async function selectTopStocks(limit = 10) {
  const startTime = Date.now();

  // 验证并限制参数范围
  const topN = Math.min(20, Math.max(1, limit));

  // 获取市场数据集
  const datasets = await getSelectionDatasets();
  const tradeDate = datasets.tradeDate;

  // 获取股票列表（过滤 ST、退市等）
  const stockList = datasets.stockBasic
    .filter(stock => {
      const name = String(stock.name || '');
      // 排除 ST、退市股票
      if (name.includes('ST') || name.includes('退')) {
        return false;
      }
      // 排除上市不足 60 天的新股
      const listDate = stock.list_date;
      if (listDate) {
        const listDateObj = new Date(
          parseInt(listDate.slice(0, 4)),
          parseInt(listDate.slice(4, 6)) - 1,
          parseInt(listDate.slice(6, 8))
        );
        const daysSinceList = (Date.now() - listDateObj.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceList < 60) {
          return false;
        }
      }
      return true;
    })
    .slice(0, 100); // 限制计算数量，避免超时

  console.log(`[stock-select] 开始计算 ${stockList.length} 只股票的评分...`);

  // 并行计算评分（分批处理，避免并发过高）
  const batchSize = 10;
  const scoreResults = [];

  for (let i = 0; i < stockList.length; i += batchSize) {
    const batch = stockList.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (stock) => {
        const score = await calculateStockScore(stock.ts_code, tradeDate);
        if (!score) return null;
        return {
          ...score,
          stock_name: stock.name,
          industry: stock.industry
        };
      })
    );
    scoreResults.push(...batchResults.filter(Boolean));
  }

  // 按评分排序，取 Top N
  const sortedStocks = scoreResults
    .sort((a, b) => b.reportScore - a.reportScore)
    .slice(0, topN);

  // 添加排名
  const corePool = sortedStocks.map((stock, index) => ({
    rank: index + 1,
    ts_code: stock.ts_code,
    stock_name: stock.stock_name,
    industry: stock.industry || '',
    total_score: Math.round(stock.reportScore * 10) / 10,
    decision: stock.decision
  }));

  const elapsed = Date.now() - startTime;

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    tradeDate,
    elapsed_ms: elapsed,
    selected_count: corePool.length,
    total_evaluated: scoreResults.length,
    core_pool: corePool
  };
}

/**
 * GET /api/stock/select/top10
 * 获取 Top10 股票列表
 *
 * 查询参数：
 * - limit: 返回数量（默认 10，范围 1-20）
 */
router.get('/top10', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));

    console.log(`[stock-select] 开始筛选 Top ${limit} 股票...`);

    const result = await selectTopStocks(limit);

    console.log(`[stock-select] 筛选完成，耗时 ${result.elapsed_ms}ms，共 ${result.selected_count} 只股票`);

    res.json(result);
  } catch (error) {
    console.error('[stock-select] 筛选失败:', error);
    const status = error instanceof MarketDataError ? error.status : 500;
    res.status(status).json({
      success: false,
      message: error.message,
      core_pool: []
    });
  }
});

/**
 * GET /api/stock/top
 * 获取 Top N 股票列表（简化接口，前端选股页面使用）
 *
 * 查询参数：
 * - limit: 返回数量（默认 10，范围 1-20）
 * - minScore: 最低评分过滤（默认 0）
 * - decision: 决策过滤（buy/watch/avoid，可选）
 *
 * 返回格式（适配前端 select.html）：
 * {
 *   success: boolean,
 *   top10: Array<{rank, code, name, finalScore, decision}>,
 *   tradeDate: string
 * }
 */
router.get('/top', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
    const minScore = parseFloat(req.query.minScore) || 0;
    const decisionFilter = req.query.decision || null;

    console.log(`[stock-select] GET /top 筛选 Top ${limit} 股票, minScore=${minScore}, decision=${decisionFilter || 'all'}...`);

    const result = await selectTopStocks(limit);

    // 转换为前端需要的格式
    let top10 = result.core_pool
      .filter(stock => {
        if (minScore > 0 && stock.total_score < minScore) return false;
        if (decisionFilter && stock.decision !== decisionFilter) return false;
        return true;
      })
      .map(stock => ({
        rank: stock.rank,
        code: stock.ts_code,
        name: stock.stock_name,
        finalScore: stock.total_score,
        decision: stock.decision,
        industry: stock.industry
      }));

    console.log(`[stock-select] GET /top 完成，返回 ${top10.length} 只股票`);

    res.json({
      success: true,
      top10,
      tradeDate: result.tradeDate,
      generatedAt: result.generatedAt,
      total_evaluated: result.total_evaluated
    });
  } catch (error) {
    console.error('[stock-select] GET /top 失败:', error);
    const status = error instanceof MarketDataError ? error.status : 500;
    res.status(status).json({
      success: false,
      message: error.message,
      top10: []
    });
  }
});

/**
 * POST /api/stock/select/top10
 * 获取 Top N 股票列表（POST 方式）
 *
 * 请求体：
 * {
 *   "limit": 10
 * }
 */
router.post('/top10', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, req.body.limit || 10));

    console.log(`[stock-select] 开始筛选 Top ${limit} 股票（POST）...`);

    const result = await selectTopStocks(limit);

    console.log(`[stock-select] 筛选完成，耗时 ${result.elapsed_ms}ms`);

    res.json(result);
  } catch (error) {
    console.error('[stock-select] 筛选失败:', error);
    const status = error instanceof MarketDataError ? error.status : 500;
    res.status(status).json({
      success: false,
      message: error.message,
      core_pool: []
    });
  }
});

// 导出
module.exports = router;
module.exports.selectTopStocks = selectTopStocks;
module.exports.calculateStockScore = calculateStockScore;