/**
 * API 模块：v2 结构化数据接口
 *
 * 职责：返回结构化的策略数据，用于条件单界面导入和方向股列表显示
 *
 * 主要接口：
 * - GET /api/v2/analyze/report?ts_code=xxx - 获取单只股票的 v2 结构化报告
 * - GET /api/v2/analyze/strategy/:ts_code/:riskType - 获取指定股票的风险策略
 */

const { createRequire } = require('node:module');
const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');
const router = express.Router();

const analysisRouter = require('./analysis');
const analyzeRouter = require('./analyze');

function toNumber(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

/**
 * 将 strategies 文本格式转换为 v2 结构化格式
 */
function convertStrategiesToV2(strategies, technical, decision, buyZone, stopLoss, targetPrice) {
  const price = toNumber(technical?.price);
  const [buyLow, buyHigh] = buyZone || [price * 0.95, price * 1.05];
  const stop = stopLoss || buyLow * 0.95;
  const target = targetPrice || price * 1.15;

  // 策略参数配置
  const STRATEGY_PARAMS = {
    aggressive: { maxPosition: 20, stopLossPercent: 8 },
    balanced: { maxPosition: 15, stopLossPercent: 6 },
    conservative: { maxPosition: 10, stopLossPercent: 4 }
  };

  // 构建结构化 actions
  const buildActions = (riskType) => {
    const params = STRATEGY_PARAMS[riskType];
    const actions = [];

    if (decision === '买入') {
      // 第一笔建仓
      actions.push({
        sequence: 1,
        action_type: 'buy',
        trigger_conditions: [
          { type: 'price', field: 'price', operator: '<=', value: buyHigh, unit: '元' }
        ],
        position_percent: riskType === 'aggressive' ? 10 : riskType === 'balanced' ? 8 : 5,
        stop_loss: toNumber(stop, 0).toFixed(2),
        note: '第一笔建仓'
      });

      // 加仓条件
      if (riskType !== 'conservative') {
        actions.push({
          sequence: 2,
          action_type: 'buy',
          trigger_conditions: [
            { type: 'price', field: 'price', operator: '<=', value: buyLow, unit: '元' }
          ],
          position_percent: riskType === 'aggressive' ? 10 : 7,
          note: '加仓'
        });
      }

      // 止损
      actions.push({
        sequence: actions.length + 1,
        action_type: 'sell',
        trigger_conditions: [
          { type: 'price', field: 'price', operator: '<=', value: toNumber(stop, 0).toFixed(2), unit: '元' }
        ],
        position_percent: 100,
        note: '止损'
      });
    } else if (decision === '观望') {
      // 观望策略
      actions.push({
        sequence: 1,
        action_type: 'hold',
        trigger_conditions: [
          { type: 'indicator', field: 'volume_ratio', operator: '>', value: 1.5, unit: '倍' }
        ],
        position_percent: riskType === 'aggressive' ? 5 : 0,
        note: '观望，等待确认信号'
      });
    } else {
      // 回避
      actions.push({
        sequence: 1,
        action_type: 'hold',
        trigger_conditions: [],
        position_percent: 0,
        note: '不建议参与'
      });
    }

    return actions;
  };

  return {
    aggressive: {
      risk_level: 'aggressive',
      actions: buildActions('aggressive'),
      summary_text: strategies?.aggressive || ''
    },
    balanced: {
      risk_level: 'balanced',
      actions: buildActions('balanced'),
      summary_text: strategies?.balanced || ''
    },
    conservative: {
      risk_level: 'conservative',
      actions: buildActions('conservative'),
      summary_text: strategies?.conservative || ''
    }
  };
}

/**
 * 构建 operations 结构化数据
 */
function buildOperations(technical, buyZone, stopLoss, targetPrice) {
  const price = toNumber(technical?.price);
  const [buyLow, buyHigh] = buyZone || [price * 0.95, price * 1.05];
  const { ma10, ma20, bb_upper } = technical?.latest || {};

  return {
    short_term: {
      buy_zone: [toNumber(buyHigh, 0), toNumber(buyLow, 0)],
      stop_loss: toNumber(stopLoss, 0),
      target_price: toNumber(targetPrice, 0) * 0.95,
      summary: `短线关注 ${toNumber(buyLow, 0).toFixed(2)}-${toNumber(buyHigh, 0).toFixed(2)} 元区间承接，失守则止损。`,
      conditions: []
    },
    mid_term: {
      buy_zone: [toNumber(buyLow, 0) * 0.98, toNumber(buyLow, 0)],
      target_price: toNumber(targetPrice, 0),
      summary: '中线重点看业绩、资金和价格是否共振，只有三者同步转强才考虑加仓。',
      conditions: []
    },
    long_term: {
      target_price: toNumber(targetPrice, 0) * 1.1,
      summary: '长线继续跟踪行业景气、产品兑现与估值中枢变化。',
      conditions: []
    }
  };
}

/**
 * 构建 target_prices 结构化数据
 */
function buildTargetPrices(technical, targetPrice, decision) {
  const price = toNumber(technical?.price);
  const baseMultiplier = decision === '买入' ? 1 : decision === '观望' ? 0.98 : 0.95;

  return [
    {
      period: 'short',
      price: toNumber(targetPrice, price * 1.08 * baseMultiplier),
      logic: '短线情绪溢价',
      expected_return: ((toNumber(targetPrice, price * 1.08 * baseMultiplier) / price) - 1) * 100
    },
    {
      period: 'mid',
      price: toNumber(targetPrice, price * 1.15 * baseMultiplier),
      logic: '估值修复目标',
      expected_return: ((toNumber(targetPrice, price * 1.15 * baseMultiplier) / price) - 1) * 100
    },
    {
      period: 'long',
      price: toNumber(targetPrice, price * 1.25 * baseMultiplier),
      logic: '行业景气度提升',
      expected_return: ((toNumber(targetPrice, price * 1.25 * baseMultiplier) / price) - 1) * 100
    }
  ];
}

/**
 * 将 v1 payload 转换为 v2 格式
 */
function convertToV2Format(v1Payload) {
  const stock = v1Payload.stock || {};
  const summary = v1Payload.summary || {};
  const technical = v1Payload.technical || {};
  const valuation = v1Payload.valuation || {};

  // 从 analyze.js 的 payload 获取数据
  const buyZone = v1Payload.buyZone || [toNumber(technical.price) * 0.95, toNumber(technical.price) * 1.05];
  const stopLoss = v1Payload.stopLoss || toNumber(buyZone[0]) * 0.95;
  const targetPrice = v1Payload.targetPrice || toNumber(technical.price) * 1.15;

  const strategiesV2 = convertStrategiesToV2(
    v1Payload.strategies || {},
    technical,
    summary.decision || v1Payload.decision,
    buyZone,
    stopLoss,
    targetPrice
  );

  return {
    stock_code: stock.ts_code,
    stock_name: stock.name,
    industry: stock.industry,
    report_score: toNumber(summary.report_score || v1Payload.reportScore),
    decision: summary.decision || v1Payload.decision || '观望',
    generated_at: v1Payload.generated_at || v1Payload.generatedAt || new Date().toISOString(),
    strategies: strategiesV2,
    operations: v1Payload.operations || buildOperations(technical, buyZone, stopLoss, targetPrice),
    target_prices: v1Payload.target_prices || v1Payload.targetPrices || buildTargetPrices(technical, targetPrice, summary.decision || v1Payload.decision),
    technical: {
      price: toNumber(technical.price),
      ma_signal: technical.ma_signal || technical.maSignal,
      macd_signal: technical.macd_signal || technical.macdSignal,
      latest: technical.latest || technical.table?.reduce((acc, item) => {
        acc[item.indicator.toLowerCase().replace(/[^a-z0-9]/g, '_')] = toNumber(item.value);
        return acc;
      }, {})
    },
    valuation: {
      pe_ttm: toNumber(valuation.pe_ttm),
      pb: toNumber(valuation.pb),
      ps: toNumber(valuation.ps),
      total_mv: toNumber(valuation.total_mv)
    },
    bull_points: v1Payload.bull_points || v1Payload.bullPoints || [],
    bear_points: v1Payload.bear_points || v1Payload.bearPoints || [],
    buy_zone: buyZone,
    stop_loss: stopLoss,
    target_price: targetPrice
  };
}

/**
 * GET /api/v2/analysis/:stockCode
 * TASK_104: 获取指定股票的 v2 结构化报告（URL 参数版本）
 * 直接返回 stock_analyzer.py 的 v2 格式输出
 */
router.get('/analysis/:stockCode', async (req, res) => {
  const { stockCode } = req.params;

  if (!stockCode) {
    return res.status(400).json({
      success: false,
      error: 'stockCode is required'
    });
  }

  try {
    // 优先使用 Python 分析脚本的输出
    const payload = await analysisRouter.runAnalysis(stockCode);

    // 检查是否为 v2 格式
    const isV2 = payload &&
                 payload.strategies &&
                 typeof payload.strategies.aggressive === 'object' &&
                 Array.isArray(payload.strategies.aggressive.actions);

    if (isV2) {
      // 直接返回 v2 格式
      return res.json({
        success: true,
        data: payload,
        version: 'v2'
      });
    }

    // 如果不是 v2 格式，转换 v1 到 v2
    const v2Data = convertToV2Format(payload);
    return res.json({
      success: true,
      data: v2Data,
      version: 'v1-converted'
    });
  } catch (error) {
    console.error(`[v2/analysis/:stockCode] 分析失败:`, error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v2/analyze/report?ts_code=xxx
 * 获取单只股票的 v2 结构化报告
 */
router.get('/report', async (req, res) => {
  const tsCode = req.query.ts_code;
  if (!tsCode) {
    return res.status(400).json({
      success: false,
      error: 'ts_code is required'
    });
  }

  try {
    // 先尝试使用 analysis router 的 runAnalysis
    let payload;
    try {
      payload = await analysisRouter.runAnalysis(tsCode);
    } catch (error) {
      // fallback 到 analyze router
      payload = await analyzeRouter.buildReportPayload(tsCode);
    }

    const v2Data = convertToV2Format(payload);
    return res.json({
      success: true,
      data: v2Data
    });
  } catch (error) {
    console.error(`[v2/analyze/report] 分析失败:`, error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v2/analyze/strategy/:ts_code/:riskType
 * 获取指定股票的指定风险类型策略
 */
router.get('/strategy/:tsCode/:riskType', async (req, res) => {
  const { tsCode, riskType } = req.params;

  if (!['aggressive', 'balanced', 'conservative'].includes(riskType)) {
    return res.status(400).json({
      success: false,
      error: 'riskType must be one of: aggressive, balanced, conservative'
    });
  }

  try {
    let payload;
    try {
      payload = await analysisRouter.runAnalysis(tsCode);
    } catch (error) {
      payload = await analyzeRouter.buildReportPayload(tsCode);
    }

    const v2Data = convertToV2Format(payload);
    const strategy = v2Data.strategies[riskType];

    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: `Strategy ${riskType} not found`
      });
    }

    return res.json({
      success: true,
      data: {
        stock_code: v2Data.stock_code,
        stock_name: v2Data.stock_name,
        risk_type: riskType,
        strategy: strategy,
        buy_zone: v2Data.buy_zone,
        stop_loss: v2Data.stop_loss,
        target_price: v2Data.target_price,
        decision: v2Data.decision
      }
    });
  } catch (error) {
    console.error(`[v2/analyze/strategy] 获取策略失败:`, error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v2/analyze/batch/strategies
 * 批量获取多只股票的策略数据
 * 请求体: { ts_codes: string[], risk_type: 'aggressive' | 'balanced' | 'conservative' }
 */
router.post('/batch/strategies', async (req, res) => {
  const { ts_codes, risk_type = 'balanced' } = req.body;

  if (!Array.isArray(ts_codes) || ts_codes.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'ts_codes must be a non-empty array'
    });
  }

  if (!['aggressive', 'balanced', 'conservative'].includes(risk_type)) {
    return res.status(400).json({
      success: false,
      error: 'risk_type must be one of: aggressive, balanced, conservative'
    });
  }

  const results = [];
  const errors = [];

  for (const tsCode of ts_codes) {
    try {
      let payload;
      try {
        payload = await analysisRouter.runAnalysis(tsCode);
      } catch (error) {
        payload = await analyzeRouter.buildReportPayload(tsCode);
      }

      const v2Data = convertToV2Format(payload);
      const strategy = v2Data.strategies[risk_type];

      results.push({
        ts_code: tsCode,
        stock_name: v2Data.stock_name,
        success: true,
        data: {
          stock_code: v2Data.stock_code,
          stock_name: v2Data.stock_name,
          risk_type: risk_type,
          strategy: strategy,
          buy_zone: v2Data.buy_zone,
          stop_loss: v2Data.stop_loss,
          target_price: v2Data.target_price,
          decision: v2Data.decision,
          report_score: v2Data.report_score
        }
      });
    } catch (error) {
      errors.push({
        ts_code: tsCode,
        error: error.message
      });
    }
  }

  return res.json({
    success: true,
    data: {
      results,
      errors,
      total: ts_codes.length,
      success_count: results.length,
      error_count: errors.length
    }
  });
});

module.exports = router;