/**
 * 条件单执行器
 * 负责条件校验、成交落库、持仓更新和状态推进
 */

const { getDatabase } = require('./db');
const { checkCondition } = require('./conditional-order');

const BOARD_LOT_SIZE = 100;
const COMMISSION_RATE = 0.001;

function roundTo(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolvePrice(marketData = {}) {
  const candidates = [
    marketData.price,
    marketData.current_price,
    marketData.currentPrice,
    marketData.last_price,
    marketData.lastPrice,
    marketData.close
  ];

  for (const candidate of candidates) {
    const price = toNumber(candidate);
    if (price && price > 0) {
      return price;
    }
  }

  return null;
}

function isSuspended(marketData = {}) {
  const statusText = String(
    marketData.status
    || marketData.trade_status
    || marketData.tradeStatus
    || marketData.security_status
    || ''
  ).toLowerCase();

  if (marketData.suspended === true || marketData.isSuspended === true) {
    return true;
  }

  return ['suspended', 'halted', '停牌', '停牌一天'].some((keyword) => statusText.includes(keyword));
}

function getExecutionMode(order) {
  if (toNumber(order.quantity) > 0) return 'quantity';
  if (toNumber(order.amount) > 0) return 'amount';
  if (toNumber(order.position_pct) > 0) return 'position_pct';
  throw createExecutorError('INVALID_ORDER', '条件单缺少有效的下单参数');
}

function normalizeQuantity(rawQuantity, action, maxSellQuantity = null) {
  const quantity = Math.floor(Number(rawQuantity) || 0);
  if (quantity <= 0) {
    return 0;
  }

  if (action === 'sell' && Number.isFinite(maxSellQuantity) && quantity >= maxSellQuantity) {
    return Math.floor(maxSellQuantity);
  }

  return Math.floor(quantity / BOARD_LOT_SIZE) * BOARD_LOT_SIZE;
}

function createExecutorError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildFailure(error) {
  return {
    success: false,
    code: error.code || 'EXECUTION_FAILED',
    error: error.message
  };
}

async function getOrderById(db, orderId) {
  const order = await db.getPromise('SELECT * FROM conditional_order WHERE id = ?', [orderId]);
  if (!order) {
    throw createExecutorError('ORDER_NOT_FOUND', '条件单不存在');
  }

  let conditions = order.conditions;
  if (typeof order.conditions === 'string') {
    try {
      conditions = JSON.parse(order.conditions);
    } catch (error) {
      throw createExecutorError('INVALID_CONDITIONS', '条件单条件配置损坏，无法执行');
    }
  }

  return {
    ...order,
    conditions
  };
}

function ensureOrderActive(order) {
  if (!['enabled', 'pending'].includes(order.status)) {
    throw createExecutorError('ORDER_NOT_ACTIVE', `条件单状态不可执行: ${order.status}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  if (order.start_date && order.start_date > today) {
    throw createExecutorError('ORDER_NOT_STARTED', '条件单尚未到生效时间');
  }
  if (order.end_date && order.end_date < today) {
    throw createExecutorError('ORDER_EXPIRED', '条件单已过期');
  }
}

async function loadAccountState(db, order) {
  const account = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [order.account_id]);
  if (!account) {
    throw createExecutorError('ACCOUNT_NOT_FOUND', '账户不存在');
  }

  const position = await db.getPromise(
    'SELECT * FROM portfolio_position WHERE account_id = ? AND ts_code = ?',
    [order.account_id, order.ts_code]
  );

  return { account, position };
}

function calculateQuantity(order, account, position, price) {
  const executionMode = getExecutionMode(order);

  if (executionMode === 'quantity') {
    return {
      executionMode,
      quantity: normalizeQuantity(order.quantity, order.action)
    };
  }

  if (executionMode === 'amount') {
    const targetAmount = toNumber(order.amount);
    if (!targetAmount || targetAmount <= 0) {
      throw createExecutorError('INVALID_ORDER', '金额下单参数无效');
    }

    const rawQuantity = Math.floor(targetAmount / price);
    return {
      executionMode,
      quantity: normalizeQuantity(rawQuantity, order.action, position?.quantity ?? null)
    };
  }

  const pct = toNumber(order.position_pct);
  if (!pct || pct <= 0) {
    throw createExecutorError('INVALID_ORDER', '仓位百分比参数无效');
  }

  if (order.action === 'buy') {
    const availableAmount = account.current_cash * (pct / 100);
    const rawQuantity = Math.floor(availableAmount / price);
    return {
      executionMode,
      quantity: normalizeQuantity(rawQuantity, order.action)
    };
  }

  if (!position || position.quantity <= 0) {
    throw createExecutorError('INSUFFICIENT_POSITION', '持仓不足');
  }

  const rawQuantity = Math.floor(position.quantity * (pct / 100));
  return {
    executionMode,
    quantity: normalizeQuantity(rawQuantity, order.action, position.quantity)
  };
}

function validateTradeRequest(order, account, position, quantity, tradeAmount, fee) {
  if (!quantity || quantity <= 0) {
    throw createExecutorError('INVALID_QUANTITY', '交易数量不足，无法形成有效委托');
  }

  if (order.action === 'buy') {
    if (quantity < BOARD_LOT_SIZE) {
      throw createExecutorError('INVALID_QUANTITY', '买入数量不足100股');
    }

    const totalCost = tradeAmount + fee;
    if (totalCost > account.current_cash) {
      throw createExecutorError('INSUFFICIENT_FUNDS', '资金不足');
    }

    return;
  }

  if (!position || position.quantity <= 0) {
    throw createExecutorError('INSUFFICIENT_POSITION', '持仓不足');
  }

  if (quantity > position.quantity) {
    throw createExecutorError('INSUFFICIENT_POSITION', '持仓不足');
  }
}

async function applyBuy(db, order, position, quantity, price) {
  const previousQuantity = position?.quantity || 0;
  const previousCost = position?.cost_amount || 0;
  const newQuantity = previousQuantity + quantity;
  const newCost = roundTo(previousCost + quantity * price);
  const marketValue = roundTo(newQuantity * price);
  const avgPrice = roundTo(newCost / newQuantity);
  const unrealizedPnl = roundTo(marketValue - newCost);
  const unrealizedPnlRate = newCost > 0 ? roundTo(unrealizedPnl / newCost, 6) : 0;

  if (position) {
    await db.runPromise(`
      UPDATE portfolio_position
      SET quantity = ?, avg_price = ?, cost_amount = ?, current_price = ?, market_value = ?,
          unrealized_pnl = ?, unrealized_pnl_rate = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [newQuantity, avgPrice, newCost, price, marketValue, unrealizedPnl, unrealizedPnlRate, position.id]);
    return;
  }

  await db.runPromise(`
    INSERT INTO portfolio_position (
      account_id, ts_code, stock_name, quantity, avg_price, cost_amount,
      current_price, market_value, unrealized_pnl, unrealized_pnl_rate,
      position_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), datetime('now'))
  `, [order.account_id, order.ts_code, order.stock_name, newQuantity, avgPrice, newCost, price, marketValue, unrealizedPnl, unrealizedPnlRate]);
}

async function applySell(db, position, quantity, price) {
  const remainingQuantity = position.quantity - quantity;

  if (remainingQuantity <= 0) {
    await db.runPromise('DELETE FROM portfolio_position WHERE id = ?', [position.id]);
    return;
  }

  const remainingCost = roundTo((remainingQuantity / position.quantity) * position.cost_amount);
  const marketValue = roundTo(remainingQuantity * price);
  const unrealizedPnl = roundTo(marketValue - remainingCost);
  const unrealizedPnlRate = remainingCost > 0 ? roundTo(unrealizedPnl / remainingCost, 6) : 0;

  await db.runPromise(`
    UPDATE portfolio_position
    SET quantity = ?, cost_amount = ?, current_price = ?, market_value = ?,
        unrealized_pnl = ?, unrealized_pnl_rate = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [remainingQuantity, remainingCost, price, marketValue, unrealizedPnl, unrealizedPnlRate, position.id]);
}

async function updateAccountSnapshot(db, accountId) {
  const account = await db.getPromise('SELECT * FROM portfolio_account WHERE id = ?', [accountId]);
  const positions = await db.allPromise(
    'SELECT COALESCE(market_value, 0) AS market_value FROM portfolio_position WHERE account_id = ?',
    [accountId]
  );

  const positionValue = positions.reduce((sum, item) => sum + (Number(item.market_value) || 0), 0);
  const totalValue = roundTo(account.current_cash + positionValue);
  const totalReturn = roundTo(totalValue - account.initial_cash);
  const returnRate = account.initial_cash > 0 ? roundTo(totalReturn / account.initial_cash, 6) : 0;

  await db.runPromise(`
    UPDATE portfolio_account
    SET total_value = ?, total_return = ?, return_rate = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [totalValue, totalReturn, returnRate, accountId]);
}

async function recordTrade(db, order, quantity, price, tradeAmount, executionMode) {
  const remark = `条件单执行成功(${executionMode})`;

  await db.runPromise(`
    INSERT INTO portfolio_trade (
      account_id, ts_code, stock_name, action, quantity, price, amount,
      trade_date, order_type, conditional_order_id, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
  `, [
    order.account_id,
    order.ts_code,
    order.stock_name,
    order.action,
    quantity,
    price,
    tradeAmount,
    executionMode,
    order.id,
    remark
  ]);
}

async function updateConditionalOrderState(db, order) {
  const nextTriggerCount = (order.trigger_count || 0) + 1;
  const maxTriggerCount = Number(order.max_trigger_count) || 0;
  const nextStatus = maxTriggerCount > 0 && nextTriggerCount >= maxTriggerCount ? 'expired' : 'enabled';

  await db.runPromise(`
    UPDATE conditional_order
    SET trigger_count = ?, last_trigger_time = datetime('now'), status = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [nextTriggerCount, nextStatus, order.id]);

  return { nextTriggerCount, nextStatus };
}

async function executeConditionalOrder(orderId, marketData = {}, technicalData = {}, options = {}) {
  const db = options.db || await getDatabase();
  const shouldCheckCondition = options.skipConditionCheck !== true;

  try {
    const order = await getOrderById(db, orderId);
    ensureOrderActive(order);

    if (isSuspended(marketData)) {
      throw createExecutorError('SECURITY_SUSPENDED', '股票停牌，无法执行');
    }

    const price = resolvePrice(marketData);
    if (!price) {
      throw createExecutorError('INVALID_MARKET_DATA', '获取行情失败或价格无效');
    }

    if (shouldCheckCondition && !checkCondition(order, marketData, technicalData)) {
      return {
        success: false,
        code: 'CONDITION_NOT_TRIGGERED',
        error: '条件未触发'
      };
    }

    await db.runPromise('BEGIN TRANSACTION');

    const { account, position } = await loadAccountState(db, order);
    const { executionMode, quantity } = calculateQuantity(order, account, position, price);
    const tradeAmount = roundTo(quantity * price);
    const fee = roundTo(tradeAmount * COMMISSION_RATE);

    validateTradeRequest(order, account, position, quantity, tradeAmount, fee);

    if (order.action === 'buy') {
      await db.runPromise(
        'UPDATE portfolio_account SET current_cash = current_cash - ? WHERE id = ?',
        [roundTo(tradeAmount + fee), order.account_id]
      );
      await applyBuy(db, order, position, quantity, price);
    } else if (order.action === 'sell') {
      await db.runPromise(
        'UPDATE portfolio_account SET current_cash = current_cash + ? WHERE id = ?',
        [roundTo(tradeAmount - fee), order.account_id]
      );
      await applySell(db, position, quantity, price);
    } else {
      throw createExecutorError('INVALID_ACTION', `不支持的交易动作: ${order.action}`);
    }

    await recordTrade(db, order, quantity, price, tradeAmount, executionMode);
    const orderState = await updateConditionalOrderState(db, order);
    await updateAccountSnapshot(db, order.account_id);
    await db.runPromise('COMMIT');

    return {
      success: true,
      order_id: order.id,
      account_id: order.account_id,
      ts_code: order.ts_code,
      stock_name: order.stock_name,
      action: order.action,
      quantity,
      price,
      amount: tradeAmount,
      fee,
      execution_mode: executionMode,
      trigger_count: orderState.nextTriggerCount,
      status: orderState.nextStatus
    };
  } catch (error) {
    try {
      await db.runPromise('ROLLBACK');
    } catch (rollbackError) {
      if (!String(rollbackError.message || '').includes('no transaction is active')) {
        console.error('[conditional-executor] 回滚失败:', rollbackError.message);
      }
    }

    return buildFailure(error);
  }
}

module.exports = {
  executeConditionalOrder,
  isSuspended,
  resolvePrice
};
