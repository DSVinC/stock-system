const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const Database = require('better-sqlite3');

const execFileAsync = promisify(execFile);
const TUSHARE_URL = 'https://api.tushare.pro';
const ENV_PATHS = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
];
const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
let dbCache = null;

// 免费新浪财经 API（替代收费的 sina-ashare-mcp）
const sinaFreeApi = require('../lib/sina-free-api');

loadWorkspaceEnv();

function getDb() {
  if (!dbCache) {
    dbCache = new Database(DB_PATH, { readonly: true });
  }
  return dbCache;
}

class MarketDataError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MarketDataError';
    this.code = options.code || 'MARKET_DATA_ERROR';
    this.status = options.status || 503;
    this.details = options.details || null;
  }
}

function loadWorkspaceEnv() {
  for (const envPath of ENV_PATHS) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  }
}

function getTushareToken() {
  const token = typeof process.env.TUSHARE_TOKEN === 'string' ? process.env.TUSHARE_TOKEN.trim() : '';
  if (!token) {
    throw new MarketDataError('未配置 TUSHARE_TOKEN，无法请求 Tushare Pro。', {
      code: 'MISSING_TUSHARE_TOKEN',
      status: 500,
    });
  }
  return token;
}

function getProxyEnv() {
  const proxy = process.env.HTTPS_PROXY
    || process.env.HTTP_PROXY
    || process.env.ALL_PROXY
    || process.env.TUSHARE_PROXY_URL;

  if (!proxy) {
    return {};
  }

  return {
    HTTPS_PROXY: proxy,
    HTTP_PROXY: proxy,
    ALL_PROXY: proxy,
  };
}

function httpsPostJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 12000,
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        raw += chunk;
      });
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new MarketDataError(`Tushare HTTP ${response.statusCode}`, {
            code: 'TUSHARE_HTTP_ERROR',
            details: raw.slice(0, 500),
          }));
          return;
        }

        try {
          resolve(JSON.parse(raw || '{}'));
        } catch (error) {
          reject(new MarketDataError('Tushare 返回了无法解析的 JSON。', {
            code: 'TUSHARE_BAD_JSON',
            details: raw.slice(0, 500),
          }));
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new MarketDataError('Tushare 请求超时。', {
        code: 'TUSHARE_TIMEOUT',
      }));
    });
    request.on('error', (error) => {
      reject(new MarketDataError(`Tushare 连接失败：${error.message}`, {
        code: error.code || 'TUSHARE_NETWORK_ERROR',
      }));
    });
    request.write(body);
    request.end();
  });
}

async function curlPostJson(url, payload) {
  const body = JSON.stringify(payload);
  const env = {
    ...process.env,
    ...getProxyEnv(),
  };

  try {
    const { stdout } = await execFileAsync('curl', [
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '20',
      '--header',
      'Content-Type: application/json',
      '--data',
      body,
      url,
    ], {
      env,
      timeout: 22000,
      maxBuffer: 1024 * 1024 * 4,
    });
    return JSON.parse(stdout || '{}');
  } catch (error) {
    throw new MarketDataError(`Tushare 代理请求失败：${error.message}`, {
      code: 'TUSHARE_PROXY_ERROR',
      details: error.stderr || error.stdout || null,
    });
  }
}

