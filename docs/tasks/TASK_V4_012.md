# TASK_V4_012 - 扩展 strategy_configs 表结构

**创建时间**: 2026-03-25  
**优先级**: P0  
**阶段**: 阶段 0 - 策略模板库  
**状态**: pending

---

## 📋 任务描述

扩展 strategy_configs 表结构，支持多策略模板类型。

---

## 🎯 验收标准

- [ ] 创建数据库迁移脚本 `012_extend_strategy_configs.sql`
- [ ] 添加字段：template_id, strategy_type, params, grid_params, rotation_params 等
- [ ] 添加字段：config_type, source, is_public, tags
- [ ] 执行迁移，验证表结构
- [ ] 更新 db.js 中的表定义注释

---

## 📐 技术方案

**新增字段**:
```sql
ALTER TABLE strategy_configs ADD COLUMN template_id TEXT;
ALTER TABLE strategy_configs ADD COLUMN strategy_type TEXT;
ALTER TABLE strategy_configs ADD COLUMN params JSON;
ALTER TABLE strategy_configs ADD COLUMN grid_params JSON;
ALTER TABLE strategy_configs ADD COLUMN rotation_params JSON;
ALTER TABLE strategy_configs ADD COLUMN config_type TEXT;
ALTER TABLE strategy_configs ADD COLUMN source TEXT;
ALTER TABLE strategy_configs ADD COLUMN is_public INTEGER DEFAULT 0;
ALTER TABLE strategy_configs ADD COLUMN tags JSON;
```

---

## 📁 交付物

- `db/migrations/012_extend_strategy_configs.sql`
- 更新后的表结构

---

## 🔗 依赖关系

- 依赖：TASK_V4_011（策略模板库设计）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
