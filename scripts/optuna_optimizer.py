#!/usr/bin/env python3
"""
Optuna 参数优化器 (V5_007)
职责：使用 Optuna 进行策略参数自动优化
"""
import argparse
import json
import math
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Union


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REAL_SCORE_CLI = os.path.join(SCRIPT_DIR, "real_score_cli.mjs")
REAL_SCORE_TIMEOUT_SECONDS = 45
DB_PATH = os.environ.get("DB_PATH") or "/Volumes/SSD500/openclaw/stock-system/stock_system.db"
DEFAULT_STOCKS = ["000001.SZ"]
DEFAULT_START_DATE = "2024-01-01"
DEFAULT_END_DATE = "2024-12-31"
OPTUNA_CONTEXT = {
    "strategy_type": "double_ma",
    "stocks": DEFAULT_STOCKS,
    "start_date": DEFAULT_START_DATE,
    "end_date": DEFAULT_END_DATE,
    "seed_params": {},
    "market_regime": None,
}


def _to_db_date(date_str: str) -> str:
    return str(date_str or "").replace("-", "")


def _pearson_corr(xs: List[float], ys: List[float]) -> Optional[float]:
    if len(xs) != len(ys) or len(xs) < 2:
        return None
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    if vx <= 0 or vy <= 0:
        return None
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return cov / math.sqrt(vx * vy)


