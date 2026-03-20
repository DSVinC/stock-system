#!/usr/bin/env python3
"""SQLite-backed simulation account database helpers for stock-system."""

from __future__ import annotations

import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BASE_DIR / "data" / "simulation.db"
SCHEMA_PATH = BASE_DIR / "docs" / "db" / "simulation_schema.sql"


@dataclass(frozen=True)
class FeeBreakdown:
    commission: float
    tax: float
    transfer_fee: float

    @property
    def total_fees(self) -> float:
        return round(self.commission + self.tax + self.transfer_fee, 4)


class SimulationAccountDB:
    """Database operations for simulation accounts, trades, and positions."""

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

    @contextmanager
    def connect(self) -> Iterable[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _initialize_schema(self) -> None:
        schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(schema_sql)

    @staticmethod
    def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
        return dict(row) if row is not None else None

    @staticmethod
    def _rows_to_dicts(rows: Iterable[sqlite3.Row]) -> List[Dict[str, Any]]:
        return [dict(row) for row in rows]

    @staticmethod
    def _now() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _new_id() -> str:
        return str(uuid.uuid4())

    @staticmethod
    def _validate_initial_capital(initial_capital: int) -> None:
        if not isinstance(initial_capital, int):
            raise ValueError("initial_capital 必须是整数")
        if not 1 <= initial_capital <= 1_000_000:
            raise ValueError("initial_capital 必须在 1 到 1,000,000 之间")

    @staticmethod
    def _normalize_trade_type(trade_type: str) -> str:
        value = trade_type.lower()
        if value not in {"buy", "sell"}:
            raise ValueError("trade_type 只能是 buy 或 sell")
        return value

    @staticmethod
    def _is_shanghai(stock_code: str) -> bool:
        normalized = stock_code.upper()
        return normalized.startswith(("6", "9")) or normalized.endswith(".SH")

    @classmethod
    def calculate_fees(cls, stock_code: str, trade_type: str, trade_amount: float) -> FeeBreakdown:
        normalized_type = cls._normalize_trade_type(trade_type)
        commission = max(round(trade_amount * 0.00025, 4), 5.0)
        tax = round(trade_amount * 0.001, 4) if normalized_type == "sell" else 0.0
        transfer_fee = round(trade_amount * 0.00002, 4) if cls._is_shanghai(stock_code) else 0.0
        return FeeBreakdown(commission=commission, tax=tax, transfer_fee=transfer_fee)

    def create_account(self, account_name: str, initial_capital: int) -> Dict[str, Any]:
        self._validate_initial_capital(initial_capital)
        if not account_name or not account_name.strip():
            raise ValueError("account_name 不能为空")

        account_id = self._new_id()
        now = self._now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO accounts (
                    account_id, account_name, initial_capital, current_cash, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (account_id, account_name.strip(), initial_capital, float(initial_capital), now, now),
            )
        return self.get_account(account_id)

    def get_account(self, account_id: str) -> Dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT
                    a.account_id,
                    a.account_name,
                    a.initial_capital,
                    a.current_cash,
                    a.created_at,
                    a.updated_at,
                    COALESCE(SUM(p.market_value), 0) AS total_market_value,
                    a.current_cash + COALESCE(SUM(p.market_value), 0) AS total_assets
                FROM accounts a
                LEFT JOIN positions p ON p.account_id = a.account_id
                WHERE a.account_id = ?
                GROUP BY a.account_id
                """,
                (account_id,),
            ).fetchone()
        if row is None:
            raise KeyError(f"account_id 不存在: {account_id}")
        return dict(row)

    def list_accounts(self) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    a.account_id,
                    a.account_name,
                    a.initial_capital,
                    a.current_cash,
                    a.created_at,
                    COALESCE(SUM(p.market_value), 0) AS total_market_value,
                    a.current_cash + COALESCE(SUM(p.market_value), 0) AS total_assets
                FROM accounts a
                LEFT JOIN positions p ON p.account_id = a.account_id
                GROUP BY a.account_id
                ORDER BY a.created_at DESC
                """
            ).fetchall()
        return self._rows_to_dicts(rows)

    def get_position(self, account_id: str, stock_code: str) -> Optional[Dict[str, Any]]:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM positions WHERE account_id = ? AND stock_code = ?",
                (account_id, stock_code),
            ).fetchone()
        return self._row_to_dict(row)

    def list_positions(self, account_id: str) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM positions
                WHERE account_id = ?
                ORDER BY market_value DESC, stock_code ASC
                """,
                (account_id,),
            ).fetchall()
        return self._rows_to_dicts(rows)

    def list_trades(self, account_id: str) -> List[Dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM trades
                WHERE account_id = ?
                ORDER BY trade_time DESC, created_at DESC
                """,
                (account_id,),
            ).fetchall()
        return self._rows_to_dicts(rows)

    def record_trade(
        self,
        account_id: str,
        stock_code: str,
        trade_type: str,
        price: float,
        volume: int,
        stock_name: Optional[str] = None,
        current_price: Optional[float] = None,
        triggered_by: Optional[str] = None,
        trade_time: Optional[str] = None,
    ) -> Dict[str, Any]:
        if price <= 0:
            raise ValueError("price 必须大于 0")
        if volume <= 0:
            raise ValueError("volume 必须大于 0")

        normalized_type = self._normalize_trade_type(trade_type)
        account = self.get_account(account_id)
        trade_amount = round(price * volume, 4)
        fees = self.calculate_fees(stock_code=stock_code, trade_type=normalized_type, trade_amount=trade_amount)
        total_cost = round(trade_amount + fees.total_fees, 4) if normalized_type == "buy" else round(trade_amount - fees.total_fees, 4)
        trade_id = self._new_id()
        effective_price = current_price if current_price is not None else price
        trade_timestamp = trade_time or self._now()

        with self.connect() as conn:
            if normalized_type == "buy":
                if account["current_cash"] < total_cost:
                    raise ValueError("可用资金不足，无法完成买入")
                new_cash = round(account["current_cash"] - total_cost, 4)
                self._apply_buy(
                    conn=conn,
                    account_id=account_id,
                    stock_code=stock_code,
                    stock_name=stock_name,
                    volume=volume,
                    price=price,
                    current_price=effective_price,
                )
            else:
                new_cash = round(account["current_cash"] + total_cost, 4)
                self._apply_sell(
                    conn=conn,
                    account_id=account_id,
                    stock_code=stock_code,
                    volume=volume,
                    current_price=effective_price,
                )

            conn.execute(
                "UPDATE accounts SET current_cash = ? WHERE account_id = ?",
                (new_cash, account_id),
            )
            conn.execute(
                """
                INSERT INTO trades (
                    trade_id, account_id, stock_code, trade_type, trade_price, trade_volume,
                    trade_amount, commission, tax, transfer_fee, total_cost, trade_time,
                    triggered_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    trade_id,
                    account_id,
                    stock_code,
                    normalized_type,
                    round(price, 4),
                    volume,
                    trade_amount,
                    fees.commission,
                    fees.tax,
                    fees.transfer_fee,
                    total_cost,
                    trade_timestamp,
                    triggered_by,
                    self._now(),
                ),
            )

        return self.get_trade(trade_id)

    def _apply_buy(
        self,
        conn: sqlite3.Connection,
        account_id: str,
        stock_code: str,
        stock_name: Optional[str],
        volume: int,
        price: float,
        current_price: float,
    ) -> None:
        row = conn.execute(
            "SELECT * FROM positions WHERE account_id = ? AND stock_code = ?",
            (account_id, stock_code),
        ).fetchone()
        if row is None:
            hold_volume = volume
            avg_cost = round(price, 4)
            market_value = round(current_price * hold_volume, 4)
            floating_pnl = round((current_price - avg_cost) * hold_volume, 4)
            floating_pnl_pct = round((floating_pnl / (avg_cost * hold_volume)) * 100, 4) if hold_volume else 0.0
            conn.execute(
                """
                INSERT INTO positions (
                    position_id, account_id, stock_code, stock_name, hold_volume, avg_cost,
                    current_price, market_value, floating_pnl, floating_pnl_pct, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self._new_id(),
                    account_id,
                    stock_code,
                    stock_name,
                    hold_volume,
                    avg_cost,
                    round(current_price, 4),
                    market_value,
                    floating_pnl,
                    floating_pnl_pct,
                    self._now(),
                    self._now(),
                ),
            )
            return

        old_volume = row["hold_volume"]
        new_volume = old_volume + volume
        new_cost_amount = row["avg_cost"] * old_volume + price * volume
        avg_cost = round(new_cost_amount / new_volume, 4)
        stock_name = stock_name or row["stock_name"]
        market_value = round(current_price * new_volume, 4)
        floating_pnl = round((current_price - avg_cost) * new_volume, 4)
        floating_pnl_pct = round((floating_pnl / (avg_cost * new_volume)) * 100, 4) if new_volume else 0.0
        conn.execute(
            """
            UPDATE positions
            SET stock_name = ?, hold_volume = ?, avg_cost = ?, current_price = ?,
                market_value = ?, floating_pnl = ?, floating_pnl_pct = ?
            WHERE position_id = ?
            """,
            (
                stock_name,
                new_volume,
                avg_cost,
                round(current_price, 4),
                market_value,
                floating_pnl,
                floating_pnl_pct,
                row["position_id"],
            ),
        )

    def _apply_sell(
        self,
        conn: sqlite3.Connection,
        account_id: str,
        stock_code: str,
        volume: int,
        current_price: float,
    ) -> None:
        row = conn.execute(
            "SELECT * FROM positions WHERE account_id = ? AND stock_code = ?",
            (account_id, stock_code),
        ).fetchone()
        if row is None:
            raise ValueError("持仓不存在，无法卖出")
        if row["hold_volume"] < volume:
            raise ValueError("持仓数量不足，无法卖出")

        remaining_volume = row["hold_volume"] - volume
        if remaining_volume == 0:
            conn.execute("DELETE FROM positions WHERE position_id = ?", (row["position_id"],))
            return

        market_value = round(current_price * remaining_volume, 4)
        floating_pnl = round((current_price - row["avg_cost"]) * remaining_volume, 4)
        floating_pnl_pct = round((floating_pnl / (row["avg_cost"] * remaining_volume)) * 100, 4) if remaining_volume else 0.0
        conn.execute(
            """
            UPDATE positions
            SET hold_volume = ?, current_price = ?, market_value = ?,
                floating_pnl = ?, floating_pnl_pct = ?
            WHERE position_id = ?
            """,
            (
                remaining_volume,
                round(current_price, 4),
                market_value,
                floating_pnl,
                floating_pnl_pct,
                row["position_id"],
            ),
        )

    def get_trade(self, trade_id: str) -> Dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM trades WHERE trade_id = ?", (trade_id,)).fetchone()
        if row is None:
            raise KeyError(f"trade_id 不存在: {trade_id}")
        return dict(row)

    def update_position_price(self, account_id: str, stock_code: str, current_price: float) -> Dict[str, Any]:
        if current_price < 0:
            raise ValueError("current_price 不能小于 0")
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM positions WHERE account_id = ? AND stock_code = ?",
                (account_id, stock_code),
            ).fetchone()
            if row is None:
                raise KeyError(f"未找到持仓: {stock_code}")

            market_value = round(current_price * row["hold_volume"], 4)
            floating_pnl = round((current_price - row["avg_cost"]) * row["hold_volume"], 4)
            denominator = row["avg_cost"] * row["hold_volume"]
            floating_pnl_pct = round((floating_pnl / denominator) * 100, 4) if denominator else 0.0

            conn.execute(
                """
                UPDATE positions
                SET current_price = ?, market_value = ?, floating_pnl = ?, floating_pnl_pct = ?
                WHERE position_id = ?
                """,
                (round(current_price, 4), market_value, floating_pnl, floating_pnl_pct, row["position_id"]),
            )

        updated = self.get_position(account_id, stock_code)
        if updated is None:
            raise KeyError(f"更新后未找到持仓: {stock_code}")
        return updated

    def get_account_summary(self, account_id: str) -> Dict[str, Any]:
        account = self.get_account(account_id)
        positions = self.list_positions(account_id)
        trades = self.list_trades(account_id)
        return {
            "account": account,
            "positions": positions,
            "trades": trades,
            "position_count": len(positions),
            "trade_count": len(trades),
        }


__all__ = ["DEFAULT_DB_PATH", "SCHEMA_PATH", "FeeBreakdown", "SimulationAccountDB"]
