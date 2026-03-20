/**
 * 投资组合/模拟账户 API
 * 阶段2：账户管理 + 阶段3：条件单引擎
 * 安全修复版：修复SQL注入、参数验证
 */

const { getDatabase } = require('./db');

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
  getAccountSummary,
  getPositions,
  getPosition,
  getTrades
};