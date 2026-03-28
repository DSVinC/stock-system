#!/usr/bin/env node

const assert = require('assert');
const http = require('http');

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

function requestRaw({ port, path }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET'
      },
      res => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: raw
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function startTestServer(iterationRouter) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/iteration', iterationRouter);

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve({
        server,
        port: server.address().port
      });
    });
  });
}

async function main() {
  const dbModule = require('../api/db');
  dbModule.getDatabase = async () => createMockDb();

  const iterationRouter = require('../api/iteration-manager');
  const { activeTasks } = iterationRouter.__test;
  const { server, port } = await startTestServer(iterationRouter);

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

    const res = await requestRaw({
      port,
      path: `/api/iteration/report/${taskId}?format=markdown&download=1`
    });

    assert.equal(res.statusCode, 200);
    assert.ok(String(res.headers['content-type'] || '').includes('text/markdown'));
    assert.ok(String(res.headers['content-disposition'] || '').includes(`${taskId}_report.md`));
    assert.ok(res.body.includes('# 迭代任务回测报告'));
    assert.ok(res.body.includes('## 任务信息'));
    assert.ok(res.body.includes('## 下一步建议'));

    console.log('✅ iteration manager report download mode test passed');
  } finally {
    activeTasks.clear();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(`❌ iteration manager report download mode test failed: ${error.message}`);
  process.exit(1);
});
