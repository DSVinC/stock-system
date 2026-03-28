# TASK_SNAPSHOT_001~005 实时状态

**任务 ID**: TASK_SNAPSHOT_001~005  
**任务名称**: 历史快照数据表 + 回填  
**优先级**: P0  
**创建时间**: 2026-03-24 21:56  
**当前状态**: done  
**最后更新**: 2026-03-27 19:24  

---

## 👥 负责人

| 角色 | 担当 |
|------|------|
| **项目经理** | 灵爪 |
| **程序员** | Gemini CLI |
| **验收员** | Gemini CLI |

---

## 📋 任务描述

创建历史快照数据表并回填 2020-至今的数据，用于回测系统避免未来函数问题。

**子任务**：
1. TASK_SNAPSHOT_001: 创建 `stock_factor_snapshot` 表
2. TASK_SNAPSHOT_002: 创建 `policy_events` 表
3. TASK_SNAPSHOT_003: 创建 `stock_selection_reports` 表（✅ 已完成）
4. TASK_SNAPSHOT_004: 编写历史数据回填脚本
5. TASK_SNAPSHOT_005: 执行历史数据回填（2020-至今）

---

## ✅ 验收标准

- [x] `stock_factor_snapshot` 表已创建
- [x] `policy_events` 表已创建
- [x] 回填脚本可正常运行
- [x] 历史数据已回填（2020-至今）
- [x] 回测系统可查询历史快照数据

---

## 📝 进度记录

### 2026-03-27 19:24 - 文档收口完成 ✅
- 基于真实仓库与数据库证据收口状态：
  - `db/migrations/001_create_snapshot_table.sql` 已存在
  - `db/migrations/002_create_policy_events_table.sql` 已存在
  - `db/migrations/003_create_selection_reports_table.sql` 已存在
  - `scripts/backfill_snapshot.py` / `scripts/backfill_factor_snapshot_batch.mjs` 已存在
  - 数据库现状：
    - `stock_factor_snapshot`: 8269446 条
    - `policy_events`: 56 条
    - `stock_selection_reports`: 56 条
- 结论：`TASK_SNAPSHOT_001~005` 已具备完成证据，原 `in_progress` 状态改为 `done`

### 2026-03-24 22:05 - 任务启动
- 创建实时状态文件
- 派发任务给 Gemini 开发
- 下一步：创建数据库表和回填脚本

---

## 🔗 关联文档

- 任务分配单：`docs/tasks/TASK_SNAPSHOT_001.md` ~ `TASK_SNAPSHOT_005.md`
- 设计共识：`docs/DESIGN_CONSENSUS.md` 第 15.2 节
- 数据库迁移：`db/migrations/`
