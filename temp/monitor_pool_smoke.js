const { chromium } = require('playwright');

async function request(path, options = {}) {
  const res = await fetch(`http://127.0.0.1:3000${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

(async () => {
  const stock = {
    stock_code: '111111.SZ',
    stock_name: '测试反馈股',
    strategySource: 'strategy_config',
    strategyConfigId: 999,
    strategyConfigName: '七因子高分策略（导入副本）',
    templateId: 888,
    templateName: '七因子高分策略模板'
  };

  await request('/api/monitor-pool/remove', { method: 'DELETE', body: JSON.stringify({ stock_code: stock.stock_code }) });
  const addRes = await request('/api/monitor-pool/add', { method: 'POST', body: JSON.stringify(stock) });
  if (!addRes.json.success) throw new Error(`add failed: ${JSON.stringify(addRes.json)}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000/monitor-pool.html', { waitUntil: 'networkidle' });
  const rowText = await page.locator('tbody tr').first().innerText();
  console.log(rowText);
  console.log(JSON.stringify({
    hasSource: rowText.includes('策略库'),
    hasName: rowText.includes('七因子高分策略（导入副本）')
  }));
  await browser.close();
})();
