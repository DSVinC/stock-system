const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const base = 'http://127.0.0.1:3000';
const screenshotDir = path.join(process.cwd(), 'temp/screenshots');
const outputPath = path.join(process.cwd(), 'temp/e2e_results.json');

fs.mkdirSync(screenshotDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  page.on('dialog', async (dialog) => {
    try {
      await dialog.accept();
    } catch {}
  });

  const out = {
    executedAt: new Date().toISOString(),
    playwrightVersion: require('playwright/package.json').version,
    browser: 'chromium',
    tasks: {}
  };

  async function shot(name) {
    const filePath = path.join(screenshotDir, name);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  async function trackResponses(matchers) {
    const store = {};
    page.removeAllListeners('response');
    page.on('response', async (resp) => {
      try {
        const url = resp.url();
        for (const [key, pattern] of Object.entries(matchers)) {
          if (!store[key] && pattern.test(url)) {
            let body = null;
            try {
              body = await resp.json();
            } catch {}
            store[key] = { url, status: resp.status(), body };
          }
        }
      } catch {}
    });
    return store;
  }

  {
    const task = { page: 'select.html', checks: {}, screenshots: [], api: {} };
    const responses = await trackResponses({ select: /\/api\/select\?/ });

    await page.goto(`${base}/select.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    task.screenshots.push(await shot('select-initial.png'));

    const options = await page.$$eval('#configStrategy option', (els) =>
      els.map((el) => ({ value: el.value, text: el.textContent.trim() }))
    );
    task.checks.strategySelectorOptions = {
      pass: JSON.stringify(options.map((o) => o.value)) === JSON.stringify(['double_ma', 'rsi', 'macd', 'bollinger', 'seven_factor']),
      actual: options
    };

    await page.getByRole('button', { name: /参数配置/ }).click();
    await page.waitForTimeout(300);
    const panelActive = await page.$eval('#configPanel', (el) => el.classList.contains('active'));
    task.checks.configPanelPopup = { pass: panelActive, actual: panelActive };
    task.screenshots.push(await shot('select-config-panel.png'));

    await page.selectOption('#configStrategy', 'seven_factor');
    await page.fill('#configLimit', '5');
    await page.fill('#configMinScore', '0');
    await page.click('button.config-apply');
    await page.waitForResponse((resp) => /\/api\/select\?/.test(resp.url()), { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(3000);
    task.screenshots.push(await shot('select-results.png'));

    task.api.select = responses.select || null;
    const body = responses.select?.body || {};
    const directions = Array.isArray(body.directions) ? body.directions : [];
    const decisions = Array.isArray(body.decisions) ? body.decisions : [];
    const decisionShapeOk =
      decisions.length > 0 &&
      decisions.every(
        (d) =>
          Object.prototype.hasOwnProperty.call(d, 'entry_zone') &&
          Object.prototype.hasOwnProperty.call(d, 'stop_loss') &&
          Object.prototype.hasOwnProperty.call(d, 'target_prices')
      );
    task.checks.apiDirectionsAndDecisions = {
      pass: directions.length > 0 && decisions.length > 0 && decisionShapeOk,
      actual: {
        directionsCount: directions.length,
        decisionsCount: decisions.length,
        decisionShapeOk,
        firstDecision: decisions[0] || null
      }
    };

    const top3Visible = await page.locator('#top3Section').isVisible().catch(() => false);
    const top10Visible = await page.locator('#top10Section').isVisible().catch(() => false);
    const top10Cards = await page.locator('#top10Grid > *').count().catch(() => 0);
    task.checks.stockCardsVisible = {
      pass: top3Visible && top10Visible && top10Cards > 0,
      actual: { top3Visible, top10Visible, top10Cards }
    };

    out.tasks.select = task;
  }

  {
    const task = { page: 'backtest.html', checks: {}, screenshots: [], api: {} };
    const responses = await trackResponses({
      select: /\/api\/select\?/,
      backtest: /\/api\/backtest\/joint\/run/
    });

    await page.goto(`${base}/backtest.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    task.screenshots.push(await shot('backtest-initial.png'));

    const strategyCount = await page.locator('#strategySelect').count();
    task.checks.strategySelectorExists = { pass: strategyCount > 0, actual: strategyCount };

    const metricIds = [
      'totalReturn',
      'returnRate',
      'annualizedReturn',
      'maxDrawdown',
      'sharpeRatio',
      'calmarRatio',
      'winRate',
      'profitLossRatio',
      'tradeCount'
    ];
    const metricExistence = {};
    for (const id of metricIds) {
      metricExistence[id] = (await page.locator(`#${id}`).count()) > 0;
    }
    task.checks.metricCardsExist = { pass: Object.values(metricExistence).every(Boolean), actual: metricExistence };

    await page.locator('#coreSlider').evaluate((el) => {
      el.value = '60';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#satelliteSlider').evaluate((el) => {
      el.value = '40';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.selectOption('#strategySelect', 'seven_factor');
    await page.locator('details.selection-config').evaluate((el) => {
      el.open = true;
    });
    await page.fill('#selectionLimit', '5');
    await page.fill('#selectionMinScore', '0');
    await page.click('#runSelectionBtn');
    await page.waitForResponse((resp) => /\/api\/select\?/.test(resp.url()), { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(2500);

    const applyBtn = page.getByRole('button', { name: /应用到已选股票/ });
    if ((await applyBtn.count()) > 0) {
      await applyBtn.click();
    }
    await page.waitForTimeout(1000);

    const stockCountText = (await page.locator('#stockCount').textContent().catch(() => '0')) || '0';
    const selectedStockCount = parseInt(stockCountText.trim(), 10) || 0;

    const hasMaxPositionInput = (await page.locator('#maxPosition').count()) > 0;
    task.checks.gridMaxPositionInputExists = { pass: hasMaxPositionInput, actual: hasMaxPositionInput };

    await page.getByRole('button', { name: /^开始回测$/ }).click();
    await page.waitForResponse((resp) => /\/api\/backtest\/joint\/run/.test(resp.url()), { timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(6000);
    task.screenshots.push(await shot('backtest-results.png'));

    task.api.selection = responses.select || null;
    task.api.backtest = responses.backtest || null;

    const metricValues = {};
    for (const id of metricIds) {
      metricValues[id] = await page.locator(`#${id}`).textContent().catch(() => null);
    }
    const metricsShown = metricIds.every((id) => metricValues[id] && metricValues[id].trim() !== '--' && metricValues[id].trim() !== '');
    task.checks.metricCardsShowData = { pass: metricsShown, actual: metricValues };

    const chartCanvasPresent = (await page.locator('#equityChart').count()) > 0;
    const placeholderVisible = await page.locator('#chartPlaceholder').isVisible().catch(() => false);
    const resultContainerVisible = await page.locator('#resultContainer').isVisible().catch(() => false);
    const backtestSuccess = !!responses.backtest?.body?.success;
    const equityCurveLength = responses.backtest?.body?.data?.equityCurve?.length || 0;
    task.checks.chartRendered = {
      pass: chartCanvasPresent && resultContainerVisible && backtestSuccess && equityCurveLength > 0,
      actual: {
        chartCanvasPresent,
        resultContainerVisible,
        placeholderVisible,
        backtestSuccess,
        equityCurveLength,
        selectedStockCount
      }
    };

    out.tasks.backtest = task;
  }

  {
    const task = { page: 'iteration-manager.html', checks: {}, screenshots: [], api: {} };
    const responses = await trackResponses({
      start: /\/api\/iteration\/start/,
      versions: /\/api\/iteration\/versions\//
    });

    const cfg = encodeURIComponent(JSON.stringify({ min_score: 0.75 }));
    await page.goto(
      `${base}/iteration-manager.html?strategyType=seven_factor&stocks=000001.SZ,600519.SH&startDate=2024-01-01&endDate=2024-12-31&config=${cfg}`,
      { waitUntil: 'domcontentloaded' }
    );
    await page.waitForTimeout(3000);
    task.screenshots.push(await shot('iteration-initial.png'));

    const strategyCount = await page.locator('#strategySelect').count();
    const versionListCount = await page.locator('#versionList').count();
    task.checks.strategySelectorExists = { pass: strategyCount > 0, actual: strategyCount };
    task.checks.versionListExists = { pass: versionListCount > 0, actual: versionListCount };

    await page.click('#startBtn');
    await page.waitForResponse((resp) => /\/api\/iteration\/start/.test(resp.url()), { timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(4000);
    task.screenshots.push(await shot('iteration-after-start.png'));

    task.api.start = responses.start || null;
    task.api.versions = responses.versions || null;
    const statusBadge = await page.locator('#statusBadge').textContent().catch(() => null);
    task.checks.startIterationApi = {
      pass: !!responses.start?.body?.success,
      actual: { statusBadge, api: responses.start?.body || null }
    };

    const versionItems = await page.locator('#versionList .version-item').count().catch(() => 0);
    const versionListText = await page.locator('#versionList').textContent().catch(() => '');
    task.checks.versionHistoryDisplayed = {
      pass: versionItems > 0 && !/暂无版本记录/.test(versionListText),
      actual: {
        versionItems,
        versionListText: (versionListText || '').trim().slice(0, 300),
        versionsApi: responses.versions?.body || null
      }
    };

    out.tasks.iteration = task;
  }

  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2));
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
