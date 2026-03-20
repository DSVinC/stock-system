#!/usr/bin/env node

/**
 * 盘后事件源接入框架
 * After-Hours Events Source Framework
 *
 * 支持事件类型:
 * 1. 公司公告 (Company Announcement) - 本地新闻数据库
 * 2. 财报发布 (Earnings Report) - Mock（待接入 Tushare）
 * 3. 重要新闻 (Important News) - 本地新闻数据库 + 行业监控
 * 4. 价格异动 (Price Movement) - Mock（待接入新浪财经）
 *
 * 数据源整合说明 (2026-03-20):
 * - 重要新闻：整合 industry-news-monitor.js 的 fetchIndustryNews() 函数
 * - 公司公告：从 news.db 的 news_raw 表筛选 category='监管公告'
 * - 新闻数据库路径：/Users/vvc/.openclaw/workspace/news_system/news.db
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// 数据库路径
const SCRIPTS_DIR = path.dirname(import.meta.url.replace('file://', ''));
const STOCK_SYSTEM_DIR = path.join(SCRIPTS_DIR, '..');
const NEWS_DB_PATH = path.join(STOCK_SYSTEM_DIR, '..', 'news_system', 'news.db');
const STOCK_DB_PATH = path.join(STOCK_SYSTEM_DIR, 'data', 'stock_system.db');

// Tushare API 配置
const TUSHARE_URL = 'https://api.tushare.pro';
const TUSHARE_TOKEN = process.env.TUSHARE_TOKEN || '';

// ==================== 配置 ====================
const CONFIG = {
  // 事件源开关配置
  sources: {
    companyAnnouncement: {
      enabled: true,
      name: '公司公告',
      priority: 'high',
      mockDataCount: 10,
      useRealData: true // ✅ 使用真实数据
    },
    earningsReport: {
      enabled: true,
      name: '财报发布',
      priority: 'high',
      mockDataCount: 20,
      useRealData: true // ✅ 使用 Tushare 披露日期表
    },
    importantNews: {
      enabled: true,
      name: '重要新闻',
      priority: 'medium',
      mockDataCount: 20,
      useRealData: true, // ✅ 使用真实数据
      hours: 24 // 最近 24 小时
    },
    priceMovement: {
      enabled: true,
      name: '价格异动',
      priority: 'high',
      mockDataCount: 4,
      useRealData: false // 待接入新浪财经
    }
  },

  // 全局配置
  global: {
    marketCloseTime: '15:00',
    afterHoursStart: '15:01',
    timezone: 'Asia/Shanghai',
    maxEventsPerSource: 10
  }
};

// ==================== 数据库查询工具 ====================

/**
 * 运行 SQL 查询
 */
async function runSql(sql, dbPath, options = {}) {
  const args = [];
  if (options.json) {
    args.push('-json');
  }
  args.push(dbPath, sql);

  try {
    const { stdout, stderr } = await execFileAsync('/usr/bin/sqlite3', args, {
      maxBuffer: 1024 * 1024
    });

    if (stderr && stderr.trim()) {
      throw new Error(stderr.trim());
    }

    return stdout.trim();
  } catch (error) {
    console.warn(`SQL 查询失败 (${dbPath}):`, error.message);
    return '';
  }
}

/**
 * 从新闻数据库获取公司公告
 */
async function fetchCompanyAnnouncements(limit = 10) {
  if (!fs.existsSync(NEWS_DB_PATH)) {
    console.warn(`新闻数据库不存在：${NEWS_DB_PATH}`);
    return [];
  }

  // 查询监管公告类别的新闻
  const sql = `
    SELECT 
      id,
      title,
      content,
      link,
      pub_date,
      fetched_at,
      category
    FROM news_raw 
    WHERE 
      category LIKE '%公告%' OR category LIKE '%监管%'
    ORDER BY fetched_at DESC
    LIMIT ${limit};
  `;

  const stdout = await runSql(sql, NEWS_DB_PATH, { json: true });
  if (!stdout) return [];

  const newsList = JSON.parse(stdout);
  
  return newsList.map(news => ({
    id: `ANN-${news.id}`,
    type: 'company_announcement',
    source: news.category || 'news_db',
    title: news.title,
    content: news.content || '',
    stockCode: extractStockCode(news.title),
    stockName: null,
    eventTime: new Date(news.pub_date || Date.now()),
    publishTime: new Date(news.fetched_at || Date.now()),
    priority: 'high',
    announcementType: '监管公告',
    filingNumber: null,
    pdfUrl: news.link || null,
    metadata: { newsId: news.id, originalLink: news.link }
  }));
}

