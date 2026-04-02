/**
 * TASK_MOCK_002
 * 模拟交易引擎 API
 */

'use strict';

const crypto = require('node:crypto');
const { getDatabase } = require('./db');

const DEFAULT_SLIPPAGE_RATE = 0.001;
const COMMISSION_RATE = 0.00025;
const MIN_COMMISSION = 5;
const STAMP_DUTY_RATE = 0.001;

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getDataDateNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const cst = new Date(utc + 8 * 60 * 60 * 1000);
  const year = cst.getFullYear();
  const month = String(cst.getMonth() + 1).padStart(2, '0');
  const day = String(cst.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function roundAmount(value) {
  return Number(Number(value).toFixed(4));
}

function buildValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validatePayload(payload) {
  const accountId = String(payload?.account_id || '').trim();
  const tsCode = String(payload?.ts_code || '').trim().toUpperCase();
  const action = String(payload?.action || '').trim().toUpperCase();
  const quantity = toNumber(payload?.quantity);
  const price = toNumber(payload?.price);
  const slippageRate = toNumber(payload?.slippage_rate);

  if (!accountId) {
    throw buildValidationError('缺少 account_id');
  }
  if (!/^\d{6}\.(SZ|SH|BJ)$/.test(tsCode)) {
    throw buildValidationError('ts_code 格式无效，示例: 000001.SZ');
  }
  if (!['BUY', 'SELL'].includes(action)) {
    throw buildValidationError('action 仅支持 BUY 或 SELL');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw buildValidationError('quantity 必须为正整数');
  }
  if (!price || price <= 0) {
    throw buildValidationError('price 必须为正数');
  }

  return {
    accountId,
    tsCode,
    action,
    quantity,
    price,
    slippageRate: slippageRate == null ? DEFAULT_SLIPPAGE_RATE : slippageRate
  };
}

async function loadAccountOrThrow(db, accountId) {
  const account = await db.getPromise(
    `SELECT account_id, strategy_version_id, current_capital, available_capital, status
     FROM mock_account
     WHERE account_id = ?`,
    [accountId]
  );
  if (!account) {
    const error = new Error('模拟账户不存在');
    error.statusCode = 404;
    throw error;
  }
  if (String(account.status || '').toLowerCase() !== 'active') {
    const error = new Error('模拟账户非 active 状态，禁止交易');
    error.statusCode = 400;
    throw error;
  }
  return account;
}

function calcTradeCost(action, quantity, price, slippageRate) {
  const simulatedPrice = roundAmount(
    action === 'BUY'
      ? price * (1 + slippageRate)
      : price * (1 - slippageRate)
  );
  const grossAmount = roundAmount(simulatedPrice * quantity);
  const commission = roundAmount(Math.max(grossAmount * COMMISSION_RATE, MIN_COMMISSION));
  const stampDuty = action === 'SELL' ? roundAmount(grossAmount * STAMP_DUTY_RATE) : 0;
  const netAmount = action === 'BUY'
    ? roundAmount(grossAmount + commission + stampDuty)
    : roundAmount(grossAmount - commission - stampDuty);

  return {
    simulatedPrice,
    grossAmount,
    commission,
    stampDuty,
    netAmount
  };
}

async function executeBuy(db, account, payload, cost, occurredAt) {
  if (Number(account.available_capital) < cost.netAmount) {
    throw buildValidationError('可用资金不足，无法执行买入');
  }

  const existing = await db.getPromise(
    `SELECT position_id, quantity, avg_cost
     FROM mock_position
     WHERE account_id = ? AND ts_code = ?`,
    [payload.accountId, payload.tsCode]
  );

  if (existing) {
    const oldQuantity = Number(existing.quantity);
    const oldAvgCost = Number(existing.avg_cost);
    const oldCostAmount = oldQuantity * oldAvgCost;
    const newQuantity = oldQuantity + payload.quantity;
    const newAvgCost = roundAmount((oldCostAmount + cost.netAmount) / newQuantity);

    await db.runPromise(
      `UPDATE mock_position
       SET quantity = ?, avg_cost = ?, current_price = ?, market_value = ?, unrealized_pnl = ?, updated_at = ?
       WHERE position_id = ?`,
      [
        newQuantity,
        newAvgCost,
        payload.price,
        roundAmount(newQuantity * payload.price),
        roundAmount((payload.price - newAvgCost) * newQuantity),
        occurredAt,
        existing.position_id
      ]
    );
  } else {
    const positionId = crypto.randomUUID();
    const marketValue = roundAmount(payload.quantity * payload.price);
    const unrealizedPnl = roundAmount((payload.price - cost.netAmount / payload.quantity) * payload.quantity);
    await db.runPromise(
      `INSERT INTO mock_position (
        position_id, account_id, ts_code, quantity, avg_cost, current_price, market_value, unrealized_pnl, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        positionId,
        payload.accountId,
        payload.tsCode,
        payload.quantity,
        roundAmount(cost.netAmount / payload.quantity),
        payload.price,
        marketValue,
        unrealizedPnl,
        occurredAt,
        occurredAt
      ]
    );
  }

  await db.runPromise(
    `UPDATE mock_account
     SET current_capital = current_capital - ?,
         available_capital = available_capital - ?
     WHERE account_id = ?`,
    [cost.netAmount, cost.netAmount, payload.accountId]
  );

  return null;
}

async function executeSell(db, account, payload, cost, occurredAt) {
  const existing = await db.getPromise(
    `SELECT position_id, quantity, avg_cost
     FROM mock_position
     WHERE account_id = ? AND ts_code = ?`,
    [payload.accountId, payload.tsCode]
  );

  if (!existing || Number(existing.quantity) <= 0) {
    throw buildValidationError('无可卖持仓');
  }
  if (Number(existing.quantity) < payload.quantity) {
    throw buildValidationError('卖出数量超过当前持仓');
  }

  const realizedCost = roundAmount(Number(existing.avg_cost) * payload.quantity);
  const pnl = roundAmount(cost.netAmount - realizedCost);
  const remainQuantity = Number(existing.quantity) - payload.quantity;

  if (remainQuantity === 0) {
    await db.runPromise(
      'DELETE FROM mock_position WHERE position_id = ?',
      [existing.position_id]
    );
  } else {
    await db.runPromise(
      `UPDATE mock_position
       SET quantity = ?, current_price = ?, market_value = ?, unrealized_pnl = ?, updated_at = ?
       WHERE position_id = ?`,
      [
        remainQuantity,
        payload.price,
        roundAmount(remainQuantity * payload.price),
        roundAmount((payload.price - Number(existing.avg_cost)) * remainQuantity),
        occurredAt,
        existing.position_id
      ]
    );
  }

  await db.runPromise(
    `UPDATE mock_account
     SET current_capital = current_capital + ?,
         available_capital = available_capital + ?
     WHERE account_id = ?`,
    [cost.netAmount, cost.netAmount, payload.accountId]
  );

  return pnl;
}

async function executeTrade(req, res) {
  const db = await getDatabase();
  try {
    const payload = validatePayload(req.body || {});
    const account = await loadAccountOrThrow(db, payload.accountId);
    const occurredAt = new Date().toISOString();
    const dataDate = getDataDateNow();
    const cost = calcTradeCost(payload.action, payload.quantity, payload.price, payload.slippageRate);

    await db.runPromise('BEGIN TRANSACTION');

    let pnl = null;
    if (payload.action === 'BUY') {
      await executeBuy(db, account, payload, cost, occurredAt);
    } else {
      pnl = await executeSell(db, account, payload, cost, occurredAt);
    }

    const tradeId = crypto.randomUUID();
    await db.runPromise(
      `INSERT INTO mock_trade (
        trade_id, account_id, ts_code, action, quantity, price, simulated_price, slippage_rate,
        commission, stamp_duty, pnl, trade_type, trigger_source, strategy_version_id, data_date,
        execution_status, reject_reason, occurred_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'simulation', ?, ?, ?, 'FILLED', NULL, ?, ?)`,
      [
        tradeId,
        payload.accountId,
        payload.tsCode,
        payload.action,
        payload.quantity,
        payload.price,
        cost.simulatedPrice,
        payload.slippageRate,
        cost.commission,
        cost.stampDuty,
        pnl,
        req.body?.trigger_source || 'api_manual',
        req.body?.strategy_version_id || account.strategy_version_id || null,
        dataDate,
        occurredAt,
        occurredAt
      ]
    );

    const accountAfter = await db.getPromise(
      `SELECT account_id, current_capital, available_capital, status
       FROM mock_account
       WHERE account_id = ?`,
      [payload.accountId]
    );
    const positionAfter = await db.getPromise(
      `SELECT account_id, ts_code, quantity, avg_cost, current_price, market_value, unrealized_pnl
       FROM mock_position
       WHERE account_id = ? AND ts_code = ?`,
      [payload.accountId, payload.tsCode]
    );

    await db.runPromise('COMMIT');

    return res.json({
      success: true,
      data: {
        trade_id: tradeId,
        account_id: payload.accountId,
        ts_code: payload.tsCode,
        action: payload.action,
        quantity: payload.quantity,
        price: payload.price,
        simulated_price: cost.simulatedPrice,
        slippage_rate: payload.slippageRate,
        commission: cost.commission,
        stamp_duty: cost.stampDuty,
        pnl,
        data_date: dataDate,
        account: accountAfter,
        position: positionAfter || null
      }
    });
  } catch (error) {
    try {
      await db.runPromise('ROLLBACK');
    } catch (_rollbackError) {
      // ignore
    }
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode).json({
      success: false,
      message: error?.message || '模拟交易执行失败'
    });
  }
}

function createRouter(express) {
  const router = express.Router();
  router.post('/execute', executeTrade);
  return router;
}

module.exports = {
  createRouter,
  executeTrade
};
