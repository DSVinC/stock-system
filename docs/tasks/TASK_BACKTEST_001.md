# TASK_BACKTEST_001 - 策略执行脚本数据库导出功能

**创建时间**: 2026-03-23 09:15  
**优先级**: P0  
**负责人**: Claude Code  
**验收员**: Gemini CLI  
**状态**: in_progress  

---

## 📋 任务描述

在 `scripts/run_strategy.py` 中添加数据库导出功能，支持将策略信号存入 SQLite 数据库。

---

## 🎯 验收标准

- [ ] 运行 `python scripts/run_strategy.py --strategy dual_ma --db-export --db-path ./stock_system.db --strategy-id test_001` 成功
- [ ] 数据库中 `strategy_signals` 表有记录
- [ ] 信号数量与 CSV 导出一致

---

## 📝 实现要求

### 1. 添加数据库导出函数

```python
def export_signals_to_db(signals: pd.DataFrame, db_path: str, strategy_id: str):
    """将信号导出到 SQLite 数据库"""
```

### 2. 添加命令行参数

```bash
--db-export       # 启用数据库导出
--db-path PATH    # 数据库路径
--strategy-id ID  # 策略 ID
```

### 3. 创建数据表

```sql
CREATE TABLE IF NOT EXISTS strategy_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    date TEXT NOT NULL,
    code TEXT NOT NULL,
    signal TEXT NOT NULL,
    qty INTEGER DEFAULT 0,
    price REAL NOT NULL,
    score REAL,
    created_at TEXT NOT NULL
);
```

---

## 📁 交付物

1. `scripts/run_strategy.py` - 支持数据库导出
2. `docs/handover/TASK_BACKTEST_001_HANDOVER.md` - 交接文档
3. `docs/acceptance/TASK_BACKTEST_001_ACCEPTANCE.md` - 验收报告

---

## 🔗 相关文件

- 父任务：`docs/tasks/TASK_BACKTEST_SYSTEM_001.md`
- 状态文件：`docs/runtime/TASK_BACKTEST_001_STATUS.md`
- 源文件：`scripts/run_strategy.py`
