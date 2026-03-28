/**
 * 4 维度行业自动评分 API
 * TASK_V3_001
 *
 * 维度定义：
 * - policy: 政策支持力度 (25%)
 * - commercial: 商业化显现 (30%)
 * - public: 舆论热度 (25%)
 * - capital: 资本关注度 (20%)
 *
 * 输入：行业列表 + 权重配置（默认 25%/30%/25%/20%）
 * 输出：行业评分排行榜（JSON 格式）
 */

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const express = require('express');
// express already required above
const Database = require('better-sqlite3');
const { MarketDataError, getSelectionDatasets, toNumber, tushareRequest } = require('./market-data');

// 数据库连接（单例）
const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
let dbCache = null;
function getDb() {
  if (!dbCache) dbCache = new Database(DB_PATH);
  return dbCache;
}

const router = express.Router();

// 默认权重配置
const DEFAULT_WEIGHTS = {
  policy: 0.25,      // 政策支持力度 25%
  commercial: 0.30,  // 商业化显现 30%
  public: 0.25,      // 舆论热度 25%
  capital: 0.20      // 资本关注度 20%
};

// 政策关键词评分映射
const POLICY_KEYWORDS = {
  5: ['算力', '人工智能', '机器人', '创新药', '低空', '半导体', '芯片', '储能', '电网', '数据', '信创', '卫星', '军工', 'AI'],
  4: ['医疗', '工业', '新能源', '智能', '新材料', '高端制造', '汽车', '消费电子', '光模块', '服务器', '云', '数字'],
};

// 配置文件路径
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const WEIGHTS_FILE = path.join(CONFIG_DIR, 'industry-weights.json');

/**
 * 加载权重配置
 * @returns {Object} 权重配置
 */
function loadWeights() {
  try {
    if (fs.existsSync(WEIGHTS_FILE)) {
      const content = fs.readFileSync(WEIGHTS_FILE, 'utf8');
      const config = JSON.parse(content);

      // 验证权重总和
      const total = Object.values(config).reduce((sum, val) => sum + val, 0);
      if (Math.abs(total - 1.0) > 0.01) {
        console.warn(`[industry-score] 权重总和 ${total} 不等于 1.0，使用默认权重`);
        return { ...DEFAULT_WEIGHTS };
      }

      return config;
    }
  } catch (error) {
    console.warn(`[industry-score] 加载权重配置失败: ${error.message}`);
  }
  return { ...DEFAULT_WEIGHTS };
}

/**
 * 归一化名称
 */
function normalizeName(value) {
  return String(value || '').trim();
}

/**
 * 根据关键词计算政策评分
 * @param {string} name - 行业名称
 * @returns {number} 政策评分 (1-5)
 */
