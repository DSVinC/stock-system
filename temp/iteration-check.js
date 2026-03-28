const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.on('dialog', async (dialog) => {
    try {
      await dialog.accept();
    } catch {}
  });

  let startApi = null;
  let versionsApi = null;

  page.on('response', async (resp) => {
    const url = resp.url();
    try {
      if (url.includes('/api/iteration/start')) {
        startApi = { url, status: resp.status(), body: await resp.json() };
      }
      if (url.includes('/api/iteration/versions/')) {
        versionsApi = { url, status: resp.status(), body: await resp.json() };
      }
    } catch {}
  });

  const cfg = encodeURIComponent(JSON.stringify({ min_score: 0.75 }));
  await page.goto(
    `http://127.0.0.1:3000/iteration-manager.html?strategyType=seven_factor&stocks=000001.SZ,600519.SH&startDate=2024-01-01&endDate=2024-12-31&config=${cfg}`,
    { waitUntil: 'domcontentloaded' }
  );
  await page.waitForTimeout(3000);

  const strategyCount = await page.locator('#strategySelect').count();
  const versionListCount = await page.locator('#versionList').count();

  await page.click('#startBtn');
  await page.waitForTimeout(2500);

  const statusBadge = await page.locator('#statusBadge').textContent().catch(() => null);
  const versionItems = await page.locator('#versionList .version-item').count().catch(() => 0);
  const versionListText = await page.locator('#versionList').textContent().catch(() => '');

  await page.screenshot({ path: 'temp/screenshots/iteration-after-start-20260327.png', fullPage: true });

  console.log(
    JSON.stringify(
      {
        strategyCount,
        versionListCount,
        statusBadge,
        versionItems,
        versionListText,
        startApi,
        versionsApi
      },
      null,
      2
    )
  );

  await browser.close();
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