async function tushareRequest(apiName, params = {}, fields = []) {
  const token = getTushareToken();
  const requestPayload = {
    api_name: apiName,
    token,
    params,
    fields: Array.isArray(fields) ? fields.join(',') : String(fields || ''),
  };
  let response;

  try {
    response = await httpsPostJson(TUSHARE_URL, requestPayload);
  } catch (error) {
    const shouldRetryWithProxy = error instanceof MarketDataError
      && ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'TUSHARE_TIMEOUT', 'TUSHARE_NETWORK_ERROR'].includes(error.code);
    if (!shouldRetryWithProxy) {
      throw error;
    }
    response = await curlPostJson(TUSHARE_URL, requestPayload);
  }

  if (response.code !== 0) {
    throw new MarketDataError(`Tushare 接口 ${apiName} 调用失败：${response.msg || 'unknown error'}`, {
      code: 'TUSHARE_API_ERROR',
      details: response,
    });
  }

  const items = response.data && Array.isArray(response.data.items) ? response.data.items : [];
  const columns = response.data && Array.isArray(response.data.fields) ? response.data.fields : [];
  return items.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function findLatestTradeDate(maxLookbackDays = 14) {
  // 优先使用 Tushare 判定最近有效交易日，避免长期固定在本地快照日期。
  let lastApiError = null;
  for (let index = 0; index <= maxLookbackDays; index += 1) {
    const candidate = new Date();
    candidate.setDate(candidate.getDate() - index);
    const tradeDate = formatDate(candidate);

    try {
      const rows = await tushareRequest('daily_basic', {
        trade_date: tradeDate,
      }, ['ts_code', 'trade_date', 'close', 'turnover_rate', 'volume_ratio', 'pe', 'pb', 'total_mv']);

      // 关键调整：
      // 1) 有效交易日判定不再强依赖 ths_hot（其更新常晚于行情日终数据）
      // 2) 使用 daily_basic + moneyflow_cnt_ths 作为当日可用的硬条件
      let conceptFlow = [];
      try {
        conceptFlow = await tushareRequest('moneyflow_cnt_ths', {
          trade_date: tradeDate,
        }, ['trade_date', 'ts_code', 'name', 'pct_change', 'net_amount']);
      } catch (_flowError) {
        conceptFlow = [];
      }

      const hasDailyBasic = rows.length > 0;
      const hasConceptFlow = Array.isArray(conceptFlow) && conceptFlow.length > 0;
      if (hasDailyBasic && hasConceptFlow) {
        console.log(`[market-data] 使用 Tushare 最近交易日：${tradeDate}`);
        return { tradeDate, source: 'tushare_realtime' };
      }
    } catch (error) {
      lastApiError = error;
      if (error instanceof MarketDataError && error.code === 'MISSING_TUSHARE_TOKEN') {
        // 无 token 时不允许静默降级
        throw error;
      }
    }
  }

  // 仅在 Tushare 失败时才回退本地快照日期
  const db = getDb();
  const dbResult = db.prepare(`
    SELECT MAX(trade_date) as latest FROM stock_factor_snapshot
  `).get();
  if (dbResult && dbResult.latest) {
    const latestDate = String(dbResult.latest);
    console.warn(`[market-data] Tushare 未找到有效交易日，降级数据库日期：${latestDate}`);
    return { tradeDate: latestDate, source: 'db_snapshot_fallback' };
  }

  if (lastApiError instanceof MarketDataError) {
    throw lastApiError;
  }
  throw new MarketDataError('最近 14 天内未获取到有效交易日数据。', {
    code: 'NO_TRADE_DATE',
  });
}

function toNumber(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length === 0) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function calculateSma(values, window, index) {
  if (index + 1 < window) return null;
  const slice = values.slice(index + 1 - window, index + 1);
  return average(slice);
}

