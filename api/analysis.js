const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createRequire } = require('node:module');

const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');

const execFileAsync = promisify(execFile);
const router = express.Router();

const PYTHON_SCRIPT = path.join(__dirname, '..', '..', 'skills', 'a股个股分析', 'scripts', 'stock_analyzer.py');
const HTML_REPORT_DIR = path.join(__dirname, '..', '..', 'report', 'analysis');
const analyzeRouter = require('./analyze');
const { getMarginDetailRows, toNumber: marketToNumber } = require('./market-data');

function slugify(value) {
  return String(value || 'stock')
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'stock';
}

function toNumber(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function toStars(score) {
  const rounded = Math.min(5, Math.max(1, Math.round(toNumber(score, 3))));
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatYuan(value) {
  return `${toNumber(value).toFixed(2)} 元`;
}

function renderTable(headers, rows) {
  const thead = headers.map((item) => `<th scope="col">${escapeHtml(item)}</th>`).join('');
  const tbody = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
  return `
    <div class="data-table-wrap">
      <table>
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
}

function renderList(items, ordered = false) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} class="plain-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`;
}

function buildHtmlReport(payload) {
  const summary = payload.summary || {};
  const stock = payload.stock || {};
  const technicalTable = Array.isArray(payload.technical?.table) ? payload.technical.table : [];
  const valuationTable = Array.isArray(payload.valuation?.table) ? payload.valuation.table : [];
  const targetPrices = Array.isArray(payload.target_prices) ? payload.target_prices : [];
  const fundFlow = payload.capital?.fund_flow || {};
  const fundRows = Object.entries(fundFlow).map(([key, value]) => [
    escapeHtml(key),
    typeof value === 'number' ? escapeHtml(value.toFixed(Number.isInteger(value) ? 0 : 2)) : escapeHtml(value),
  ]);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(stock.name)} 个股分析报告</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #08111f;
      --bg-top: #0b1628;
      --panel: rgba(11, 24, 40, 0.92);
      --panel-soft: rgba(255, 255, 255, 0.03);
      --line: rgba(129, 165, 208, 0.18);
      --text: #eff5ff;
      --muted: #9badc8;
      --accent: #84f1cc;
      --accent-2: #7cb7ff;
      --warn: #ffbf7a;
      --risk: #ffc9ab;
      --shadow: 0 20px 60px rgba(3, 8, 18, 0.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(124, 183, 255, 0.18), transparent 28%),
        radial-gradient(circle at top right, rgba(132, 241, 204, 0.12), transparent 24%),
        linear-gradient(180deg, var(--bg-top) 0%, var(--bg) 100%);
    }
    main { max-width: 1180px; margin: 0 auto; padding: 36px 18px 60px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 24px; backdrop-filter: blur(14px); box-shadow: var(--shadow); }
    .hero { padding: 28px; margin-bottom: 18px; }
    .eyebrow, .tag, .pill { display: inline-flex; align-items: center; border-radius: 999px; font-size: 13px; }
    .eyebrow { padding: 6px 10px; background: rgba(132, 241, 204, 0.12); color: var(--accent); letter-spacing: 0.08em; }
    h1 { margin: 14px 0 10px; font-size: clamp(32px, 5vw, 52px); line-height: 1.05; }
    h2 { margin: 0 0 8px; font-size: 24px; }
    h3 { margin: 0 0 10px; font-size: 18px; }
    .lead, p, li { color: var(--muted); line-height: 1.8; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; padding: 18px; margin-bottom: 18px; }
    .summary-item, .detail-card, .callout { padding: 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--panel-soft); }
    .summary-label { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
    .summary-value { font-size: 24px; font-weight: 700; line-height: 1.35; word-break: break-word; }
    .section { padding: 22px; margin-bottom: 18px; }
    .section-description { margin: 0; color: var(--muted); line-height: 1.8; }
    .duo, .card-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .card-grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
    .meta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
    .pill { padding: 7px 11px; background: rgba(124, 183, 255, 0.12); color: var(--accent-2); }
    .tag { padding: 7px 11px; background: rgba(132, 241, 204, 0.12); color: var(--accent); }
    .callout-risk h3, .callout-risk li { color: var(--risk); }
    .plain-list { margin: 0; padding-left: 20px; display: grid; gap: 8px; }
    .data-table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th, td { padding: 14px 12px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--text); font-size: 13px; font-weight: 700; white-space: nowrap; }
    td { color: var(--muted); }
    tr:last-child td { border-bottom: none; }
    @media (max-width: 720px) {
      main { padding: 24px 14px 40px; }
      .panel { border-radius: 18px; }
      .hero, .section { padding: 20px; }
      .summary { padding: 14px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="panel hero">
      <span class="eyebrow">skills/a股个股分析 · 实时数据版</span>
      <h1>${escapeHtml(stock.name)} 个股分析报告</h1>
      <p class="lead">报告按原始 Skill 的结构输出，并接入新浪财经实时价格 + Tushare 技术面、估值、资金面与目标价测算，数据不再靠猜。</p>
    </section>

    <section class="panel summary">
      <div class="summary-item"><div class="summary-label">股票代码</div><div class="summary-value">${escapeHtml(stock.ts_code)}</div></div>
      <div class="summary-item"><div class="summary-label">所属行业</div><div class="summary-value">${escapeHtml(stock.industry || '-')}</div></div>
      <div class="summary-item"><div class="summary-label">当前价格</div><div class="summary-value">${escapeHtml(formatYuan(summary.current_price))}</div></div>
      <div class="summary-item"><div class="summary-label">研究评级</div><div class="summary-value">${escapeHtml(summary.rating)} (${escapeHtml(toNumber(summary.report_score).toFixed(1))} / 5)</div></div>
      <div class="summary-item"><div class="summary-label">最终决策</div><div class="summary-value">${escapeHtml(summary.decision)}</div></div>
      <div class="summary-item"><div class="summary-label">生成时间</div><div class="summary-value">${escapeHtml(payload.generated_at)}</div></div>
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>1. 核心信息</h2>
        <p class="section-description">先看标的定位、价格状态和研究结论，再决定要不要继续往下看。</p>
      </div>
      <div class="duo">
        <div class="callout">
          <h3>核心信息</h3>
          <ul class="plain-list">
            <li>股票名称：${escapeHtml(stock.name)}</li>
            <li>股票代码：${escapeHtml(stock.ts_code)}</li>
            <li>所属行业：${escapeHtml(stock.industry || '-')}</li>
            <li>当前价格：${escapeHtml(formatYuan(summary.current_price))}</li>
            <li>今日涨跌：${escapeHtml(toNumber(summary.change).toFixed(2))} 元 (${escapeHtml(toNumber(summary.pct_chg).toFixed(2))}%)</li>
            <li>研究评级：${escapeHtml(summary.rating)}（${escapeHtml(toNumber(summary.report_score).toFixed(1))}/5）</li>
            <li>最终决策：${escapeHtml(summary.decision)}</li>
          </ul>
        </div>
        <div class="callout">
          <h3>实时行情</h3>
          <ul class="plain-list">
            <li>今日最高：${escapeHtml(formatYuan(summary.high))}</li>
            <li>今日最低：${escapeHtml(formatYuan(summary.low))}</li>
            <li>成交量：${escapeHtml(toNumber(summary.volume).toFixed(2))} 万手</li>
            <li>成交额：${escapeHtml(toNumber(summary.amount).toFixed(2))} 亿元</li>
            <li>总市值：${escapeHtml(toNumber(summary.total_mv).toFixed(2))} 亿元</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>2. 关键技术指标</h2>
        <p class="section-description">MA、MACD、RSI、布林带全部落表，不再只给口头结论。</p>
      </div>
      ${renderTable(
        ['指标', '数值', '判断'],
        technicalTable.map((item) => [escapeHtml(item.indicator), escapeHtml(String(item.value)), escapeHtml(item.judgment)])
      )}
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>3. 估值分析</h2>
        <p class="section-description">PE、PB、PEG 统一按真实数据口径展示，并给出高低判断。</p>
      </div>
      ${renderTable(
        ['指标', '数值', '判断'],
        valuationTable.map((item) => [escapeHtml(item.indicator), escapeHtml(String(item.value)), escapeHtml(item.judgment)])
      )}
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>4. 资金面数据</h2>
        <p class="section-description">成交量、融资融券余额、股东人数都给到，不再留"以后再接"的坑。</p>
      </div>
      ${renderTable(['指标', '数值'], fundRows)}
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>5. 核心争议点（多方 vs 空方）</h2>
        <p class="section-description">保留 Skill 原版的多空对照结构，避免只给单边喊单。</p>
      </div>
      <div class="duo">
        <div class="callout">
          <h3>多方观点</h3>
          ${renderList(payload.bull_points || [])}
        </div>
        <div class="callout callout-risk">
          <h3>空方观点</h3>
          ${renderList(payload.bear_points || [])}
        </div>
      </div>
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>6. 风险管理委员会决策意见</h2>
      </div>
      <div class="callout">
        <p>${escapeHtml(payload.committee_opinion || '')}</p>
      </div>
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>7. 关键观察点</h2>
        <p class="section-description">这些点是后续是否加仓、降级或直接撤退的风向标。</p>
      </div>
      ${renderList(payload.watch_points || [], true)}
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>8. 适合你的策略</h2>
        <p class="section-description">按激进、稳健、保守三类风险偏好输出执行框架。</p>
      </div>
      <div class="card-grid">
        <article class="detail-card"><div class="meta-row"><span class="pill">激进型</span></div><p>${escapeHtml(payload.strategies?.aggressive || '')}</p></article>
        <article class="detail-card"><div class="meta-row"><span class="pill">稳健型</span></div><p>${escapeHtml(payload.strategies?.balanced || '')}</p></article>
        <article class="detail-card"><div class="meta-row"><span class="pill">保守型</span></div><p>${escapeHtml(payload.strategies?.conservative || '')}</p></article>
      </div>
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>9. 操作建议</h2>
        <p class="section-description">区分短线、中线、长线，别一把梭哈把自己硬控住。</p>
      </div>
      <div class="callout">
        <ul class="plain-list">
          <li>短线（1周）：${escapeHtml(payload.operations?.short_term || '')}</li>
          <li>中线（1-3个月）：${escapeHtml(payload.operations?.mid_term || '')}</li>
          <li>长线（6个月以上）：${escapeHtml(payload.operations?.long_term || '')}</li>
        </ul>
      </div>
    </section>

    <section class="panel section">
      <div class="section-header">
        <h2>10. 目标价格测算</h2>
        <p class="section-description">1个月、3个月、6个月三档目标价与预期涨幅全部给出。</p>
      </div>
      ${renderTable(
        ['时间', '目标价', '对应逻辑', '预期涨幅'],
        targetPrices.map((item) => [
          escapeHtml(item.period),
          escapeHtml(formatYuan(item.target_price)),
          escapeHtml(item.logic),
          `${escapeHtml(toNumber(item.expected_return).toFixed(2))}%`,
        ])
      )}
    </section>
  </main>
</body>
</html>`;
}

async function runAnalysis(query) {
  const env = {
    ...process.env,
    PYTHONPYCACHEPREFIX: '/tmp/pycache',
  };
  const { stdout, stderr } = await execFileAsync('python3', [PYTHON_SCRIPT, '--json', query], {
    cwd: path.join(__dirname, '..', '..'),
    env,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
  });

  try {
    return JSON.parse(stdout);
  } catch (error) {
    const details = [stdout, stderr].filter(Boolean).join('\n').slice(0, 1000);
    throw new Error(`个股分析脚本返回了无法解析的 JSON: ${details || error.message}`);
  }
}

async function buildFallbackPayload(query) {
  const payload = await analyzeRouter.buildReportPayload(query);
  const marginRows = await getMarginDetailRows(payload.stock.ts_code).catch(() => []);
  const latestMargin = Array.isArray(marginRows) && marginRows.length > 0 ? marginRows[0] : null;
  const peg = toNumber(payload.valuation.pe_ttm) > 0 && toNumber(payload.latestFina?.netprofit_yoy) > 0
    ? toNumber(payload.valuation.pe_ttm) / toNumber(payload.latestFina?.netprofit_yoy)
    : 0;

  return {
    generated_at: new Date(payload.generatedAt).toISOString().slice(0, 19).replace('T', ' '),
    stock: {
      name: payload.stock.name,
      ts_code: payload.stock.ts_code,
      industry: payload.stock.industry,
      area: payload.stock.area || '',
    },
    summary: {
      current_price: toNumber(payload.technical.price),
      change: toNumber(payload.technical.change),
      pct_chg: toNumber(payload.technical.pctChange),
      high: toNumber(payload.technical.high),
      low: toNumber(payload.technical.low),
      volume: toNumber(payload.technical.volume) / 10000,
      amount: toNumber(payload.technical.amount) / 100000,
      total_mv: toNumber(payload.valuation.total_mv) / 10000,
      report_score: toNumber(payload.reportScore),
      rating: toStars(payload.reportScore),
      decision: payload.decision,
    },
    technical: {
      price: toNumber(payload.technical.price),
      pre_close: toNumber(payload.technical.preClose),
      change: toNumber(payload.technical.change),
      pct_chg: toNumber(payload.technical.pctChange),
      high: toNumber(payload.technical.high),
      low: toNumber(payload.technical.low),
      vol: toNumber(payload.technical.volume) / 100,
      amount: toNumber(payload.technical.amount),
      ma5: toNumber(payload.technical.latest.ma5),
      ma10: toNumber(payload.technical.latest.ma10),
      ma20: toNumber(payload.technical.latest.ma20),
      ma60: toNumber(payload.technical.latest.ma60),
      macd_dif: toNumber(payload.technical.latest.macd_dif),
      macd_dea: toNumber(payload.technical.latest.macd_dea),
      macd_bar: toNumber(payload.technical.latest.macd_bar),
      rsi: toNumber(payload.technical.latest.rsi),
      bb_upper: toNumber(payload.technical.latest.bb_upper),
      bb_middle: toNumber(payload.technical.latest.bb_middle),
      bb_lower: toNumber(payload.technical.latest.bb_lower),
      ma_signal: payload.technical.maSignal,
      macd_signal: payload.technical.macdSignal,
      rsi_signal: payload.technical.rsiSignal,
      bb_signal: payload.technical.bollSignal,
      table: [
        { indicator: 'MA5', value: toNumber(payload.technical.latest.ma5).toFixed(2), judgment: toNumber(payload.technical.price) >= toNumber(payload.technical.latest.ma5) ? '股价在MA5上方' : '股价跌破MA5' },
        { indicator: 'MA10', value: toNumber(payload.technical.latest.ma10).toFixed(2), judgment: toNumber(payload.technical.price) >= toNumber(payload.technical.latest.ma10) ? '股价在MA10上方' : '股价跌破MA10' },
        { indicator: 'MA20', value: toNumber(payload.technical.latest.ma20).toFixed(2), judgment: payload.technical.maSignal },
        { indicator: 'MA60', value: toNumber(payload.technical.latest.ma60).toFixed(2), judgment: toNumber(payload.technical.price) >= toNumber(payload.technical.latest.ma60) ? '股价在MA60上方' : '股价跌破MA60' },
        { indicator: 'MACD DIF', value: toNumber(payload.technical.latest.macd_dif).toFixed(4), judgment: payload.technical.macdSignal },
        { indicator: 'MACD DEA', value: toNumber(payload.technical.latest.macd_dea).toFixed(4), judgment: toNumber(payload.technical.latest.macd_dif) >= toNumber(payload.technical.latest.macd_dea) ? '多头占优' : '空头占优' },
        { indicator: 'MACD柱', value: toNumber(payload.technical.latest.macd_bar).toFixed(4), judgment: toNumber(payload.technical.latest.macd_bar) >= 0 ? '红柱' : '绿柱' },
        { indicator: 'RSI(14)', value: toNumber(payload.technical.latest.rsi).toFixed(2), judgment: payload.technical.rsiSignal },
        { indicator: '布林上轨', value: toNumber(payload.technical.latest.bb_upper).toFixed(2), judgment: '压力位' },
        { indicator: '布林中轨', value: toNumber(payload.technical.latest.bb_middle).toFixed(2), judgment: payload.technical.bollSignal },
        { indicator: '布林下轨', value: toNumber(payload.technical.latest.bb_lower).toFixed(2), judgment: '支撑位' },
      ],
    },
    valuation: {
      ...payload.valuation,
      peg,
      table: [
        { indicator: 'PE(TTM)', value: toNumber(payload.valuation.pe_ttm).toFixed(2), judgment: toNumber(payload.valuation.pe_ttm) > 35 ? '偏高' : toNumber(payload.valuation.pe_ttm) > 0 ? '合理' : '暂无数据' },
        { indicator: 'PB', value: toNumber(payload.valuation.pb).toFixed(2), judgment: toNumber(payload.valuation.pb) > 4 ? '偏高' : toNumber(payload.valuation.pb) > 0 ? '合理' : '暂无数据' },
        { indicator: 'PEG', value: toNumber(peg).toFixed(2), judgment: peg > 1.5 ? '偏高' : peg > 0 ? '合理' : '暂无数据' },
        { indicator: 'PS', value: toNumber(payload.valuation.ps).toFixed(2), judgment: toNumber(payload.valuation.ps) > 6 ? '偏高' : '合理' },
      ],
    },
    capital: {
      latest_volume: toNumber(payload.technical.volume) / 100,
      latest_amount: toNumber(payload.technical.amount),
      avg_vol_5: 0,
      avg_vol_20: 0,
      vol_ratio: toNumber(payload.valuation.volume_ratio),
      margin_balance: toNumber(latestMargin?.rzrqye) / 100000000,
      holder_num: marketToNumber(payload.latestHolder?.holder_num),
      fund_flow: {
        '成交量(万手)': toNumber(payload.technical.volume) / 1000000,
        '成交额(亿元)': toNumber(payload.technical.amount) / 100000000,
        '量比': toNumber(payload.valuation.volume_ratio),
        '换手率(%)': toNumber(payload.valuation.turnover_rate),
        '融资融券余额(亿元)': toNumber(latestMargin?.rzrqye) / 100000000,
        '股东人数(户)': marketToNumber(payload.latestHolder?.holder_num),
        '同花顺主力净流入(万元)': toNumber(payload.latestThsFlow?.net_amount),
        '北向资金(百万元)': toNumber(payload.latestNorthMoney?.north_money),
      },
    },
    fundamental: {
      revenue_q3: toNumber(payload.latestIncome?.total_revenue) / 100000000,
      profit_q3: toNumber(payload.latestIncome?.n_income) / 100000000,
      roe: toNumber(payload.latestFina?.roe),
      gross_margin: toNumber(payload.latestFina?.grossprofit_margin),
    },
    bull_points: payload.bullPoints,
    bear_points: payload.bearPoints,
    committee_opinion: payload.committeeOpinion,
    watch_points: payload.watchPoints,
    strategies: payload.strategies,
    operations: {
      short_term: `围绕 ${toNumber(payload.technical.latest.ma10).toFixed(2)}-${toNumber(payload.technical.latest.ma20).toFixed(2)} 元区间观察承接，失守支撑则减仓。`,
      mid_term: '重点看业绩、资金和价格是否同步改善，只有共振才考虑加仓。',
      long_term: `继续跟踪 ${payload.stock.industry || '行业'} 逻辑、产品兑现和估值中枢变化。`,
    },
    target_prices: payload.targetPrices.map((item) => ({
      period: item.period,
      target_price: toNumber(item.price),
      logic: item.logic,
      expected_return: toNumber(item.rise),
    })),
    realtime_quote: payload.realtimeQuote,
  };
}

function getQuery(body) {
  const stockName = typeof body?.stock_name === 'string' ? body.stock_name.trim() : '';
  const stockCode = typeof body?.stock_code === 'string' ? body.stock_code.trim() : '';
  return stockCode || stockName;
}

async function buildAnalysisResponse(req, res, withReport = false) {
  const query = getQuery(req.body);
  if (!query) {
    return res.status(400).json({
      success: false,
      message: 'stock_name or stock_code is required',
    });
  }

  try {
    let payload;
    try {
      payload = await runAnalysis(query);
    } catch (error) {
      const fallbackable = /No module named 'tushare'|No module named 'pandas'|No module named 'numpy'|无法解析的 JSON/.test(error.message);
      if (!fallbackable) {
        throw error;
      }
      payload = await buildFallbackPayload(query);
    }

    if (!withReport) {
      return res.json({
        success: true,
        data: payload,
      });
    }

    fs.mkdirSync(HTML_REPORT_DIR, { recursive: true });
    const dateStamp = String(payload.generated_at || '').slice(0, 10).replace(/-/g, '') || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `stock_report_${slugify(payload.stock?.name)}_${dateStamp}.html`;
    const fullPath = path.join(HTML_REPORT_DIR, fileName);
    fs.writeFileSync(fullPath, buildHtmlReport(payload), 'utf8');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json({
      success: true,
      report_path: `${baseUrl}/report/analysis/${encodeURIComponent(fileName)}`,
      markdown_report_path: payload.report_path || '',
      data: payload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

router.post('/', async (req, res) => buildAnalysisResponse(req, res, false));
router.post('/report', async (req, res) => buildAnalysisResponse(req, res, true));

router.runAnalysis = runAnalysis;
router.buildFallbackPayload = buildFallbackPayload;
router.buildHtmlReport = buildHtmlReport;
router.buildAnalysisResponse = buildAnalysisResponse;
module.exports = router;