/**
 * 从新闻数据库获取重要新闻
 */
async function fetchImportantNews(hours = 24, limit = 20) {
  if (!fs.existsSync(NEWS_DB_PATH)) {
    console.warn(`新闻数据库不存在：${NEWS_DB_PATH}`);
    return [];
  }

  // 查询高优先级的新闻（排除公告类）
  const sql = `
    SELECT 
      id,
      title,
      content,
      link,
      pub_date,
      fetched_at,
      category,
      priority
    FROM news_raw 
    WHERE 
      category NOT LIKE '%公告%'
      AND fetched_at >= datetime('now', '-${hours} hours')
    ORDER BY 
      COALESCE(priority, 5) DESC,
      fetched_at DESC
    LIMIT ${limit};
  `;

  const stdout = await runSql(sql, NEWS_DB_PATH, { json: true });
  if (!stdout) return [];

  const newsList = JSON.parse(stdout);
  
  return newsList.map(news => ({
    id: `NEWS-${news.id}`,
    type: 'important_news',
    source: news.category || 'news_db',
    title: news.title,
    content: news.content || '',
    stockCode: null,
    stockName: null,
    eventTime: new Date(news.pub_date || Date.now()),
    publishTime: new Date(news.fetched_at || Date.now()),
    priority: news.priority >= 8 ? 'high' : news.priority >= 6 ? 'medium' : 'low',
    newsType: mapCategory(news.category),
    sourceUrl: news.link || null,
    relatedStocks: extractRelatedStocks(news.title, news.content),
    sentiment: analyzeNewsSentiment(news.title, news.content),
    metadata: { newsId: news.id, category: news.category }
  }));
}

/**
 * 从标题中提取股票代码
 */
function extractStockCode(title) {
  const match = title.match(/[(（]?(\d{6})[)）]?/);
  if (match) {
    const code = match[1];
    if (code.startsWith('6')) return `${code}.SH`;
    if (code.startsWith('0') || code.startsWith('3')) return `${code}.SZ`;
  }
  return null;
}

/**
 * 从新闻内容中提取相关股票
 */
function extractRelatedStocks(title, content) {
  const stocks = [];
  const text = (title || '') + ' ' + (content || '');
  const matches = text.match(/\b(\d{6})\b/g);
  if (matches) {
    matches.forEach(code => {
      if (code.startsWith('6')) stocks.push(`${code}.SH`);
      else if (code.startsWith('0') || code.startsWith('3')) stocks.push(`${code}.SZ`);
    });
  }
  return stocks.slice(0, 5); // 最多 5 只
}

/**
 * 映射新闻类别
 */
function mapCategory(category) {
  if (!category) return '其他';
  if (category.includes('宏观')) return '宏观';
  if (category.includes('股市')) return '股市';
  if (category.includes('行业')) return '行业';
  if (category.includes('政策')) return '政策';
  return '其他';
}

/**
 * 简单情感分析
 */
function analyzeNewsSentiment(title, content) {
  const text = (title + ' ' + (content || '')).toLowerCase();
  const positiveWords = ['利好', '增长', '盈利', '突破', '上涨', '创新高', '支持', '订单', '合作'];
  const negativeWords = ['利空', '下跌', '亏损', '下滑', '风险', '警告', '违规', '调查', '处罚'];
  
  let score = 0;
  positiveWords.forEach(w => { if (text.includes(w)) score += 0.2; });
  negativeWords.forEach(w => { if (text.includes(w)) score -= 0.2; });
  
  return Math.max(-1, Math.min(1, score));
}

/**
 * Tushare API 请求
 */
