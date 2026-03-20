const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');
const { MarketDataError, getSelectionDatasets, toNumber, tushareRequest } = require('./market-data');

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
      return {
        code: member.con_code,
        name: member.con_name,
        industry: basic.industry || '',
        total_mv: toNumber(quote.total_mv) / 10000,
        turnover_rate: toNumber(quote.turnover_rate),
        volume_ratio: toNumber(quote.volume_ratio),
        pe_ttm: toNumber(quote.pe_ttm),
      };
    })
    .filter((item) => item.total_mv > 0)
    .sort((left, right) => {
      if (right.total_mv !== left.total_mv) return right.total_mv - left.total_mv;
      if (right.volume_ratio !== left.volume_ratio) return right.volume_ratio - left.volume_ratio;
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

async function buildSelectionPayload() {
  const datasets = await getSelectionDatasets();
  const stockBasicMap = new Map(datasets.stockBasic.map((item) => [item.ts_code, item]));
  const dailyBasicMap = new Map(datasets.dailyBasic.map((item) => [item.ts_code, item]));
  const indexMap = new Map(
    datasets.thsIndex
      .filter((item) => ['N', 'TH', 'I'].includes(item.type))
      .map((item) => [item.ts_code, item])
  );
  const hotMap = new Map(
    datasets.conceptHot
      .filter((item) => normalizeName(item.ts_name))
      .map((item) => [normalizeName(item.ts_name), item])
  );

  const ipoIndustries = datasets.ipoRows
    .map((row) => stockBasicMap.get(row.ts_code))
    .filter(Boolean)
    .map((row) => normalizeName(row.industry));

  const candidateDirections = datasets.conceptFlow
    .map((flow) => {
      const index = indexMap.get(flow.ts_code);
      if (!index) return null;

      const name = normalizeName(flow.name || index.name);
      const hot = hotMap.get(name);
      const companyCount = Math.max(toNumber(flow.company_num), toNumber(index.count));
      const netAmount = toNumber(flow.net_amount);
      const pctChange = toNumber(flow.pct_change);
      const hotRank = hot ? toNumber(hot.rank, 999) : 999;
      const hotValue = hot ? toNumber(hot.hot) : 0;
      const ipoMatches = ipoIndustries.filter((industry) => industry && (name.includes(industry) || industry.includes(name))).length;

      const social = dimensionFromRaw(Math.min(100, (companyCount * 0.6) + (ipoMatches * 22) + (pctChange > 0 ? 15 : 0)));
      const policy = keywordScore(name);
      const publicHeat = dimensionFromRaw(Math.min(100, hotValue / 2000 + (hotRank < 999 ? (110 - hotRank * 3) : 15) + (pctChange * 6)));
      const business = dimensionFromRaw(Math.min(100, (Math.max(netAmount, 0) * 4) + (companyCount * 0.4) + (toNumber(flow.pct_change_stock) * 8)));
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
          netAmount,
          pctChange,
        },
        leadStock: normalizeName(flow.lead_stock),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.metrics.netAmount !== left.metrics.netAmount) return right.metrics.netAmount - left.metrics.netAmount;
      return left.name.localeCompare(right.name, 'zh-CN');
    })
    .slice(0, 6);

  const directions = [];
  for (const direction of candidateDirections) {
    const picks = await buildDirectionPicks(direction, dailyBasicMap, stockBasicMap);
    directions.push({
      ...direction,
      picks,
      reason: buildReason(direction),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    tradeDate: datasets.tradeDate,
    methodology: {
      framework: '自上而下行业筛选',
      dimensions: ['社会经济趋势', '政策方向', '舆论热度', '商业变现'],
      sources: ['Tushare stock_basic', 'Tushare ths_index', 'Tushare moneyflow_cnt_ths', 'Tushare ths_hot', 'Tushare new_share'],
    },
    directions,
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

router.get('/', async (_req, res) => {
  try {
    res.json(await buildSelectionPayload());
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
