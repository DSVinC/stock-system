#!/usr/bin/env python3
"""Simple CLI smoke test for the simulation account database."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from simulation_db import DEFAULT_DB_PATH, SimulationAccountDB


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Test simulation account database workflow")
    parser.add_argument(
        "--db-path",
        default=str(DEFAULT_DB_PATH),
        help="SQLite database path, defaults to stock-system/data/simulation.db",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete the target database before running the test flow",
    )
    return parser


def print_json(title: str, payload: object) -> None:
    print(f"\n[{title}]")
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def main() -> int:
    args = build_parser().parse_args()
    db_path = Path(args.db_path)
    if args.reset and db_path.exists():
        db_path.unlink()

    db = SimulationAccountDB(db_path)
    account = db.create_account("模拟账户A", 200000)
    print_json("创建账户", account)

    buy_trade = db.record_trade(
        account_id=account["account_id"],
        stock_code="600000.SH",
        stock_name="浦发银行",
        trade_type="buy",
        price=10.5,
        volume=1000,
        current_price=10.8,
        triggered_by="manual-test-buy",
    )
    print_json("买入成交", buy_trade)

    repriced_position = db.update_position_price(
        account_id=account["account_id"],
        stock_code="600000.SH",
        current_price=11.2,
    )
    print_json("更新市价后的持仓", repriced_position)

    sell_trade = db.record_trade(
        account_id=account["account_id"],
        stock_code="600000.SH",
        trade_type="sell",
        price=11.2,
        volume=400,
        current_price=11.2,
        triggered_by="manual-test-sell",
    )
    print_json("卖出成交", sell_trade)

    summary = db.get_account_summary(account["account_id"])
    print_json("账户汇总", summary)

    print(f"\n数据库文件: {db_path}")
    print("CLI 测试完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
