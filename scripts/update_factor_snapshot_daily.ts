#!/usr/bin/env bun

import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

function parseDate8(dateStr: string): Date | null {
  const s = String(dateStr || '').trim();
  if (!/^\d{8}$/.test(s)) return null;
  return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
}

function formatDate8(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function runCommand(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare('SELECT MAX(trade_date) AS max_trade_date FROM stock_factor_snapshot').get() as { max_trade_date?: string } | undefined;
  db.close();

  const snapshotMaxDate = row?.max_trade_date ? String(row.max_trade_date) : null;
  if (!snapshotMaxDate) {
    throw new Error('stock_factor_snapshot 为空，无法执行增量更新');
  }

  const marketData = await import(path.join(ROOT, 'api', 'market-data.js'));
  const latest = await marketData.findLatestTradeDate();
  const latestMarketDate = typeof latest === 'string' ? latest : latest.tradeDate;

  const startDateObj = addDays(parseDate8(snapshotMaxDate) as Date, 1);
  const endDateObj = parseDate8(latestMarketDate);
  if (!startDateObj || !endDateObj) {
    throw new Error(`日期解析失败 snapshot=${snapshotMaxDate} latest=${latestMarketDate}`);
  }

  const startDate = formatDate8(startDateObj);
  const endDate = formatDate8(endDateObj);

  console.log(`[snapshot-update] DB=${DB_PATH}`);
  console.log(`[snapshot-update] snapshot_max=${snapshotMaxDate}, market_latest=${latestMarketDate}`);

  if (startDate > endDate) {
    console.log('[snapshot-update] 无需更新，快照已是最新交易日');
    return;
  }

  console.log(`[snapshot-update] 增量回填区间: ${startDate} ~ ${endDate}`);

  const env = {
    ...process.env,
    STOCK_DB: DB_PATH,
  };

  await runCommand('python3', ['scripts/backfill_snapshot.py', '--start', startDate, '--end', endDate], env);
  await runCommand('node', ['scripts/backfill_seven_factors.js', '--auto'], env);

  console.log('[snapshot-update] ✅ 增量更新完成');
}

main().catch((error: Error) => {
  console.error(`[snapshot-update] ❌ 失败: ${error.message}`);
  process.exit(1);
});

