/**
 * 行业成分股 API
 * 提供按行业名称或代码获取成分股列表的功能
 */

const express = require('express');
const { tushareRequest, toNumber } = require('./market-data');

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
 *   industry: {
 *     name: "储能",
 *     ts_code: "BK0001",
 *     companyCount: 150
 *   },
 *   stocks: [
 *     {
 *       code: "300750.SZ",
 *       name: "宁德时代",
 *       industry: "电池",
 *       total_mv: 1234567.89,
 *       turnover_rate: 2.5,
 *       volume_ratio: 1.2,
 *       pe_ttm: 25.3
 *     }
 *   ]
 * }
 */
router.get('/:name/stocks', async (req, res) => {
  try {
    const { name } = req.params;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: '缺少行业名称参数',
        stocks: [],
      });
    }
    
    // 首先需要获取行业的 ts_code
    // 通过 select API 获取所有行业方向，然后匹配名称
    const directions = await getDirections();
    const direction = directions.find(d => d.name === name);
    
    if (!direction) {
      return res.status(404).json({
        success: false,
        message: `未找到行业：${name}`,
        stocks: [],
      });
    }
    
    // 获取成分股列表
    const members = await tushareRequest('ths_member', {
      ts_code: direction.ts_code,
    }, ['ts_code', 'con_code', 'con_name']);
    
    // 获取实时行情数据
    const dailyBasicMap = await getDailyBasicMap(members.map(m => m.con_code));
    const stockBasicMap = await getStockBasicMap(members.map(m => m.con_code));
    
    // 构建成分股列表
    const stocks = members
      .map((member) => {
        const quote = dailyBasicMap.get(member.con_code) || {};
        const basic = stockBasicMap.get(member.con_code) || {};
        return {
          code: member.con_code,
          name: member.con_name,
          industry: basic.industry || '',
          total_mv: toNumber(quote.total_mv) / 10000,
          turnover_rate: toNumber(quote.turnover_rate),
          volume_ratio: toNumber(quote.volume_ratio),
          pe_ttm: toNumber(quote.pe_ttm),
        };
      })
      .filter((item) => item.total_mv > 0)
      .sort((left, right) => {
        if (right.total_mv !== left.total_mv) return right.total_mv - left.total_mv;
        if (right.volume_ratio !== left.volume_ratio) return right.volume_ratio - left.volume_ratio;
        return left.code.localeCompare(right.code, 'zh-CN');
      });
    
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
 * 获取行业方向列表（通过 HTTP 调用 select API，避免循环依赖）
 */
async function getDirections() {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/select');
    const data = await response.json();
    return data.directions || [];
  } catch (error) {
    console.warn('[获取行业方向列表] 失败:', error.message);
    return [];
  }
}

module.exports = router;
