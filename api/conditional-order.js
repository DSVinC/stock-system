/**
 * 条件单管理 API
 * 阶段3：条件单引擎
 * 安全修复版：修复SQL注入、JSON解析错误处理
 */

const { getDatabase } = require('./db');

const BOARD_LOT_SIZE = 100;

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

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeTradeQuantity(rawQuantity, action, maxSellQuantity = null) {
  const quantity = Math.floor(Number(rawQuantity) || 0);
  if (quantity <= 0) {
    return 0;
  }

  if (action === 'sell' && Number.isFinite(maxSellQuantity) && quantity >= maxSellQuantity) {
    return Math.floor(maxSellQuantity);
  }

  return Math.floor(quantity / BOARD_LOT_SIZE) * BOARD_LOT_SIZE;
}

function extractPriceFromConditions(conditions) {
  if (!Array.isArray(conditions)) {
    return null;
  }

  for (const condition of conditions) {
    if (condition?.trigger_type === 'price_above' || condition?.trigger_type === 'price_below') {
      const price = toNumber(condition?.params?.price);
      if (price && price > 0) {
        return price;
      }
    }

    if (condition?.type === 'price') {
      const price = toNumber(condition?.value);
      if (price && price > 0) {
        return price;
      }
    }
  }

  return null;
}

async function resolveReferencePrice(db, tsCode, conditions) {
  const conditionPrice = extractPriceFromConditions(conditions);
  if (conditionPrice) {
    return conditionPrice;
  }

  try {
    const latestRow = await db.getPromise(`
      SELECT close
      FROM stock_daily
      WHERE ts_code = ?
      ORDER BY trade_date DESC
      LIMIT 1
    `, [tsCode]);
    const latestPrice = toNumber(latestRow?.close);
    return latestPrice && latestPrice > 0 ? latestPrice : null;
  } catch (_error) {
    return null;
  }
}

