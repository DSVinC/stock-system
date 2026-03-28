/**
 * 交易日查询 API
 * 从 stock_factor_snapshot 表获取所有交易日列表
 */

const { getDatabase } = require('./db');

/**
 * 将 YYYYMMDD 格式转换为 YYYY-MM-DD
 */
function formatDateString(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

/**
 * 将 YYYY-MM-DD 格式转换为 YYYYMMDD
 */
function parseDateString(dateStr) {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  return dateStr.replace(/-/g, '');
}

/**
 * 获取所有交易日列表
 * GET /api/trading-days
 * Query params:
 *   - startDate: 可选，开始日期 (YYYY-MM-DD)
 *   - endDate: 可选，结束日期 (YYYY-MM-DD)
 */
async function getTradingDays(req, res) {
  try {
    const db = getDatabase();
    const { startDate, endDate } = req.query;

    let sql = 'SELECT DISTINCT trade_date FROM stock_factor_snapshot';
    const params = [];

    // 转换日期格式用于数据库查询
    const dbStartDate = startDate ? parseDateString(startDate) : null;
    const dbEndDate = endDate ? parseDateString(endDate) : null;

    if (dbStartDate && dbEndDate) {
      sql += ' WHERE trade_date >= ? AND trade_date <= ?';
      params.push(dbStartDate, dbEndDate);
    } else if (dbStartDate) {
      sql += ' WHERE trade_date >= ?';
      params.push(dbStartDate);
    } else if (dbEndDate) {
      sql += ' WHERE trade_date <= ?';
      params.push(dbEndDate);
    }

    sql += ' ORDER BY trade_date ASC';

    const rows = await db.allPromise(sql, params);
    // 转换为 YYYY-MM-DD 格式
    const tradingDays = rows.map(row => formatDateString(row.trade_date));

    res.json({
      success: true,
      data: tradingDays,
      meta: {
        total: tradingDays.length,
        minDate: tradingDays[0] || null,
        maxDate: tradingDays[tradingDays.length - 1] || null
      }
    });
  } catch (error) {
    console.error('[Trading Days API] 查询失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 检查指定日期是否为交易日
 * GET /api/trading-days/check
 * Query params:
 *   - date: 必填，日期 (YYYY-MM-DD)
 */
async function checkTradingDay(req, res) {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: '缺少 date 参数'
      });
    }

    const db = getDatabase();
    const dbDate = parseDateString(date);
    const row = await db.getPromise(
      'SELECT 1 FROM stock_factor_snapshot WHERE trade_date = ? LIMIT 1',
      [dbDate]
    );

    const isTradingDay = !!row;

    res.json({
      success: true,
      data: {
        date,
        isTradingDay,
        dayOfWeek: new Date(date).getDay()
      }
    });
  } catch (error) {
    console.error('[Trading Days API] 检查失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 创建路由
 */
function createRouter(express) {
  const router = express.Router();

  router.get('/', getTradingDays);
  router.get('/check', checkTradingDay);

  return router;
}

module.exports = {
  getTradingDays,
  checkTradingDay,
  createRouter
};