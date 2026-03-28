#!/usr/bin/env node

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function main() {
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

  console.log('✅ real-score-cli smoke test passed');
}

main();
