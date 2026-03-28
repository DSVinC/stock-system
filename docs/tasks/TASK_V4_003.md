# TASK_V4_003: 策略配置数据库表创建

**阶段**: V4 优化阶段  
**优先级**: 🟡 重要  
**状态**: done  
**创建日期**: 2026-03-25  
**完成日期**: 2026-03-25

---

## 📋 任务描述

创建策略配置数据库表 `strategy_configs`，用于存储选股策略的权重配置和参数，支持四维度行业权重、7 因子阈值、核心 - 卫星仓位配置、网格交易参数和风控参数。

---

## 🎯 验收标准

- [x] 创建数据库迁移脚本 `db/migrations/011_create_strategy_configs.sql`
- [x] 表结构包含所有必需字段
- [x] 插入默认配置数据
- [x] 数据库索引创建完成
- [x] 约束条件正确（权重总和 100%）

---

## 📁 交付物

### 新增文件
1. `db/migrations/011_create_strategy_configs.sql` - 数据库迁移脚本

### 数据库表
- `strategy_configs` - 策略配置表

---

## 📊 表结构

| 字段类别 | 字段数 | 说明 |
|----------|--------|------|
| 基础信息 | 4 | id, name, version, description |
| 四维度权重 | 4 | policy/commercialization/sentiment/capital_weight |
| 筛选阈值 | 7 | revenue_growth, gross_margin, sentiment, seven_factor, pe, peg |
| 核心 - 卫星 | 3 | core_ratio, satellite_ratio, satellite_count |
| 网格交易 | 4 | grid_step, grid_price_range, grid_single_amount, grid_trend_filter |
| 风控参数 | 3 | max_drawdown, min_annual_return, min_win_rate |
| 元数据 | 5 | is_active, is_default, created_at, updated_at, created_by |

---

## ✅ 测试结果

```sql
-- 默认配置验证
name: 行业 7 因子策略
version: 1.0.0
policy_weight: 0.25 (25%)
commercialization_weight: 0.30 (30%)
sentiment_weight: 0.25 (25%)
capital_weight: 0.20 (20%)
seven_factor_min_score: 0.75
core_ratio: 0.75 (75%)
satellite_ratio: 0.25 (25%)
```

---

## 🔗 相关任务

- TASK_V4_004: 策略配置 API 模块创建
- TASK_V4_005: 策略配置页面创建
- TASK_V4_006: 集成测试和联调

---

**验收人**: 灵爪  
**验收时间**: 2026-03-25 15:50  
**验收结论**: ✅ 通过
