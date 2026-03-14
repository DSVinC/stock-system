const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');

const router = express.Router();
const REPORT_DIR = path.join(__dirname, '..', 'report', 'selection');

function buildDirections() {
  return [
    {
      name: 'AI算力',
      score: 92,
      reason: '社会端需求由大模型训练和推理持续拉动，政策鼓励算力基础设施建设，市场讨论热度高，服务器、光模块和液冷环节已有明确订单与收入兑现。'
    },
    {
      name: '机器人',
      score: 88,
      reason: '制造业自动化升级和人形机器人催化并行，政策支持智能制造，资本市场关注度保持高位，减速器、伺服和传感器具备较强产业化落地能力。'
    },
    {
      name: '低空经济',
      score: 84,
      reason: '低空空域管理改革推动产业放量，中央与地方密集出台配套政策，舆论关注度持续升温，无人机整机、运营服务和基础设施开始进入商业变现阶段。'
    },
    {
      name: '创新药',
      score: 82,
      reason: '人口老龄化和医疗升级构成长期趋势，集采扰动边际缓和后政策环境改善，国际授权交易频繁提升市场热度，头部药企的出海收入和管线价值逐步兑现。'
    },
    {
      name: '国产替代半导体',
      score: 80,
      reason: '自主可控仍是中长期主线，产业政策支持设备、材料和先进封装，行业关注度受景气复苏催化回升，部分环节已具备订单验证和国产份额提升逻辑。'
    },
    {
      name: '新型电力系统',
      score: 79,
      reason: '能源结构转型带来电网投资扩容，政策持续推进特高压、储能和电力市场化，媒体与机构覆盖稳定，设备招标和储能项目建设提供较强业绩支撑。'
    }
  ];
}

function buildSelectionPayload() {
  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      framework: '自上而下行业筛选',
      dimensions: ['社会经济趋势', '政策方向', '舆论热度', '商业变现']
    },
    directions: buildDirections()
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSelectionReport(payload) {
  const generatedAt = new Date(payload.generatedAt);
  const generatedLabel = Number.isNaN(generatedAt.getTime())
    ? payload.generatedAt
    : generatedAt.toLocaleString('zh-CN', { hour12: false });

  const cards = payload.directions.map((direction, index) => `
    <article class="card">
      <div class="card-head">
        <span class="rank">TOP ${index + 1}</span>
        <span class="score">${escapeHtml(direction.score)}</span>
      </div>
      <h2>${escapeHtml(direction.name)}</h2>
      <p>${escapeHtml(direction.reason || '暂无说明')}</p>
    </article>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A股行业筛选报告</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #08111f;
      --panel: rgba(12, 23, 40, 0.92);
      --line: rgba(117, 141, 179, 0.22);
      --text: #eef4ff;
      --muted: #95a8c7;
      --accent: #7ef0c8;
      --accent-2: #7cb8ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background:
        radial-gradient(circle at top, rgba(124, 184, 255, 0.18), transparent 32%),
        linear-gradient(180deg, #0a1324 0%, var(--bg) 100%);
      color: var(--text);
    }
    main {
      max-width: 1080px;
      margin: 0 auto;
      padding: 48px 20px 64px;
    }
    .hero, .summary, .grid {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      backdrop-filter: blur(12px);
    }
    .hero {
      padding: 28px;
      margin-bottom: 20px;
    }
    .eyebrow {
      display: inline-block;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(126, 240, 200, 0.12);
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.08em;
    }
    h1 {
      margin: 16px 0 10px;
      font-size: clamp(32px, 5vw, 52px);
      line-height: 1.05;
    }
    .lead {
      margin: 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.7;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      padding: 20px 24px;
      margin-bottom: 20px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 8px;
    }
    .metric-value {
      font-size: 22px;
      font-weight: 700;
    }
    .grid {
      display: grid;
      gap: 16px;
      padding: 20px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.02);
    }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .rank {
      color: var(--accent-2);
      font-size: 12px;
      letter-spacing: 0.08em;
    }
    .score {
      min-width: 56px;
      text-align: center;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(126, 240, 200, 0.12);
      color: var(--accent);
      font-weight: 700;
    }
    h2 {
      margin: 14px 0 10px;
      font-size: 24px;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.8;
    }
    @media (max-width: 720px) {
      main { padding: 24px 14px 40px; }
      .hero, .summary, .grid { border-radius: 18px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">skills/a股行业筛选</span>
      <h1>A股行业筛选报告</h1>
      <p class="lead">基于社会经济趋势、政策方向、舆论热度、商业变现四个维度，对当前优先研究的行业方向进行排序与说明。</p>
    </section>
    <section class="summary">
      <div>
        <div class="metric-label">生成时间</div>
        <div class="metric-value">${escapeHtml(generatedLabel)}</div>
      </div>
      <div>
        <div class="metric-label">候选方向</div>
        <div class="metric-value">${payload.directions.length}</div>
      </div>
      <div>
        <div class="metric-label">方法论</div>
        <div class="metric-value">${escapeHtml(payload.methodology.framework)}</div>
      </div>
    </section>
    <section class="grid">
      ${cards}
    </section>
  </main>
</body>
</html>`;
}

function writeSelectionReport() {
  const payload = buildSelectionPayload();
  const dateStamp = payload.generatedAt.slice(0, 10).replace(/-/g, '');
  const fileName = `selection_report_${dateStamp}.html`;
  const fullPath = path.join(REPORT_DIR, fileName);

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(fullPath, renderSelectionReport(payload), 'utf8');

  return { payload, fileName, fullPath };
}

router.get('/', (_req, res) => {
  res.json(buildSelectionPayload());
});

router.post('/report', (req, res) => {
  const { fileName } = writeSelectionReport();
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    success: true,
    report_path: `${baseUrl}/report/selection/${encodeURIComponent(fileName)}`
  });
});

module.exports = router;

if (require.main === module) {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.get('/api/select', (_req, res) => {
    res.json(buildSelectionPayload());
  });

  app.listen(port, () => {
    console.log(`select api listening on http://localhost:${port}/api/select`);
  });
}