function calculateStd(values, window, index) {
  if (index + 1 < window) return null;
  const slice = values.slice(index + 1 - window, index + 1);
  const mean = average(slice);
  const variance = average(slice.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function calculateTechnicalIndicators(dailyRows) {
  const rows = [...dailyRows]
    .map((row) => ({
      ...row,
      close: toNumber(row.close),
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      vol: toNumber(row.vol),
      amount: toNumber(row.amount),
      pct_chg: toNumber(row.pct_chg),
      pre_close: toNumber(row.pre_close),
    }))
    .sort((left, right) => String(left.trade_date).localeCompare(String(right.trade_date)));

  const closes = rows.map((row) => row.close);
  const ema12 = [];
  const ema26 = [];
  const deaList = [];
  const difList = [];
  const macdBarList = [];

  for (let index = 0; index < rows.length; index += 1) {
    const close = closes[index];
    ema12[index] = index === 0 ? close : (close * (2 / 13)) + (ema12[index - 1] * (11 / 13));
    ema26[index] = index === 0 ? close : (close * (2 / 27)) + (ema26[index - 1] * (25 / 27));
    difList[index] = ema12[index] - ema26[index];
    deaList[index] = index === 0 ? difList[index] : (difList[index] * 0.2) + (deaList[index - 1] * 0.8);
    macdBarList[index] = 2 * (difList[index] - deaList[index]);
  }

  const gains = [0];
  const losses = [0];
  for (let index = 1; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    gains[index] = delta > 0 ? delta : 0;
    losses[index] = delta < 0 ? Math.abs(delta) : 0;
  }

  return rows.map((row, index) => {
    const ma5 = calculateSma(closes, 5, index);
    const ma10 = calculateSma(closes, 10, index);
    const ma20 = calculateSma(closes, 20, index);
    const ma60 = calculateSma(closes, 60, index);
    const avgGain = calculateSma(gains, 14, index);
    const avgLoss = calculateSma(losses, 14, index);
    const rsi = avgGain === null || avgLoss === null
      ? null
      : avgLoss === 0
        ? 100
        : 100 - (100 / (1 + (avgGain / avgLoss)));
    const bbMiddle = ma20;
    const bbStd = calculateStd(closes, 20, index);
    const bbUpper = bbMiddle === null || bbStd === null ? null : bbMiddle + (bbStd * 2);
    const bbLower = bbMiddle === null || bbStd === null ? null : bbMiddle - (bbStd * 2);

    return {
      ...row,
      ma5,
      ma10,
      ma20,
      ma60,
      macd_dif: difList[index],
      macd_dea: deaList[index],
      macd_bar: macdBarList[index],
      rsi,
      bb_middle: bbMiddle,
      bb_upper: bbUpper,
      bb_lower: bbLower,
    };
  });
}

function analyzeTechnical(indicatorRows, realtimeQuote = null) {
  const latest = indicatorRows[indicatorRows.length - 1];
  const previous = indicatorRows[indicatorRows.length - 2] || latest;
  const price = realtimeQuote ? toNumber(realtimeQuote.price, latest.close) : latest.close;
  const change = realtimeQuote
    ? toNumber(realtimeQuote.change, price - latest.pre_close)
    : price - latest.pre_close;
  const pctChange = realtimeQuote
    ? toNumber(realtimeQuote.percent, latest.pct_chg)
    : latest.pct_chg;

  const maSignal = price > latest.ma5 && latest.ma5 > latest.ma10 && latest.ma10 > latest.ma20
    ? '多头排列（趋势偏强）'
    : price < latest.ma5 && latest.ma5 < latest.ma10 && latest.ma10 < latest.ma20
      ? '空头排列（趋势偏弱）'
      : '均线缠绕（震荡整理）';

  const macdSignal = previous.macd_dif <= previous.macd_dea && latest.macd_dif > latest.macd_dea
    ? 'MACD 金叉'
    : previous.macd_dif >= previous.macd_dea && latest.macd_dif < latest.macd_dea
      ? 'MACD 死叉'
      : latest.macd_dif >= latest.macd_dea
        ? 'MACD 多头延续'
        : 'MACD 空头延续';

  const rsiSignal = latest.rsi === null
    ? '样本不足'
    : latest.rsi >= 80
      ? '超买，留意回撤'
      : latest.rsi >= 60
        ? '强势区间'
        : latest.rsi >= 40
          ? '中性区间'
          : latest.rsi >= 20
            ? '偏弱区间'
            : '超卖，留意反弹';

  const bollSignal = latest.bb_upper !== null && price > latest.bb_upper
    ? '突破上轨，短线偏热'
    : latest.bb_lower !== null && price < latest.bb_lower
      ? '跌破下轨，短线超跌'
      : '布林带中轨附近运行';

  return {
    latest,
    price,
    change,
    pctChange,
    high: realtimeQuote ? toNumber(realtimeQuote.high, latest.high) : latest.high,
    low: realtimeQuote ? toNumber(realtimeQuote.low, latest.low) : latest.low,
    open: realtimeQuote ? toNumber(realtimeQuote.openPrice, latest.open) : latest.open,
    preClose: realtimeQuote ? toNumber(realtimeQuote.preClose, latest.pre_close) : latest.pre_close,
    volume: realtimeQuote ? toNumber(realtimeQuote.volume, latest.vol * 100) / 100 : latest.vol,
    amount: realtimeQuote ? toNumber(realtimeQuote.amount, latest.amount) : latest.amount,
    maSignal,
    macdSignal,
    rsiSignal,
    bollSignal,
  };
}

function normalizeCnSymbol(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  if (/^(sh|sz|bj)\d{6}$/.test(raw)) return raw;
  if (/^\d{6}$/.test(raw)) {
    if (raw.startsWith('6') || raw.startsWith('9')) return `sh${raw}`;
    if (raw.startsWith('8') || raw.startsWith('4')) return `bj${raw}`;
    return `sz${raw}`;
  }
  if (/^\d{6}\.(sh|sz|bj)$/i.test(raw)) {
    const [symbol, market] = raw.split('.');
    return `${market}${symbol}`;
  }
  return raw;
}

function normalizeTsCode(input) {
  const raw = String(input || '').trim().toUpperCase();
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(raw)) return raw;
  if (/^(SH|SZ|BJ)\d{6}$/.test(raw)) return `${raw.slice(2)}.${raw.slice(0, 2)}`;
  if (/^\d{6}$/.test(raw)) {
    if (raw.startsWith('6') || raw.startsWith('9')) return `${raw}.SH`;
    if (raw.startsWith('8') || raw.startsWith('4')) return `${raw}.BJ`;
    return `${raw}.SZ`;
  }
  return raw;
}

function toSymbol(tsCode) {
  const normalized = normalizeTsCode(tsCode);
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(normalized)) {
    return normalized.slice(0, 6);
  }
  return normalized;
}

