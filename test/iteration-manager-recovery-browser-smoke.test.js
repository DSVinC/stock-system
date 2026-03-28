#!/usr/bin/env node

const assert = require('node:assert');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const taskId = 'task-restore';
  const url = new URL('http://127.0.0.1:3000/iteration-manager.html');
  url.searchParams.set('strategyType', 'seven_factor');

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: 'lastIterationTaskId', value: taskId }
  );

  await page.route('**/api/iteration/versions/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        versions: [
          {
            version: 'v1',
            score: 86.4,
            execution_feedback_status: 'positive',
            execution_feedback_confidence: 'high',
            published_strategy_config_id: 201,
            is_published_to_library: true
          }
        ]
      })
    });
  });

  await page.route(`**/api/iteration/status/${taskId}`, async (route) => {
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
            optimizationBackend: 'optuna',
            config: {
              ma_short: 8,
              ma_long: 24
            }
          },
          status: 'running',
          progress: 0.5,
          currentIteration: 5,
          maxIterations: 12,
          bestScore: 90.2,
          bestParams: {
            fast_period: 5,
            slow_period: 20
          },
          resultSummary: {
            status: 'mixed',
            optimizationBackend: 'optuna',
            bestScore: 90.2,
            bestParams: {
              fast_period: 5,
              slow_period: 20
            },
            completedAt: '2026-03-28T08:00:00+08:00'
          },
          history: []
        }
      })
    });
  });

  await page.goto(url.toString(), { waitUntil: 'networkidle' });

  await page.waitForFunction(() => {
    const summary = document.getElementById('researchInputSummary');
    const backend = document.getElementById('optimizationBackend');
    return (
      summary &&
      summary.innerText.includes('optuna（真实优化模式）') &&
      backend &&
      backend.value === 'optuna'
    );
  });

  const summaryText = await page.locator('#researchInputSummary').innerText();
  assert.ok(summaryText.includes('optuna（真实优化模式）'), '恢复后的摘要应显示 optuna');
  assert.ok(summaryText.includes('6 个并发任务'), '恢复后的摘要应显示并发任务数');
  assert.ok(summaryText.includes('000001.SZ'), '恢复后的摘要应显示股票池');
  assert.equal(
    await page.locator('#optimizationBackend').inputValue(),
    'optuna',
    '恢复后的下拉框应保持 optuna'
  );

  const storedTaskId = await page.evaluate(() => window.localStorage.getItem('currentTaskId'));
  assert.equal(storedTaskId, taskId, '恢复后应同步当前任务 id');

  await browser.close();
  console.log('✅ iteration-manager recovery browser smoke test passed');
}

main().catch((error) => {
  console.error(`❌ iteration-manager recovery browser smoke test failed: ${error.message}`);
  process.exit(1);
});
