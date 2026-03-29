#!/usr/bin/env node

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function testHelperExports() {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'real_score_cli.mjs');
  const module = await import(pathToFileURL(scriptPath).href);

  assert.strictEqual(module.extractTradeCount({ summary: { tradeCount: 7 } }), 7);
  assert.strictEqual(module.extractTradeCount({ metrics: { tradeCount: 3 } }), 3);
  assert.strictEqual(module.extractTradeCount({}), 0);

  const successPayload = module.buildSuccessPayload({
    report: { summary: { tradeCount: 12 } },
    scoreResult: { scoreTotal: 83, level: 'B', metrics: { winRate: 0.56 } },
    normalizedParams: { fast_period: 5, slow_period: 20 }
  });
  assert.strictEqual(successPayload.success, true);
  assert.strictEqual(successPayload.tradeCount, 12);

  const noTradePayload = module.buildNoTradePayload({
    report: { summary: { tradeCount: 0 }, metrics: { tradeCount: 0 } },
    normalizedParams: { fast_period: 5, slow_period: 20 },
    scoreResult: { scoreTotal: 50, level: 'C', metrics: { tradeCount: 0 } }
  });
  assert.strictEqual(noTradePayload.success, false);
  assert.strictEqual(noTradePayload.error, 'no_trade_samples');
  assert.strictEqual(noTradePayload.tradeCount, 0);
}

function testCliSmoke() {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'real_score_cli.mjs');
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--strategy-type',
      'double_ma',
      '--stocks',
      '300308.SZ,600519.SH,000001.SZ',
      '--start',
      '2025-01-01',
      '--end',
      '2025-03-31',
      '--params',
      JSON.stringify({ ma_short: 5, ma_long: 20 })
    ],
    {
      encoding: 'utf8',
      env: process.env
    }
  );

  assert.strictEqual(result.status, 0, `CLI should exit cleanly: ${result.stderr || result.stdout}`);

  let payload;
  try {
    payload = JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`CLI should print JSON only: ${error.message}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }

  assert.strictEqual(payload.success, true, 'CLI should succeed');
  assert.strictEqual(typeof payload.scoreTotal, 'number', 'scoreTotal should be a number');
  assert.ok(Number.isFinite(payload.scoreTotal), 'scoreTotal should be finite');
  assert.strictEqual(typeof payload.tradeCount, 'number', 'tradeCount should be a number');
  assert.ok(payload.tradeCount > 0, 'tradeCount should be greater than zero in smoke scenario');

  console.log('✅ real-score-cli smoke test passed');
}

async function main() {
  await testHelperExports();
  testCliSmoke();
}

main().catch((error) => {
  console.error(`❌ real-score-cli smoke test failed: ${error.message}`);
  process.exit(1);
});
