#!/usr/bin/env python3
"""
Optuna 参数优化器 (V5_007)
职责：使用 Optuna 进行策略参数自动优化
"""
import argparse
import json
import os
import subprocess
import sys
from typing import Any, Dict, Iterable, List, Union


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REAL_SCORE_CLI = os.path.join(SCRIPT_DIR, "real_score_cli.mjs")
DEFAULT_STOCKS = ["000001.SZ"]
DEFAULT_START_DATE = "2024-01-01"
DEFAULT_END_DATE = "2024-12-31"
OPTUNA_CONTEXT = {
    "strategy_type": "double_ma",
    "stocks": DEFAULT_STOCKS,
    "start_date": DEFAULT_START_DATE,
    "end_date": DEFAULT_END_DATE,
}


def _normalize_stocks(stocks: Union[Iterable[str], str, None]) -> List[str]:
    if stocks is None:
        return list(DEFAULT_STOCKS)
    if isinstance(stocks, str):
        items = [item.strip() for item in stocks.split(",")]
        return [item for item in items if item]
    return [str(item).strip() for item in stocks if str(item).strip()]


def build_cli_params(params: Dict[str, Any]) -> Dict[str, Any]:
    cli_params = dict(params)
    if "ma_short" in cli_params:
        cli_params["fast_period"] = cli_params.pop("ma_short")
    if "ma_long" in cli_params:
        cli_params["slow_period"] = cli_params.pop("ma_long")
    return cli_params


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
    result = subprocess.run(command, capture_output=True, text=True)

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


def _get_context() -> Dict[str, Any]:
    return OPTUNA_CONTEXT


def objective(trial):
    # 参数空间定义
    params = {
        'ma_short': trial.suggest_int('ma_short', 5, 30),
        'ma_long': trial.suggest_int('ma_long', 30, 200),
        'stop_loss': trial.suggest_float('stop_loss', 0.05, 0.20),
        'take_profit': trial.suggest_float('take_profit', 0.10, 0.50),
    }
    context = _get_context()
    result = run_real_score_cli(
        context['strategy_type'],
        context['stocks'],
        context['start_date'],
        context['end_date'],
        params,
    )
    return float(result['scoreTotal'])

def optimize_strategy(strategy_type, n_trials=50, stocks=None, start_date=None, end_date=None):
    try:
        import optuna  # 延迟导入，方便无 optuna 环境下运行 smoke 测试
    except ModuleNotFoundError as exc:
        raise RuntimeError("未安装 optuna，请先执行 `pip install optuna` 后再运行此脚本。") from exc

    OPTUNA_CONTEXT.update({
        'strategy_type': strategy_type,
        'stocks': _normalize_stocks(stocks),
        'start_date': start_date or DEFAULT_START_DATE,
        'end_date': end_date or DEFAULT_END_DATE,
    })

    study = optuna.create_study(direction='maximize')
    study.optimize(objective, n_trials=n_trials)
    
    return {
        'best_params': study.best_params,
        'best_score': study.best_value,
        'trials': len(study.trials)
    }


def _build_parser():
    parser = argparse.ArgumentParser(description='Optuna 参数优化器 (V5_007)')
    parser.add_argument('strategy_type', nargs='?', default='double_ma', help='策略类型')
    parser.add_argument('--stocks', default=None, help='股票代码列表，逗号分隔')
    parser.add_argument('--start', dest='start_date', default=None, help='开始日期')
    parser.add_argument('--end', dest='end_date', default=None, help='结束日期')
    parser.add_argument('--n-trials', type=int, default=50, help='优化轮数')
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
        )
    except RuntimeError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(result, indent=2, ensure_ascii=False))
