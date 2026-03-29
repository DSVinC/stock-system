/**
 * 投资组合/模拟账户 API
 * 阶段2：账户管理 + 阶段3：条件单引擎
 * 安全修复版：修复SQL注入、参数验证
 */

const { getDatabase } = require('./db');
const { normalizeToApi, normalizeToDb } = require('../utils/format');
const { getRealtimeQuote } = require('./market-data');

function safeJsonParse(value, fallback = null) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (_error) {
    return fallback;
  }
}

// 参数验证辅助函数
function validateAccountName(name) {
  return typeof name === 'string' && name.length >= 1 && name.length <= 50 && /^[\u4e00-\u9fa5a-zA-Z0-9_\-]+$/.test(name);
}

function validateInitialCash(cash) {
  return typeof cash === 'number' && cash > 0 && cash <= 10000000;
}

function validateTsCode(tsCode) {
  return typeof tsCode === 'string' && /^\d{6}\.(SZ|SH|BJ)$/.test(tsCode.trim().toUpperCase());
}

function validateStockName(name) {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 50;
}

function validatePrice(price) {
  return typeof price === 'number' && Number.isFinite(price) && price > 0 && price <= 100000;
}

function validateQuantity(quantity) {
  return typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0 && quantity <= 10000000;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

async function getLatestCloseByTsCode(db, tsCode) {
  const raw = String(tsCode || '').trim();
  if (!raw) {
    return null;
  }

  const candidates = [...new Set([
    raw,
    raw.toUpperCase(),
    raw.toLowerCase(),
    normalizeToApi(raw),
    normalizeToDb(raw)
  ])].filter(Boolean);

  const placeholders = candidates.map(() => '?').join(',');
  return db.getPromise(`
    SELECT close, trade_date, ts_code
    FROM stock_daily
    WHERE ts_code IN (${placeholders})
    ORDER BY trade_date DESC
    LIMIT 1
  `, candidates);
}

async function getRealtimePriceByTsCode(tsCode) {
  try {
    const quote = await getRealtimeQuote(tsCode);
    const price = toNumber(
      quote?.price ?? quote?.data?.price,
      0
    );
    if (price > 0) {
      return {
        price,
        tradeDate: quote?.date || quote?.data?.date || null
      };
    }
  } catch (error) {
    console.warn(`[portfolio] 实时行情兜底失败 ${tsCode}:`, error.message);
  }
  return { price: 0, tradeDate: null };
}

async function refreshAccountPositionsValuation(db, accountId) {
  const positions = await db.allPromise(`
    SELECT *
    FROM portfolio_position
    WHERE account_id = ?
    ORDER BY id ASC
  `, [accountId]);

  const refreshed = [];

  for (const position of positions) {
    const latestCloseRow = await getLatestCloseByTsCode(db, position.ts_code);
    let latestPrice = toNumber(latestCloseRow?.close, toNumber(position.current_price, 0));
    let latestTradeDate = latestCloseRow?.trade_date || null;
    if (!(latestPrice > 0)) {
      const fallbackQuote = await getRealtimePriceByTsCode(position.ts_code);
      if (fallbackQuote.price > 0) {
        latestPrice = fallbackQuote.price;
        latestTradeDate = fallbackQuote.tradeDate || latestTradeDate;
      }
    }
    const quantity = toNumber(position.quantity, 0);
    const avgPrice = toNumber(position.avg_price, 0);
    const costAmount = toNumber(position.cost_amount, avgPrice * quantity);
    const marketValue = latestPrice > 0 ? Number((quantity * latestPrice).toFixed(2)) : 0;
    const unrealizedPnl = Number((marketValue - costAmount).toFixed(2));
    const unrealizedPnlRate = costAmount > 0 ? Number((unrealizedPnl / costAmount).toFixed(6)) : 0;

    await db.runPromise(`
      UPDATE portfolio_position
      SET current_price = ?, market_value = ?, unrealized_pnl = ?, unrealized_pnl_rate = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [latestPrice || null, marketValue, unrealizedPnl, unrealizedPnlRate, position.id]);

    refreshed.push({
      ...position,
      current_price: latestPrice || null,
      market_value: marketValue,
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_rate: unrealizedPnlRate,
      latest_trade_date: latestTradeDate,
    });
  }

  await updateAccountValue(db, accountId);
  return refreshed.sort((a, b) => toNumber(b.market_value, 0) - toNumber(a.market_value, 0));
}

// ========== 账户管理 API ==========

/**
 * 获取账户列表
 * GET /api/portfolio/account
 */
async function getAccounts(req, res) {
  try {
    const db = await getDatabase();
    const accounts = await db.allPromise(`
      SELECT * FROM portfolio_account ORDER BY created_at DESC
    `);
    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('获取账户列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 创建账户
 * POST /api/portfolio/account
 */
async function createAccount(req, res) {
  try {
    const { account_name, initial_cash } = req.body;
    
    // 参数验证
    if (!account_name || !initial_cash) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }
    
    if (!validateAccountName(account_name)) {
      return res.status(400).json({ success: false, error: '账户名称格式无效（1-50字符，仅允许中文、字母、数字、下划线、连字符）' });
    }
    
    if (!validateInitialCash(initial_cash)) {
      return res.status(400).json({ success: false, error: '初始资金必须在1-1000万之间' });
    }
    
    const db = await getDatabase();
    const result = await db.runPromise(`
      INSERT INTO portfolio_account (
        account_name, initial_cash, current_cash, total_value, total_return, return_rate, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [account_name, initial_cash, initial_cash, initial_cash, 0, 0]);
    
    res.json({ 
      success: true, 
      data: { id: result.lastID, account_name, initial_cash }
    });
  } catch (error) {
    console.error('创建账户失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 获取账户详情
 * GET /api/portfolio/account/:id
 */
async function getAccount(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const account = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [id]);
    
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }
    
    res.json({ success: true, data: account });
  } catch (error) {
    console.error('获取账户详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 更新账户
 * PUT /api/portfolio/account/:id
 */
async function updateAccount(req, res) {
  try {
    const { id } = req.params;
    const { account_name } = req.body;
    
    // 参数验证
    if (!account_name) {
      return res.status(400).json({ success: false, error: '缺少账户名称参数' });
    }
    
    if (!validateAccountName(account_name)) {
      return res.status(400).json({ success: false, error: '账户名称格式无效' });
    }
    
    const db = await getDatabase();
    
    // 先检查账户是否存在
    const account = await db.getPromise('SELECT id FROM portfolio_account WHERE id = ?', [id]);
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }
    
    await db.runPromise(`
      UPDATE portfolio_account SET account_name = ?, updated_at = datetime('now') WHERE id = ?
    `, [account_name, id]);
    
    res.json({ success: true, message: '账户更新成功' });
  } catch (error) {
    console.error('更新账户失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 删除账户
 * DELETE /api/portfolio/account/:id
 */
async function deleteAccount(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    // 先检查账户是否存在
    const account = await db.getPromise('SELECT id FROM portfolio_account WHERE id = ?', [id]);
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }
    
    // 检查是否有持仓
    const positions = await db.getPromise('SELECT COUNT(*) as count FROM portfolio_position WHERE account_id = ?', [id]);
    if (positions.count > 0) {
      return res.status(400).json({ success: false, error: '账户仍有持仓，请先清空持仓再删除账户' });
    }
    
    // 检查是否有条件单
    const orders = await db.getPromise('SELECT COUNT(*) as count FROM conditional_order WHERE account_id = ?', [id]);
    if (orders.count > 0) {
      return res.status(400).json({ success: false, error: '账户仍有条件单，请先删除条件单再删除账户' });
    }
    
    // 检查是否有交易记录
    const trades = await db.getPromise('SELECT COUNT(*) as count FROM portfolio_trade WHERE account_id = ?', [id]);
    if (trades.count > 0) {
      return res.status(400).json({ success: false, error: '账户仍有交易记录，无法删除' });
    }
    
    // 删除账户
    await db.runPromise('DELETE FROM portfolio_account WHERE id = ?', [id]);
    
    res.json({ success: true, message: '账户删除成功' });
  } catch (error) {
    console.error('删除账户失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 获取账户总览（含持仓）
 * GET /api/portfolio/account/:id/summary
 */
async function getAccountSummary(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    const account = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [id]);
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }
    
    const positions = await refreshAccountPositionsValuation(db, id);
    const refreshedAccount = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [id]);
    
    res.json({ 
      success: true, 
      data: {
        account: refreshedAccount || account,
        positions,
        position_count: positions.length
      }
    });
  } catch (error) {
    console.error('获取账户总览失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 清空账户所有持仓
 * POST /api/portfolio/account/:id/clear-positions
 */
async function clearPositions(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    // 先检查账户是否存在
    const account = await db.getPromise('SELECT id FROM portfolio_account WHERE id = ?', [id]);
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }
    
    // 获取所有持仓
    const positions = await db.allPromise('SELECT * FROM portfolio_position WHERE account_id = ?', [id]);
    
    if (positions.length === 0) {
      return res.status(400).json({ success: false, error: '账户没有持仓' });
    }
    
    // 将所有持仓清零，并记录交易记录
    const tradeDate = new Date().toISOString().slice(0, 10);
    const timestamp = new Date().toISOString();
    
    for (const position of positions) {
      if (position.quantity > 0) {
        // 记录卖出交易（清仓）
        await db.runPromise(`
          INSERT INTO portfolio_trade (
            account_id, ts_code, stock_name, action, quantity, price, amount, trade_date, created_at, remark
          ) VALUES (?, ?, ?, 'sell', ?, ?, ?, ?, ?, ?)
        `, [
          id,
          position.ts_code,
          position.stock_name,
          position.quantity,
          position.current_price,
          position.quantity * position.current_price,
          tradeDate,
          timestamp,
          '清空持仓'
        ]);
      }
    }
    
    // 删除所有持仓
    await db.runPromise('DELETE FROM portfolio_position WHERE account_id = ?', [id]);
    
    // 计算清仓所得总额
    const totalProceeds = positions.reduce((sum, pos) => sum + (pos.quantity * pos.current_price), 0);
    
    // 获取清仓前的现金
    const accountBefore = await db.getPromise('SELECT current_cash FROM portfolio_account WHERE id = ?', [id]);
    const cashBefore = accountBefore ? accountBefore.current_cash : 0;
    
    // 更新账户的现金和总值，并重新计算损益
    const newCash = cashBefore + totalProceeds;
    const accountInfo = await db.getPromise('SELECT initial_cash FROM portfolio_account WHERE id = ?', [id]);
    const initialCash = accountInfo ? accountInfo.initial_cash : newCash;
    const totalReturn = newCash - initialCash;
    const returnRate = initialCash > 0 ? totalReturn / initialCash : 0;
    
    await db.runPromise(`
      UPDATE portfolio_account 
      SET current_cash = ?, total_value = ?, total_return = ?, return_rate = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [newCash, newCash, totalReturn, returnRate, id]);
    
    res.json({ success: true, message: '已清空所有持仓，资金已退回' });
  } catch (error) {
    console.error('清空持仓失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function ensureConditionalExecutionView(db) {
  await db.runPromise(`
    CREATE VIEW IF NOT EXISTS view_conditional_executions AS
    SELECT
      co.id AS order_id,
      co.account_id,
      pa.account_name,
      co.ts_code,
      co.stock_name,
      co.action,
      co.order_type,
      co.status,
      co.trigger_count,
      co.max_trigger_count,
      co.created_at AS order_created_at,
      co.updated_at AS order_updated_at,
      pt.id AS trade_id,
      pt.trade_date,
      pt.quantity,
      pt.price,
      pt.amount,
      pt.remark
    FROM conditional_order co
    LEFT JOIN portfolio_trade pt ON pt.conditional_order_id = co.id
    LEFT JOIN portfolio_account pa ON pa.id = co.account_id
  `);
}

/**
 * 获取账户相关条件单及执行历史
 * GET /api/portfolio/account/:id/conditional-orders
 */
async function getAccountConditionalOrders(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();

    const account = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [id]);
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }

    await ensureConditionalExecutionView(db);

    const orders = await db.allPromise(`
      SELECT
        co.*,
        pa.account_name
      FROM conditional_order co
      LEFT JOIN portfolio_account pa ON pa.id = co.account_id
      WHERE co.account_id = ?
      ORDER BY co.created_at DESC
    `, [id]);

    const executions = await db.allPromise(`
      SELECT *
      FROM view_conditional_executions
      WHERE account_id = ? AND trade_id IS NOT NULL
      ORDER BY trade_date DESC, trade_id DESC
    `, [id]);

    res.json({
      success: true,
      data: {
        account,
        orders: orders.map((order) => ({
          ...order,
          conditions: safeJsonParse(order.conditions, [])
        })),
        executions
      }
    });
  } catch (error) {
    console.error('获取账户条件单失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ========== 持仓管理 API ==========

/**
 * 获取持仓列表
 * GET /api/portfolio/position
 */
async function getPositions(req, res) {
  try {
    const { account_id } = req.query;
    const db = await getDatabase();
    
    let query = 'SELECT * FROM portfolio_position';
    let params = [];
    
    if (account_id) {
      query += ' WHERE account_id = ?';
      params.push(account_id);
    }
    query += ' ORDER BY market_value DESC';
    
    const positions = await db.allPromise(query, params);
    res.json({ success: true, data: positions });
  } catch (error) {
    console.error('获取持仓列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 获取持仓详情
 * GET /api/portfolio/position/:id
 */
async function getPosition(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const position = await db.getPromise('SELECT * FROM portfolio_position WHERE id = ?', [id]);
    
    if (!position) {
      return res.status(404).json({ success: false, error: '持仓不存在' });
    }
    
    res.json({ success: true, data: position });
  } catch (error) {
    console.error('获取持仓详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 手动添加持仓
 * POST /api/portfolio/account/:id/manual-position
 */
async function addManualPosition(req, res) {
  try {
    const { id } = req.params;
    const {
      ts_code,
      stock_name,
      avg_price,
      quantity,
    } = req.body || {};

    const normalizedCode = String(ts_code || '').trim().toUpperCase();
    const normalizedName = String(stock_name || '').trim();
    const price = Number(avg_price);
    const lotQuantity = Number(quantity);

    if (!validateTsCode(normalizedCode)) {
      return res.status(400).json({ success: false, error: '股票代码格式无效，需为 000001.SZ / 600000.SH' });
    }
    if (!validateStockName(normalizedName)) {
      return res.status(400).json({ success: false, error: '股票名称不能为空，且长度不能超过 50 字符' });
    }
    if (!validatePrice(price)) {
      return res.status(400).json({ success: false, error: '成本价必须为大于 0 的有效数字' });
    }
    if (!validateQuantity(lotQuantity)) {
      return res.status(400).json({ success: false, error: '持仓量必须为正整数' });
    }

    const db = await getDatabase();
    const account = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [id]);
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }

    const latestCloseRow = await getLatestCloseByTsCode(db, normalizedCode);
    const currentPrice = toNumber(latestCloseRow?.close, price);
    const costAmount = Number((price * lotQuantity).toFixed(2));
    const marketValue = Number((currentPrice * lotQuantity).toFixed(2));
    const unrealizedPnl = Number((marketValue - costAmount).toFixed(2));
    const unrealizedPnlRate = costAmount > 0 ? Number((unrealizedPnl / costAmount).toFixed(6)) : 0;

    if (toNumber(account.current_cash, 0) < costAmount) {
      return res.status(400).json({ success: false, error: '账户现金不足，无法按该成本价和持仓量录入仓位' });
    }

    await db.runPromise(`
      INSERT INTO portfolio_position (
        account_id, ts_code, stock_name, quantity, avg_price, cost_amount,
        current_price, market_value, unrealized_pnl, unrealized_pnl_rate,
        position_date, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), datetime('now'))
    `, [id, normalizedCode, normalizedName, lotQuantity, price, costAmount, currentPrice, marketValue, unrealizedPnl, unrealizedPnlRate]);

    await db.runPromise(`
      INSERT INTO portfolio_trade (
        account_id, ts_code, stock_name, action, quantity, price, amount, trade_date, order_type, remark
      ) VALUES (?, ?, ?, 'buy', ?, ?, ?, datetime('now'), ?, ?)
    `, [id, normalizedCode, normalizedName, lotQuantity, price, costAmount, 'manual', '手动录入持仓']);

    await db.runPromise(`
      UPDATE portfolio_account
      SET current_cash = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [Number((toNumber(account.current_cash, 0) - costAmount).toFixed(2)), id]);

    await updateAccountValue(db, id);

    const summaryPositions = await refreshAccountPositionsValuation(db, id);
    const refreshedAccount = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '手动持仓添加成功',
      data: {
        account: refreshedAccount,
        positions: summaryPositions,
      }
    });
  } catch (error) {
    console.error('手动添加持仓失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ========== 交易记录 API ==========

/**
 * 获取交易记录
 * GET /api/portfolio/trade
 */
async function getTrades(req, res) {
  try {
    const { account_id, ts_code } = req.query;
    const db = await getDatabase();
    
    let query = 'SELECT * FROM portfolio_trade';
    let params = [];
    let conditions = [];
    
    if (account_id) {
      conditions.push('account_id = ?');
      params.push(account_id);
    }
    if (ts_code) {
      conditions.push('ts_code = ?');
      params.push(ts_code);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY trade_date DESC';
    
    const trades = await db.allPromise(query, params);
    res.json({ success: true, data: trades });
  } catch (error) {
    console.error('获取交易记录失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ========== 辅助函数 ==========

async function updateOrCreatePosition(db, account_id, ts_code, stock_name, quantity, price, action) {
  const existing = await db.getPromise(
    'SELECT * FROM portfolio_position WHERE account_id = ? AND ts_code = ?',
    [account_id, ts_code]
  );
  
  if (existing) {
    // 更新持仓
    const newQuantity = existing.quantity + quantity;
    const newCost = existing.cost_amount + (quantity * price);
    const newAvgPrice = newCost / newQuantity;
    
    await db.runPromise(`
      UPDATE portfolio_position 
      SET quantity = ?, avg_price = ?, cost_amount = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [newQuantity, newAvgPrice, newCost, existing.id]);
  } else {
    // 新建持仓
    await db.runPromise(`
      INSERT INTO portfolio_position (
        account_id, ts_code, stock_name, quantity, avg_price, cost_amount,
        current_price, market_value, unrealized_pnl, unrealized_pnl_rate,
        position_date, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), datetime('now'))
    `, [account_id, ts_code, stock_name, quantity, price, quantity * price, price, quantity * price, 0, 0]);
  }
}

async function updatePositionOnSell(db, account_id, ts_code, quantity) {
  const position = await db.getPromise(
    'SELECT * FROM portfolio_position WHERE account_id = ? AND ts_code = ?',
    [account_id, ts_code]
  );
  
  if (!position) return;
  
  const newQuantity = position.quantity - quantity;
  if (newQuantity <= 0) {
    // 清仓
    await db.runPromise('DELETE FROM portfolio_position WHERE id = ?', [position.id]);
  } else {
    // 减仓
    const newCost = (newQuantity / position.quantity) * position.cost_amount;
    await db.runPromise(`
      UPDATE portfolio_position 
      SET quantity = ?, cost_amount = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [newQuantity, newCost, position.id]);
  }
}

async function updateAccountValue(db, account_id) {
  const account = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [account_id]);
  const positions = await db.allPromise('SELECT market_value FROM portfolio_position WHERE account_id = ?', [account_id]);
  
  const positionValue = positions.reduce((sum, p) => sum + (p.market_value || 0), 0);
  const totalValue = account.current_cash + positionValue;
  const totalReturn = totalValue - account.initial_cash;
  const returnRate = account.initial_cash > 0 ? totalReturn / account.initial_cash : 0;
  
  await db.runPromise(`
    UPDATE portfolio_account 
    SET total_value = ?, total_return = ?, return_rate = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [totalValue, totalReturn, returnRate, account_id]);
}

module.exports = {
  getAccounts,
  createAccount,
  getAccount,
  updateAccount,
  deleteAccount,
  getAccountSummary,
  addManualPosition,
  clearPositions,
  getAccountConditionalOrders,
  getPositions,
  getPosition,
  getTrades
};