function dedupeStockRows(rows, limit = 10) {
  const result = [];
  const seen = new Set();

  for (const row of rows || []) {
    const tsCode = normalizeTsCode(row.ts_code || row.code || '');
    if (!tsCode || seen.has(tsCode)) {
      continue;
    }
    seen.add(tsCode);
    result.push({
      ts_code: tsCode,
      symbol: toSymbol(tsCode),
      name: row.name || row.stock_name || row.ts_name || tsCode,
      industry: row.industry || row.industry_name_l1 || ''
    });
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function searchStocksFromLocalDb(query, limit = 10) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    return [];
  }

  const db = getDb();
  const tsCode = normalizeTsCode(normalizedQuery);
  const symbol = toSymbol(tsCode);
  const likeQuery = `%${normalizedQuery}%`;
  const likeSymbol = `%${symbol}%`;

  const localRows = [];

  try {
    const fromStocks = db.prepare(`
      SELECT ts_code, stock_name AS name, industry_name_l1 AS industry
      FROM stocks
      WHERE (list_status IS NULL OR list_status = 'L')
        AND (
          ts_code = @tsCode
          OR ts_code LIKE @likeQuery
          OR stock_name LIKE @likeQuery
          OR ts_code LIKE @likeSymbol
        )
      ORDER BY CASE
        WHEN ts_code = @tsCode THEN 0
        WHEN stock_name = @query THEN 1
        ELSE 2
      END, ts_code
      LIMIT @limit
    `).all({
      tsCode,
      query: normalizedQuery,
      likeQuery,
      likeSymbol,
      limit
    });
    localRows.push(...fromStocks);
  } catch (_error) {
    // 忽略本地表异常，继续尝试 stock_list
  }

  if (localRows.length < limit) {
    try {
      const fromStockList = db.prepare(`
        SELECT ts_code, stock_name AS name, '' AS industry
        FROM stock_list
        WHERE (status IS NULL OR status = 'L')
          AND (
            ts_code = @tsCode
            OR ts_code LIKE @likeQuery
            OR stock_name LIKE @likeQuery
            OR ts_code LIKE @likeSymbol
          )
        ORDER BY CASE
          WHEN ts_code = @tsCode THEN 0
          WHEN stock_name = @query THEN 1
          ELSE 2
        END, ts_code
        LIMIT @limit
      `).all({
        tsCode,
        query: normalizedQuery,
        likeQuery,
        likeSymbol,
        limit: Math.max(1, limit - localRows.length)
      });
      localRows.push(...fromStockList);
    } catch (_error) {
      // 忽略本地表异常，外层会继续走 Tushare 兜底
    }
  }

  return dedupeStockRows(localRows, limit);
}

