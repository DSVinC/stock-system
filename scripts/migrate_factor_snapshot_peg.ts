#!/usr/bin/env bun
/**
 * 为 stock_factor_snapshot 补齐 peg 列并回填历史值
 *
 * 执行:
 *   bun scripts/migrate_factor_snapshot_peg.ts
 */

import { Database } from "bun:sqlite";

const DB_PATH = process.env.DB_PATH || "/Volumes/SSD500/openclaw/stock-system/stock_system.db";

function hasColumn(db: Database, table: string, column: string): boolean {
  const rows = db
    .query(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function main() {
  const db = new Database(DB_PATH);
  try {
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA busy_timeout = 5000");

    const hasPeg = hasColumn(db, "stock_factor_snapshot", "peg");
    if (!hasPeg) {
      db.run("ALTER TABLE stock_factor_snapshot ADD COLUMN peg REAL");
      console.log("✅ 已添加列: peg");
    } else {
      console.log("ℹ️ 列 peg 已存在，跳过添加");
    }

    const update = db.prepare(`
      UPDATE stock_factor_snapshot
      SET peg = CASE
        WHEN pe_ttm IS NOT NULL AND netprofit_growth IS NOT NULL AND netprofit_growth > 0
          THEN pe_ttm / netprofit_growth
        ELSE NULL
      END
      WHERE peg IS NULL
    `);
    const result = update.run();
    console.log(`✅ 已回填 peg 行数: ${result.changes}`);

    const stats = db
      .query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN peg IS NOT NULL THEN 1 ELSE 0 END) AS peg_filled
        FROM stock_factor_snapshot
      `)
      .get() as { total: number; peg_filled: number };
    console.log(`📊 stock_factor_snapshot 总行数: ${stats.total}, peg 已填充: ${stats.peg_filled}`);
  } finally {
    db.close();
  }
}

main();
