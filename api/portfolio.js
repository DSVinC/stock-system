/**
 * 投资组合/模拟账户 API
 * 阶段2：账户管理 + 阶段3：条件单引擎
 * 安全修复版：修复SQL注入、参数验证
 */

const { getDatabase } = require('./db');

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
    
    const positions = await db.allPromise(`
      SELECT * FROM portfolio_position WHERE account_id = ? ORDER BY market_value DESC
    `, [id]);
    
    res.json({ 
      success: true, 
      data: {
        account,
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
    
    // 更新账户的现金和总值
    await db.runPromise(`
      UPDATE portfolio_account 
      SET current_cash = initial_cash, total_value = initial_cash, total_return = 0, return_rate = 0, updated_at = datetime('now')
      WHERE id = ?
    `, [id]);
    
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
  clearPositions,
  getAccountConditionalOrders,
  getPositions,
  getPosition,
  getTrades
};