// 已弃用：runSinaScript - 改用免费 API
// async function runSinaScript(scriptName, args = []) { ... }

async function searchStock(query) {
  let normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    throw new MarketDataError('缺少股票代码或名称。', {
      code: 'MISSING_STOCK_QUERY',
      status: 400,
    });
  }

  // 自动补充后缀（问题#2 修复）
  let maybeCode = normalizedQuery;
  if (!/^\d{6}\.(SH|SZ|BJ)$/.test(normalizedQuery) && /^\d{6}$/.test(normalizedQuery)) {
    if (normalizedQuery.startsWith('6') || normalizedQuery.startsWith('9')) {
      maybeCode = normalizedQuery + '.SH';
    } else if (normalizedQuery.startsWith('3') || normalizedQuery.startsWith('0')) {
      maybeCode = normalizedQuery + '.SZ';
    } else if (normalizedQuery.startsWith('4') || normalizedQuery.startsWith('8')) {
      maybeCode = normalizedQuery + '.BJ';
    }
  }
  maybeCode = normalizeTsCode(maybeCode);

  // 优先本地库命中，避免外部接口不可用导致“总是搜不到”
  const localMatches = searchStocksFromLocalDb(normalizedQuery, 5);
  if (localMatches.length > 0) {
    const exact = localMatches.find((item) => item.ts_code === maybeCode)
      || localMatches.find((item) => item.symbol === normalizedQuery)
      || localMatches.find((item) => String(item.name || '') === normalizedQuery);
    return exact || localMatches[0];
  }

  if (/^\d{6}\.(SH|SZ|BJ)$/.test(maybeCode)) {
    const rows = await tushareRequest('stock_basic', {
      ts_code: maybeCode,
      list_status: 'L',
    }, ['ts_code', 'symbol', 'name', 'industry', 'area', 'market', 'list_date']);
    if (rows.length > 0) {
      return rows[0];
    }
  }

  // 已移除收费 MCP 搜索，直接使用 Tushare 搜索
  // 免费新浪 API 无搜索功能

  const rows = await tushareRequest('stock_basic', {
    exchange: '',
    list_status: 'L',
  }, ['ts_code', 'symbol', 'name', 'industry', 'area', 'market', 'list_date']);

  const matched = rows.find((item) => item.name === normalizedQuery)
    || rows.find((item) => String(item.name || '').includes(normalizedQuery));
  if (!matched) {
    throw new MarketDataError(`未找到股票：${normalizedQuery}`, {
      code: 'STOCK_NOT_FOUND',
      status: 404,
    });
  }
  return matched;
}

/**
 * 模糊搜索股票（返回多个结果）
 */
async function searchStocks(query, limit = 10) {
  const rawQuery = String(query || '').trim();
  if (!rawQuery) {
    return [];
  }
  const normalizedQuery = rawQuery.toLowerCase();

  const results = searchStocksFromLocalDb(rawQuery, limit);
  const seen = new Set(results.map((item) => item.ts_code));

  // 兜底：本地库不足时再使用 Tushare
  if (results.length < limit) {
    try {
      const rows = await tushareRequest('stock_basic', {
        exchange: '',
        list_status: 'L',
      }, ['ts_code', 'symbol', 'name', 'industry']);

      for (const row of rows) {
        if (results.length >= limit) break;
        const nameLower = String(row.name || '').toLowerCase();
        const codeLower = String(row.ts_code || '').toLowerCase();
        const symbolLower = String(row.symbol || '').toLowerCase();

        if (
          nameLower.includes(normalizedQuery) ||
          codeLower.includes(normalizedQuery) ||
          symbolLower === normalizedQuery ||
          symbolLower.includes(normalizedQuery.replace(/^0+/, ''))
        ) {
          if (!seen.has(row.ts_code)) {
            seen.add(row.ts_code);
            results.push({
              ts_code: row.ts_code,
              name: row.name,
              symbol: row.symbol,
              industry: row.industry || '',
            });
          }
        }
      }
    } catch (_error) {
      // 忽略错误
    }
  }

  return results;
}

