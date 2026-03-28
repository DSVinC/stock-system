# TASK_STRATEGY_LIB_001_FIX_001 - 策略执行脚本数据库导出修复

**创建时间**: 2026-03-23 07:50  
**优先级**: P0  
**负责人**: Claude Code  
**验收员**: Gemini CLI  
**状态**: ✅ 已完成  
**关联任务**: TASK_STRATEGY_LIB_001  

---

## 📋 问题描述

验收发现 `scripts/run_strategy.py` 缺少数据库导出功能，仅支持 CSV 导出。

**验收报告**: `docs/acceptance/TASK_STRATEGY_LIB_001_ACCEPTANCE.md`

---

## 🎯 修复内容

### 1. 添加数据库导出函数

在 `scripts/run_strategy.py` 中添加：

```python
import sqlite3
from datetime import datetime

def export_signals_to_db(signals: pd.DataFrame, db_path: str, strategy_id: str):
    """将信号导出到 SQLite 数据库"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 创建表（如不存在）
    cursor.execute("""
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
        )
    """)
    
    # 插入数据
    for _, row in signals.iterrows():
        cursor.execute("""
            INSERT INTO strategy_signals 
            (strategy_id, date, code, signal, qty, price, score, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (strategy_id, str(row['date']), row['code'], 
              row['signal'], row.get('qty', 0), row['price'],
              row.get('score', None), datetime.now().isoformat()))
    
    conn.commit()
    conn.close()
    print(f"📁 信号已导出到数据库：{db_path} ({len(signals)} 条记录)")
```

### 2. 添加命令行参数

在 `argparse` 中添加：
```python
parser.add_argument('--db-export', action='store_true',
                    help='导出信号到数据库')
parser.add_argument('--db-path', type=str, 
                    default='/Volumes/SSD500/openclaw/stock-system/stock_system.db',
                    help='数据库路径')
parser.add_argument('--strategy-id', type=str, default=None,
                    help='策略 ID（用于数据库记录）')
```

### 3. 修改主函数

在 `main()` 中添加数据库导出逻辑：
```python
# 导出信号
if args.output:
    export_signals(signals, args.output)

if args.db_export:
    strategy_id = args.strategy_id or f"{args.strategy}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    export_signals_to_db(signals, args.db_path, strategy_id)
```

---

## ✅ 验收标准

- [ ] 运行 `python scripts/run_strategy.py --strategy dual_ma --db-export` 成功
- [ ] 数据库中 `strategy_signals` 表创建成功
- [ ] 信号记录正确插入（数量与 CSV 导出一致）
- [ ] 运行 `python scripts/run_strategy.py --strategy multi_factor --db-export` 成功
- [ ] 原有 CSV 导出功能不受影响

---

## 🧪 测试命令

```bash
# 测试双均线策略数据库导出
python3 scripts/run_strategy.py --strategy dual_ma --db-export --strategy-id TEST_DUAL_MA_001

# 测试多因子策略数据库导出
python3 scripts/run_strategy.py --strategy multi_factor --db-export --strategy-id TEST_MF_001

# 验证数据库记录
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db "SELECT * FROM strategy_signals LIMIT 10;"
```

---

## 📁 修改文件

- `scripts/run_strategy.py` - 添加数据库导出功能

---

*创建时间：2026-03-23 07:50*
