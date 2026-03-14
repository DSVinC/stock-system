'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/package.json');
const express = workspaceRequire('express');

const { createMonitorRouter } = require('./monitor');

const app = express();
const ROOT_DIR = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(ROOT_DIR));

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

  if (await mountApi('select.js', '/api/select').catch(() => false)) {
    mounted.push('/api/select');
  }

  if (await mountApi('analyze.js', '/api/analyze').catch(() => false)) {
    mounted.push('/api/analyze');
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

  const server = app.listen(PORT, () => {
    console.log(`A股投资系统服务已启动: http://localhost:${PORT}`);
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
