#!/usr/bin/env node

const assert = require('node:assert');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const capturedRequests = [];
  const taskId = 'ITER_BROWSER_OPTUNA_001';
  const researchConfig = {
    ma_short: 8,
    ma_long: 24,
    stop_loss: 0.12
  };
  const url = new URL('http://127.0.0.1:3000/iteration-manager.html');
  url.searchParams.set('strategyType', 'seven_factor');
  url.searchParams.set('stocks', '000001.SZ,600519.SH');
  url.searchParams.set('startDate', '2024-01-01');
  url.searchParams.set('endDate', '2024-12-31');
  url.searchParams.set('parallelTasks', '6');
  url.searchParams.set('config', JSON.stringify(researchConfig));

  await page.route('**/api/iteration/versions/**', async (route) => {
    const versions = [
      {
        version: 'v1',
        score: 84.5,
        execution_feedback_status: 'positive',
        execution_feedback_confidence: 'high',
        published_strategy_config_id: 101,
        is_published_to_library: true
      }
    ];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, versions })
    });
  });

  await page.route('**/api/iteration/start', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    capturedRequests.push(payload);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        taskId,
        message: '迭代任务已启动'
      })
    });
  });

  await page.route('**/api/iteration/status/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        task: {
          taskId,
          strategyType: 'seven_factor',
          optimizationBackend: 'optuna',
          inputSummary: {
            stocks: ['000001.SZ', '600519.SH'],
            startDate: '2024-01-01',
            endDate: '2024-12-31',
            parallelTasks: 6,
            config: researchConfig,
            optimizationBackend: 'optuna'
          },
          status: 'completed',
          progress: 1,
          currentIteration: 1,
          maxIterations: 20,
          bestScore: 91.5,
          bestParams: {
            fast_period: 5,
            slow_period: 20
          },
          resultSummary: {
            status: 'completed',
            optimizationBackend: 'optuna',
            bestScore: 91.5,
            bestParams: {
              fast_period: 5,
              slow_period: 20
            },
            completedAt: '2026-03-28T07:44:00+08:00'
          },
          history: []
        }
      })
    });
  });

  await page.goto(url.toString(), { waitUntil: 'networkidle' });

  const summaryText = await page.locator('#researchInputSummary').innerText();
  assert.ok(summaryText.includes('2 只股票'), '应从 URL 导入股票池');
  assert.ok(summaryText.includes('2024-01-01 → 2024-12-31'), '应从 URL 导入时间区间');
  assert.ok(summaryText.includes('ma_short'), '应从 URL 导入研究配置');

  const defaultBackend = await page.locator('#optimizationBackend').inputValue();
  assert.equal(defaultBackend, 'heuristic', '优化后端默认值应为 heuristic');
  const parallelTasksValue = await page.locator('#parallelTasks').inputValue();
  assert.ok(/^\d+$/.test(parallelTasksValue), '并发任务数应为数字');

  await page.selectOption('#optimizationBackend', 'optuna');
  await page.click('#startBtn');

  await page.waitForFunction(() => {
    const log = document.getElementById('iterationLog');
    return log && log.innerText.includes('任务已创建');
  });

  assert.equal(capturedRequests.length, 1, '应只发起一次开始请求');

  const body = capturedRequests[0];
  assert.equal(body.strategyType, 'seven_factor', '应保留策略类型');
  assert.deepStrictEqual(body.stocks, ['000001.SZ', '600519.SH'], '应保留股票池');
  assert.equal(body.startDate, '2024-01-01', '应保留开始日期');
  assert.equal(body.endDate, '2024-12-31', '应保留结束日期');
  assert.equal(body.parallelTasks, Number(parallelTasksValue), '应保留并发任务数');
  assert.deepStrictEqual(body.config, researchConfig, '应保留研究配置');
  assert.equal(body.optimizationBackend, 'optuna', '切换后应提交 optuna');
  assert.equal(body.maxIterations, 20, '应保留最大迭代次数');
  assert.equal(body.scoreThreshold, 70, '应保留评分阈值');

  await browser.close();
  console.log('✅ iteration-manager optuna browser smoke test passed');
}

main().catch((error) => {
  console.error(`❌ iteration-manager optuna browser smoke test failed: ${error.message}`);
  process.exit(1);
});
