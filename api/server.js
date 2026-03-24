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

  // 监控池管理 API
  try {
    const monitorPool = require('./monitor-pool');
    const router = require('express').Router();
    router.post('/add', monitorPool.addToPool);
    router.get('/list', monitorPool.getPoolList);
    router.get('/stock-list', monitorPool.getStockList); // 条件单页面使用
    router.delete('/remove', monitorPool.removeFromPool);
    router.post('/batch-add', monitorPool.batchAddToPool);
    router.delete('/batch-remove', monitorPool.batchRemoveFromPool);
    app.use('/api/monitor-pool', router);
    mounted.push('/api/monitor-pool');
  } catch (e) {
    console.log('[mountApi] monitor-pool 模块加载失败:', e.message);
  }

  // 投资组合/账户API
  try {
    const portfolio = require('./portfolio');
    const router = require('express').Router();
    router.get('/account', portfolio.getAccounts);
    router.post('/account', portfolio.createAccount);
    router.get('/account/:id', portfolio.getAccount);
    router.put('/account/:id', portfolio.updateAccount);
    router.delete('/account/:id', portfolio.deleteAccount);
    router.get('/account/:id/summary', portfolio.getAccountSummary);
    router.post('/account/:id/clear-positions', portfolio.clearPositions);
    router.get('/account/:id/conditional-orders', portfolio.getAccountConditionalOrders);
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
    router.get('/:id/history', conditionalOrder.getConditionalOrderHistory);
    router.get('/:id', conditionalOrder.getConditionalOrder);
    router.post('/', conditionalOrder.createConditionalOrder);
    router.post('/create-from-report', conditionalOrder.createFromReport);
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

  // 报告存储 API (TASK_V3_009)
  try {
    const reportStorage = require('./report-storage');
    const router = require('express').Router();
    router.post('/store', reportStorage.storeReport);
    router.get('/list', reportStorage.getReportList);
    router.get('/:stockCode/latest', reportStorage.getLatestReport);
    router.post('/:reportId/import-to-order', reportStorage.importToOrderFromReport);
    app.use('/api/report', router);
    mounted.push('/api/report');
    console.log('[mountApi] report-storage API mounted: /api/report');
  } catch (e) {
    console.log('[mountApi] report-storage 模块加载失败:', e.message);
  }
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

  // TASK_V3_001: 4 维度行业自动评分 API
  try {
    const industryScore = require('./industry-score');
    app.use('/api/industry/score', industryScore);
    mounted.push('/api/industry/score');
  } catch (e) {
    console.log('[mountApi] industry-score 模块加载失败:', e.message);
  }

  // TASK_V3_003: 行业内个股 7 因子评分 API
  try {
    const industryTopStocks = require('./industry-top-stocks');
    app.use('/api/industry', industryTopStocks);
    mounted.push('/api/industry/:industry/top-stocks');
  } catch (e) {
    console.log('[mountApi] industry-top-stocks 模块加载失败:', e.message);
  }

  // TASK_V3_004: 个股 Top10 自动筛选 API
  try {
    const stockSelect = require('./stock-select');
    app.use('/api/stock/select', stockSelect);
    mounted.push('/api/stock/select');
  } catch (e) {
    console.log('[mountApi] stock-select 模块加载失败:', e.message);
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
    
    // 原有回测功能
    router.post('/run', backtest.runBacktest);
    router.get('/history', backtest.getBacktestHistory);
    router.get('/:id', backtest.getBacktestDetail);
    // TASK_BACKTEST_004: 参数扫描
    router.post('/scan', backtest.scanParameters);
    // TASK_BACKTEST_003: 报告生成
    router.post('/:id/report', backtest.generateBacktestReport);
    // TASK_100: 批量回测
    router.post('/batch', backtest.runBatchBacktest);
    
    // TASK_V3_007: 因子快照回测功能
    router.post('/factor-snapshot/run', backtest.runFactorSnapshotBacktest);
    router.get('/factor-snapshot/history', backtest.getFactorSnapshotBacktestHistory);
    router.get('/factor-snapshot/:id', backtest.getFactorSnapshotBacktestDetail);
    router.post('/factor-snapshot/scan', backtest.scanFactorSnapshotParameters);
    
    app.use('/api/backtest', router);
    mounted.push('/api/backtest');
    mounted.push('/api/backtest/factor-snapshot/run');
    mounted.push('/api/backtest/factor-snapshot/history');
    mounted.push('/api/backtest/factor-snapshot/:id');
    mounted.push('/api/backtest/factor-snapshot/scan');
  } catch (e) {
    console.log('[mountApi] backtest模块加载失败:', e.message);
  }

  // TASK_V3_008_FIX_001: 分钟线回测 API
  try {
    const minuteBacktest = require('./backtest-minute');
    const router = require('express').Router();

    // POST /api/backtest/minute/run - 运行分钟线回测
    router.post('/run', async (req, res) => {
      try {
        const result = await minuteBacktest.runMinuteBacktest(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // POST /api/backtest/minute/batch - 批量回测（参数扫描）
    router.post('/batch', async (req, res) => {
      try {
        const engine = new minuteBacktest(req.body);
        const results = await engine.runBatch(req.body.baseParams, req.body.paramRanges);
        res.json({ success: true, data: results });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.use('/api/backtest/minute', router);
    mounted.push('/api/backtest/minute');
    mounted.push('/api/backtest/minute/run');
    mounted.push('/api/backtest/minute/batch');
  } catch (e) {
    console.log('[mountApi] backtest-minute 模块加载失败:', e.message);
  }

  // TASK_V3_103: 回测缓存 API
  try {
    const backtestCache = require('./backtest-cache');
    const cacheRouter = require('express').Router();

    // GET /api/backtest/cache/:key - 查询缓存
    cacheRouter.get('/:key', backtestCache.handleGetCache);

    // DELETE /api/backtest/cache/:key - 删除缓存
    cacheRouter.delete('/:key', backtestCache.handleDeleteCache);

    // POST /api/backtest/cache/cleanup - 清理过期缓存
    cacheRouter.post('/cleanup', backtestCache.handleCleanupCache);

    // GET /api/backtest/cache/stats - 获取缓存统计
    cacheRouter.get('/stats', backtestCache.handleGetStats);

    // GET /api/backtest/cache/list - 获取缓存列表
    cacheRouter.get('/list', backtestCache.handleGetList);

    // DELETE /api/backtest/cache - 清空所有缓存
    cacheRouter.delete('/', backtestCache.handleClearAll);

    app.use('/api/backtest/cache', cacheRouter);
    mounted.push('/api/backtest/cache');
    console.log('[mountApi] backtest-cache API mounted: /api/backtest/cache');
  } catch (e) {
    console.log('[mountApi] backtest-cache 模块加载失败:', e.message);
  }

  // 持仓监控API
  try {
    const positionSignals = require('./position-signals');
    const router = require('express').Router();
    router.get('/signals', positionSignals.handleGetSignals);
    router.get('/overview', positionSignals.handleGetOverview);
    router.post('/signals/:id/read', positionSignals.handleMarkRead);
    router.post('/run', async (req, res) => {
      try {
        const result = await positionSignals.runFullMonitoring();
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    app.use('/api/monitor', router);
    mounted.push('/api/monitor/signals');
    mounted.push('/api/monitor/overview');
    mounted.push('/api/monitor/run');
  } catch (e) {
    console.log('[mountApi] position-signals模块加载失败:', e.message);
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

  // TASK_V3_006_003: 选股 + 分钟线获取整合 API
  try {
    const stockRouter = require('./stock');
    app.use('/api/stock', stockRouter);
    mounted.push('/api/stock/select-with-minute');
    console.log('[mountApi] stock 选股+分钟线API已加载');
  } catch (e) {
    console.log('[mountApi] stock 选股+分钟线模块加载失败:', e.message);
  }

  // TASK_V3_006: 分钟线数据API
  try {
    const minuteFetch = require('./minute-fetch');
    const router = require('express').Router();

    // POST /api/minute/fetch - 触发分钟线数据获取（支持 stocks 数组）
    router.post('/fetch', minuteFetch.handleMinuteFetch);

    // GET /api/minute/status - 查询状态概览（不带参数）
    router.get('/status', minuteFetch.handleMinuteStatus);

    // GET /api/minute/status/:taskId/:tsCode - 查询特定任务状态
    router.get('/status/:taskId/:tsCode', minuteFetch.handleMinuteStatus);

    // GET /api/minute/data - 查询分钟线数据
    router.get('/data', minuteFetch.handleMinuteData);

    // GET /api/minute/integrity/:tsCode - 检查数据完整性
    router.get('/integrity/:tsCode', minuteFetch.handleMinuteIntegrity);

    // GET /api/minute/tasks - 获取任务列表
    router.get('/tasks', minuteFetch.handleMinuteTasks);

    app.use('/api/minute', router);
    mounted.push('/api/minute/fetch');
    mounted.push('/api/minute/status');
    mounted.push('/api/minute/status/:taskId/:tsCode');
    mounted.push('/api/minute/data');
    mounted.push('/api/minute/integrity/:tsCode');
    mounted.push('/api/minute/tasks');

    console.log('[mountApi] 分钟线数据API已加载');
  } catch (e) {
    console.log('[mountApi] minute-fetch模块加载失败:', e.message);
  }

  // TASK_V3_102: 参数优化 API
  try {
    const optimizer = require('./optimizer');
    const router = require('express').Router();

    // POST /api/optimizer/run - 运行优化
    router.post('/run', optimizer.runOptimizer);

    // GET /api/optimizer/status/:id - 查询优化状态
    router.get('/status/:id', optimizer.getOptimizerStatus);

    // GET /api/optimizer/result/:id - 获取优化结果
    router.get('/result/:id', optimizer.getOptimizerResult);

    app.use('/api/optimizer', router);
    mounted.push('/api/optimizer/run');
    mounted.push('/api/optimizer/status/:id');
    mounted.push('/api/optimizer/result/:id');

    console.log('[mountApi] 参数优化API已加载');
  } catch (e) {
    console.log('[mountApi] optimizer模块加载失败:', e.message);
  }

  // TASK_V3_301~303: 联合优化器 API
  try {
    const jointOptimizer = require('./joint-optimizer');
    const router = jointOptimizer.createRouter(express);

    app.use('/api/joint-optimizer', router);
    mounted.push('/api/joint-optimizer/run');
    mounted.push('/api/joint-optimizer/weights');

    console.log('[mountApi] 联合优化器API已加载');
  } catch (e) {
    console.log('[mountApi] joint-optimizer模块加载失败:', e.message);
  }

  // TASK_V3_401: 回测转条件单 API
  try {
    const backtestToConditional = require('./backtest-to-conditional');
    const router = backtestToConditional.createRouter(express);

    app.use('/api/backtest-to-conditional', router);
    mounted.push('/api/backtest-to-conditional/summary');
    mounted.push('/api/backtest-to-conditional/preview');
    mounted.push('/api/backtest-to-conditional/import');
    mounted.push('/api/backtest-to-conditional/batch-import');

    console.log('[mountApi] 回测转条件单API已加载');
  } catch (e) {
    console.log('[mountApi] backtest-to-conditional模块加载失败:', e.message);
  }

  // TASK_V3_402: 回测转监控池 API
  try {
    const backtestToMonitor = require('./backtest-to-monitor');
    const router = backtestToMonitor.createRouter(express);

    app.use('/api/backtest-to-monitor', router);
    mounted.push('/api/backtest-to-monitor/evaluate');
    mounted.push('/api/backtest-to-monitor/preview');
    mounted.push('/api/backtest-to-monitor/recommend');
    mounted.push('/api/backtest-to-monitor/recommended');

    console.log('[mountApi] 回测转监控池API已加载');
  } catch (e) {
    console.log('[mountApi] backtest-to-monitor模块加载失败:', e.message);
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
