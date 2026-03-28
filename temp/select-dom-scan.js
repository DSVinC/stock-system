const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000/select.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const buttons = await page.locator('button').evaluateAll(nodes => nodes.map(n => ({ text: (n.textContent || '').trim(), id: n.id || null, onclick: n.getAttribute('onclick') || null })).slice(0, 40));
  console.log(JSON.stringify(buttons, null, 2));
  await browser.close();
})();
