#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const HTML_PATH = '/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html';

function loadScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('未找到主脚本');
  return match[1];
}

function extractFunction(source, functionName) {
  const token = `function ${functionName}`;
  const start = source.indexOf(token);
  if (start === -1) throw new Error(`未找到函数 ${functionName}`);
  const braceIndex = source.indexOf('{', start);
  let depth = 0;
  let end = braceIndex;
  while (end < source.length) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
    end += 1;
  }
  return source.slice(start, end);
}

function createSandbox() {
  const elements = {
    progressFill: { style: { width: '0%' } },
    completedCount: { textContent: '0' }
  };

  const sandbox = {
    Number,
    Math,
    String,
    document: {
      getElementById(id) {
        return elements[id];
      }
    },
    __elements: elements
  };

  vm.createContext(sandbox);
  return sandbox;
}

async function main() {
  const script = loadScript();
  const fn = extractFunction(script, 'updateProgress');

  {
    const sandbox = createSandbox();
    vm.runInContext(fn, sandbox);
    sandbox.updateProgress(3, 0);
    assert.equal(sandbox.__elements.progressFill.style.width, '100%');
    assert.equal(sandbox.__elements.completedCount.textContent, '3');
  }

  {
    const sandbox = createSandbox();
    vm.runInContext(fn, sandbox);
    sandbox.updateProgress('abc', null);
    assert.equal(sandbox.__elements.progressFill.style.width, '0%');
    assert.equal(sandbox.__elements.completedCount.textContent, '0');
  }

  {
    const sandbox = createSandbox();
    vm.runInContext(fn, sandbox);
    sandbox.updateProgress(15, 10);
    assert.equal(sandbox.__elements.progressFill.style.width, '100%');
  }

  console.log('✅ iteration manager progress guard test passed');
}

main().catch((error) => {
  console.error(`❌ iteration manager progress guard test failed: ${error.message}`);
  process.exit(1);
});