async function getRealtimeQuote(tsCode) {
  const symbol = sinaFreeApi.normalizeSymbol(tsCode);
  try {
    const quote = await sinaFreeApi.getQuote(symbol);
    return {
      code: 0,
      data: {
        symbol: quote.symbol,
        name: quote.name,
        price: quote.price,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        close: quote.close,
        volume: quote.volume,
        amount: quote.amount,
        percent: quote.percent,
        change: quote.change,
        time: quote.time,
        date: quote.date
      }
    };
  } catch (error) {
    throw new MarketDataError(`新浪财经实时行情失败：${error.message}`, {
      code: 'SINA_QUOTE_ERROR',
    });
  }
}

async function getDailyHistory(tsCode, lookbackDays = 240) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - lookbackDays * 1.6);
  const rows = await tushareRequest('daily', {
    ts_code: normalizeTsCode(tsCode),
    start_date: formatDate(start),
    end_date: formatDate(end),
  }, ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'pre_close', 'change', 'pct_chg', 'vol', 'amount']);

  if (rows.length === 0) {
    throw new MarketDataError(`未获取到 ${tsCode} 的历史行情。`, {
      code: 'EMPTY_DAILY_HISTORY',
      status: 404,
    });
  }

  return rows;
}

async function getLatestDailyBasic(tsCode) {
  const rows = await tushareRequest('daily_basic', {
    ts_code: normalizeTsCode(tsCode),
  }, ['ts_code', 'trade_date', 'close', 'turnover_rate', 'volume_ratio', 'pe', 'pe_ttm', 'pb', 'ps', 'total_mv', 'circ_mv', 'dv_ttm']);
  return rows[0] || null;
}

async function getIncomeRows(tsCode) {
  return tushareRequest('income', {
    ts_code: normalizeTsCode(tsCode),
  }, ['ts_code', 'ann_date', 'end_date', 'total_revenue', 'revenue', 'n_income', 'operate_profit', 'basic_eps']);
}

async function getFinaIndicatorRows(tsCode) {
  return tushareRequest('fina_indicator', {
    ts_code: normalizeTsCode(tsCode),
  }, ['ts_code', 'ann_date', 'end_date', 'roe', 'grossprofit_margin', 'debt_to_assets', 'netprofit_yoy', 'tr_yoy', 'q_sales_yoy', 'q_dt_roe', 'rd_exp']);
}

async function getMoneyflowThsRows(tsCode, tradeDate) {
  const rows = await tushareRequest('moneyflow_ths', {
    ts_code: normalizeTsCode(tsCode),
    start_date: tradeDate,
    end_date: tradeDate,
  }, ['trade_date', 'ts_code', 'name', 'pct_change', 'latest', 'net_amount', 'net_d5_amount', 'buy_lg_amount', 'buy_lg_amount_rate', 'buy_md_amount', 'buy_md_amount_rate', 'buy_sm_amount', 'buy_sm_amount_rate']);
  return rows;
}

async function getMoneyflowRows(tsCode, tradeDate) {
  const rows = await tushareRequest('moneyflow', {
    ts_code: normalizeTsCode(tsCode),
    start_date: tradeDate,
    end_date: tradeDate,
  }, ['ts_code', 'trade_date', 'buy_lg_amount', 'sell_lg_amount', 'buy_elg_amount', 'sell_elg_amount', 'net_mf_amount']);
  return rows;
}

async function getHolderNumberRows(tsCode) {
  return tushareRequest('stk_holdernumber', {
    ts_code: normalizeTsCode(tsCode),
  }, ['ts_code', 'ann_date', 'end_date', 'holder_num']);
}