async function validateAccountForOrder(db, payload) {
  const account = await db.getPromise(
    'SELECT id, account_name, current_cash, initial_cash FROM portfolio_account WHERE id = ?',
    [payload.account_id]
  );
  if (!account) {
    return { valid: false, status: 404, code: 'ACCOUNT_NOT_FOUND', error: '投资组合账户不存在' };
  }

  const action = String(payload.action || '').toLowerCase();
  if (!['buy', 'sell'].includes(action)) {
    return { valid: false, status: 400, code: 'INVALID_ACTION', error: '交易动作必须是 buy 或 sell' };
  }

  const referencePrice = await resolveReferencePrice(db, payload.ts_code, payload.conditions);
  const quantityValue = toNumber(payload.quantity);
  const amountValue = toNumber(payload.amount);
  const positionPctValue = toNumber(payload.position_pct);

  const position = await db.getPromise(
    'SELECT * FROM portfolio_position WHERE account_id = ? AND ts_code = ?',
    [payload.account_id, payload.ts_code]
  );

  if (action === 'buy') {
    let estimatedCost = null;

    if (quantityValue && quantityValue > 0) {
      if (!referencePrice) {
        return {
          valid: false,
          status: 400,
          code: 'PRICE_REFERENCE_REQUIRED',
          error: '当前条件单缺少可用于估算成本的价格，请配置价格条件或补充金额参数'
        };
      }

      const normalizedQuantity = normalizeTradeQuantity(quantityValue, 'buy');
      if (normalizedQuantity < BOARD_LOT_SIZE) {
        return { valid: false, status: 400, code: 'INVALID_QUANTITY', error: '买入数量不足100股' };
      }
      estimatedCost = normalizedQuantity * referencePrice;
    } else if (amountValue && amountValue > 0) {
      estimatedCost = amountValue;
    } else if (positionPctValue && positionPctValue > 0) {
      if (positionPctValue > 100) {
        return { valid: false, status: 400, code: 'INVALID_POSITION_PCT', error: '买入仓位比例不能超过100%' };
      }
      estimatedCost = Number(account.current_cash) * (positionPctValue / 100);
    }

    if (!estimatedCost || estimatedCost <= 0) {
      return { valid: false, status: 400, code: 'INVALID_ORDER', error: '条件单缺少有效的买入参数' };
    }

    if (estimatedCost > Number(account.current_cash)) {
      return { valid: false, status: 400, code: 'INSUFFICIENT_FUNDS', error: '账户资金不足，无法创建该条件单' };
    }
  }

  if (action === 'sell') {
    if (!position || Number(position.quantity) <= 0) {
      return { valid: false, status: 400, code: 'INSUFFICIENT_POSITION', error: '账户当前无对应持仓，无法创建卖出条件单' };
    }

    if (quantityValue && quantityValue > 0) {
      if (quantityValue > Number(position.quantity)) {
        return { valid: false, status: 400, code: 'INSUFFICIENT_POSITION', error: '卖出数量超过当前持仓' };
      }
    } else if (amountValue && amountValue > 0) {
      if (!referencePrice) {
        return {
          valid: false,
          status: 400,
          code: 'PRICE_REFERENCE_REQUIRED',
          error: '当前条件单缺少可用于估算卖出数量的价格，请配置价格条件或改用数量/仓位比例'
        };
      }

      const estimatedQuantity = normalizeTradeQuantity(Math.floor(amountValue / referencePrice), 'sell', Number(position.quantity));
      if (estimatedQuantity <= 0) {
        return { valid: false, status: 400, code: 'INVALID_QUANTITY', error: '卖出金额不足以形成有效委托' };
      }
      if (estimatedQuantity > Number(position.quantity)) {
        return { valid: false, status: 400, code: 'INSUFFICIENT_POSITION', error: '卖出金额对应数量超过当前持仓' };
      }
    } else if (positionPctValue && positionPctValue > 0) {
      if (positionPctValue > 100) {
        return { valid: false, status: 400, code: 'INVALID_POSITION_PCT', error: '卖出仓位比例不能超过100%' };
      }
    } else {
      return { valid: false, status: 400, code: 'INVALID_ORDER', error: '条件单缺少有效的卖出参数' };
    }
  }

  return {
    valid: true,
    account,
    position,
    referencePrice
  };
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
    
    let query = `
      SELECT
        co.*,
        pa.account_name,
        coc.strategy_source,
        coc.strategy_config_id,
        coc.strategy_config_name,
        coc.template_id,
        coc.template_name,
        coc.strategy_id,
        coc.strategy_version,
        coc.report_id,
        scf.execution_feedback_status,
        scf.execution_feedback_confidence,
        scf.total_trades,
        scf.total_pnl
      FROM conditional_order co
      LEFT JOIN portfolio_account pa ON pa.id = co.account_id
      LEFT JOIN conditional_order_context coc ON coc.conditional_order_id = co.id
      LEFT JOIN strategy_config_feedback scf ON scf.strategy_config_id = coc.strategy_config_id
    `;
    let params = [];
    let conditions = [];
    
    if (account_id) {
      conditions.push('co.account_id = ?');
      params.push(account_id);
    }
    if (status) {
      const statusClause = buildStatusClause(status);
      if (statusClause) {
        conditions.push(statusClause.clause.replace(/status/g, 'co.status'));
        params.push(...statusClause.params);
      } else {
        conditions.push('co.status = ?');
        params.push(status);
      }
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY co.created_at DESC';
    
    const orders = await db.allPromise(query, params);
    
    // 安全解析conditions JSON
    const parsedOrders = orders.map(order => ({
      ...order,
      status: normalizeStatusForWrite(order.status),
      conditions: safeJsonParse(order.conditions, [])
    }));
    
    res.json({ success: true, data: parsedOrders, orders: parsedOrders });
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
    
    const order = await db.getPromise(`
      SELECT
        co.*,
        pa.account_name,
        coc.strategy_source,
        coc.strategy_config_id,
        coc.strategy_config_name,
        coc.template_id,
        coc.template_name,
        coc.strategy_id,
        coc.strategy_version,
        coc.report_id,
        scf.execution_feedback_status,
        scf.execution_feedback_confidence,
        scf.total_trades,
        scf.total_pnl
      FROM conditional_order co
      LEFT JOIN portfolio_account pa ON pa.id = co.account_id
      LEFT JOIN conditional_order_context coc ON coc.conditional_order_id = co.id
      LEFT JOIN strategy_config_feedback scf ON scf.strategy_config_id = coc.strategy_config_id
      WHERE co.id = ?
    `, [id]);
    
    if (!order) {
      return res.status(404).json({ success: false, error: '条件单不存在' });
    }
    
    // 安全解析 conditions JSON
    const parsedOrder = {
      ...order,
      status: normalizeStatusForWrite(order.status),
      conditions: safeJsonParse(order.conditions, [])
    };
    
    res.json({ success: true, data: parsedOrder, order: parsedOrder });
  } catch (error) {
    console.error('获取条件单详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 从分析报告导入条件单
 * POST /api/conditional-order/create-from-report
 * @param {string} stock_code - 股票代码
 * @param {string} report_id - 分析报告 ID
 * @param {number} account_id - 账户 ID（可选）
 * @param {number} position_pct - 仓位百分比（可选）
 */
async function createFromReport(req, res) {
  try {
    const { stock_code, report_id, account_id, position_pct } = req.body;
    
    if (!stock_code || !report_id) {
      return res.status(400).json({ success: false, error: '缺少股票代码或报告 ID' });
    }
    
    // 读取分析报告
    const db = await getDatabase();
    const report = await db.getPromise(
      'SELECT * FROM stock_analysis_reports WHERE report_id = ? AND stock_code = ?',
      [report_id, stock_code]
    );
    
    if (!report) {
      return res.status(404).json({ success: false, error: '未找到分析报告' });
    }
    
    // 解析报告决策
    const decisions = JSON.parse(report.report_json).decisions || {};
    const createdOrders = [];
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const persistOrderContext = async (conditionalOrderId) => {
      await db.runPromise(
        `INSERT INTO conditional_order_context (
          conditional_order_id,
          strategy_source,
          strategy_config_name,
          report_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          conditionalOrderId,
          'analysis_report',
          `从分析报告导入: ${report_id}`,
          report_id
        ]
      );
    };
    
    // 1. 创建止损条件单
    if (decisions.stop_loss) {
      const stopLossOrder = {
        account_id: account_id || 1,
        ts_code: stock_code,
        stock_name: report.stock_name,
        order_type: 'stop_loss',
        action: 'sell',
        conditions: JSON.stringify([{
          field: 'price',
          operator: '<=',
          value: decisions.stop_loss
        }]),
        condition_logic: 'AND'
      };
      
      const stopLossResult = await db.runPromise(
        `INSERT INTO conditional_order (
          account_id, ts_code, stock_name, order_type, action,
          conditions, condition_logic, status, start_date, end_date,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'enabled', ?, ?, datetime('now'), datetime('now'))`,
        [stopLossOrder.account_id, stopLossOrder.ts_code, stopLossOrder.stock_name, 
         stopLossOrder.order_type, stopLossOrder.action, stopLossOrder.conditions, 
         stopLossOrder.condition_logic, startDate, endDate]
      );
      await persistOrderContext(stopLossResult.lastID);
      createdOrders.push({ type: 'stop_loss', id: stopLossResult.lastID });
    }
    
    // 2. 创建止盈条件单
    if (decisions.stop_profit) {
      const stopProfits = Array.isArray(decisions.stop_profit) 
        ? decisions.stop_profit 
        : [decisions.stop_profit];
      
      for (const target of stopProfits) {
        const stopProfitOrder = {
          account_id: account_id || 1,
          ts_code: stock_code,
          stock_name: report.stock_name,
          order_type: 'take_profit',
          action: 'sell',
          conditions: JSON.stringify([{
            field: 'price',
            operator: '>=',
            value: target
          }]),
          condition_logic: 'AND'
        };
        
        const stopProfitResult = await db.runPromise(
          `INSERT INTO conditional_order (
            account_id, ts_code, stock_name, order_type, action,
            conditions, condition_logic, status, start_date, end_date,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'enabled', ?, ?, datetime('now'), datetime('now'))`,
          [stopProfitOrder.account_id, stopProfitOrder.ts_code, stopProfitOrder.stock_name,
           stopProfitOrder.order_type, stopProfitOrder.action, stopProfitOrder.conditions,
           stopProfitOrder.condition_logic, startDate, endDate]
        );
        await persistOrderContext(stopProfitResult.lastID);
        createdOrders.push({ type: 'take_profit', target, id: stopProfitResult.lastID });
      }
    }
    
    // 3. 创建建仓条件单（如果有建仓区间）
    if (decisions.entry_zone) {
      const entryZone = decisions.entry_zone;
      const entryOrder = {
        account_id: account_id || 1,
        ts_code: stock_code,
        stock_name: report.stock_name,
        order_type: 'entry',
        action: 'buy',
        position_pct: position_pct || 10,
          conditions: JSON.stringify([{
            field: 'price',
            operator: 'between',
            value: [entryZone.low, entryZone.high]
          }]),
        condition_logic: 'AND'
      };
      
      const entryResult = await db.runPromise(
        `INSERT INTO conditional_order (
          account_id, ts_code, stock_name, order_type, action,
          conditions, condition_logic, status, position_pct,
          start_date, end_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'enabled', ?, ?, ?, datetime('now'), datetime('now'))`,
        [entryOrder.account_id, entryOrder.ts_code, entryOrder.stock_name,
         entryOrder.order_type, entryOrder.action, entryOrder.conditions,
         entryOrder.condition_logic, entryOrder.position_pct, startDate, endDate]
      );
      await persistOrderContext(entryResult.lastID);
      createdOrders.push({ type: 'entry', id: entryResult.lastID });
    }
    
    res.json({
      success: true,
      message: `成功创建 ${createdOrders.length} 个条件单`,
      orders: createdOrders,
      report_id: report_id
    });
    
  } catch (error) {
    console.error('从报告导入条件单失败:', error);
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
      start_date, end_date, max_trigger_count,
      // Strategy context fields
      strategySource, strategyConfigId, strategyConfigName,
      templateId, templateName,
      strategyId, strategyVersion, reportId
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

    const validation = await validateAccountForOrder(db, {
      account_id,
      ts_code,
      action,
      quantity,
      amount,
      position_pct,
      conditions
    });
    if (!validation.valid) {
      return res.status(validation.status).json({
        success: false,
        code: validation.code,
        error: validation.error
      });
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

    const conditionalOrderId = result.lastID;

    // Insert into conditional_order_context side table when any strategy context is present.
    if (
      strategySource || strategyConfigId || strategyConfigName ||
      templateId || templateName ||
      strategyId || strategyVersion || reportId
    ) {
      await db.runPromise(`
        INSERT INTO conditional_order_context (
          conditional_order_id,
          strategy_source,
          strategy_config_id,
          strategy_config_name,
          template_id,
          template_name,
          strategy_id,
          strategy_version,
          report_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [
        conditionalOrderId,
        strategySource || null,
        strategyConfigId || null,
        strategyConfigName || null,
        templateId || null,
        templateName || null,
        strategyId || null,
        strategyVersion || null,
        reportId || null
      ]);
    }

    res.json({
      success: true,
      data: {
        id: conditionalOrderId,
        account_id,
        account_name: validation.account.account_name,
        ts_code,
        stock_name,
        action,
        status: 'enabled'
      }
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
      actualValue = technicalData?.macdSignalValue ?? technicalData?.macdSignal;
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
      return compareValues(
        technicalData?.macdSignalValue ?? technicalData?.macdSignal,
        '>=',
        Number(params.signal)
      );
    case 'macd_bearish':
      return compareValues(
        technicalData?.macdSignalValue ?? technicalData?.macdSignal,
        '<=',
        Number(params.signal)
      );
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
  createFromReport,
  updateConditionalOrder,
  getConditionalOrderHistory,
  deleteConditionalOrder,
  toggleConditionalOrder,
  cancelConditionalOrder,
  checkCondition,
  evaluateCondition,
  compareValues
};
