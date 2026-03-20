#!/usr/bin/env node

/**
 * 盘后事件源接入框架
 * After-Hours Events Source Framework
 *
 * 支持事件类型:
 * 1. 公司公告 (Company Announcement)
 * 2. 财报发布 (Earnings Report)
 * 3. 重要新闻 (Important News)
 * 4. 价格异动 (Price Movement)
 */

// ==================== 配置 ====================
const CONFIG = {
  // 事件源开关配置
  sources: {
    companyAnnouncement: {
      enabled: true,
      name: '公司公告',
      priority: 'high',
      mockDataCount: 3
    },
    earningsReport: {
      enabled: true,
      name: '财报发布',
      priority: 'high',
      mockDataCount: 2
    },
    importantNews: {
      enabled: true,
      name: '重要新闻',
      priority: 'medium',
      mockDataCount: 5
    },
    priceMovement: {
      enabled: true,
      name: '价格异动',
      priority: 'high',
      mockDataCount: 4
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

// ==================== 事件数据结构 ====================

/**
 * 基础事件结构
 * @typedef {Object} BaseEvent
 * @property {string} id - 事件唯一ID
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

/**
 * 公司公告事件
 * @typedef {Object} CompanyAnnouncementEvent
 * @extends BaseEvent
 * @property {string} announcementType - 公告类型 (股权激励/股东增减持/重大合同/ etc.)
 * @property {string} filingNumber - 公告编号
 * @property {string} pdfUrl - PDF链接
 */

/**
 * 财报发布事件
 * @typedef {Object} EarningsReportEvent
 * @extends BaseEvent
 * @property {string} reportType - 财报类型 (年报/季报/业绩快报)
 * @property {string} reportPeriod - 报告期
 * @property {number} revenue - 营收
 * @property {number} netProfit - 净利润
 * @property {number} eps - 每股收益
 * @property {number} yoyGrowth - 同比增长率
 */

/**
 * 重要新闻事件
 * @typedef {Object} ImportantNewsEvent
 * @extends BaseEvent
 * @property {string} newsType - 新闻类型 (行业/宏观/政策/国际)
 * @property {string} sourceUrl - 新闻来源链接
 * @property {Array<string>} relatedStocks - 相关股票列表
 * @property {number} sentiment - 情感评分 (-1 到 1)
 */

/**
 * 价格异动事件
 * @typedef {Object} PriceMovementEvent
 * @extends BaseEvent
 * @property {number} changePercent - 涨跌幅
 * @property {number} changeAmount - 涨跌额
 * @property {number} volume - 成交量
 * @property {number} volumeRatio - 量比
 * @property {string} movementType - 异动类型 (涨停/跌停/放量/缩量)
 */

// ==================== 事件生成器 ====================

const EventGenerators = {
  /**
   * 生成公司公告事件
   */
  generateCompanyAnnouncements(count = 3) {
    const announcementTypes = ['股权激励', '股东增减持', '重大合同', '并购重组', '业绩预告修正'];
    const events = [];

    for (let i = 0; i < count; i++) {
      const stockCode = this._generateStockCode();
      events.push({
        id: `ANN-${Date.now()}-${i}`,
        type: 'company_announcement',
        source: 'sse_szse', // 上交所/深交所
        title: `${announcementTypes[i % announcementTypes.length]}公告`,
        content: `关于${announcementTypes[i % announcementTypes.length]}的公告内容...`,
        stockCode,
        stockName: this._generateStockName(stockCode),
        eventTime: new Date(),
        publishTime: new Date(),
        priority: 'high',
        announcementType: announcementTypes[i % announcementTypes.length],
        filingNumber: `临2025-${String(i + 1).padStart(3, '0')}`,
        pdfUrl: `http://www.sse.com.cn/disclosure/announcement/pdf/${stockCode}_2025.pdf`,
        metadata: { category: 'disclosure', exchange: stockCode.startsWith('6') ? 'sse' : 'szse' }
      });
    }

    return events;
  },

  /**
   * 生成财报发布事件
   */
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
        reportPeriod: '2025年Q1',
        revenue: parseFloat(revenue.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        eps: parseFloat((netProfit / 10).toFixed(3)),
        yoyGrowth: parseFloat((Math.random() * 60 - 20).toFixed(2)),
        metadata: { exchange: stockCode.startsWith('6') ? 'sse' : 'szse', auditor: '四大' }
      });
    }

    return events;
  },

  /**
   * 生成重要新闻事件
   */
  generateImportantNews(count = 5) {
    const newsTypes = ['行业政策', '宏观数据', '监管动态', '国际市场', '产业链消息'];
    const events = [];

    for (let i = 0; i < count; i++) {
      events.push({
        id: `NEWS-${Date.now()}-${i}`,
        type: 'important_news',
        source: ['财联社', '证券时报', '上海证券报', '中国证券报'][i % 4],
        title: `${newsTypes[i % newsTypes.length]}：重要市场动态`,
        content: `关于${newsTypes[i % newsTypes.length]}的详细报道...`,
        stockCode: null,
        stockName: null,
        eventTime: new Date(Date.now() - Math.random() * 3600000),
        publishTime: new Date(),
        priority: i < 2 ? 'high' : 'medium',
        newsType: newsTypes[i % newsTypes.length],
        sourceUrl: `https://www.cls.cn/detail/${Date.now()}`,
        relatedStocks: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => this._generateStockCode()),
        sentiment: parseFloat((Math.random() * 2 - 1).toFixed(2)),
        metadata: { keywords: ['政策', '市场'], readCount: Math.floor(Math.random() * 10000) }
      });
    }

    return events;
  },

  /**
   * 生成价格异动事件
   */
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
        metadata: { market: 'A股', triggerTime: '14:55' }
      });
    }

    return events;
  },

  // ==================== 工具方法 ====================

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
    // 模拟网络延迟
    await this._delay(100);
    return this._fetchImpl();
  }

  _fetchImpl() {
    throw new Error('子类必须实现 _fetchImpl 方法');
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class CompanyAnnouncementAdapter extends EventSourceAdapter {
  _fetchImpl() {
    return EventGenerators.generateCompanyAnnouncements(this.config.mockDataCount);
  }
}

class EarningsReportAdapter extends EventSourceAdapter {
  _fetchImpl() {
    return EventGenerators.generateEarningsReports(this.config.mockDataCount);
  }
}

class ImportantNewsAdapter extends EventSourceAdapter {
  _fetchImpl() {
    return EventGenerators.generateImportantNews(this.config.mockDataCount);
  }
}

class PriceMovementAdapter extends EventSourceAdapter {
  _fetchImpl() {
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
    console.log(`[配置] 市场收盘时间: ${this.config.global.marketCloseTime}`);
    console.log(`[配置] 盘后开始时间: ${this.config.global.afterHoursStart}`);
    console.log(`[配置] 时区: ${this.config.global.timezone}\n`);

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
    console.log(`总计事件数: ${allEvents.length}`);
    console.log(`高优先级: ${allEvents.filter(e => e.priority === 'high').length}`);
    console.log(`中优先级: ${allEvents.filter(e => e.priority === 'medium').length}`);
    console.log(`低优先级: ${allEvents.filter(e => e.priority === 'low').length}`);
    console.log('=====================================\n');

    return { bySource: results, all: allEvents };
  }
}

// ==================== 主程序 ====================

async function main() {
  console.log(`[${new Date().toISOString()}] 盘后事件源接入框架启动`);
  console.log('版本: 1.0.0');
  console.log('支持事件源: 公司公告 | 财报发布 | 重要新闻 | 价格异动\n');

  const aggregator = new EventAggregator(CONFIG);
  const events = await aggregator.fetchAllEvents();

  // 输出事件数据结构示例
  if (events.all.length > 0) {
    console.log('【事件数据结构示例】\n');
    const sample = events.all[0];
    console.log(`事件ID: ${sample.id}`);
    console.log(`类型: ${sample.type}`);
    console.log(`来源: ${sample.source}`);
    console.log(`标题: ${sample.title}`);
    console.log(`股票: ${sample.stockCode} ${sample.stockName || ''}`);
    console.log(`优先级: ${sample.priority}`);
    console.log(`元数据:`, JSON.stringify(sample.metadata, null, 2));
  }

  return events;
}

// 执行
main().catch(error => {
  console.error('程序执行失败:', error);
  process.exit(1);
});
