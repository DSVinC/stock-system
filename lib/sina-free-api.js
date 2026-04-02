/**
 * 免费新浪财经 API 封装
 * 替代收费的 sina-ashare-mcp MCP 服务
 * 
 * 数据源：新浪财经免费 HTTP API
 * 接口文档：https://finance.sina.com.cn
 */

const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');

const DEFAULT_HEADERS = {
  'Referer': 'https://finance.sina.com.cn',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

/**
 * HTTP GET 请求（支持 GBK 编码）
 */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: { ...DEFAULT_HEADERS, ...headers }
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        resolve({ data, status: res.statusCode });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * 标准化股票代码格式
 * 支持输入：600519, 000001, sh600519, sz000001, 600519.SH, 000001.SZ
 * 输出：sh600519, sz000001
 */
function normalizeSymbol(code) {
  if (!code) return '';
  
  code = code.toString().trim();
  
  // 处理带点号的格式：600519.SH -> sh600519
  const dotMatch = code.match(/^(\d{6})\.(SH|SZ|BJ)$/i);
  if (dotMatch) {
    const num = dotMatch[1];
    const exchange = dotMatch[2].toLowerCase();
    return `${exchange}${num}`;
  }
  
  code = code.toLowerCase();
  
  // 已经是标准格式
  if (/^(sh|sz|bj)[0-9]{6}$/.test(code)) {
    return code;
  }
  
  // 6 位数字代码
  if (/^[0-9]{6}$/.test(code)) {
    if (/^6[0-9]{5}$/.test(code) || /^9[0-9]{5}$/.test(code)) {
      return `sh${code}`;
    } else if (/^0[0-9]{5}$/.test(code) || /^3[0-9]{5}$/.test(code)) {
      return `sz${code}`;
    } else if (/^4[0-9]{5}$/.test(code) || /^8[0-9]{5}$/.test(code)) {
      return `bj${code}`;
    }
  }
  
  return code;
}

/**
 * 解析实时行情数据
 * 原始格式：var hq_str_sh600519="名称，现价，昨收，今开，最高，最低，..."
 */
function parseQuoteData(symbol, rawData) {
  const match = rawData.match(/var hq_str_[a-z0-9]+="([^"]+)"/);
  if (!match) {
    throw new Error(`Invalid quote data format for ${symbol}`);
  }
  
  const parts = match[1].split(',');
  if (parts.length < 32) {
    throw new Error(`Incomplete quote data for ${symbol}`);
  }
  
  return {
    symbol: normalizeSymbol(symbol),
    name: parts[0] || '',
    price: parseFloat(parts[3]) || 0,
    open: parseFloat(parts[1]) || 0,
    high: parseFloat(parts[4]) || 0,
    low: parseFloat(parts[5]) || 0,
    close: parseFloat(parts[2]) || 0,  // 昨收
    volume: parseFloat(parts[8]) || 0,
    amount: parseFloat(parts[9]) || 0,
    percent: ((parts[3] - parts[2]) / parts[2] * 100).toFixed(2),
    change: (parts[3] - parts[2]).toFixed(2),
    // 买盘
    bid1: { price: parseFloat(parts[11]) || 0, volume: parseFloat(parts[10]) || 0 },
    bid2: { price: parseFloat(parts[13]) || 0, volume: parseFloat(parts[12]) || 0 },
    bid3: { price: parseFloat(parts[15]) || 0, volume: parseFloat(parts[14]) || 0 },
    bid4: { price: parseFloat(parts[17]) || 0, volume: parseFloat(parts[16]) || 0 },
    bid5: { price: parseFloat(parts[19]) || 0, volume: parseFloat(parts[18]) || 0 },
    // 卖盘
    ask1: { price: parseFloat(parts[21]) || 0, volume: parseFloat(parts[20]) || 0 },
    ask2: { price: parseFloat(parts[23]) || 0, volume: parseFloat(parts[22]) || 0 },
    ask3: { price: parseFloat(parts[25]) || 0, volume: parseFloat(parts[24]) || 0 },
    ask4: { price: parseFloat(parts[27]) || 0, volume: parseFloat(parts[26]) || 0 },
    ask5: { price: parseFloat(parts[29]) || 0, volume: parseFloat(parts[28]) || 0 },
    // 时间
    date: parts[30] || '',
    time: parts[31] || ''
  };
}

/**
 * 解析分钟线数据
 * 返回格式：[{day, open, high, low, close, volume, amount}, ...]
 */
