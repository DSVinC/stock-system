#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ANALYZE_PATH = path.resolve(__dirname, '..', 'api', 'analyze.js');
const ANALYSIS_PATH = path.resolve(__dirname, '..', 'api', 'analysis.js');

function main() {
  const analyzeSource = fs.readFileSync(ANALYZE_PATH, 'utf8');
  const analysisSource = fs.readFileSync(ANALYSIS_PATH, 'utf8');

  assert.ok(
    analyzeSource.includes('buildFallbackPayload(stockCode)'),
    'analyzeStockWithCache 应在 Python 依赖缺失时回退到 buildFallbackPayload'
  );

  assert.ok(
    !analyzeSource.includes("stock.score = 6;\n      stock.decision = '观望';"),
    '分析失败时不应再使用 6 分 / 观望 伪装默认值'
  );

  assert.ok(
    analysisSource.includes('stock_report_${slugify(v1Payload.stock?.name)}_${slugify(v1Payload.stock?.ts_code)}_${dateStamp}.html'),
    '分析报告文件名应包含 ts_code，避免不同股票串到同一份报告'
  );

  assert.ok(
    analysisSource.includes('.filter(f => reportMatchesStock(f, ts_code))'),
    '报告历史接口应按 ts_code 过滤'
  );

  console.log('✅ analysis report isolation regression test passed');
}

try {
  main();
} catch (error) {
  console.error(`❌ analysis report isolation regression test failed: ${error.message}`);
  process.exit(1);
}
