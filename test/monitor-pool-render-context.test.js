#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'monitor-pool.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunction(source, name) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`未找到函数: ${name}`);
  }

  const braceIndex = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`函数大括号未闭合: ${name}`);
}

function main() {
  const context = {
    console
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(html, 'formatMonitorStrategyMeta'), context, {
    filename: 'monitor-pool-render-context.js'
  });

  const strategyConfigMeta = context.formatMonitorStrategyMeta({
    strategy_source: 'strategy_config',
    strategy_config_name: '七因子高分策略（导入副本）'
  });
  assert.ok(strategyConfigMeta.includes('策略库'), '策略库来源应显示“策略库”标签');
  assert.ok(strategyConfigMeta.includes('七因子高分策略（导入副本）'), '应显示策略名称');

  const templateMeta = context.formatMonitorStrategyMeta({
    strategy_source: 'template',
    template_name: '七因子模板'
  });
  assert.ok(templateMeta.includes('模板'), '模板来源应显示“模板”标签');
  assert.ok(templateMeta.includes('七因子模板'), '模板来源应显示模板名称');

  const emptyMeta = context.formatMonitorStrategyMeta({});
  assert.strictEqual(emptyMeta, '', '无上下文时不应渲染额外信息');

  console.log('✅ monitor-pool.html 监控池策略上下文渲染测试通过');
}

try {
  main();
} catch (error) {
  console.error(`❌ monitor-pool.html 监控池策略上下文渲染测试失败: ${error.message}`);
  process.exit(1);
}