function parseMinuteData(rawData) {
  // 移除 JSONP 包装：/*<script>...</script>*/test=([...])
  const match = rawData.match(/test=\((\[.*\])\)/s);
  if (!match) {
    throw new Error('Invalid minute data format');
  }
  
  const jsonStr = match[1];
  const data = JSON.parse(jsonStr);
  
  return data.map(item => ({
    day: item.day,
    open: parseFloat(item.open) || 0,
    high: parseFloat(item.high) || 0,
    low: parseFloat(item.low) || 0,
    close: parseFloat(item.close) || 0,
    volume: parseFloat(item.volume) || 0,
    amount: parseFloat(item.amount) || 0,
    ma_price5: parseFloat(item.ma_price5) || 0,
    ma_volume5: parseFloat(item.ma_volume5) || 0,
    ma_price10: parseFloat(item.ma_price10) || 0,
    ma_volume10: parseFloat(item.ma_volume10) || 0,
    ma_price30: parseFloat(item.ma_price30) || 0,
    ma_volume30: parseFloat(item.ma_volume30) || 0
  }));
}

/**
 * 获取实时行情（单只股票）
 * @param {string} symbol - 股票代码（如 sh600519）
 * @returns {Promise<Object>} 行情数据
 */
async function getQuote(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const url = `http://hq.sinajs.cn/list=${normalizedSymbol}`;
  
  const { data } = await httpGet(url);
  return parseQuoteData(symbol, data);
}

/**
 * 获取实时行情（批量）
 * @param {string[]} symbols - 股票代码数组
 * @returns {Promise<Object[]>} 行情数据数组
 */
async function getQuotes(symbols) {
  const normalizedSymbols = symbols.map(s => normalizeSymbol(s));
  const url = `http://hq.sinajs.cn/list=${normalizedSymbols.join(',')}`;
  
  const { data } = await httpGet(url);
  
  // 解析多只股票数据
  const lines = data.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const match = line.match(/var hq_str_([a-z0-9]+)="([^"]+)"/);
    if (!match) return null;
    
    const symbol = match[1].replace('hq_str_', '');
    const parts = match[2].split(',');
    if (parts.length < 10) return null;
    
    return {
      symbol: symbol.toUpperCase(),
      name: parts[0] || '',
      price: parseFloat(parts[3]) || 0,
      percent: ((parts[3] - parts[2]) / parts[2] * 100).toFixed(2),
      change: (parts[3] - parts[2]).toFixed(2),
      volume: parseFloat(parts[8]) || 0,
      amount: parseFloat(parts[9]) || 0
    };
  }).filter(item => item !== null);
}

/**
 * 获取分钟线数据
 * @param {string} symbol - 股票代码
 * @param {number} scale - 周期（1=1 分钟，5=5 分钟，15=15 分钟，30=30 分钟，60=60 分钟）
 * @param {number} dataLen - 数据条数（默认 10 条）
 * @returns {Promise<Object[]>} 分钟线数据
 */
async function getMinuteData(symbol, scale = 5, dataLen = 10) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const url = `https://quotes.sina.cn/cn/api/jsonp_v2.php/test=/CN_MarketDataService.getKLineData?symbol=${normalizedSymbol}&scale=${scale}&datalen=${dataLen}`;
  
  const { data } = await httpGet(url, {
    'Referer': 'https://finance.sina.com.cn/'
  });
  
  return parseMinuteData(data);
}

/**
 * 获取板块成分股排行
 * @param {string} node - 板块代码（如 sh000001）
 * @param {string} sort - 排序字段（percent=涨幅，price=价格，volume=成交量）
 * @param {number} page - 页码
 * @param {number} num - 每页数量
 * @returns {Promise<Object[]>} 成分股数据
 */
async function getSectorComponents(node, sort = 'percent', page = 1, num = 20) {
  const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=${num}&sort=${sort}&asc=0&node=${node}&symbol=${node}`;
  
  const { data } = await httpGet(url, {
    'Referer': 'https://finance.sina.com.cn/'
  });
  
  // 移除 JSONP 包装
  const jsonStr = data.replace(/^[^\(]*\(/, '').replace(/\);?$/, '');
  return JSON.parse(jsonStr);
}

/**
 * 解析公告列表数据（从 HTML 页面提取）
 * 新浪财经格式：日期&nbsp;<a href='...' target='_blank'>标题</a><br>
 */
function parseAnnouncementList(html, symbol) {
  const announcements = [];
  
  // 匹配公告列表项：2026-03-10&nbsp;<a target='_blank' href='...'>标题</a><br>
  const itemRegex = /(\d{4}-\d{2}-\d{2})\s*&nbsp;\s*<a\s+[^>]*href=['"]([^'"]+)['"][^>]*target=['"]_blank['"][^>]*>([^<]+)<\/a>\s*<br>/gi;
  
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const date = match[1].trim();
    const url = match[2].trim();
    const title = match[3].trim();
    
    // 跳过无效数据
    if (!title || title === '暂无数据' || title.includes('热门股票')) continue;
    
    const { eventType, riskTag } = classifyAnnouncementType(title);
    
    announcements.push({
      symbol: symbol,
      title: title,
      ann_date: date.replace(/-/g, ''),
      url: url.startsWith('http') ? url : `http://vip.stock.finance.sina.com.cn${url}`,
      event_type: eventType,
      riskTag: riskTag
    });
  }
  
  return announcements;
}

