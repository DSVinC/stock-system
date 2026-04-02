#!/usr/bin/env node
/**
 * 估值数据更新脚本
 * 定时更新行业PE/PB中位数、历史PE分位数等数据
 *
 * 用法:
 *   node update_valuation_data.mjs --type=industry    # 更新行业估值
 *   node update_valuation_data.mjs --type=pe          # 更新历史PE分位数
 *   node update_valuation_data.mjs --type=atr         # 更新ATR数据
 *   node update_valuation_data.mjs --type=all         # 更新所有
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 Tushare 配置
const workspaceRequire = createRequire('/Users/vvc/.openclaw/workspace/skills/tushare-data/package.json');
const axios = workspaceRequire('axios');

const TUSHARE_TOKEN = process.env.TUSHARE_TOKEN || '';
const TUSHARE_API = 'https://api.tushare.pro';

// 解析命令行参数
const args = process.argv.slice(2);
const updateType = args.find(arg => arg.startsWith('--type='))?.split('=')[1] || 'all';
const specificDate = args.find(arg => arg.startsWith('--date='))?.split('=')[1];

// 引入 valuation-service
const valuationServicePath = path.join(__dirname, '..', 'api', 'valuation-service.js');
const {
  batchSaveIndustryValuation,
  saveStockPeHistory,
  saveStockAtr,
  logUpdate,
  getLatestIndustryValuation
} = await import('file://' + valuationServicePath);

// Tushare API 调用
async function callTushare(apiName, params = {}) {
  const response = await axios.post(TUSHARE_API, {
    api_name: apiName,
    token: TUSHARE_TOKEN,
    params: params,
    fields: ''
  });

  if (response.data.code !== 0) {
    throw new Error(`Tushare API error: ${response.data.msg}`);
  }

  return response.data.data;
}

// 转换 Tushare 返回格式
function parseTushareData(data) {
  const { fields, items } = data;
  return items.map(item => {
    const obj = {};
    fields.forEach((field, index) => {
      obj[field] = item[index];
    });
    return obj;
  });
}

// 获取最新交易日
async function getLatestTradeDate() {
  const data = await callTushare('trade_cal', {
    exchange: 'SSE',
    start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, ''),
    end_date: new Date().toISOString().slice(0, 10).replace(/-/g, '')
  });

  const items = parseTushareData(data);
  const tradeDays = items.filter(item => item.is_open === 1);
  return tradeDays[tradeDays.length - 1]?.cal_date;
}

// 更新行业估值数据
async function updateIndustryValuation(tradeDate) {
  console.log(`[UpdateIndustry] Starting update for ${tradeDate}...`);

  try {
    // 获取所有股票的 daily_basic 数据
    const data = await callTushare('daily_basic', {
      trade_date: tradeDate,
      fields: 'ts_code,trade_date,pe,pb,ps,total_mv,industry'
    });

    const stocks = parseTushareData(data);
    console.log(`[UpdateIndustry] Fetched ${stocks.length} stocks`);

    // 按行业分组计算中位数
    const industryMap = new Map();

    stocks.forEach(stock => {
      if (!stock.industry) return;

      if (!industryMap.has(stock.industry)) {
        industryMap.set(stock.industry, {
          peList: [],
          pbList: [],
          psList: [],
          count: 0
        });
      }

      const industry = industryMap.get(stock.industry);
      if (stock.pe > 0) industry.peList.push(stock.pe);
      if (stock.pb > 0) industry.pbList.push(stock.pb);
      if (stock.ps > 0) industry.psList.push(stock.ps);
      industry.count++;
    });

    // 计算中位数
    const calculateMedian = (arr) => {
      if (arr.length === 0) return null;
      const sorted = arr.sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    };

    const industryList = [];
    industryMap.forEach((data, industryName) => {
      industryList.push({
        industry_name: industryName,
        pe_median: calculateMedian(data.peList),
        pb_median: calculateMedian(data.pbList),
        ps_median: calculateMedian(data.psList),
        stock_count: data.count,
        trade_date: tradeDate
      });
    });

    // 保存到数据库
    await batchSaveIndustryValuation(industryList);
    await logUpdate('industry', tradeDate, industryList.length, 'success');

    console.log(`[UpdateIndustry] Updated ${industryList.length} industries`);
    return industryList.length;

  } catch (error) {
    console.error(`[UpdateIndustry] Error: ${error.message}`);
    await logUpdate('industry', tradeDate, 0, 'failed', error.message);
    throw error;
  }
}

// 更新个股历史PE分位数
async function updatePeHistory(tsCode) {
  console.log(`[UpdatePE] Starting update for ${tsCode}...`);

  try {
    const endDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const startDate5y = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');

    // 获取5年历史数据
    const data = await callTushare('daily_basic', {
      ts_code: tsCode,
      start_date: startDate5y,
      end_date: endDate,
      fields: 'trade_date,pe_ttm'
    });

    const history = parseTushareData(data);
    const peList = history.map(h => h.pe_ttm).filter(pe => pe > 0);

    if (peList.length === 0) {
      console.log(`[UpdatePE] No valid PE data for ${tsCode}`);
      return null;
    }

    // 计算分位数
    const currentPE = peList[peList.length - 1];
    const sortedPE = peList.sort((a, b) => a - b);

    const calculatePercentile = (value, sortedArr) => {
      const count = sortedArr.filter(v => v <= value).length;
      return count / sortedArr.length;
    };

    const peData = {
      ts_code: tsCode,
      pe_percentile_5y: calculatePercentile(currentPE, sortedPE),
      pe_percentile_3y: calculatePercentile(currentPE, sortedPE.slice(-Math.floor(peList.length * 0.6))),
      pe_percentile_1y: calculatePercentile(currentPE, sortedPE.slice(-Math.floor(peList.length * 0.2))),
      pe_min_5y: sortedPE[0],
      pe_max_5y: sortedPE[sortedPE.length - 1],
      pe_avg_5y: sortedPE.reduce((a, b) => a + b, 0) / sortedPE.length
    };

    await saveStockPeHistory(peData);
    console.log(`[UpdatePE] Updated ${tsCode}: 5y percentile ${(peData.pe_percentile_5y * 100).toFixed(2)}%`);

    return peData;

  } catch (error) {
    console.error(`[UpdatePE] Error for ${tsCode}: ${error.message}`);
    throw error;
  }
}

// 计算ATR
function calculateATR(dailyRows, period = 20) {
  if (dailyRows.length < period + 1) return null;

  // 计算真实波动 TR
  const trValues = [];
  for (let i = 1; i < dailyRows.length; i++) {
    const current = dailyRows[i];
    const prev = dailyRows[i - 1];

    const hl = current.high - current.low;
    const hc = Math.abs(current.high - prev.close);
    const lc = Math.abs(current.low - prev.close);

    trValues.push(Math.max(hl, hc, lc));
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
    trade_date: dailyRows[dailyRows.length - 1].trade_date
  };
}

// 更新ATR数据
async function updateATR(tsCode) {
  console.log(`[UpdateATR] Starting update for ${tsCode}...`);

  try {
    // 获取日线数据
    const endDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');

    const data = await callTushare('daily', {
      ts_code: tsCode,
      start_date: startDate,
      end_date: endDate,
      fields: 'trade_date,open,high,low,close'
    });

    const dailyRows = parseTushareData(data);

    if (dailyRows.length < 21) {
      console.log(`[UpdateATR] Insufficient data for ${tsCode}: ${dailyRows.length} days`);
      return null;
    }

    // 按日期排序
    dailyRows.sort((a, b) => a.trade_date.localeCompare(b.trade_date));

    const atr = calculateATR(dailyRows, 20);
    if (!atr) {
      console.log(`[UpdateATR] Failed to calculate ATR for ${tsCode}`);
      return null;
    }

    const atrData = {
      ts_code: tsCode,
      atr_14: atr.atr_14,
      atr_20: atr.atr_20,
      trade_date: atr.trade_date
    };

    await saveStockAtr(atrData);
    console.log(`[UpdateATR] Updated ${tsCode}: ATR20=${atr.atr_20.toFixed(4)}`);

    return atrData;

  } catch (error) {
    console.error(`[UpdateATR] Error for ${tsCode}: ${error.message}`);
    throw error;
  }
}

// 主函数
async function main() {
  console.log(`[UpdateValuation] Starting update: type=${updateType}`);

  try {
    const tradeDate = specificDate || await getLatestTradeDate();
    console.log(`[UpdateValuation] Trade date: ${tradeDate}`);

    let results = {};

    if (updateType === 'all' || updateType === 'industry') {
      results.industry = await updateIndustryValuation(tradeDate);
    }

    if (updateType === 'all' || updateType === 'pe') {
      // PE历史需要指定个股，这里示例更新一只
      console.log('[UpdateValuation] PE history update requires specific stock code');
      console.log('[UpdateValuation] Usage: node update_valuation_data.mjs --type=pe --code=000001.SZ');
    }

    if (updateType === 'all' || updateType === 'atr') {
      // ATR需要指定个股
      console.log('[UpdateValuation] ATR update requires specific stock code');
      console.log('[UpdateValuation] Usage: node update_valuation_data.mjs --type=atr --code=000001.SZ');
    }

    console.log('[UpdateValuation] Update completed:', results);

  } catch (error) {
    console.error('[UpdateValuation] Fatal error:', error.message);
    process.exit(1);
  }
}

// 如果指定了个股代码
const stockCode = args.find(arg => arg.startsWith('--code='))?.split('=')[1];
if (stockCode) {
  if (updateType === 'pe') {
    updatePeHistory(stockCode).then(() => {
      console.log('[UpdateValuation] PE history update completed');
    }).catch(err => {
      console.error('[UpdateValuation] PE history update failed:', err.message);
      process.exit(1);
    });
  } else if (updateType === 'atr') {
    updateATR(stockCode).then(() => {
      console.log('[UpdateValuation] ATR update completed');
    }).catch(err => {
      console.error('[UpdateValuation] ATR update failed:', err.message);
      process.exit(1);
    });
  }
} else {
  main();
}