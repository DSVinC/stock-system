/**
 * 行业成分股 API
 * 提供按行业名称或代码获取成分股列表的功能
 */

const express = require('express');
const { tushareRequest, toNumber } = require('./market-data');
const selectApi = require('./select');

const router = express.Router();

/**
 * GET /api/industry/:name/stocks
 * 获取指定行业的成分股列表
 * 
 * 参数:
 * - name: 行业名称（如"储能"、"人工智能"）
 * 
 * 返回:
 * {
 *   success: true,
 *   industry: {...},
 *   stocks: [...]
 * }
 */
router.get('/:name/stocks', async (req, res) => {
  try {
    const { name } = req.params;
    console.log('[行业成分股 API] 请求行业:', name);
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '缺少行业名称参数',
        stocks: [],
      });
    }
    
    // 直接从 select API 获取完整的行业数据（包含 picks）
    console.log('[行业成分股 API] 调用 selectApi.buildSelectionPayload()...');
    const selectData = await selectApi.buildSelectionPayload();
    const direction = selectData.directions.find(d => d.name === name);
    console.log('[行业成分股 API] direction:', direction ? direction.name : '未找到');
    
    if (!direction) {
      return res.status(404).json({
        success: false,
        message: `未找到行业：${name}`,
        stocks: [],
      });
    }
    
    // 直接使用 select API 已经获取的 picks 数据
    const stocks = direction.picks || [];
    console.log('[行业成分股 API] stocks 数量:', stocks.length);
    
    res.json({
      success: true,
      industry: {
        name: direction.name,
        ts_code: direction.ts_code,
        companyCount: stocks.length,
      },
      stocks,
    });
  } catch (error) {
    console.error('[行业成分股 API] 错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取成分股失败',
      stocks: [],
    });
  }
});

/**
 * 获取日线基本面数据
 */
async function getDailyBasicMap(codes) {
  try {
    const data = await tushareRequest('daily_basic', {
      trade_date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      ts_code: codes.join(','),
    }, ['ts_code', 'total_mv', 'turnover_rate', 'volume_ratio', 'pe_ttm']);
    
    const map = new Map();
    data.forEach(item => {
      map.set(item.ts_code, item);
    });
    return map;
  } catch (error) {
    console.warn('[获取日线基本面] 失败:', error.message);
    return new Map();
  }
}

/**
 * 获取股票基本信息
 */
async function getStockBasicMap(codes) {
  try {
    const data = await tushareRequest('stock_basic', {
      ts_code: codes.join(','),
    }, ['ts_code', 'industry']);
    
    const map = new Map();
    data.forEach(item => {
      map.set(item.ts_code, item);
    });
    return map;
  } catch (error) {
    console.warn('[获取股票基本信息] 失败:', error.message);
    return new Map();
  }
}

/**
 * 获取行业方向列表（直接调用 select.js）
 */
async function getDirections() {
  try {
    const data = await selectApi.buildSelectionPayload();
    return data.directions || [];
  } catch (error) {
    console.warn('[获取行业方向列表] 失败:', error.message);
    return [];
  }
}

module.exports = router;