async function tushareRequest(apiName, params = {}) {
  if (!TUSHARE_TOKEN) {
    console.warn('[Tushare] 未配置 TUSHARE_TOKEN，使用 Mock 数据');
    return null;
  }

  try {
    const response = await fetch(TUSHARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: apiName,
        token: TUSHARE_TOKEN,
        params: params,
        fields: []
      })
    });

    if (!response.ok) {
      throw new Error(`Tushare API 请求失败：${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.msg || 'Tushare API 返回错误');
    }

    return data;
  } catch (error) {
    console.warn(`[Tushare] ${apiName} 请求失败:`, error.message);
    return null;
  }
}

/**
 * 从 Tushare 获取财报发布日期
 */
async function fetchEarningsReportsFromTushare(days = 7) {
  if (!TUSHARE_TOKEN) {
    console.log('[财报发布] 未配置 TUSHARE_TOKEN，使用 Mock 数据');
    return null;
  }

  console.log('[财报发布] 从 Tushare 获取财报数据...');

  // 使用披露日程表获取近期财报披露计划
  // ann_date: 最新披露公告日，格式 YYYYMMDD
  const startDate = getDaysAgo(days).replace(/-/g, '');
  const endDate = getFutureDate(7).replace(/-/g, '');

  const data = await tushareRequest('disclosure_date', {
    ann_date: startDate
  });

  if (!data || !data.data || !data.data.items) {
    console.log('[财报发布] Tushare 无近期财报数据，使用 Mock 数据降级');
    return null;
  }

  const fields = data.data.fields;
  const items = data.data.items;

  // 字段映射
  const fieldIndex = {};
  fields.forEach((field, index) => {
    fieldIndex[field] = index;
  });

  const events = [];
  const processedCompanies = new Set();

  items.slice(0, 20).forEach(item => {
    const tsCode = item[fieldIndex.ts_code];
    const annDate = item[fieldIndex.ann_date]; // 公告日期
    const endDate = item[fieldIndex.end_date]; // 报告期
    const reportType = determineReportType(endDate);

    // 避免同一天同一公司多条记录
    const key = `${tsCode}_${annDate}`;
    if (processedCompanies.has(key)) return;
    processedCompanies.add(key);

    events.push({
      id: `RPT-${tsCode}-${annDate}`,
      type: 'earnings_report',
      source: 'tushare',
      title: `${reportType}披露`,
      content: `公告日期：${annDate}, 报告期：${endDate}`,
      stockCode: tsCode,
      stockName: null,
      eventTime: new Date(annDate),
      publishTime: new Date(annDate),
      priority: 'high',
      reportType: reportType,
      reportPeriod: endDate,
      revenue: null,
      netProfit: null,
      eps: null,
      yoyGrowth: null,
      metadata: { ts_code: tsCode, ann_date: annDate, end_date: endDate }
    });
  });

  console.log(`[财报发布] 从 Tushare 获取 ${events.length} 条财报数据`);
  return events;
}

/**
 * 获取 N 天前的日期 (YYYYMMDD)
 */
function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * 获取未来 7 天的日期 (YYYYMMDD)
 */
function getFutureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * 判断财报类型
 */
function determineReportType(endDate) {
  const month = parseInt(endDate.substring(4, 6));
  if (month === 12) return '年报';
  if (month === 3) return '一季报';
  if (month === 6) return '半年报';
  if (month === 9) return '三季报';
  return '季报';
}

// ==================== 事件数据结构 ====================

/**
 * 基础事件结构
 * @typedef {Object} BaseEvent
 * @property {string} id - 事件唯一 ID
 * @property {string} type - 事件类型
 * @property {string} source - 事件来源
 * @property {string} title - 事件标题
 * @property {string} content - 事件内容
 * @property {string} stockCode - 股票代码
 * @property {string} stockName - 股票名称
 * @property {Date} eventTime - 事件发生时间
 * @property {Date} publishTime - 事件发布时间
 * @property {string} priority - 优先级 (high/medium/low)
 * @property {Object} metadata - 元数据
 */

// ==================== 事件生成器 (Mock 数据，用于降级) ====================

const EventGenerators = {
  generateCompanyAnnouncements(count = 3) {
    console.log('[Mock] 生成公司公告 Mock 数据');
    return []; // 真实数据优先，Mock 降级为空
  },

  generateEarningsReports(count = 2) {
    const reportTypes = ['年报', '一季报', '半年报', '三季报', '业绩快报'];
    const events = [];

    for (let i = 0; i < count; i++) {
      const stockCode = this._generateStockCode();
      const revenue = Math.random() * 100 + 10;
      const netProfit = revenue * (Math.random() * 0.2 + 0.05);

      events.push({
        id: `RPT-${Date.now()}-${i}`,
        type: 'earnings_report',
        source: 'cninfo',
        title: `${reportTypes[i % reportTypes.length]}披露`,
        content: `公司发布${reportTypes[i % reportTypes.length]}，营收${revenue.toFixed(2)}亿元...`,
        stockCode,
        stockName: this._generateStockName(stockCode),
        eventTime: new Date(),
        publishTime: new Date(),
        priority: 'high',
        reportType: reportTypes[i % reportTypes.length],
        reportPeriod: '2025 年 Q1',
        revenue: parseFloat(revenue.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        eps: parseFloat((netProfit / 10).toFixed(3)),
        yoyGrowth: parseFloat((Math.random() * 60 - 20).toFixed(2)),
        metadata: { exchange: stockCode.startsWith('6') ? 'sse' : 'szse' }
      });
    }

    return events;
  },

  generateImportantNews(count = 5) {
    console.log('[Mock] 生成重要新闻 Mock 数据');
    return []; // 真实数据优先，Mock 降级为空
  },

  generatePriceMovements(count = 4) {
    const movementTypes = ['涨停', '跌停', '放量大涨', '缩量下跌', '异动拉升', '异动跳水'];
    const events = [];

    for (let i = 0; i < count; i++) {
      const stockCode = this._generateStockCode();
      const isUp = i % 2 === 0;
      const changePercent = isUp ? Math.random() * 10 + 5 : -(Math.random() * 10 + 5);

      events.push({
        id: `PM-${Date.now()}-${i}`,
        type: 'price_movement',
        source: 'market_data',
        title: `${movementTypes[i % movementTypes.length]}：${changePercent.toFixed(2)}%`,
        content: `股票${movementTypes[i % movementTypes.length]}，振幅${Math.abs(changePercent).toFixed(2)}%...`,
        stockCode,
        stockName: this._generateStockName(stockCode),
        eventTime: new Date(Date.now() - Math.random() * 1800000),
        publishTime: new Date(),
        priority: Math.abs(changePercent) > 9.5 ? 'high' : 'medium',
        changePercent: parseFloat(changePercent.toFixed(2)),
        changeAmount: parseFloat((changePercent * 0.5).toFixed(2)),
        volume: Math.floor(Math.random() * 1000000) + 100000,
        volumeRatio: parseFloat((Math.random() * 5 + 0.5).toFixed(2)),
        movementType: movementTypes[i % movementTypes.length],
        metadata: { market: 'A 股', triggerTime: '14:55' }
      });
    }

    return events;
  },

  _generateStockCode() {
    const prefixes = ['600', '601', '603', '688', '000', '001', '002', '300'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = String(Math.floor(Math.random() * 999)).padStart(3, '0');
    return prefix + suffix;
  },

  _generateStockName(stockCode) {
    const names = {
      '600': ['浦发', '白云', '东风'],
      '601': ['中信', '中国', '太保'],
      '603': ['海天', '恒瑞', '隆基'],
      '688': ['中芯', '金山', '传音'],
      '000': ['平安', '万科', '招商'],
      '001': ['招商', '平安', '深南'],
      '002': ['美的', '格力', '顺丰'],
      '300': ['宁德', '迈瑞', '爱尔']
    };
    const prefix = stockCode.substring(0, 3);
    const candidates = names[prefix] || ['科技', '股份', '集团'];
    return candidates[Math.floor(Math.random() * candidates.length)] + (Math.random() > 0.5 ? '股份' : '科技');
  }
};

// ==================== 事件源适配器 ====================

class EventSourceAdapter {
  constructor(config) {
    this.config = config;
    this.name = config.name;
    this.enabled = config.enabled;
  }

  async fetch() {
    if (!this.enabled) {
      console.log(`[${this.name}] 事件源已禁用`);
      return [];
    }

    console.log(`[${this.name}] 正在获取事件...`);
    return this._fetchImpl();
  }

  _fetchImpl() {
    throw new Error('子类必须实现 _fetchImpl 方法');
  }
}

class CompanyAnnouncementAdapter extends EventSourceAdapter {
  async _fetchImpl() {
    if (this.config.useRealData) {
      console.log(`[${this.name}] 从新闻数据库获取真实公告数据...`);
      const events = await fetchCompanyAnnouncements(this.config.mockDataCount);
      console.log(`[${this.name}] 获取 ${events.length} 条公告`);
      return events;
    }
    return EventGenerators.generateCompanyAnnouncements(this.config.mockDataCount);
  }
}

class EarningsReportAdapter extends EventSourceAdapter {
  async _fetchImpl() {
    if (this.config.useRealData) {
      console.log(`[${this.name}] 从 Tushare 获取真实财报数据...`);
      const events = await fetchEarningsReportsFromTushare(7);
      if (events && events.length > 0) {
        console.log(`[${this.name}] 获取 ${events.length} 条财报`);
        return events;
      }
    }
    // 降级到 Mock 数据
    console.log(`[${this.name}] 使用 Mock 数据（降级）`);
    return EventGenerators.generateEarningsReports(this.config.mockDataCount);
  }
}

class ImportantNewsAdapter extends EventSourceAdapter {
  async _fetchImpl() {
    if (this.config.useRealData) {
      console.log(`[${this.name}] 从新闻数据库获取真实新闻数据（最近${this.config.hours}小时）...`);
      const events = await fetchImportantNews(this.config.hours, this.config.mockDataCount * 2);
      console.log(`[${this.name}] 获取 ${events.length} 条新闻`);
      return events;
    }
    return EventGenerators.generateImportantNews(this.config.mockDataCount);
  }
}

class PriceMovementAdapter extends EventSourceAdapter {
  _fetchImpl() {
    // 待接入新浪财经实时行情
    console.log(`[${this.name}] 使用 Mock 数据（待接入新浪财经）`);
    return EventGenerators.generatePriceMovements(this.config.mockDataCount);
  }
}

// ==================== 事件聚合器 ====================

class EventAggregator {
  constructor(config) {
    this.config = config;
    this.adapters = this._createAdapters();
  }

  _createAdapters() {
    return {
      companyAnnouncement: new CompanyAnnouncementAdapter(this.config.sources.companyAnnouncement),
      earningsReport: new EarningsReportAdapter(this.config.sources.earningsReport),
      importantNews: new ImportantNewsAdapter(this.config.sources.importantNews),
      priceMovement: new PriceMovementAdapter(this.config.sources.priceMovement)
    };
  }

  async fetchAllEvents() {
    console.log('\n========== 盘后事件采集开始 ==========\n');
    console.log(`[配置] 市场收盘时间：${this.config.global.marketCloseTime}`);
    console.log(`[配置] 盘后开始时间：${this.config.global.afterHoursStart}`);
    console.log(`[配置] 时区：${this.config.global.timezone}\n`);

    const results = {};
    const allEvents = [];

    for (const [key, adapter] of Object.entries(this.adapters)) {
      try {
        const events = await adapter.fetch();
        results[key] = events;
        allEvents.push(...events);

        console.log(`✓ [${adapter.name}] 获取 ${events.length} 条事件`);
        events.forEach(event => {
          console.log(`  - [${event.stockCode || 'N/A'}] ${event.title} (${event.priority})`);
        });
        console.log('');
      } catch (error) {
        console.error(`✗ [${adapter.name}] 获取失败:`, error.message);
        results[key] = [];
      }
    }

    // 按时间排序
    allEvents.sort((a, b) => b.publishTime - a.publishTime);

    console.log('========== 盘后事件采集完成 ==========');
    console.log(`总计事件数：${allEvents.length}`);
    console.log(`高优先级：${allEvents.filter(e => e.priority === 'high').length}`);
    console.log(`中优先级：${allEvents.filter(e => e.priority === 'medium').length}`);
    console.log(`低优先级：${allEvents.filter(e => e.priority === 'low').length}`);
    console.log('=====================================\n');

    return { bySource: results, all: allEvents };
  }
}

// ==================== 主程序 ====================

async function main() {
  console.log(`[${new Date().toISOString()}] 盘后事件源接入框架启动`);
  console.log('版本：1.2.0 (整合本地新闻数据库 + Tushare 财报)');
  console.log('支持事件源：公司公告 (真实) | 财报发布 (Tushare) | 重要新闻 (真实) | 价格异动 (Mock)');
  console.log(`新闻数据库：${NEWS_DB_PATH}`);
  console.log(`Tushare API: ${TUSHARE_TOKEN ? '✅ 已配置' : '❌ 未配置'}\n`);

  // 检查新闻数据库是否存在
  if (!fs.existsSync(NEWS_DB_PATH)) {
    console.error(`❌ 新闻数据库不存在：${NEWS_DB_PATH}`);
    console.log('请确保 news_system/news.db 存在');
    process.exit(1);
  }

  console.log('✅ 新闻数据库存在，开始采集事件...\n');

  const aggregator = new EventAggregator(CONFIG);
  const events = await aggregator.fetchAllEvents();

  // 输出事件数据结构示例
  if (events.all.length > 0) {
    console.log('\n【事件数据结构示例】\n');
    const sample = events.all[0];
    console.log(`事件 ID: ${sample.id}`);
    console.log(`类型：${sample.type}`);
    console.log(`来源：${sample.source}`);
    console.log(`标题：${sample.title}`);
    console.log(`股票：${sample.stockCode || 'N/A'} ${sample.stockName || ''}`);
    console.log(`优先级：${sample.priority}`);
    console.log(`元数据:`, JSON.stringify(sample.metadata, null, 2));
  }

  return events;
}

// 执行
main().catch(error => {
  console.error('程序执行失败:', error);
  process.exit(1);
});

// ==================== 导出函数 ====================

/**
 * 盘后事件收集函数
 * @returns {Promise<Array>} 事件列表
 */
export async function collectAfterHoursEvents() {
  const aggregator = new EventAggregator(CONFIG);
  const events = await aggregator.fetchAllEvents();
  
  // 返回事件列表
  return events.all;
}

// 如果直接运行此脚本，执行 main 函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
