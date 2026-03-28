#!/usr/bin/env python3
"""
Optuna 优化器 smoke test.

直接运行：
    python3 test/optuna-optimizer-smoke.py
"""

from __future__ import annotations

import importlib.util
import json
import pathlib


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "optuna_optimizer.py"


def load_module():
    spec = importlib.util.spec_from_file_location("optuna_optimizer_smoke", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class FakeTrial:
    def __init__(self, int_values, float_values):
        self.int_values = int_values
        self.float_values = float_values

    def suggest_int(self, name, low, high):
        return self.int_values[name]

    def suggest_float(self, name, low, high):
        return self.float_values[name]


class FakeCompletedProcess:
    def __init__(self, stdout, returncode=0, stderr=""):
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = stderr


def run_test(name, fn):
    try:
        fn()
        print(f"PASS {name}")
    except AssertionError as exc:
        print(f"FAIL {name}: {exc}")
        raise


def test_objective_uses_real_score(module):
    captured = {}

    def fake_run(command, capture_output, text):
        captured["command"] = command
        payload = {
            "success": True,
            "scoreTotal": 91.25,
            "level": "A",
            "metrics": {"win_rate": 0.6},
            "params": json.loads(command[-1]),
        }
        return FakeCompletedProcess(json.dumps(payload, ensure_ascii=False))

    module.subprocess.run = fake_run
    module.OPTUNA_CONTEXT = {
        "strategy_type": "trend_following",
        "stocks": ["000001.SZ"],
        "start_date": "2024-01-01",
        "end_date": "2024-12-31",
    }

    score = module.objective(
        FakeTrial(
            {"ma_short": 8, "ma_long": 21},
            {"stop_loss": 0.12, "take_profit": 0.24},
        )
    )

    assert score == 91.25, "objective() still returns the placeholder score"
    command = captured["command"]
    assert command[0] == "node"
    assert command[2] == "--strategy-type"


def test_ma_mapping_and_cli_args(module):
    captured = {}

    def fake_run(command, capture_output, text):
        captured["command"] = command
        payload = {
            "success": True,
            "scoreTotal": 88.5,
            "level": "B",
            "metrics": {"drawdown": 0.2},
            "params": json.loads(command[-1]),
        }
        return FakeCompletedProcess(json.dumps(payload, ensure_ascii=False))

    module.subprocess.run = fake_run

    result = module.run_real_score_cli(
        "double_ma",
        ["000001.SZ", "000002.SZ"],
        "2024-01-01",
        "2024-12-31",
        {
            "ma_short": 7,
            "ma_long": 19,
            "stop_loss": 0.11,
            "take_profit": 0.31,
        },
    )

    assert result["scoreTotal"] == 88.5
    command = captured["command"]
    params = json.loads(command[-1])
    assert params["fast_period"] == 7, "ma_short was not mapped to fast_period"
    assert params["slow_period"] == 19, "ma_long was not mapped to slow_period"
    assert "ma_short" not in params
    assert "ma_long" not in params
    assert command[command.index("--stocks") + 1] == "000001.SZ,000002.SZ"
    assert command[command.index("--start") + 1] == "2024-01-01"
    assert command[command.index("--end") + 1] == "2024-12-31"


def test_helper_parses_cli_json(module):
    def fake_run(command, capture_output, text):
        payload = {
            "success": True,
            "scoreTotal": 77.7,
            "level": "C",
            "metrics": {"sharpe": 1.2},
            "params": json.loads(command[-1]),
        }
        return FakeCompletedProcess(json.dumps(payload, ensure_ascii=False))

    module.subprocess.run = fake_run
    result = module.run_real_score_cli(
        "mean_reversion",
        "000001.SZ",
        "2025-01-01",
        "2025-06-30",
        {"ma_short": 5, "ma_long": 30, "stop_loss": 0.1, "take_profit": 0.2},
    )

    assert result["success"] is True
    assert result["scoreTotal"] == 77.7
    assert result["metrics"]["sharpe"] == 1.2


def main():
    module = load_module()
    run_test("objective uses real score", lambda: test_objective_uses_real_score(module))
    run_test("ma mapping and CLI args", lambda: test_ma_mapping_and_cli_args(module))
    run_test("helper parses CLI JSON", lambda: test_helper_parses_cli_json(module))
    print("SMOKE OK")


if __name__ == "__main__":
    main()
