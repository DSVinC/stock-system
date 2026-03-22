'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { URL } = require('node:url');

const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');

const { createMonitorRouter } = require('./monitor');

const app = express();
const ROOT_DIR = path.join(__dirname, '..');
const REPORT_ROOT_DIR = path.join(__dirname, '..', '..', 'report');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const API_AUTH_TOKEN = typeof process.env.API_AUTH_TOKEN === 'string'
  ? process.env.API_AUTH_TOKEN.trim()
  : '';

function getTrustedOrigins() {
  const configured = typeof process.env.TRUSTED_ORIGINS === 'string'
    ? process.env.TRUSTED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
  const defaults = [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`
  ];

  return new Set([...defaults, ...configured]);
}

function normalizeOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch (_error) {
    return '';
  }
}

const TRUSTED_ORIGINS = getTrustedOrigins();

app.use((req, res, next) => {
  const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  const normalizedOrigin = requestOrigin ? normalizeOrigin(requestOrigin) : '';
  const isTrustedOrigin = !normalizedOrigin || TRUSTED_ORIGINS.has(normalizedOrigin);

  if (normalizedOrigin && isTrustedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-API-Token');

  if (!isTrustedOrigin) {
    return res.status(403).json({
      success: false,
      message: 'origin is not allowed'
    });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (API_AUTH_TOKEN) {
    const bearerToken = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '';
    const headerToken = typeof req.headers['x-api-token'] === 'string'
      ? req.headers['x-api-token'].trim()
      : '';
    const token = bearerToken || headerToken;

    if (token !== API_AUTH_TOKEN) {
      return res.status(401).json({
        success: false,
        message: 'unauthorized'
      });
    }
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT_DIR));
app.use('/report', express.static(REPORT_ROOT_DIR));

async function mountApi(relativePath, mountPath) {
  const fullPath = path.join(__dirname, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`[mountApi] 文件不存在: ${fullPath}`);
    return false;
  }

  const exported = require(fullPath);
  console.log(`[mountApi] 加载 ${relativePath}, type: ${typeof exported}, hasStack: ${!!exported?.stack}`);

  // 先检查是否有 stack（Express Router）
  if (exported && exported.stack) {
    app.use(mountPath, exported);
    return true;
  }

  if (exported && typeof exported.createMonitorRouter === 'function') {
    const router = await exported.createMonitorRouter(express);
    app.use(mountPath, router);
    return true;
  }

  if (exported && typeof exported.createRouter === 'function') {
    const router = await exported.createRouter(express);
    app.use(mountPath, router);
    return true;
  }

  throw new Error(`无法识别 ${relativePath} 的路由导出格式`);
}

async function bootstrap() {
  const mounted = [];

  if (await mountApi('monitor.js', '/api/monitor')) {
    mounted.push('/api/monitor');
  }

  // 投资组合/账户API
  try {
    const portfolio = require('./portfolio');
    const router = require('express').Router();
    router.get('/account', portfolio.getAccounts);
    router.post('/account', portfolio.createAccount);
    router.get('/account/:id', portfolio.getAccount);
    router.put('/account/:id', portfolio.updateAccount);
    router.get('/account/:id/summary', portfolio.getAccountSummary);
    router.get('/position', portfolio.getPositions);
    router.get('/position/:id', portfolio.getPosition);
    router.get('/trade', portfolio.getTrades);
    app.use('/api/portfolio', router);
    mounted.push('/api/portfolio');
  } catch (e) {
    console.log('[mountApi] portfolio模块加载失败:', e.message);
  }

  // 条件单API
  try {
    const conditionalOrder = require('./conditional-order');
    const router = require('express').Router();
    router.get('/', conditionalOrder.getConditionalOrders);
    router.get('/list', conditionalOrder.getConditionalOrders);
    router.get('/:id', conditionalOrder.getConditionalOrder);
    router.post('/', conditionalOrder.createConditionalOrder);
    router.put('/:id/toggle', conditionalOrder.toggleConditionalOrder);
    router.put('/:id', conditionalOrder.updateConditionalOrder);
    router.delete('/:id', conditionalOrder.deleteConditionalOrder);
    router.post('/:id/cancel', conditionalOrder.cancelConditionalOrder);
    app.use('/api/conditional-order', router);
    mounted.push('/api/conditional-order');
  } catch (e) {
    console.log('[mountApi] conditional-order模块加载失败:', e.message);
  }

  if (await mountApi('select.js', '/api/select').catch(() => false)) {
    mounted.push('/api/select');
  }

  // 行业成分股 API
  try {
    const industry = require('./industry');
    app.use('/api/industry', industry);
    mounted.push('/api/industry');
  } catch (e) {
    console.log('[mountApi] industry 模块加载失败:', e.message);
  }

  if (await mountApi('analyze.js', '/api/analyze').catch(() => false)) {
    mounted.push('/api/analyze');
  }

  if (await mountApi('analysis.js', '/api/analysis').catch(() => false)) {
    mounted.push('/api/analysis');
  }

  // v2 API 路由（结构化数据接口）
  try {
    const v2Router = require('./v2');
    app.use('/api/v2/analyze', v2Router);
    app.use('/api/v2', v2Router);
    mounted.push('/api/v2/analyze');
  } catch (e) {
    console.log('[mountApi] v2模块加载失败:', e.message);
  }

  // 回测API
  try {
    const backtest = require('./backtest');
    const router = require('express').Router();
    router.post('/run', backtest.runBacktest);
    router.get('/history', backtest.getBacktestHistory);
    router.get('/:id', backtest.getBacktestDetail);
    app.use('/api/backtest', router);
    mounted.push('/api/backtest');
  } catch (e) {
    console.log('[mountApi] backtest模块加载失败:', e.message);
  }

  // 股票搜索API
  try {
    const { searchStock, searchStocks } = require('./market-data');
    const router = require('express').Router();
    // 单个搜索（精确匹配）
    router.get('/search', async (req, res) => {
      const query = req.query.q || req.query.query || '';
      if (!query.trim()) {
        return res.json({ success: true, data: [] });
      }
      try {
        const result = await searchStock(query);
        res.json({ success: true, data: [result] });
      } catch (error) {
        res.json({ success: true, data: [], message: error.message });
      }
    });
    // 模糊搜索（返回多个结果）
    router.get('/search/fuzzy', async (req, res) => {
      const query = req.query.q || req.query.query || '';
      const limit = Math.min(parseInt(req.query.limit) || 10, 20);
      if (!query.trim()) {
        return res.json({ success: true, data: [] });
      }
      try {
        const results = await searchStocks(query, limit);
        res.json({ success: true, data: results });
      } catch (error) {
        res.json({ success: true, data: [], message: error.message });
      }
    });
    app.use('/api/stock', router);
    mounted.push('/api/stock');
  } catch (e) {
    console.log('[mountApi] stock search模块加载失败:', e.message);
  }

  app.get('/api', (req, res) => {
    res.json({
      success: true,
      message: 'A股投资系统接口服务运行中',
      mounted
    });
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'monitor-pool.html'));
  });

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `未找到接口或页面: ${req.path}`
    });
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`A股投资系统服务已启动: http://${HOST}:${PORT}`);
  });

  server.on('error', (error) => {
    console.error('服务监听失败:', error);
    process.exitCode = 1;
  });
}

bootstrap().catch((error) => {
  console.error('服务启动失败:', error);
  process.exitCode = 1;
});
