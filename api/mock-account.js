'use strict';

const crypto = require('node:crypto');
const { getDatabase } = require('./db');

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return null;
}

async function createAccount(req, res) {
  try {
    const {
      strategy_version_id: strategyVersionId,
      strategy_type: strategyType = null,
      account_name: accountName,
      initial_capital: initialCapital
    } = req.body || {};

    if (!strategyVersionId || !accountName) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：strategy_version_id, account_name'
      });
    }

    const capital = toNumber(initialCapital, null);
    if (capital === null || capital <= 0) {
      return res.status(400).json({
        success: false,
        error: 'initial_capital 必须为正数'
      });
    }

    const db = await getDatabase();
    const version = await db.getPromise(
      'SELECT version_id FROM strategy_versions WHERE version_id = ?',
      [strategyVersionId]
    );
    if (!version) {
      return res.status(404).json({
        success: false,
        error: '策略版本不存在'
      });
    }

    const accountId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.runPromise(
      `INSERT INTO mock_account (
        account_id, strategy_version_id, strategy_type, account_name,
        initial_capital, current_capital, available_capital, status, created_at, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [accountId, strategyVersionId, strategyType, accountName, capital, capital, capital, now, now]
    );

    return res.json({
      success: true,
      account: {
        account_id: accountId,
        strategy_version_id: strategyVersionId,
        strategy_type: strategyType,
        account_name: accountName,
        initial_capital: capital,
        current_capital: capital,
        available_capital: capital,
        status: 'active',
        created_at: now
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function listAccounts(req, res) {
  try {
    const db = await getDatabase();
    const rows = await db.allPromise(
      `SELECT account_id, strategy_version_id, strategy_type, account_name,
              initial_capital, current_capital, available_capital, status, created_at, started_at
       FROM mock_account
       ORDER BY created_at DESC`
    );

    const data = rows.map((row) => {
      const initial = toNumber(row.initial_capital, 0) || 0;
      const current = toNumber(row.current_capital, 0) || 0;
      const totalReturn = initial > 0 ? (current - initial) / initial : 0;
      const startAt = new Date(row.started_at || row.created_at || Date.now());
      const daysRunning = Math.max(1, Math.floor((Date.now() - startAt.getTime()) / 86400000) + 1);
      return {
        ...row,
        total_return: totalReturn,
        days_running: daysRunning
      };
    });

    return res.json({ success: true, accounts: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function stopAccount(req, res) {
  try {
    const { account_id: accountId } = req.body || {};
    if (!accountId) {
      return res.status(400).json({ success: false, error: '缺少 account_id' });
    }

    const db = await getDatabase();
    const result = await db.runPromise(
      `UPDATE mock_account
       SET status = 'stopped', stopped_at = ?, current_capital = current_capital
       WHERE account_id = ?`,
      [new Date().toISOString(), accountId]
    );

    if (!result.changes) {
      return res.status(404).json({ success: false, error: '模拟账户不存在' });
    }
    return res.json({ success: true, message: '模拟账户已停止' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function listTrades(req, res) {
  try {
    const { account_id: accountId, ts_code: tsCode, start_date: startDate, end_date: endDate } = req.query || {};
    if (!accountId) {
      return res.status(400).json({ success: false, error: '缺少 account_id' });
    }

    const clauses = ['account_id = ?'];
    const params = [accountId];

    if (tsCode) {
      clauses.push('ts_code = ?');
      params.push(String(tsCode).trim().toUpperCase());
    }
    if (startDate) {
      const normalized = normalizeDate(startDate);
      if (normalized) {
        clauses.push('date(occurred_at) >= date(?)');
        params.push(normalized);
      }
    }
    if (endDate) {
      const normalized = normalizeDate(endDate);
      if (normalized) {
        clauses.push('date(occurred_at) <= date(?)');
        params.push(normalized);
      }
    }

    const db = await getDatabase();
    const rows = await db.allPromise(
      `SELECT trade_id, account_id, ts_code, action, quantity, price, simulated_price, slippage_rate,
              commission, stamp_duty, pnl, strategy_version_id, data_date, execution_status, reject_reason,
              trigger_source, occurred_at, created_at
       FROM mock_trade
       WHERE ${clauses.join(' AND ')}
       ORDER BY occurred_at DESC, created_at DESC`,
      params
    );

    return res.json({ success: true, trades: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function getCurrentPerformance(req, res) {
  try {
    const { account_id: accountId } = req.query || {};
    if (!accountId) {
      return res.status(400).json({ success: false, error: '缺少 account_id' });
    }

    const db = await getDatabase();
    const row = await db.getPromise(
      `SELECT *
       FROM mock_performance
       WHERE account_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [accountId]
    );

    if (!row) {
      return res.status(404).json({ success: false, error: '未找到绩效记录' });
    }
    return res.json({ success: true, performance: row });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function getDeviationAccounts(req, res) {
  try {
    const threshold = toNumber(req.query?.threshold, 0.2);
    const db = await getDatabase();
    const rows = await db.allPromise(
      `SELECT p.account_id, p.strategy_version_id, p.backtest_deviation, p.drawdown_deviation,
              p.win_rate_deviation, p.period_end, p.trade_count, p.is_sample_valid, p.created_at
       FROM mock_performance p
       INNER JOIN (
         SELECT account_id, MAX(created_at) AS latest_created_at
         FROM mock_performance
         GROUP BY account_id
       ) latest
         ON latest.account_id = p.account_id AND latest.latest_created_at = p.created_at
       WHERE ABS(COALESCE(p.backtest_deviation, 0)) > ?
       ORDER BY ABS(COALESCE(p.backtest_deviation, 0)) DESC`,
      [threshold]
    );

    return res.json({ success: true, exceeded_accounts: rows });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function getPerformanceAlerts(req, res) {
  try {
    const db = await getDatabase();
    const rows = await db.allPromise(
      `SELECT p.account_id, p.strategy_version_id, p.is_sample_valid, p.trade_count,
              p.backtest_deviation, p.drawdown_deviation, p.win_rate_deviation, p.period_end, p.created_at
       FROM mock_performance p
       INNER JOIN (
         SELECT account_id, MAX(created_at) AS latest_created_at
         FROM mock_performance
         GROUP BY account_id
       ) latest
         ON latest.account_id = p.account_id AND latest.latest_created_at = p.created_at
       WHERE p.is_deviation_exceeded = 1
       ORDER BY p.created_at DESC`
    );

    const alerts = rows.map((row) => ({
      ...row,
      suggestion: Number(row.is_sample_valid) === 1
        ? '需要人工确认是否触发二次迭代'
        : '样本不足，先补齐交易样本再评估是否触发二次迭代'
    }));

    return res.json({ success: true, alerts });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

function createRouter(express) {
  const router = express.Router();
  router.post('/account/create', createAccount);
  router.get('/account/list', listAccounts);
  router.post('/account/stop', stopAccount);

  router.get('/trade/list', listTrades);

  router.get('/performance/current', getCurrentPerformance);
  router.get('/performance/deviation', getDeviationAccounts);
  router.get('/performance/alerts', getPerformanceAlerts);

  return router;
}

module.exports = {
  createRouter,
  createAccount,
  listAccounts,
  stopAccount,
  listTrades,
  getCurrentPerformance,
  getDeviationAccounts,
  getPerformanceAlerts
};
