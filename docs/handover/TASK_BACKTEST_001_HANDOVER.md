# TASK_BACKTEST_001_HANDOVER - 交接文档

**任务**: 策略执行脚本数据库导出功能  
**创建时间**: 2026-03-23 09:15  

---

## 📋 任务背景

回测系统需要策略信号存入数据库，当前 `run_strategy.py` 仅支持 CSV 导出。

---

## 🎯 任务目标

在 `scripts/run_strategy.py` 中添加数据库导出功能

---

## ✅ 验收标准

1. 命令行参数 `--db-export`、`--db-path`、`--strategy-id` 可用
2. 运行后数据库中有信号记录
3. 信号数量与 CSV 导出一致

---

## 📁 相关文件

- `scripts/run_strategy.py`
- `stock_system.db` (数据库)

---

## 🧪 测试命令

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
python scripts/run_strategy.py --strategy dual_ma --db-export --db-path ./stock_system.db --strategy-id test_001
```

---

## 📝 注意事项

- 使用 sqlite3 模块
- 表不存在时自动创建
- 支持批量插入
