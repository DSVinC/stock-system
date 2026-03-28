#!/usr/bin/env node

const assert = require('assert');
const { URL } = require('url');

function createMockDb() {
  return {
    async runPromise() {
      return { changes: 0 };
    },
    async getPromise() {
      return null;
    },
    async allPromise() {
      return [];
    }
  };
}

function invokeRouter(router, method, rawPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(rawPath, 'http://127.0.0.1');
    const req = {
      method,
      url: `${url.pathname}${url.search}`,
      originalUrl: `${url.pathname}${url.search}`,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: {},
      params: {}
    };

    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      _done: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = value;
        return this;
      },
      getHeader(name) {
        return this.headers[String(name).toLowerCase()];
      },
      json(payload) {
        this.body = payload;
        finish();
        return this;
      },
      send(payload) {
        this.body = payload;
        finish();
        return this;
      }
    };

    function finish() {
      if (res._done) {
        return;
      }
      res._done = true;
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: res.body
      });
    }

    try {
      router.handle(req, res, err => {
        if (err) {
          reject(err);
          return;
        }
        finish();
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function main() {
  const dbModule = require('../api/db');
  const originalGetDatabase = dbModule.getDatabase;
  dbModule.getDatabase = async () => createMockDb();

  const iterationRouter = require('../api/iteration-manager');
  const { activeTasks } = iterationRouter.__test;

  try {
    const taskId = 'ITER_REPORT_RAW_DOWNLOAD';
    activeTasks.set(taskId, {
      taskId,
      strategyType: 'double_ma',
      optimizationBackend: 'heuristic',
      inputSummary: {
        stocks: ['000001.SZ'],
        startDate: '2026-01-01',
        endDate: '2026-03-01'
      },
      status: 'completed',
      progress: 100,
      currentIteration: 10,
      maxIterations: 10,
      scoreThreshold: 80,
      bestScore: 88.5,
      bestParams: {
        fast_period: 5,
        slow_period: 20
      },
      history: [],
      createdAt: '2026-03-28T01:00:00.000Z',
      completedAt: '2026-03-28T01:30:00.000Z'
    });

    const res = await invokeRouter(iterationRouter, 'GET', `/report/${taskId}?format=markdown&download=1`);

    assert.equal(res.statusCode, 200);
    assert.ok(String(res.headers['content-type'] || '').includes('text/markdown'));
    assert.ok(String(res.headers['content-disposition'] || '').includes(`${taskId}_report.md`));
    assert.ok(String(res.body || '').includes('# 迭代任务回测报告'));
    assert.ok(String(res.body || '').includes('## 任务信息'));
    assert.ok(String(res.body || '').includes('## 下一步建议'));

    console.log('✅ iteration manager report download mode test passed');
  } finally {
    activeTasks.clear();
    dbModule.getDatabase = originalGetDatabase;
  }
}

main().catch(error => {
  console.error(`❌ iteration manager report download mode test failed: ${error.message}`);
  process.exit(1);
});
