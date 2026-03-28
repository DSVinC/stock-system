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
  const asyncToken = `async function ${functionName}`;
  const syncToken = `function ${functionName}`;
  let start = source.indexOf(asyncToken);
  if (start === -1) start = source.indexOf(syncToken);
  if (start === -1) throw new Error(`未找到函数 ${functionName}`);

  const braceIndex = source.indexOf('{', start);
  let depth = 0;
  let end = braceIndex;
  while (end < source.length) {
    const char = source[end];
    if (char === '{') depth += 1;
    if (char === '}') {
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

function buildSandbox() {
  const logs = [];
  const downloads = [];
  const blobUrls = [];

  const storageData = {
    currentTaskId: 'ITER_EXPORT_TASK',
    lastIterationTaskId: 'ITER_EXPORT_TASK'
  };

  const storage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null;
    },
    setItem(key, value) {
      storageData[key] = String(value);
    },
    removeItem(key) {
      delete storageData[key];
    }
  };

  const exportBtn = { disabled: true };

  const sandbox = {
    window: {
      localStorage: storage
    },
    localStorage: storage,
    currentTaskId: 'ITER_EXPORT_TASK',
    document: {
      getElementById(id) {
        if (id === 'exportReportBtn') return exportBtn;
        return null;
      },
      createElement(tag) {
        if (tag !== 'a') {
          throw new Error(`unexpected tag: ${tag}`);
        }
        return {
          href: '',
          download: '',
          click() {
            downloads.push({
              href: this.href,
              download: this.download
            });
          }
        };
      }
    },
    Blob: function(parts, options) {
      this.parts = parts;
      this.options = options || {};
    },
    URL: {
      createObjectURL() {
        const url = `blob:mock-${blobUrls.length + 1}`;
        blobUrls.push(url);
        return url;
      },
      revokeObjectURL() {}
    },
    fetch: async (url) => {
      assert.equal(url, '/api/iteration/report/ITER_EXPORT_TASK?format=markdown');
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            fileName: 'ITER_EXPORT_TASK_report.md',
            markdown: '# 迭代任务回测报告\n'
          }
        })
      };
    },
    addLog(message, type) {
      logs.push({ message, type });
    },
    __logs: logs,
    __downloads: downloads,
    __exportBtn: exportBtn
  };

  vm.createContext(sandbox);
  return sandbox;
}

function main() {
  const script = loadScript();
  const sandbox = buildSandbox();

  vm.runInContext(extractFunction(script, 'getIterationTaskStorage'), sandbox);
  vm.runInContext(extractFunction(script, 'getPersistedIterationTaskId'), sandbox);
  vm.runInContext(extractFunction(script, 'updateReportExportButtonState'), sandbox);
  vm.runInContext(extractFunction(script, 'getReportTaskId'), sandbox);
  vm.runInContext(extractFunction(script, 'exportIterationReport'), sandbox);

  sandbox.updateReportExportButtonState();
  assert.equal(sandbox.__exportBtn.disabled, false, '有 taskId 时导出按钮应可用');

  return sandbox.exportIterationReport().then(() => {
    assert.ok(
      sandbox.__logs.some(entry => entry.message.includes('正在导出报告')),
      '应记录导出开始日志'
    );
    assert.ok(
      sandbox.__logs.some(entry => entry.message.includes('报告已导出')),
      '应记录导出完成日志'
    );
    assert.equal(sandbox.__downloads.length, 1, '应触发一次下载');
    assert.equal(sandbox.__downloads[0].download, 'ITER_EXPORT_TASK_report.md');
    console.log('✅ iteration manager report download test passed');
  });
}

main().catch(error => {
  console.error(`❌ iteration manager report download test failed: ${error.message}`);
  process.exit(1);
});