async function getMarginDetailRows(tsCode) {
  return tushareRequest('margin_detail', {
    ts_code: normalizeTsCode(tsCode),
  }, ['trade_date', 'ts_code', 'rzye', 'rqye', 'rzrqye']);
}

async function getNorthMoneyRows(endDate, lookbackDays = 20) {
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays * 2);
  return tushareRequest('moneyflow_hsgt', {
    start_date: formatDate(start),
    end_date: endDate,
  }, ['trade_date', 'north_money', 'south_money', 'hgt', 'sgt']);
}

async function getSelectionDatasets() {
  const tradeDateResult = await findLatestTradeDate();
  const tradeDate = typeof tradeDateResult === 'string' ? tradeDateResult : tradeDateResult.tradeDate;
  const tradeDateSource = typeof tradeDateResult === 'string' ? 'unknown' : tradeDateResult.source;
  const ipoStart = new Date();
  ipoStart.setDate(ipoStart.getDate() - 365);

  const [stockBasic, thsIndex, dailyBasic, ipoRows] = await Promise.all([
    tushareRequest('stock_basic', {
      exchange: '',
      list_status: 'L',
    }, ['ts_code', 'symbol', 'name', 'area', 'industry', 'market', 'list_date']),
    tushareRequest('ths_index', {
      exchange: 'A',
    }, ['ts_code', 'name', 'count', 'exchange', 'list_date', 'type']),
    tushareRequest('daily_basic', {
      trade_date: tradeDate,
    }, ['ts_code', 'trade_date', 'close', 'turnover_rate', 'volume_ratio', 'pe', 'pe_ttm', 'pb', 'ps', 'total_mv']),
    tushareRequest('new_share', {
      start_date: formatDate(ipoStart),
      end_date: tradeDate,
    }, ['ts_code', 'name', 'ipo_date', 'issue_date', 'amount', 'market_amount', 'price', 'pe', 'funds']),
  ]);

  let conceptFlow = [];
  let conceptHot = [];
  try {
    conceptFlow = await tushareRequest('moneyflow_cnt_ths', {
      trade_date: tradeDate,
    }, ['trade_date', 'ts_code', 'name', 'lead_stock', 'close_price', 'pct_change', 'industry_index', 'company_num', 'pct_change_stock', 'net_buy_amount', 'net_sell_amount', 'net_amount']);
  } catch (_error) {
    conceptFlow = [];
  }

  try {
    conceptHot = await tushareRequest('ths_hot', {
      trade_date: tradeDate,
      market: '概念板块',
    }, ['trade_date', 'ts_code', 'ts_name', 'rank', 'hot', 'rank_reason']);
    
    // 如果当前日期没有热度数据，尝试前一交易日（休市日场景）
    if (!conceptHot || conceptHot.length === 0) {
      // tradeDate 格式：20260324，需要转换为 Date 对象
      const dateStr = String(tradeDate);
      const year = parseInt(dateStr.slice(0, 4));
      const month = parseInt(dateStr.slice(4, 6)) - 1;
      const day = parseInt(dateStr.slice(6, 8)) - 1; // 减 1 天
      const prevDate = new Date(year, month, day);
      const prevTradeDate = formatDate(prevDate);
      console.log(`[market-data] ${tradeDate} 无热度数据，尝试 ${prevTradeDate}`);
      conceptHot = await tushareRequest('ths_hot', {
        trade_date: prevTradeDate,
        market: '概念板块',
      }, ['trade_date', 'ts_code', 'ts_name', 'rank', 'hot', 'rank_reason']);
    }
  } catch (_error) {
    conceptHot = [];
  }

  return {
    tradeDate,
    tradeDateSource,
    stockBasic,
    thsIndex,
    dailyBasic,
    ipoRows,
    conceptFlow,
    conceptHot,
  };
}