/**
 * 解析公告详情页面（提取全文）
 */
function parseAnnouncementDetail(html) {
  const content = {};
  
  // 提取标题
  const titleMatch = html.match(/<div[^>]*class="tit"[^>]*>\s*<h1[^>]*>([^<]+)<\/h1>/i);
  if (titleMatch) {
    content.title = titleMatch[1].trim();
  }
  
  // 提取发布时间
  const dateMatch = html.match(/<span[^>]*class="time"[^>]*>([^<]+)<\/span>/i);
  if (dateMatch) {
    content.pub_date = dateMatch[1].trim();
  }
  
  // 提取公告正文
  const bodyMatch = html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i);
  if (bodyMatch) {
    // 移除 HTML 标签
    content.content = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  
  return content;
}

/**
 * 公告标题风险分类
 */
function classifyAnnouncementType(title) {
  const riskKeywords = [
    { pattern: /立案调查|行政处罚|监管函|警示函/i, type: 'regulatory_risk', tag: 'high' },
    { pattern: /退市|终止上市|暂停上市/i, type: 'delisting_risk', tag: 'high' },
    { pattern: /业绩预亏|亏损|下滑/i, type: 'earnings_warning', tag: 'medium' },
    { pattern: /减持|减持计划/i, type: 'shareholder_reduction', tag: 'medium' },
    { pattern: /中标|重大合同|回购|增持/i, type: 'positive', tag: 'low' },
    { pattern: /股东大会|董事会|监事会/i, type: 'corporate_governance', tag: 'low' },
    { pattern: /分红|派息|转增/i, type: 'dividend', tag: 'low' }
  ];
  
  for (const { pattern, type, tag } of riskKeywords) {
    if (pattern.test(title)) {
      return { eventType: type, riskTag: tag };
    }
  }
  
  return { eventType: 'general_announcement', riskTag: 'low' };
}

/**
 * 获取公司公告列表
 * @param {string} symbol - 股票代码（如 sh600519）
 * @param {number} page - 页码（默认 1）
 * @param {number} limit - 每页数量（默认 20）
 * @returns {Promise<Object[]>} 公告列表
 */
async function getAnnouncements(symbol, page = 1, limit = 20) {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) {
    throw new Error('Invalid stock symbol');
  }
  
  // 新浪财经公告列表页面
  const url = `https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletin.php?stockid=${normalizedSymbol}&page=${page}&num=${limit}`;
  
  const { data } = await httpGet(url, {
    'Referer': 'https://finance.sina.com.cn/'
  });
  
  return parseAnnouncementList(data, normalizedSymbol);
}

/**
 * 获取公告详情（全文）
 * @param {string} url - 公告详情页 URL
 * @returns {Promise<Object>} 公告详情（标题、发布时间、正文）
 */
async function getAnnouncementDetail(url) {
  if (!url) {
    throw new Error('Announcement URL is required');
  }
  
  const { data } = await httpGet(url, {
    'Referer': 'https://finance.sina.com.cn/'
  });
  
  return parseAnnouncementDetail(data);
}

/**
 * 批量获取多只股票的公告
 * @param {string[]} symbols - 股票代码数组
 * @param {number} limit - 每只股票获取数量
 * @returns {Promise<Object[]>} 合并的公告列表
 */
async function getAnnouncementsBatch(symbols, limit = 10) {
  const results = [];
  
  for (const symbol of symbols) {
    try {
      const announcements = await getAnnouncements(symbol, 1, limit);
      results.push(...announcements);
    } catch (error) {
      console.warn(`Failed to fetch announcements for ${symbol}: ${error.message}`);
    }
  }
  
  // 按日期排序
  return results.sort((a, b) => b.ann_date.localeCompare(a.ann_date));
}

module.exports = {
  // 核心函数
  getQuote,
  getQuotes,
  getMinuteData,
  getSectorComponents,
  getAnnouncements,
  getAnnouncementDetail,
  getAnnouncementsBatch,
  
  // 工具函数
  normalizeSymbol,
  parseQuoteData,
  parseMinuteData,
  parseAnnouncementList,
  parseAnnouncementDetail,
  classifyAnnouncementType,
  
  // 常量
  DEFAULT_HEADERS
};
