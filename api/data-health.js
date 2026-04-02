const Database = require('better-sqlite3');
const { findLatestTradeDate } = require('./market-data');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

function parseTradeDate(value) {
  const s = String(value || '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(4, 6)) - 1;
  const day = Number(s.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDaysUtc(leftDate, rightDate) {
  const ms = leftDate.getTime() - rightDate.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

async function getSnapshotHealth() {
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare('SELECT MAX(trade_date) AS max_trade_date, COUNT(*) AS total_rows FROM stock_factor_snapshot').get();
  db.close();

  const latestSnapshotDate = row?.max_trade_date ? String(row.max_trade_date) : null;
  const totalRows = Number(row?.total_rows || 0);
  const latestTrade = await findLatestTradeDate();
  const latestMarketTradeDate = typeof latestTrade === 'string' ? latestTrade : latestTrade.tradeDate;
  const latestMarketTradeSource = typeof latestTrade === 'string' ? 'unknown' : latestTrade.source;

  let lagDays = null;
  if (latestSnapshotDate && latestMarketTradeDate) {
    const a = parseTradeDate(latestMarketTradeDate);
    const b = parseTradeDate(latestSnapshotDate);
    if (a && b) lagDays = diffDaysUtc(a, b);
  }

  return {
    latestSnapshotDate,
    latestMarketTradeDate,
    latestMarketTradeSource,
    lagDays,
    totalRows,
    healthy: lagDays !== null ? (lagDays >= 0 && lagDays <= 1) : false,
  };
}

function createRouter(express) {
  const router = express.Router();

  router.get('/snapshot', async (_req, res) => {
    try {
      const data = await getSnapshotHealth();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  return router;
}

module.exports = {
  createRouter,
  getSnapshotHealth,
};