def _mean(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def _std(values: List[float]) -> Optional[float]:
    if len(values) < 2:
        return 0.0 if values else None
    m = sum(values) / len(values)
    return math.sqrt(sum((v - m) ** 2 for v in values) / len(values))


def compute_factor_stability_metrics(
    strategy_type: str,
    stocks: List[str],
    start_date: str,
    end_date: str,
) -> Dict[str, Any]:
    normalized_type = str(strategy_type or "").strip().lower()
    if normalized_type != "seven_factor":
        return {
            "status": "not_applicable",
            "reason": "strategy_not_seven_factor",
        }

    stock_list = _normalize_stocks(stocks)
    if not stock_list:
        return {"status": "insufficient", "reason": "no_stocks"}

    start_db = _to_db_date(start_date)
    end_db = _to_db_date(end_date)
    placeholders = ",".join(["?"] * len(stock_list))
    sql = f"""
      WITH base AS (
        SELECT
          s.trade_date,
          s.ts_code,
          s.industry,
          s.seven_factor_score AS factor_score,
          d0.close AS close0,
          (
            SELECT d1.close
            FROM stock_daily d1
            WHERE d1.ts_code = s.ts_code
              AND d1.trade_date > s.trade_date
            ORDER BY d1.trade_date ASC
            LIMIT 1
          ) AS close1
        FROM stock_factor_snapshot s
        JOIN stock_daily d0
          ON d0.ts_code = s.ts_code
         AND d0.trade_date = s.trade_date
        WHERE s.trade_date BETWEEN ? AND ?
          AND s.ts_code IN ({placeholders})
          AND s.seven_factor_score IS NOT NULL
      )
      SELECT
        trade_date,
        ts_code,
        industry,
        factor_score,
        CASE
          WHEN close0 > 0 AND close1 IS NOT NULL THEN (close1 - close0) / close0
          ELSE NULL
        END AS next_return
      FROM base
      WHERE close1 IS NOT NULL
    """

    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(sql, [start_db, end_db, *stock_list])
        rows = cur.fetchall()
    except Exception as exc:
        return {"status": "error", "reason": str(exc)}
    finally:
        try:
            conn.close()
        except Exception:
            pass

    if len(rows) < 30:
        return {
            "status": "insufficient",
            "reason": "insufficient_rows",
            "sample_size": len(rows),
        }

    pairs = [
        (float(r[3]), float(r[4]), str(r[0]), str(r[2] or "未知"))
        for r in rows
        if r[3] is not None and r[4] is not None
    ]
    if len(pairs) < 30:
        return {
            "status": "insufficient",
            "reason": "insufficient_pairs",
            "sample_size": len(pairs),
        }

    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    ic_mean = _pearson_corr(xs, ys)

    monthly = {}
    for score, ret, trade_date, _industry in pairs:
        month = trade_date[:6]
        monthly.setdefault(month, {"x": [], "y": []})
        monthly[month]["x"].append(score)
        monthly[month]["y"].append(ret)

    monthly_ics = []
    for month, values in sorted(monthly.items()):
        if len(values["x"]) < 8:
            continue
        ic = _pearson_corr(values["x"], values["y"])
        if ic is not None:
            monthly_ics.append((month, ic))

    ic_values = [v for _, v in monthly_ics]
    ic_std = _std(ic_values)
    if len(ic_values) >= 4:
        head = ic_values[: max(1, len(ic_values) // 3)]
        tail = ic_values[-max(1, len(ic_values) // 3):]
        ic_decay = (_mean(tail) or 0.0) - (_mean(head) or 0.0)
    else:
        ic_decay = None

    # 行业偏离：Top20% 高分样本与全样本的行业分布偏离
    by_all = {}
    for *_rest, industry in [(p[0], p[1], p[2], p[3]) for p in pairs]:
        by_all[industry] = by_all.get(industry, 0) + 1
    sorted_by_score = sorted(pairs, key=lambda p: p[0], reverse=True)
    top_n = max(1, int(len(sorted_by_score) * 0.2))
    top = sorted_by_score[:top_n]
    by_top = {}
    for *_rest, industry in [(p[0], p[1], p[2], p[3]) for p in top]:
        by_top[industry] = by_top.get(industry, 0) + 1

    all_total = float(len(pairs))
    top_total = float(len(top))
    industries = sorted(set(by_all.keys()) | set(by_top.keys()))
    deviations = []
    for ind in industries:
        p_all = by_all.get(ind, 0) / all_total if all_total > 0 else 0.0
        p_top = by_top.get(ind, 0) / top_total if top_total > 0 else 0.0
        deviations.append(abs(p_top - p_all))
    industry_bias_mean = _mean(deviations)
    industry_bias_max = max(deviations) if deviations else None
    top_hhi = sum((count / top_total) ** 2 for count in by_top.values()) if top_total > 0 else None

    return {
        "status": "ok",
        "sample_size": len(pairs),
        "ic_mean": ic_mean,
        "ic_std": ic_std,
        "ic_decay": ic_decay,
        "monthly_ic_count": len(monthly_ics),
        "industry_bias_mean": industry_bias_mean,
        "industry_bias_max": industry_bias_max,
        "top_industry_hhi": top_hhi,
    }

def normalize_group_with_bounds(
    raw_values: Dict[str, float],
    defaults: Dict[str, float],
    min_weight: float = 0.0,
    max_weight: float = 1.0,
) -> Dict[str, float]:
    keys = list(defaults.keys())
    if not keys:
        return {}

    if min_weight < 0:
        min_weight = 0.0
    if max_weight <= 0:
        max_weight = 1.0
    if min_weight > max_weight:
        min_weight, max_weight = max_weight, min_weight

    values = {}
    for key in keys:
        raw = raw_values.get(key)
        if raw is None:
            raw = defaults.get(key, 0.0)
        values[key] = max(0.0, float(raw))

    total = sum(values.values())
    if total <= 0:
        normalized = dict(defaults)
    else:
        normalized = {key: values[key] / total for key in keys}

    normalized = {
        key: min(max(normalized.get(key, 0.0), min_weight), max_weight)
        for key in keys
    }

    # 重新归一化到 sum=1，保持边界约束。
    for _ in range(16):
        current_sum = sum(normalized.values())
        delta = 1.0 - current_sum
        if abs(delta) < 1e-9:
            break

        if delta > 0:
            adjustable = [key for key in keys if normalized[key] < max_weight - 1e-12]
        else:
            adjustable = [key for key in keys if normalized[key] > min_weight + 1e-12]

        if not adjustable:
            break

        share = delta / len(adjustable)
        for key in adjustable:
            normalized[key] = min(
                max(normalized[key] + share, min_weight),
                max_weight
            )

    final_sum = sum(normalized.values())
    if final_sum > 0:
        normalized = {key: normalized[key] / final_sum for key in keys}

    return normalized


def _normalize_stocks(stocks: Union[Iterable[str], str, None]) -> List[str]:
    if stocks is None:
        return list(DEFAULT_STOCKS)
    if isinstance(stocks, str):
        items = [item.strip() for item in stocks.split(",")]
        return [item for item in items if item]
    return [str(item).strip() for item in stocks if str(item).strip()]


def build_cli_params(params: Dict[str, Any]) -> Dict[str, Any]:
    cli_params = dict(params)
    # 仅用于 Optuna 采样的中间变量，不应下发到 real_score_cli
    for raw_key in (
        "dimension_social_raw",
        "dimension_policy_raw",
        "dimension_public_raw",
        "dimension_business_raw",
        "factor_trend_raw",
        "factor_momentum_raw",
        "factor_valuation_raw",
        "factor_earnings_raw",
        "factor_capital_raw",
        "factor_volatility_raw",
        "factor_sentiment_raw",
    ):
        cli_params.pop(raw_key, None)
    dimension_raw = {
        "social": cli_params.pop("dimension_social", None),
        "policy": cli_params.pop("dimension_policy", None),
        "public": cli_params.pop("dimension_public", None),
        "business": cli_params.pop("dimension_business", None),
    }
    if any(value is not None for value in dimension_raw.values()):
        total = sum(float(value) for value in dimension_raw.values() if value is not None)
        if total > 0:
            cli_params["dimensionWeights"] = {
                key: float(value) / total
                for key, value in dimension_raw.items()
                if value is not None
            }
    factor_raw = {
        "trend": cli_params.pop("factor_trend", None),
        "momentum": cli_params.pop("factor_momentum", None),
        "valuation": cli_params.pop("factor_valuation", None),
        "earnings": cli_params.pop("factor_earnings", None),
        "capital": cli_params.pop("factor_capital", None),
        "volatility": cli_params.pop("factor_volatility", None),
        "sentiment": cli_params.pop("factor_sentiment", None),
    }
    if any(value is not None for value in factor_raw.values()):
        cli_params["factorWeights"] = normalize_group_with_bounds(
            {key: float(value) for key, value in factor_raw.items() if value is not None},
            {"trend": 0.17, "momentum": 0.15, "valuation": 0.15, "earnings": 0.13, "capital": 0.13, "volatility": 0.12, "sentiment": 0.15},
            min_weight=0.03,
            max_weight=0.40,
        )
    if "ma_short" in cli_params:
        cli_params["fast_period"] = cli_params.pop("ma_short")
    if "ma_long" in cli_params:
        cli_params["slow_period"] = cli_params.pop("ma_long")
    if "rsi_period" in cli_params:
        cli_params["period"] = cli_params.pop("rsi_period")
    if "rsi_oversold" in cli_params:
        cli_params["oversold"] = cli_params.pop("rsi_oversold")
    if "rsi_overbought" in cli_params:
        cli_params["overbought"] = cli_params.pop("rsi_overbought")
    if "boll_period" in cli_params:
        cli_params["period"] = cli_params.pop("boll_period")
    if "boll_std_dev" in cli_params:
        cli_params["std_dev"] = cli_params.pop("boll_std_dev")
    if "min_score" in cli_params:
        cli_params["min_seven_factor_score"] = cli_params.pop("min_score")
    return cli_params


def normalize_seed_params(strategy_type: str, params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    normalized_type = str(strategy_type or "double_ma").strip().lower()
    seed = dict(params or {})
    filters = seed.get("filters") if isinstance(seed.get("filters"), dict) else {}

    if normalized_type in {"double_ma", "trend_following"}:
        fast = seed.get("fast_period", seed.get("ma_short"))
        slow = seed.get("slow_period", seed.get("ma_long"))
        normalized = {}
        if fast is not None:
            normalized["ma_short"] = int(round(float(fast)))
        if slow is not None:
            normalized["ma_long"] = int(round(float(slow)))
        if seed.get("stop_loss") is not None:
            normalized["stop_loss"] = float(seed["stop_loss"])
        if seed.get("take_profit") is not None:
            normalized["take_profit"] = float(seed["take_profit"])
        return normalized

    if normalized_type == "seven_factor":
        normalized = {}
        min_score = seed.get("min_seven_factor_score", seed.get("min_score", filters.get("minScore")))
        if min_score is not None:
            normalized["min_score"] = float(min_score)
        pe_max = seed.get("pe_max", filters.get("peMax"))
        if pe_max is not None:
            normalized["pe_max"] = float(pe_max)
        peg_max = seed.get("peg_max", filters.get("pegMax"))
        if peg_max is not None:
            normalized["peg_max"] = float(peg_max)
        max_price = seed.get("max_price", filters.get("maxPrice"))
        if max_price is not None:
            normalized["max_price"] = float(max_price)
        if seed.get("score_stop_loss") is not None:
            normalized["score_stop_loss"] = float(seed["score_stop_loss"])
        if seed.get("stop_loss") is not None:
            normalized["stop_loss"] = float(seed["stop_loss"])
        if seed.get("take_profit") is not None:
            normalized["take_profit"] = float(seed["take_profit"])
        dimension_weights = seed.get("dimensionWeights") if isinstance(seed.get("dimensionWeights"), dict) else {}
        if dimension_weights:
            normalized["dimension_social"] = float(dimension_weights.get("social", 0.25))
            normalized["dimension_policy"] = float(dimension_weights.get("policy", 0.30))
            normalized["dimension_public"] = float(dimension_weights.get("public", 0.20))
            normalized["dimension_business"] = float(dimension_weights.get("business", 0.25))
        factor_weights = seed.get("factorWeights") if isinstance(seed.get("factorWeights"), dict) else {}
        if factor_weights:
            normalized["factor_trend"] = float(factor_weights.get("trend", 0.17))
            normalized["factor_momentum"] = float(factor_weights.get("momentum", 0.15))
            normalized["factor_valuation"] = float(factor_weights.get("valuation", 0.15))
            normalized["factor_earnings"] = float(factor_weights.get("earnings", 0.13))
            normalized["factor_capital"] = float(factor_weights.get("capital", 0.13))
            normalized["factor_volatility"] = float(factor_weights.get("volatility", 0.12))
            normalized["factor_sentiment"] = float(factor_weights.get("sentiment", 0.15))
        return normalized

    return {}


def centered_int(seed_value: Any, low: int, high: int, radius: int) -> tuple[int, int]:
    if seed_value is None:
        return low, high
    center = int(round(float(seed_value)))
    return max(low, center - radius), min(high, center + radius)


def centered_float(seed_value: Any, low: float, high: float, radius: float) -> tuple[float, float]:
    if seed_value is None:
        return low, high
    center = float(seed_value)
    lower = max(low, center - radius)
    upper = min(high, center + radius)
    if lower > upper:
        clipped = min(max(center, low), high)
        return clipped, clipped
    return lower, upper


def build_trial_params(trial, strategy_type: str) -> Dict[str, Any]:
    normalized_type = str(strategy_type or "double_ma").strip().lower()
    seed_params = _get_context().get("seed_params") or {}
    market_regime = _get_context().get("market_regime") or {}

    if normalized_type in {"double_ma", "trend_following"}:
        short_low, short_high = centered_int(seed_params.get("ma_short"), 5, 30, 3)
        long_low, long_high = centered_int(seed_params.get("ma_long"), 12, 200, 8)
        long_low = max(long_low, short_low + 2)
        if long_low >= long_high:
            long_high = max(long_low + 2, long_high)
        stop_low, stop_high = centered_float(seed_params.get("stop_loss"), 0.03, 0.20, 0.03)
        take_low, take_high = centered_float(seed_params.get("take_profit"), 0.10, 0.50, 0.08)
        return {
            "ma_short": trial.suggest_int("ma_short", short_low, short_high),
            "ma_long": trial.suggest_int("ma_long", long_low, long_high),
            "stop_loss": trial.suggest_float("stop_loss", stop_low, stop_high),
            "take_profit": trial.suggest_float("take_profit", take_low, take_high),
        }

    if normalized_type in {"rsi", "mean_reversion"}:
        return {
            "rsi_period": trial.suggest_int("rsi_period", 6, 24),
            "rsi_oversold": trial.suggest_int("rsi_oversold", 15, 40),
            "rsi_overbought": trial.suggest_int("rsi_overbought", 60, 85),
            "stop_loss": trial.suggest_float("stop_loss", 0.03, 0.15),
            "take_profit": trial.suggest_float("take_profit", 0.08, 0.35),
        }

    if normalized_type == "macd":
        return {
            "fast_period": trial.suggest_int("fast_period", 6, 18),
            "slow_period": trial.suggest_int("slow_period", 20, 40),
            "signal_period": trial.suggest_int("signal_period", 5, 15),
            "stop_loss": trial.suggest_float("stop_loss", 0.03, 0.15),
            "take_profit": trial.suggest_float("take_profit", 0.08, 0.35),
        }

    if normalized_type == "bollinger":
        return {
            "boll_period": trial.suggest_int("boll_period", 10, 30),
            "boll_std_dev": trial.suggest_float("boll_std_dev", 1.5, 3.0),
            "stop_loss": trial.suggest_float("stop_loss", 0.03, 0.15),
            "take_profit": trial.suggest_float("take_profit", 0.08, 0.35),
        }

    if normalized_type == "seven_factor":
        # 七因子在窄股票池场景下对 seed 非常敏感，过滤参数若围绕 seed 收窄，
        # 容易出现全程无交易样本。这里固定使用全局搜索范围，避免“无效空跑”。
        min_low, min_high = 0.15, 0.80
        pe_low, pe_high = 15.0, 180.0
        peg_low, peg_high = 0.8, 8.0
        price_low, price_high = 80.0, 1500.0
        dim_social_low, dim_social_high = centered_float(seed_params.get("dimension_social"), 0.05, 1.20, 0.25)
        dim_policy_low, dim_policy_high = centered_float(seed_params.get("dimension_policy"), 0.05, 1.20, 0.25)
        dim_public_low, dim_public_high = centered_float(seed_params.get("dimension_public"), 0.05, 1.20, 0.25)
        dim_business_low, dim_business_high = centered_float(seed_params.get("dimension_business"), 0.05, 1.20, 0.25)
        factor_trend_low, factor_trend_high = centered_float(seed_params.get("factor_trend"), 0.05, 1.20, 0.25)
        factor_momentum_low, factor_momentum_high = centered_float(seed_params.get("factor_momentum"), 0.05, 1.20, 0.25)
        factor_valuation_low, factor_valuation_high = centered_float(seed_params.get("factor_valuation"), 0.05, 1.20, 0.25)
        factor_earnings_low, factor_earnings_high = centered_float(seed_params.get("factor_earnings"), 0.05, 1.20, 0.25)
        factor_capital_low, factor_capital_high = centered_float(seed_params.get("factor_capital"), 0.05, 1.20, 0.25)
        factor_volatility_low, factor_volatility_high = centered_float(seed_params.get("factor_volatility"), 0.05, 1.20, 0.25)
        factor_sentiment_low, factor_sentiment_high = centered_float(seed_params.get("factor_sentiment"), 0.05, 1.20, 0.25)
        score_stop_low, score_stop_high = 0.25, 0.70
        stop_low, stop_high = 0.02, 0.18
        take_low, take_high = 0.08, 0.50
        decision_factor_low, decision_factor_high = 0.45, 0.90
        trend_confirm_period_low, trend_confirm_period_high = 2, 8
        breakout_margin_low, breakout_margin_high = 0.00, 0.10
        if market_regime.get("volatility_regime") == "high":
            # 高波动：收紧止损与突破幅度，避免回撤放大
            stop_low, stop_high = 0.02, 0.10
            take_low, take_high = 0.06, 0.35
            breakout_margin_low, breakout_margin_high = 0.00, 0.06
        elif market_regime.get("volatility_regime") == "low":
            # 低波动：允许更宽盈亏空间，降低噪声触发
            stop_low, stop_high = 0.03, 0.20
            take_low, take_high = 0.10, 0.60

        if market_regime.get("trend_regime") == "ranging":
            trend_confirm_period_low, trend_confirm_period_high = 1, 5
            decision_factor_low, decision_factor_high = 0.50, 0.92
        elif market_regime.get("trend_regime") == "trending":
            trend_confirm_period_low, trend_confirm_period_high = 3, 10
            breakout_margin_low, breakout_margin_high = max(breakout_margin_low, 0.01), max(breakout_margin_high, 0.08)
        dimension_raw = {
            "social": trial.suggest_float("dimension_social_raw", dim_social_low, dim_social_high),
            "policy": trial.suggest_float("dimension_policy_raw", dim_policy_low, dim_policy_high),
            "public": trial.suggest_float("dimension_public_raw", dim_public_low, dim_public_high),
            "business": trial.suggest_float("dimension_business_raw", dim_business_low, dim_business_high),
        }
        factor_raw = {
            "trend": trial.suggest_float("factor_trend_raw", factor_trend_low, factor_trend_high),
            "momentum": trial.suggest_float("factor_momentum_raw", factor_momentum_low, factor_momentum_high),
            "valuation": trial.suggest_float("factor_valuation_raw", factor_valuation_low, factor_valuation_high),
            "earnings": trial.suggest_float("factor_earnings_raw", factor_earnings_low, factor_earnings_high),
            "capital": trial.suggest_float("factor_capital_raw", factor_capital_low, factor_capital_high),
            "volatility": trial.suggest_float("factor_volatility_raw", factor_volatility_low, factor_volatility_high),
            "sentiment": trial.suggest_float("factor_sentiment_raw", factor_sentiment_low, factor_sentiment_high),
        }
        dimension_weights = normalize_group_with_bounds(
            dimension_raw,
            {"social": 0.25, "policy": 0.25, "public": 0.25, "business": 0.25},
            min_weight=0.05,
            max_weight=0.80,
        )
        factor_weights = normalize_group_with_bounds(
            factor_raw,
            {"trend": 0.14, "momentum": 0.14, "valuation": 0.14, "earnings": 0.14, "capital": 0.14, "volatility": 0.15, "sentiment": 0.15},
            min_weight=0.03,
            max_weight=0.40,
        )
        return {
            "min_score": trial.suggest_float("min_score", min_low, min_high),
            "pe_max": trial.suggest_float("pe_max", pe_low, pe_high),
            "peg_max": trial.suggest_float("peg_max", peg_low, peg_high),
            "max_price": trial.suggest_float("max_price", price_low, price_high),
            "dimension_social": dimension_weights["social"],
            "dimension_policy": dimension_weights["policy"],
            "dimension_public": dimension_weights["public"],
            "dimension_business": dimension_weights["business"],
            "factor_trend": factor_weights["trend"],
            "factor_momentum": factor_weights["momentum"],
            "factor_valuation": factor_weights["valuation"],
            "factor_earnings": factor_weights["earnings"],
            "factor_capital": factor_weights["capital"],
            "factor_volatility": factor_weights["volatility"],
            "factor_sentiment": factor_weights["sentiment"],
            "score_stop_loss": trial.suggest_float("score_stop_loss", score_stop_low, score_stop_high),
            "stop_loss": trial.suggest_float("stop_loss", stop_low, stop_high),
            "take_profit": trial.suggest_float("take_profit", take_low, take_high),
            "decision_factor_weight": trial.suggest_float("decision_factor_weight", decision_factor_low, decision_factor_high),
            "trend_confirm_period": trial.suggest_int("trend_confirm_period", trend_confirm_period_low, trend_confirm_period_high),
            "breakout_margin": trial.suggest_float("breakout_margin", breakout_margin_low, breakout_margin_high),
        }

    return {
        "invest_ratio": trial.suggest_float("invest_ratio", 0.10, 0.50),
        "stop_loss": trial.suggest_float("stop_loss", 0.03, 0.15),
        "take_profit": trial.suggest_float("take_profit", 0.08, 0.35),
    }


def build_real_score_cli_command(
    strategy_type: str,
    stocks: Union[Iterable[str], str],
    start_date: str,
    end_date: str,
    params: Dict[str, Any],
) -> List[str]:
    cli_params = build_cli_params(params)
    return [
        "node",
        REAL_SCORE_CLI,
        "--strategy-type",
        strategy_type,
        "--stocks",
        ",".join(_normalize_stocks(stocks)),
        "--start",
        start_date,
        "--end",
        end_date,
        "--params",
        json.dumps(cli_params, ensure_ascii=False),
    ]


def run_real_score_cli(
    strategy_type: str,
    stocks: Union[Iterable[str], str],
    start_date: str,
    end_date: str,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    command = build_real_score_cli_command(strategy_type, stocks, start_date, end_date, params)
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=REAL_SCORE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"real_score_cli 执行超时 ({REAL_SCORE_TIMEOUT_SECONDS}s): {' '.join(command)}"
        ) from exc

    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()

    if result.returncode != 0:
        detail = stderr or stdout or "no output"
        raise RuntimeError(f"real_score_cli 执行失败 (exit {result.returncode}): {detail}")

    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"real_score_cli 返回的不是有效 JSON: {exc.msg}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("real_score_cli 返回的数据结构无效")
    if not payload.get("success"):
        error = payload.get("error") or "real_score_cli 返回失败"
        raise RuntimeError(str(error))
    return payload

def compute_adjusted_objective(result: Dict[str, Any]) -> Dict[str, float]:
    score_total = float(result.get("scoreTotal") or 0.0)
    trade_count = int(result.get("tradeCount") or 0)
    metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    max_drawdown = float(metrics.get("maxDrawdown") or 0.0)
    annualized_return = float(metrics.get("annualizedReturn") or 0.0)

    # 惩罚 1：交易样本不足（目标 >= 30）
    trade_penalty = 0.0
    if trade_count < 30:
        trade_penalty = (30 - trade_count) * 0.6  # 最大约 18 分惩罚

    # 惩罚 2：回撤超阈值（20% 以内不惩罚）
    drawdown_penalty = 0.0
    if max_drawdown > 0.20:
        drawdown_penalty = (max_drawdown - 0.20) * 120.0

    # 惩罚 3：收益为负（压制“高分但负收益”）
    return_penalty = 0.0
    if annualized_return < 0:
        return_penalty = abs(annualized_return) * 40.0

    penalty_total = trade_penalty + drawdown_penalty + return_penalty
    adjusted_score = score_total - penalty_total

    return {
        "raw_score": score_total,
        "adjusted_score": adjusted_score,
        "trade_penalty": trade_penalty,
        "drawdown_penalty": drawdown_penalty,
        "return_penalty": return_penalty,
        "penalty_total": penalty_total,
    }


def _get_context() -> Dict[str, Any]:
    return OPTUNA_CONTEXT


def objective(trial):
    context = _get_context()
    params = build_trial_params(trial, context['strategy_type'])
    try:
        result = run_real_score_cli(
            context['strategy_type'],
            context['stocks'],
            context['start_date'],
            context['end_date'],
            params,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "no_trade_samples" in message or "无有效交易样本" in message:
            return -1.0
        if "执行超时" in message:
            return -1.0
        raise
    score_total = float(result.get('scoreTotal') or 0.0)
    trade_count = int(result.get('tradeCount') or 0)
    adjusted = compute_adjusted_objective(result)
    trial.set_user_attr('trade_count', trade_count)
    trial.set_user_attr('score_total', score_total)
    trial.set_user_attr('adjusted_score', adjusted["adjusted_score"])
    trial.set_user_attr('penalty_total', adjusted["penalty_total"])
    trial.set_user_attr('trade_penalty', adjusted["trade_penalty"])
    trial.set_user_attr('drawdown_penalty', adjusted["drawdown_penalty"])
    trial.set_user_attr('return_penalty', adjusted["return_penalty"])
    if trade_count <= 0:
        return -1.0
    return adjusted["adjusted_score"]

def optimize_strategy(strategy_type, n_trials=50, stocks=None, start_date=None, end_date=None, seed_params=None):
    try:
        import optuna  # 延迟导入，方便无 optuna 环境下运行 smoke 测试
    except ModuleNotFoundError as exc:
        raise RuntimeError("未安装 optuna，请先执行 `pip install optuna` 后再运行此脚本。") from exc

    OPTUNA_CONTEXT.update({
        'strategy_type': strategy_type,
        'stocks': _normalize_stocks(stocks),
        'start_date': start_date or DEFAULT_START_DATE,
        'end_date': end_date or DEFAULT_END_DATE,
        'seed_params': normalize_seed_params(strategy_type, seed_params),
        'market_regime': None,
    })

    # 先用 seed 参数跑一次，识别当前市场状态并用于采样边界切换（TASK_OPTIMIZE_008）
    baseline_params = OPTUNA_CONTEXT.get('seed_params') or {}
    try:
        baseline_result = run_real_score_cli(
            OPTUNA_CONTEXT['strategy_type'],
            OPTUNA_CONTEXT['stocks'],
            OPTUNA_CONTEXT['start_date'],
            OPTUNA_CONTEXT['end_date'],
            baseline_params,
        )
        OPTUNA_CONTEXT['market_regime'] = infer_market_regime(
            (baseline_result or {}).get('metrics', {}) or {}
        )
    except RuntimeError:
        OPTUNA_CONTEXT['market_regime'] = None

    study = optuna.create_study(direction='maximize')
    seed_trial = OPTUNA_CONTEXT.get('seed_params') or {}
    if seed_trial:
        study.enqueue_trial(seed_trial)

    def on_trial_complete(study, trial):
        # 将进度输出到 stderr，避免污染 stdout 的最终 JSON
        completed = len(study.trials)
        print(f"OPTUNA_PROGRESS:{completed}/{n_trials}", file=sys.stderr, flush=True)

    study.optimize(objective, n_trials=n_trials, callbacks=[on_trial_complete])

    valid_trials = [
        trial for trial in study.trials
        if trial.value is not None and (trial.user_attrs.get('trade_count') or 0) > 0
    ]
    chosen_trial = max(valid_trials, key=lambda t: float(t.value)) if valid_trials else study.best_trial
    chosen_params = chosen_trial.params

    best_result = run_real_score_cli(
        OPTUNA_CONTEXT['strategy_type'],
        OPTUNA_CONTEXT['stocks'],
        OPTUNA_CONTEXT['start_date'],
        OPTUNA_CONTEXT['end_date'],
        chosen_params,
    )

    validation = build_walkforward_validation(
        OPTUNA_CONTEXT['strategy_type'],
        OPTUNA_CONTEXT['stocks'],
        OPTUNA_CONTEXT['start_date'],
        OPTUNA_CONTEXT['end_date'],
        chosen_params,
    )
    factor_stability = compute_factor_stability_metrics(
        OPTUNA_CONTEXT['strategy_type'],
        OPTUNA_CONTEXT['stocks'],
        OPTUNA_CONTEXT['start_date'],
        OPTUNA_CONTEXT['end_date'],
    )
    
    best_params = build_cli_params(chosen_params)

    return {
        'best_params': best_params,
        'best_score': float(chosen_trial.value) if chosen_trial.value is not None else 0.0,
        'trade_count': best_result.get('tradeCount'),
        'metrics': best_result.get('metrics', {}),
        'market_regime': OPTUNA_CONTEXT.get('market_regime'),
        'factor_stability': factor_stability,
        'validation': validation,
        'trials': len(study.trials)
    }


def build_walkforward_validation(
    strategy_type: str,
    stocks: List[str],
    start_date: str,
    end_date: str,
    best_params: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    最小样本外验证：
    - 用末尾 20% 区间做 OOS（至少 30 天）
    - 用其余区间做 IS 复算
    """
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        return None

    if end_dt <= start_dt:
        return None

    total_days = (end_dt - start_dt).days + 1
    oos_days = max(30, int(total_days * 0.2))
    if oos_days >= total_days:
        return None

    oos_start_dt = end_dt - timedelta(days=oos_days - 1)
    is_end_dt = oos_start_dt - timedelta(days=1)
    if is_end_dt <= start_dt:
        return None

    is_start = start_dt.strftime("%Y-%m-%d")
    is_end = is_end_dt.strftime("%Y-%m-%d")
    oos_start = oos_start_dt.strftime("%Y-%m-%d")
    oos_end = end_dt.strftime("%Y-%m-%d")

    try:
        in_sample = run_real_score_cli(strategy_type, stocks, is_start, is_end, best_params)
        out_sample = run_real_score_cli(strategy_type, stocks, oos_start, oos_end, best_params)
    except RuntimeError:
        return {
            "in_sample": {
                "start": is_start,
                "end": is_end,
            },
            "out_of_sample": {
                "start": oos_start,
                "end": oos_end,
            },
            "status": "partial"
        }

    in_return = float((in_sample.get("metrics") or {}).get("totalReturn") or 0)
    out_return = float((out_sample.get("metrics") or {}).get("totalReturn") or 0)
    wfe = None
    if in_return != 0:
        wfe = out_return / in_return

    return {
        "status": "ok",
        "in_sample": {
            "start": is_start,
            "end": is_end,
            "score": in_sample.get("scoreTotal"),
            "trade_count": in_sample.get("tradeCount"),
            "metrics": in_sample.get("metrics", {}),
            "market_regime": infer_market_regime(in_sample.get("metrics", {}))
        },
        "out_of_sample": {
            "start": oos_start,
            "end": oos_end,
            "score": out_sample.get("scoreTotal"),
            "trade_count": out_sample.get("tradeCount"),
            "metrics": out_sample.get("metrics", {}),
            "market_regime": infer_market_regime(out_sample.get("metrics", {}))
        },
        "wfe": wfe,
        "regime_shift": detect_regime_shift(
            infer_market_regime(in_sample.get("metrics", {})),
            infer_market_regime(out_sample.get("metrics", {})),
        )
    }


def infer_market_regime(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    规则法市场状态识别（P2 基础版）：
    - volatility_regime: high / low
    - trend_regime: trending / ranging
    """
    try:
        annualized_return = float(metrics.get("annualizedReturn") or 0.0)
    except (TypeError, ValueError):
        annualized_return = 0.0
    try:
        volatility = float(metrics.get("volatility") or 0.0)
    except (TypeError, ValueError):
        volatility = 0.0
    try:
        sharpe_ratio = float(metrics.get("sharpeRatio") or 0.0)
    except (TypeError, ValueError):
        sharpe_ratio = 0.0

    volatility_regime = "high" if volatility >= 0.22 else "low"
    trend_regime = "trending" if abs(annualized_return) >= 0.12 and sharpe_ratio >= 0.6 else "ranging"
    direction = "bullish" if annualized_return > 0 else ("bearish" if annualized_return < 0 else "neutral")

    return {
        "volatility_regime": volatility_regime,
        "trend_regime": trend_regime,
        "direction": direction,
        "label": f"{volatility_regime}_{trend_regime}_{direction}"
    }


def detect_regime_shift(in_regime: Dict[str, Any], out_regime: Dict[str, Any]) -> Dict[str, Any]:
    if not in_regime or not out_regime:
        return {"shifted": False, "reason": "insufficient_regime_data"}

    changed_keys = []
    for key in ("volatility_regime", "trend_regime", "direction"):
        if in_regime.get(key) != out_regime.get(key):
            changed_keys.append(key)

    return {
        "shifted": len(changed_keys) > 0,
        "changed_keys": changed_keys,
        "from": in_regime.get("label"),
        "to": out_regime.get("label"),
    }


def _build_parser():
    parser = argparse.ArgumentParser(description='Optuna 参数优化器 (V5_007)')
    parser.add_argument('strategy_type', nargs='?', default='double_ma', help='策略类型')
    parser.add_argument('--stocks', default=None, help='股票代码列表，逗号分隔')
    parser.add_argument('--start', dest='start_date', default=None, help='开始日期')
    parser.add_argument('--end', dest='end_date', default=None, help='结束日期')
    parser.add_argument('--n-trials', type=int, default=50, help='优化轮数')
    parser.add_argument('--seed-params', default=None, help='初始参数 JSON，用作首个候选和局部搜索中心')
    return parser

if __name__ == '__main__':
    args = _build_parser().parse_args()
    try:
        result = optimize_strategy(
            args.strategy_type,
            n_trials=args.n_trials,
            stocks=args.stocks,
            start_date=args.start_date,
            end_date=args.end_date,
            seed_params=json.loads(args.seed_params) if args.seed_params else None,
        )
    except RuntimeError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result, indent=2, ensure_ascii=False))
