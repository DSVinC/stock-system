function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSummaryItems(items) {
  return items.map((item) => `
    <div class="summary-item">
      <div class="summary-label">${escapeHtml(item.label)}</div>
      <div class="summary-value">${escapeHtml(item.value)}</div>
    </div>
  `).join('');
}

function renderSections(sections) {
  return sections.map((section) => `
    <section class="panel section ${section.className || ''}">
      <div class="section-header">
        <h2>${escapeHtml(section.title)}</h2>
        ${section.description ? `<p class="section-description">${escapeHtml(section.description)}</p>` : ''}
      </div>
      <div class="section-body">
        ${section.content}
      </div>
    </section>
  `).join('');
}

function renderReportPage({ title, eyebrow, headline, lead, summaryItems, sections }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #08111f;
      --bg-top: #0b1628;
      --panel: rgba(11, 24, 40, 0.9);
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
    main {
      max-width: 1160px;
      margin: 0 auto;
      padding: 40px 18px 64px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      backdrop-filter: blur(14px);
      box-shadow: var(--shadow);
    }
    .hero {
      padding: 28px;
      margin-bottom: 18px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(132, 241, 204, 0.12);
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.08em;
    }
    h1 {
      margin: 14px 0 10px;
      font-size: clamp(32px, 5vw, 52px);
      line-height: 1.05;
    }
    .lead {
      margin: 0;
      max-width: 860px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.8;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      padding: 18px;
      margin-bottom: 18px;
    }
    .summary-item {
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--panel-soft);
      min-height: 96px;
    }
    .summary-label {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 8px;
    }
    .summary-value {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.35;
      word-break: break-word;
    }
    .section {
      padding: 22px;
      margin-bottom: 18px;
    }
    .section-header {
      margin-bottom: 16px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 24px;
    }
    .section-description {
      margin: 0;
      color: var(--muted);
      line-height: 1.8;
    }
    p, li {
      color: var(--muted);
      line-height: 1.8;
    }
    .stack {
      display: grid;
      gap: 14px;
    }
    .card-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .detail-card {
      padding: 18px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
    }
    .detail-card h3 {
      margin: 0 0 8px;
      font-size: 20px;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }
    .pill, .tag {
      display: inline-flex;
      align-items: center;
      padding: 7px 11px;
      border-radius: 999px;
      font-size: 13px;
    }
    .pill {
      background: rgba(124, 183, 255, 0.12);
      color: var(--accent-2);
    }
    .tag {
      background: rgba(132, 241, 204, 0.12);
      color: var(--accent);
    }
    .duo {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }
    .callout {
      padding: 18px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
    }
    .callout h3 {
      margin: 0 0 10px;
      font-size: 18px;
    }
    .callout ul {
      margin: 0;
      padding-left: 18px;
    }
    .callout-risk h3,
    .callout-risk li,
    .risk-list li {
      color: var(--risk);
    }
    .risk-note {
      color: var(--warn);
      font-size: 13px;
    }
    .data-table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
    }
    th, td {
      padding: 14px 12px;
      text-align: left;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      color: var(--text);
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }
    td {
      color: var(--muted);
    }
    tr:last-child td {
      border-bottom: none;
    }
    ol, ul {
      margin: 0;
      padding-left: 20px;
    }
    .plain-list {
      display: grid;
      gap: 8px;
    }
    .plain-list li strong {
      color: var(--text);
    }
    .footnote {
      margin-top: 14px;
      color: var(--warn);
      font-size: 13px;
    }
    @media (max-width: 720px) {
      main { padding: 24px 14px 40px; }
      .panel { border-radius: 18px; }
      .hero, .section { padding: 20px; }
      .summary { padding: 14px; }
      .summary-item { min-height: auto; }
    }
  </style>
</head>
<body>
  <main>
    <section class="panel hero">
      <span class="eyebrow">${escapeHtml(eyebrow)}</span>
      <h1>${escapeHtml(headline)}</h1>
      <p class="lead">${escapeHtml(lead)}</p>
    </section>
    <section class="panel summary">
      ${renderSummaryItems(summaryItems)}
    </section>
    ${renderSections(sections)}
  </main>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  renderReportPage
};
