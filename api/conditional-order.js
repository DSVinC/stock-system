/**
 * 条件单管理 API
 * 阶段3：条件单引擎
 * 安全修复版：修复SQL注入、JSON解析错误处理
 */

const { getDatabase } = require('./db');

// 安全的JSON解析
function safeJsonParse(str, defaultValue = []) {
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('[safeJsonParse] JSON解析失败:', e.message);
    return defaultValue;
  }
}

// 条件验证
function validateConditions(conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return { valid: false, error: 'conditions必须是非空数组' };
  }
  
  const validTypes = ['price', 'pct_change', 'volume_ratio', 'rsi', 'macd_cross', 'pe_percentile', 'main_force_net'];
  const validOperators = ['>=', '<=', '>', '<', '==', '!='];
  
  for (const cond of conditions) {
    if (!cond.type || !validTypes.includes(cond.type)) {
      return { valid: false, error: `无效的条件类型: ${cond.type}` };
    }
    if (!cond.operator || !validOperators.includes(cond.operator)) {
      return { valid: false, error: `无效的操作符: ${cond.operator}` };
    }
    if (cond.value === undefined || cond.value === null) {
      return { valid: false, error: '条件值不能为空' };
    }
  }
  
  return { valid: true };
}

// ========== 条件单管理 API ==========

/**
 * 获取条件单列表
 * GET /api/conditional-order
 */
