# 快照任务验收清单

**验收员**: Gemini  
**验收时间**: 2026-03-24  
**验收范围**: TASK_SNAPSHOT_001 ~ TASK_SNAPSHOT_004

---

## 📋 TASK_SNAPSHOT_001 验收清单

**任务**: 创建 stock_factor_snapshot 表

| 检查项 | 验收命令 | 预期结果 | 状态 |
|--------|---------|---------|------|
| 表是否存在 | `SELECT name FROM sqlite_master WHERE type='table' AND name='stock_factor_snapshot';` | 返回 1 行 | ⬜ |
| 字段数量 | `PRAGMA table_info(stock_factor_snapshot);` | 17 个字段 | ⬜ |
| 索引数量 | `SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='stock_factor_snapshot';` | ≥3 个索引 | ⬜ |
| 唯一约束 | 尝试插入重复数据 | 报错 UNIQUE constraint failed | ⬜ |
| 测试数据 | `SELECT COUNT(*) FROM stock_factor_snapshot;` | ≥2 条 | ⬜ |
| 迁移脚本 | `ls -la db/migrations/001_create_snapshot_table.sql` | 文件存在 | ⬜ |
| 交接文档 | `ls -la handover/TASK_SNAPSHOT_001_HANDOVER.md` | 文件存在 | ⬜ |

**验收结论**: ⬜ 通过 / ⬜ 不通过

---

## 📋 TASK_SNAPSHOT_002 验收清单

**任务**: 创建 policy_events 表

| 检查项 | 验收命令 | 预期结果 | 状态 |
|--------|---------|---------|------|
| 表是否存在 | `SELECT name FROM sqlite_master WHERE type='table' AND name='policy_events';` | 返回 1 行 | ⬜ |
| 字段数量 | `PRAGMA table_info(policy_events);` | 10 个字段 | ⬜ |
| CHECK 约束 | `INSERT INTO policy_events (event_id, publish_date, industry, title, impact_score) VALUES ('TEST', '2026-01-01', 'AI', '测试', 10);` | 报错 CHECK constraint failed | ⬜ |
| 索引数量 | `SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='policy_events';` | ≥3 个索引 | ⬜ |
| 示例数据 | `SELECT COUNT(*) FROM policy_events;` | 10 条 | ⬜ |
| 回测查询 | `SELECT * FROM policy_events WHERE industry='AI' AND publish_date <= '2024-06-01' ORDER BY publish_date DESC LIMIT 5;` | 返回 AI 相关政策 | ⬜ |
| 迁移脚本 | `ls -la db/migrations/002_create_policy_events_table.sql` | 文件存在 | ⬜ |
| 交接文档 | `ls -la handover/TASK_SNAPSHOT_002_HANDOVER.md` | 文件存在 | ⬜ |

**验收结论**: ⬜ 通过 / ⬜ 不通过

---

## 📋 TASK_SNAPSHOT_003 验收清单

**任务**: 创建 stock_selection_reports 表

| 检查项 | 验收命令 | 预期结果 | 状态 |
|--------|---------|---------|------|
| 表是否存在 | `SELECT name FROM sqlite_master WHERE type='table' AND name='stock_selection_reports';` | 返回 1 行 | ⬜ |
| 字段数量 | `PRAGMA table_info(stock_selection_reports);` | 9 个字段 | ⬜ |
| JSON 字段查询 | `SELECT json_extract(filter_config, '$.industry_filter') FROM stock_selection_reports LIMIT 1;` | 返回 JSON 数组 | ⬜ |
| 索引数量 | `SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='stock_selection_reports';` | ≥2 个索引 | ⬜ |
| 示例数据 | `SELECT COUNT(*) FROM stock_selection_reports;` | ≥1 条 | ⬜ |
| 迁移脚本 | `ls -la db/migrations/003_create_selection_reports_table.sql` | 文件存在 | ⬜ |
| 交接文档 | `ls -la handover/TASK_SNAPSHOT_003_HANDOVER.md` | 文件存在 | ⬜ |

**验收结论**: ⬜ 通过 / ⬜ 不通过

---

## 📋 TASK_SNAPSHOT_004 验收清单

**任务**: 编写历史数据回填脚本

| 检查项 | 验收命令 | 预期结果 | 状态 |
|--------|---------|---------|------|
| 脚本存在 | `ls -la scripts/backfill_snapshot.py` | 文件存在，>10KB | ⬜ |
| 语法检查 | `python -m py_compile scripts/backfill_snapshot.py` | 无错误 | ⬜ |
| 参数解析 | `python scripts/backfill_snapshot.py --help` | 显示帮助信息 | ⬜ |
| Tushare 导入 | `python -c "import tushare as ts; ts.set_token('xxx'); pro = ts.pro_api(); print(pro.query('daily', ts_code='000001.SZ', start_date='20260301', end_date='20260301'))"` | 返回数据 | ⬜ |
| 函数完整性 | `grep -c "^def " scripts/backfill_snapshot.py` | ≥10 个函数 | ⬜ |
| 错误处理 | `grep -c "try:" scripts/backfill_snapshot.py` | ≥3 处 | ⬜ |
| 日志输出 | `grep -c "logger\." scripts/backfill_snapshot.py` | ≥5 处 | ⬜ |
| 交接文档 | `ls -la handover/TASK_SNAPSHOT_004_HANDOVER.md` | 文件存在 | ⬜ |

**验收结论**: ⬜ 通过 / ⬜ 不通过

---

## 📊 验收汇总

| 任务 | 检查项数 | 通过数 | 通过率 | 结论 |
|------|---------|--------|--------|------|
| TASK_SNAPSHOT_001 | 7 | ⬜ | ⬜% | ⬜ |
| TASK_SNAPSHOT_002 | 8 | ⬜ | ⬜% | ⬜ |
| TASK_SNAPSHOT_003 | 7 | ⬜ | ⬜% | ⬜ |
| TASK_SNAPSHOT_004 | 8 | ⬜ | ⬜% | ⬜ |

**总体结论**: ⬜ 全部通过 / ⬜ 部分通过 / ⬜ 不通过

---

_验收时间：2026-03-24_
