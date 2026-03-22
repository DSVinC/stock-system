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

  const triggerTypeDefs = {
    price_above: { params: ['price'] },
    price_below: { params: ['price'] },
    ma_golden_cross: { params: ['ma_short', 'ma_long'] },
    ma_death_cross: { params: ['ma_short', 'ma_long'] },
    rsi_overbought: { params: ['threshold'] },
    rsi_oversold: { params: ['threshold'] },
    volume_ratio_above: { params: ['ratio'] },
    macd_bullish: { params: ['signal'] },
    macd_bearish: { params: ['signal'] },
    pe_low: { params: ['pe'] },
    pe_high: { params: ['pe'] },
    daily_gain: { params: ['percent'] },
    daily_loss: { params: ['percent'] },
    main_force_net_inflow: { params: ['amount'] },
    main_force_net_outflow: { params: ['amount'] }
  };
  const validTypes = ['price', 'pct_change', 'volume_ratio', 'rsi', 'macd_cross', 'pe_percentile', 'main_force_net', 'indicator', 'fundamental'];
  const validOperators = ['>=', '<=', '>', '<', '==', '!='];

  const isFiniteNumber = (value) => Number.isFinite(Number(value));

  for (const cond of conditions) {
    if (cond.trigger_type) {
      const triggerDef = triggerTypeDefs[cond.trigger_type];
      if (!triggerDef) {
        return { valid: false, error: `无效的触发类型: ${cond.trigger_type}` };
      }

      const params = cond.params && typeof cond.params === 'object' ? cond.params : {};
      for (const key of triggerDef.params) {
        if (!isFiniteNumber(params[key])) {
          return { valid: false, error: `触发参数 ${key} 无效` };
        }
      }

      if (['price_above', 'price_below'].includes(cond.trigger_type) && Number(params.price) <= 0) {
        return { valid: false, error: '价格必须为正数' };
      }
      if (['daily_gain', 'daily_loss', 'rsi_overbought', 'rsi_oversold'].includes(cond.trigger_type)) {
        const key = cond.trigger_type.startsWith('rsi') ? 'threshold' : 'percent';
        const value = Number(params[key]);
        if (value < 0 || value > 100) {
          return { valid: false, error: `${key} 必须在 0-100 之间` };
        }
      }
      if (cond.trigger_type === 'volume_ratio_above' && Number(params.ratio) < 0) {
        return { valid: false, error: '量比阈值不能为负数' };
      }
      if (['pe_low', 'pe_high'].includes(cond.trigger_type) && Number(params.pe) < 0) {
        return { valid: false, error: 'PE 阈值不能为负数' };
      }
      if (['main_force_net_inflow', 'main_force_net_outflow'].includes(cond.trigger_type) && Number(params.amount) < 0) {
        return { valid: false, error: '主力净额阈值不能为负数' };
      }
      if (['ma_golden_cross', 'ma_death_cross'].includes(cond.trigger_type)) {
        const shortMa = Number(params.ma_short);
        const longMa = Number(params.ma_long);
        if (shortMa < 1 || longMa < 1 || shortMa >= longMa) {
          return { valid: false, error: 'MA 参数无效，要求短期均线小于长期均线' };
        }
      }
      continue;
    }

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

function normalizeStatusForWrite(status) {
  if (status === 'pending') return 'enabled';
  if (status === 'cancelled') return 'disabled';
  return status;
}

function buildStatusClause(status) {
  switch (status) {
    case 'enabled':
      return { clause: 'status IN (?, ?)', params: ['enabled', 'pending'] };
    case 'disabled':
      return { clause: 'status IN (?, ?)', params: ['disabled', 'cancelled'] };
    case 'triggered':
      return { clause: 'status = ?', params: ['triggered'] };
    case 'expired':
      return { clause: 'status = ?', params: ['expired'] };
    default:
      return null;
  }
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
      const statusClause = buildStatusClause(status);
      if (statusClause) {
        conditions.push(statusClause.clause);
        params.push(...statusClause.params);
      } else {
        conditions.push('status = ?');
        params.push(status);
      }
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';
    
    const orders = await db.allPromise(query, params);
    
    // 安全解析conditions JSON
    const parsedOrders = orders.map(order => ({
      ...order,
      status: normalizeStatusForWrite(order.status),
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
      status: normalizeStatusForWrite(order.status),
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'enabled', ?, 0, datetime('now'), datetime('now'))
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
      data: { id: result.lastID, ts_code, stock_name, action, status: 'enabled' }
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
    if (!['pending', 'enabled', 'disabled', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, error: '当前状态的条件单不允许编辑' });
    }

    if (updateData.ts_code !== undefined) {
      const tsCodeRegex = /^[0-9]{6}\.(SZ|SH|BJ)$/;
      if (!tsCodeRegex.test(updateData.ts_code)) {
        return res.status(400).json({ success: false, error: '股票代码格式无效' });
      }
    }

    if (updateData.conditions) {
      const condValidation = validateConditions(updateData.conditions);
      if (!condValidation.valid) {
        return res.status(400).json({ success: false, error: condValidation.error });
      }
    }
    
    // 构建更新字段
    const fields = [];
    const values = [];
    
    if (updateData.ts_code !== undefined) { fields.push('ts_code = ?'); values.push(updateData.ts_code); }
    if (updateData.stock_name !== undefined) { fields.push('stock_name = ?'); values.push(updateData.stock_name); }
    if (updateData.action !== undefined) { fields.push('action = ?'); values.push(updateData.action); }
    if (updateData.order_type !== undefined) { fields.push('order_type = ?'); values.push(updateData.order_type); }
    if (updateData.quantity !== undefined) { fields.push('quantity = ?'); values.push(updateData.quantity); }
    if (updateData.amount !== undefined) { fields.push('amount = ?'); values.push(updateData.amount); }
    if (updateData.position_pct !== undefined) { fields.push('position_pct = ?'); values.push(updateData.position_pct); }
    if (updateData.conditions) { fields.push('conditions = ?'); values.push(JSON.stringify(updateData.conditions)); }
    if (updateData.condition_logic) { fields.push('condition_logic = ?'); values.push(updateData.condition_logic); }
    if (updateData.start_date) { fields.push('start_date = ?'); values.push(updateData.start_date); }
    if (updateData.end_date) { fields.push('end_date = ?'); values.push(updateData.end_date); }
    if (updateData.max_trigger_count !== undefined) { fields.push('max_trigger_count = ?'); values.push(updateData.max_trigger_count); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: '没有可更新的字段' });
    }
    
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
 * 启用/禁用切换
 * PUT /api/conditional-order/:id/toggle
 */
async function toggleConditionalOrder(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();

    const order = await db.getPromise('SELECT * FROM conditional_order WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ success: false, error: '条件单不存在' });
    }

    if (['triggered', 'expired'].includes(order.status)) {
      return res.status(400).json({ success: false, error: '已触发条件单不支持启用/禁用切换' });
    }

    const nextStatus = ['enabled', 'pending'].includes(order.status) ? 'disabled' : 'enabled';
    await db.runPromise(
      'UPDATE conditional_order SET status = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [nextStatus, id]
    );

    res.json({
      success: true,
      data: {
        id: Number(id),
        status: nextStatus
      }
    });
  } catch (error) {
    console.error('切换条件单状态失败:', error);
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
    if (!['pending', 'enabled'].includes(order.status)) {
      return res.status(400).json({ success: false, error: `条件单状态为${order.status}，无法取消` });
    }
    
    await db.runPromise(`
      UPDATE conditional_order SET status = 'disabled', updated_at = datetime('now') WHERE id = ?
    `, [id]);
    
    res.json({ success: true, message: '条件单已取消' });
  } catch (error) {
    console.error('取消条件单失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 获取条件单执行历史
 * GET /api/conditional-order/:id/history
 */
async function getConditionalOrderHistory(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();

    const order = await db.getPromise('SELECT id FROM conditional_order WHERE id = ?', [id]);
    if (!order) {
      return res.status(404).json({ success: false, error: '条件单不存在' });
    }

    const history = await db.allPromise(`
      SELECT
        id,
        conditional_order_id,
        ts_code,
        stock_name,
        action,
        quantity,
        price,
        amount,
        trade_date,
        order_type,
        remark
      FROM portfolio_trade
      WHERE conditional_order_id = ?
      ORDER BY trade_date DESC, id DESC
    `, [id]);

    res.json({
      success: true,
      data: history.map((item) => ({
        ...item,
        status: 'executed'
      }))
    });
  } catch (error) {
    console.error('获取条件单执行历史失败:', error);
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
  if (condition?.trigger_type) {
    return evaluateTriggerTypeCondition(condition, marketData, technicalData);
  }

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

function evaluateTriggerTypeCondition(condition, marketData, technicalData) {
  const triggerType = condition.trigger_type;
  const params = condition.params || {};

  switch (triggerType) {
    case 'price_above':
      return evaluateCrossCondition(
        marketData?.prevClose ?? marketData?.previousPrice ?? marketData?.prevPrice,
        marketData?.price,
        Number(params.price),
        'above'
      );
    case 'price_below':
      return evaluateCrossCondition(
        marketData?.prevClose ?? marketData?.previousPrice ?? marketData?.prevPrice,
        marketData?.price,
        Number(params.price),
        'below'
      );
    case 'ma_golden_cross':
      return evaluateMovingAverageCross(technicalData, params, 'golden');
    case 'ma_death_cross':
      return evaluateMovingAverageCross(technicalData, params, 'death');
    case 'rsi_overbought':
      return compareValues(technicalData?.rsi, '>=', Number(params.threshold));
    case 'rsi_oversold':
      return compareValues(technicalData?.rsi, '<=', Number(params.threshold));
    case 'volume_ratio_above':
      return compareValues(marketData?.volumeRatio, '>=', Number(params.ratio));
    case 'macd_bullish':
      return compareValues(technicalData?.macdSignal, '>=', Number(params.signal));
    case 'macd_bearish':
      return compareValues(technicalData?.macdSignal, '<=', Number(params.signal));
    case 'pe_low':
      return compareValues(marketData?.pe ?? marketData?.pe_ttm, '<=', Number(params.pe));
    case 'pe_high':
      return compareValues(marketData?.pe ?? marketData?.pe_ttm, '>=', Number(params.pe));
    case 'daily_gain':
      return compareValues(marketData?.pctChange, '>=', Number(params.percent));
    case 'daily_loss':
      return compareValues(marketData?.pctChange, '<=', -Math.abs(Number(params.percent)));
    case 'main_force_net_inflow':
      return compareValues(marketData?.mainForceNet, '>=', Number(params.amount));
    case 'main_force_net_outflow':
      return compareValues(marketData?.mainForceNet, '<=', -Math.abs(Number(params.amount)));
    default:
      console.warn(`未知触发类型: ${triggerType}`);
      return false;
  }
}

function evaluateCrossCondition(previousValue, currentValue, threshold, direction) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(threshold)) {
    return false;
  }

  if (!Number.isFinite(previousValue)) {
    return direction === 'above'
      ? currentValue >= threshold
      : currentValue <= threshold;
  }

  return direction === 'above'
    ? previousValue < threshold && currentValue >= threshold
    : previousValue > threshold && currentValue <= threshold;
}

function getMovingAverageValue(technicalData, period, previous = false) {
  if (!technicalData) {
    return undefined;
  }

  const currentMap = technicalData.ma || technicalData.movingAverages;
  const previousMap = technicalData.prevMa || technicalData.previousMa || technicalData.prevMovingAverages;
  const source = previous ? previousMap : currentMap;
  if (source && source[period] !== undefined) {
    return Number(source[period]);
  }

  const directKey = `ma${period}`;
  const prevKey = `prevMa${period}`;
  return Number(previous ? technicalData[prevKey] : technicalData[directKey]);
}

function evaluateMovingAverageCross(technicalData, params, mode) {
  const shortPeriod = Number(params.ma_short);
  const longPeriod = Number(params.ma_long);
  const shortCurrent = getMovingAverageValue(technicalData, shortPeriod, false);
  const longCurrent = getMovingAverageValue(technicalData, longPeriod, false);

  if (!Number.isFinite(shortCurrent) || !Number.isFinite(longCurrent)) {
    return false;
  }

  const shortPrevious = getMovingAverageValue(technicalData, shortPeriod, true);
  const longPrevious = getMovingAverageValue(technicalData, longPeriod, true);

  if (!Number.isFinite(shortPrevious) || !Number.isFinite(longPrevious)) {
    return mode === 'golden'
      ? shortCurrent >= longCurrent
      : shortCurrent <= longCurrent;
  }

  return mode === 'golden'
    ? shortPrevious < longPrevious && shortCurrent >= longCurrent
    : shortPrevious > longPrevious && shortCurrent <= longCurrent;
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
  getConditionalOrderHistory,
  deleteConditionalOrder,
  toggleConditionalOrder,
  cancelConditionalOrder,
  checkCondition,
  evaluateCondition,
  compareValues
};