// 计算ATR (Average True Range)
function calculateATR(dailyRows, period = 20) {
  if (!Array.isArray(dailyRows) || dailyRows.length < period + 1) {
    return null;
  }

  // 按日期排序
  const sorted = [...dailyRows].sort((a, b) =>
    String(a.trade_date).localeCompare(String(b.trade_date))
  );

  // 计算真实波动 TR
  const trValues = [];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = sorted[i - 1];

    const high = toNumber(current.high);
    const low = toNumber(current.low);
    const prevClose = toNumber(prev.close);

    const hl = high - low;
    const hc = Math.abs(high - prevClose);
    const lc = Math.abs(low - prevClose);

    trValues.push(Math.max(hl, hc, lc));
  }

  if (trValues.length < period) {
    return null;
  }

  // 计算ATR（简单移动平均）
  const atrValues = [];
  for (let i = period - 1; i < trValues.length; i++) {
    const slice = trValues.slice(i - period + 1, i + 1);
    const atr = slice.reduce((a, b) => a + b, 0) / period;
    atrValues.push(atr);
  }

  return {
    atr_14: null, // 暂不计算14日
    atr_20: atrValues[atrValues.length - 1],
    atr_20_list: atrValues,
    trade_date: sorted[sorted.length - 1].trade_date
  };
}

// 获取行业PE中位数
async function getIndustryPeMedian(industryName, tradeDate) {
  try {
    const valuationService = require('./valuation-service');
    const result = tradeDate
      ? await valuationService.getIndustryValuation(industryName, tradeDate)
      : await valuationService.getLatestIndustryValuation(industryName);

    return result ? result.pe_median : null;
  } catch (error) {
    console.warn(`[MarketData] Failed to get industry PE for ${industryName}:`, error.message);
    return null;
  }
}

// 获取个股历史PE分位数
async function getStockPePercentile(tsCode) {
  try {
    const valuationService = require('./valuation-service');
    const result = await valuationService.getStockPeHistory(tsCode);

    if (!result) return null;

    return {
      percentile5y: result.pe_percentile_5y,
      percentile3y: result.pe_percentile_3y,
      percentile1y: result.pe_percentile_1y,
      min5y: result.pe_min_5y,
      max5y: result.pe_max_5y,
      avg5y: result.pe_avg_5y
    };
  } catch (error) {
    console.warn(`[MarketData] Failed to get PE percentile for ${tsCode}:`, error.message);
    return null;
  }
}

// 获取ATR数据
async function getATR(tsCode, tradeDate) {
  try {
    const valuationService = require('./valuation-service');
    const result = tradeDate
      ? await valuationService.getStockAtr(tsCode, tradeDate)
      : await valuationService.getLatestStockAtr(tsCode);

    if (result) {
      return {
        atr14: result.atr_14,
        atr20: result.atr_20,
        tradeDate: result.trade_date
      };
    }

    // 如果缓存中没有，实时计算
    const dailyRows = await getDailyHistory(tsCode);
    const atr = calculateATR(dailyRows, 20);

    if (atr) {
      // 保存到缓存
      await valuationService.saveStockAtr({
        ts_code: tsCode,
        atr_14: atr.atr_14,
        atr_20: atr.atr_20,
        trade_date: atr.trade_date
      });

      return {
        atr14: atr.atr_14,
        atr20: atr.atr_20,
        tradeDate: atr.trade_date
      };
    }

    return null;
  } catch (error) {
    console.warn(`[MarketData] Failed to get ATR for ${tsCode}:`, error.message);
    return null;
  }
}

module.exports = {
  MarketDataError,
  analyzeTechnical,
  calculateATR,
  calculateTechnicalIndicators,
  findLatestTradeDate,
  formatDate,
  getATR,
  getDailyHistory,
  getFinaIndicatorRows,
  getHolderNumberRows,
  getIncomeRows,
  getIndustryPeMedian,
  getLatestDailyBasic,
  getMarginDetailRows,
  getMoneyflowRows,
  getMoneyflowThsRows,
  getNorthMoneyRows,
  getRealtimeQuote,
  getSelectionDatasets,
  getStockPePercentile,
  normalizeCnSymbol,
  normalizeTsCode,
  searchStock,
  searchStocks,
  toNumber,
  tushareRequest,
};