function calculatePolicyScore(name) {
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

/**
 * 原始值转换为维度评分 (0-100 -> 1-5)
 */
function dimensionFromRaw(rawValue) {
  const normalized = Math.max(0, Math.min(100, rawValue));
  if (normalized >= 85) return 5;
  if (normalized >= 70) return 4;
  if (normalized >= 55) return 3;
  if (normalized >= 35) return 2;
  return 1;
}

/**
 * 计算平均值
 */
function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * 计算行业 4 维度评分
 * @param {Object} flow - 板块资金流向数据
 * @param {Object} index - 同花顺指数数据
 * @param {Object} hot - 热度数据
 * @param {number} ipoMatches - 近一年 IPO 匹配数
 * @param {Object} weights - 权重配置
 * @returns {Object} 行业评分结果
 */
function scoreIndustry(flow, index, hot, ipoMatches, weights) {
  const name = normalizeName(flow.name || index?.name);
  const companyCount = Math.max(toNumber(flow.company_num), toNumber(index?.count));
  const netAmount = toNumber(flow.net_amount);
  const pctChange = toNumber(flow.pct_change);
  const hotRank = hot ? toNumber(hot.rank, 999) : 999;
  const hotValue = hot ? toNumber(hot.hot) : 0;
  const pctChangeStock = toNumber(flow.pct_change_stock);

  // 1. 政策评分 (关键词匹配)
  const policyScore = calculatePolicyScore(name);

  // 2. 商业化评分 (基于公司数量、IPO、涨幅)
  const commercialRaw = Math.min(100,
    (companyCount * 0.6) +
    (ipoMatches * 22) +
    (pctChange > 0 ? 15 : 0) +
    (pctChangeStock * 5)
  );
  const commercialScore = dimensionFromRaw(commercialRaw);

  // 3. 舆论评分 (基于热度值、热度排名)
  const publicRaw = Math.min(100,
    (hotValue / 2000) +
    (hotRank < 999 ? (110 - hotRank * 3) : 15) +
    (pctChange * 6)
  );
  const publicScore = dimensionFromRaw(publicRaw);

  // 4. 资本评分 (基于资金净流入)
  const capitalRaw = Math.min(100,
    (Math.max(netAmount, 0) * 4) +
    (companyCount * 0.4) +
    (pctChangeStock * 8)
  );
  const capitalScore = dimensionFromRaw(capitalRaw);

  // 加权计算综合评分 (满分 100)
  const totalScore = Math.round(
    (policyScore * weights.policy +
     commercialScore * weights.commercial +
     publicScore * weights.public +
     capitalScore * weights.capital) * 20  // 5 分制转 100 分制
  );

  return {
    name,
    policy_score: policyScore * 20,      // 转换为 0-100
    commercial_score: commercialScore * 20,
    public_score: publicScore * 20,
    capital_score: capitalScore * 20,
    total_score: totalScore,
    metrics: {
      companyCount,
      netAmount,
      hotRank: hotRank === 999 ? null : hotRank,
      hotValue,
      ipoMatches,
      pctChange
    }
  };
}

/**
 * 获取全市场行业评分排行榜
 * @param {Object} customWeights - 自定义权重（可选）
 * @returns {Promise<Object>} 评分结果
 */
async function getIndustryScoreRanking(customWeights = null) {
  const startTime = Date.now();
  const weights = customWeights || loadWeights();

  // 验证权重
  const total = Object.values(weights).reduce((sum, val) => sum + val, 0);
  if (Math.abs(total - 1.0) > 0.01) {
    throw new Error(`权重总和必须为 1.0，当前为 ${total}`);
  }

  // 从数据库获取行业数据
  const db = getDb();
  
  // 获取最新交易日
  const tradeDateRow = db.prepare('SELECT MAX(trade_date) as trade_date FROM industry_moneyflow').get();
  const tradeDate = tradeDateRow?.trade_date || new Date().toISOString().split('T')[0];
  
  // 获取行业资金流
  const industryFlows = db.prepare(`
    SELECT 
      industry_code as ts_code,
      industry_name as name,
      net_mf_amount as net_amount,
      avg_pct_change as pct_change,
      stock_count as company_num,
      industry_type as type
    FROM industry_moneyflow
    WHERE trade_date = ?
  `).all(tradeDate);
  
  // 获取行业指数信息
  const thsIndex = db.prepare('SELECT ts_code, name, type, count FROM industry_index').all();
  const indexMap = new Map(thsIndex.filter(item => ['N', 'TH', 'I'].includes(item.type)).map(item => [item.ts_code, item]));
  
  // 获取行业热度（如果表存在）
  let hotMap = new Map();
  try {
    const industryHot = db.prepare(`SELECT ts_code, ts_name, rank, hot FROM industry_hot WHERE trade_date = ?`).all(tradeDate);
    hotMap = new Map(industryHot.filter(item => normalizeName(item.ts_name)).map(item => [normalizeName(item.ts_name), item]));
  } catch (e) {
    console.log('[getIndustryScoreRanking] industry_hot 表不存在或无数据');
  }
  
  console.log('[getIndustryScoreRanking] 加载行业资金流', industryFlows.length, '条，行业指数', indexMap.size, '个，热度', hotMap.size, '个');

  // 计算所有行业的评分
  const industries = industryFlows
    .map(flow => {
      const index = indexMap.get(flow.ts_code);
      if (!index) return null;

      const name = normalizeName(flow.name || index.name);
      const hot = hotMap.get(name);
      
      // 构建兼容旧 scoreIndustry 函数的 flow 对象
      const flowCompat = {
        trade_date: tradeDate,
        ts_code: flow.ts_code,
        name: flow.name,
        lead_stock: '',
        close_price: 0,
        pct_change: flow.pct_change || 0,
        industry_index: flow.ts_code,
        company_num: flow.company_num || 0,
        pct_change_stock: 0,
        net_buy_amount: 0,
        net_sell_amount: 0,
        net_amount: flow.net_amount || 0
      };
      
      return scoreIndustry(flowCompat, index, hot, 0, weights);
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.total_score !== a.total_score) return b.total_score - a.total_score;
      if (b.metrics.netAmount !== a.metrics.netAmount) return b.metrics.netAmount - a.metrics.netAmount;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

  // 添加排名
  const ranking = industries.map((industry, index) => ({
    rank: index + 1,
    ...industry
  }));

  const elapsed = Date.now() - startTime;

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    tradeDate,
    weights,
    elapsed_ms: elapsed,
    total_industries: ranking.length,
    ranking: ranking.slice(0, 50),
    top3: ranking.slice(0, 3).map(item => ({
      rank: item.rank,
      industry: item.name,
      total_score: item.total_score
    }))
  };
}

/**
 * POST /api/industry/score
 * 获取行业评分排行榜
 *
 * 请求体：
 * {
 *   "weights": {
 *     "policy": 0.25,
 *     "commercial": 0.30,
 *     "public": 0.25,
 *     "capital": 0.20
 *   },
 *   "limit": 50
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { weights, limit = 50 } = req.body;

    console.log('[industry-score] 开始计算行业评分，权重:', weights || '默认');

    const result = await getIndustryScoreRanking(weights);

    // 限制返回数量
    result.ranking = result.ranking.slice(0, Math.min(limit, 100));

    console.log(`[industry-score] 计算完成，耗时 ${result.elapsed_ms}ms，共 ${result.total_industries} 个行业`);

    res.json(result);
  } catch (error) {
    console.error('[industry-score] 计算失败:', error);
    const status = error instanceof MarketDataError ? error.status : 500;
    res.status(status).json({
      success: false,
      message: error.message,
      ranking: []
    });
  }
});

/**
 * GET /api/industry/score
 * 快速获取行业评分排行榜（使用默认权重）
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    console.log('[industry-score] 开始计算行业评分（默认权重）');

    const result = await getIndustryScoreRanking(null);
    result.ranking = result.ranking.slice(0, limit);

    console.log(`[industry-score] 计算完成，耗时 ${result.elapsed_ms}ms`);

    res.json(result);
  } catch (error) {
    console.error('[industry-score] 计算失败:', error);
    const status = error instanceof MarketDataError ? error.status : 500;
    res.status(status).json({
      success: false,
      message: error.message,
      ranking: []
    });
  }
});

/**
 * GET /api/industry/score/top3
 * 快速获取 Top N 行业
 *
 * 查询参数：
 * - top_n: 返回数量 (默认 3，范围 1-10)
 */
router.get('/top3', async (req, res) => {
  try {
    // 解析并验证 top_n 参数
    const topN = Math.min(10, Math.max(1, parseInt(req.query.top_n) || 3));

    const result = await getIndustryScoreRanking(null);

    // 构建 top_industries 数组
    const topIndustries = result.ranking.slice(0, topN).map(item => ({
      rank: item.rank,
      industry: item.name,
      score: item.total_score
    }));

    res.json({
      success: true,
      data: {
        top_industries: topIndustries
      }
    });
  } catch (error) {
    console.error('[industry-score] 获取 Top N 失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 导出
module.exports = router;
module.exports.getIndustryScoreRanking = getIndustryScoreRanking;
module.exports.scoreIndustry = scoreIndustry;
module.exports.loadWeights = loadWeights;
module.exports.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;