async function getConditionalOrders(req, res) {
  try {
    const { account_id, status } = req.query;
    const db = await getDatabase();
    
    let query = 'SELECT * FROM conditional_order';
    let params = [];
    let conditions = [];
    
    if (account_id) {
      conditions.push('account_id = ?');
      params.push(account_id);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';
    
    const orders = await db.allPromise(query, params);
    
    // 安全解析conditions JSON
    const parsedOrders = orders.map(order => ({
      ...order,
      conditions: safeJsonParse(order.conditions, [])
    }));
    
    res.json({ success: true, data: parsedOrders });
  } catch (error) {
    console.error('获取条件单列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 获取单个条件单详情
 * GET /api/conditional-order/:id
 */
async function getConditionalOrder(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    const order = await db.getPromise('SELECT * FROM conditional_order WHERE id = ?', [id]);
    
    if (!order) {
      return res.status(404).json({ success: false, error: '条件单不存在' });
    }
    
    // 安全解析 conditions JSON
    const parsedOrder = {
      ...order,
      conditions: safeJsonParse(order.conditions, [])
    };
    
    res.json({ success: true, data: parsedOrder });
  } catch (error) {
    console.error('获取条件单详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 创建条件单
 * POST /api/conditional-order
 */
async function createConditionalOrder(req, res) {
  try {
    const {
      account_id, ts_code, stock_name, order_type, action,
      quantity, amount, position_pct,
      conditions, condition_logic,
      start_date, end_date, max_trigger_count
    } = req.body;
    
    if (!account_id || !ts_code || !order_type || !action || !conditions) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }
    
    // 验证ts_code格式
    const tsCodeRegex = /^[0-9]{6}\.(SZ|SH|BJ)$/;
    if (!tsCodeRegex.test(ts_code)) {
      return res.status(400).json({ success: false, error: '股票代码格式无效' });
    }
    
    // 验证conditions
    const condValidation = validateConditions(conditions);
    if (!condValidation.valid) {
      return res.status(400).json({ success: false, error: condValidation.error });
    }
    
    const db = await getDatabase();
    
    // 验证账户存在
    const account = await db.getPromise('SELECT id FROM portfolio_account WHERE id = ?', [account_id]);
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }
    
    const result = await db.runPromise(`
      INSERT INTO conditional_order (
        account_id, ts_code, stock_name, order_type, action,
        quantity, amount, position_pct,
        conditions, condition_logic,
        start_date, end_date, status,
        max_trigger_count, trigger_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, datetime('now'), datetime('now'))
    `, [
      account_id, ts_code, stock_name, order_type, action,
      quantity || null, amount || null, position_pct || null,
      JSON.stringify(conditions), condition_logic || 'AND',
      start_date || dateFormat(new Date()),
      end_date || dateFormat(addMonths(new Date(), 3)),
      max_trigger_count || 1
    ]);
    
    res.json({ 
      success: true, 
      data: { id: result.lastID, ts_code, stock_name, action, status: 'pending' }
    });
  } catch (error) {
    console.error('创建条件单失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 更新条件单
 * PUT /api/conditional-order/:id
 */
async function updateConditionalOrder(req, res) {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const db = await getDatabase();
    
    // 检查条件单是否存在且为pending状态
    const order = await db.getPromise('SELECT * FROM conditional_order WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ success: false, error: '条件单不存在' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, error: '只能修改待触发状态的条件单' });
    }
    
    // 构建更新字段
    const fields = [];
    const values = [];
    
    if (updateData.quantity !== undefined) { fields.push('quantity = ?'); values.push(updateData.quantity); }
    if (updateData.amount !== undefined) { fields.push('amount = ?'); values.push(updateData.amount); }
    if (updateData.position_pct !== undefined) { fields.push('position_pct = ?'); values.push(updateData.position_pct); }
    if (updateData.conditions) { fields.push('conditions = ?'); values.push(JSON.stringify(updateData.conditions)); }
    if (updateData.condition_logic) { fields.push('condition_logic = ?'); values.push(updateData.condition_logic); }
    if (updateData.end_date) { fields.push('end_date = ?'); values.push(updateData.end_date); }
    if (updateData.max_trigger_count !== undefined) { fields.push('max_trigger_count = ?'); values.push(updateData.max_trigger_count); }
    
    fields.push('updated_at = datetime(\'now\')');
    values.push(id);
    
    await db.runPromise(`
      UPDATE conditional_order SET ${fields.join(', ')} WHERE id = ?
    `, values);
    
    res.json({ success: true, message: '条件单更新成功' });
  } catch (error) {
    console.error('更新条件单失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 删除条件单
 * DELETE /api/conditional-order/:id
 */
async function deleteConditionalOrder(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    const order = await db.getPromise('SELECT * FROM conditional_order WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ success: false, error: '条件单不存在' });
    }
    
    await db.runPromise('DELETE FROM conditional_order WHERE id = ?', [id]);
    res.json({ success: true, message: '条件单删除成功' });
  } catch (error) {
    console.error('删除条件单失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 取消条件单
 * POST /api/conditional-order/:id/cancel
 */
async function cancelConditionalOrder(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    const order = await db.getPromise('SELECT * FROM conditional_order WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ success: false, error: '条件单不存在' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, error: `条件单状态为${order.status}，无法取消` });
    }
    
    await db.runPromise(`
      UPDATE conditional_order SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
    `, [id]);
    
    res.json({ success: true, message: '条件单已取消' });
  } catch (error) {
    console.error('取消条件单失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ========== 条件检查引擎 ==========

/**
 * 检查条件单是否触发
 * @param {Object} order - 条件单对象
 * @param {Object} marketData - 市场数据
 * @param {Object} technicalData - 技术指标数据
 * @returns {Boolean} 是否触发
 */
function checkCondition(order, marketData, technicalData) {
  const conditions = typeof order.conditions === 'string' 
    ? safeJsonParse(order.conditions, [])
    : order.conditions;
  const logic = order.condition_logic || 'AND';
  
  if (logic === 'AND') {
    return conditions.every(cond => evaluateCondition(cond, marketData, technicalData));
  } else {
    return conditions.some(cond => evaluateCondition(cond, marketData, technicalData));
  }
}

/**
 * 评估单个条件
 * @param {Object} condition - 条件对象 {type, operator, value}
 * @param {Object} marketData - 市场数据
 * @param {Object} technicalData - 技术指标数据
 */
function evaluateCondition(condition, marketData, technicalData) {
  const { type, operator, value } = condition;
  let actualValue;
  
  switch (type) {
    case 'price':
      actualValue = marketData.price;
      break;
    case 'pct_change':
      actualValue = marketData.pctChange;
      break;
    case 'volume_ratio':
      actualValue = marketData.volumeRatio;
      break;
    case 'rsi':
      actualValue = technicalData?.rsi;
      break;
    case 'macd_cross':
      actualValue = technicalData?.macdSignal;
      return compareValues(actualValue, operator, value);
    case 'pe_percentile':
      actualValue = marketData.pePercentile;
      break;
    case 'main_force_net':
      actualValue = marketData.mainForceNet;
      break;
    default:
      console.warn(`未知条件类型: ${type}`);
      return false;
  }
  
  return compareValues(actualValue, operator, value);
}

/**
 * 比较数值
 */
function compareValues(actual, operator, expected) {
  if (actual === undefined || actual === null) return false;
  
  switch (operator) {
    case '>=': return actual >= expected;
    case '<=': return actual <= expected;
    case '>': return actual > expected;
    case '<': return actual < expected;
    case '==': return actual == expected;
    case '!=': return actual != expected;
    default:
      console.warn(`未知操作符: ${operator}`);
      return false;
  }
}

// ========== 辅助函数 ==========

function dateFormat(date) {
  return date.toISOString().split('T')[0];
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

module.exports = {
  getConditionalOrders,
  getConditionalOrder,
  createConditionalOrder,
  updateConditionalOrder,
  deleteConditionalOrder,
  cancelConditionalOrder,
  checkCondition,
  evaluateCondition,
  compareValues
};