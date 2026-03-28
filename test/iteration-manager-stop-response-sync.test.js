#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const HTML_PATH = '/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html';

function loadScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('未找到主脚本');
  }
  return match[1];
}

function extractFunction(source, functionName) {
  const token = `async function ${functionName}`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`未找到函数 ${functionName}`);
  }

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

async function main() {
  const script = loadScript();
  const stopFn = extractFunction(script, 'stopIteration');

  {
    const calls = { update: [], finish: [] };
    const sandbox = {
      currentTaskId: 'task-1',
      fetch: async () => ({
        json: async () => ({
          success: true,
          task: { taskId: 'task-1', status: 'stopped' }
        })
      }),
      updateTaskStatus: (task) => calls.update.push(task),
      finishIteration: (status) => calls.finish.push(status),
      addLog: () => {}
    };

    vm.createContext(sandbox);
    vm.runInContext(stopFn, sandbox);
    await sandbox.stopIteration();

    assert.equal(calls.update.length, 1, '返回 task 时应走 updateTaskStatus');
    assert.equal(calls.update[0].status, 'stopped');
    assert.equal(calls.finish.length, 0, '返回 task 时不应走 fallback finishIteration');
  }

  {
    const calls = { update: [], finish: [] };
    const sandbox = {
      currentTaskId: 'task-2',
      fetch: async () => ({
        json: async () => ({
          success: true
        })
      }),
      updateTaskStatus: (task) => calls.update.push(task),
      finishIteration: (status) => calls.finish.push(status),
      addLog: () => {}
    };

    vm.createContext(sandbox);
    vm.runInContext(stopFn, sandbox);
    await sandbox.stopIteration();

    assert.equal(calls.update.length, 0);
    assert.deepEqual(calls.finish, ['stopped'], '无 task 时应回退到 stopped');
  }

  console.log('✅ iteration manager stop response sync test passed');
}

main().catch((error) => {
  console.error(`❌ iteration manager stop response sync test failed: ${error.message}`);
  process.exit(1);
});
