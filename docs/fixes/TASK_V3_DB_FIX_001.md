# TASK_V3_DB_FIX_001 - 补充缺失数据库表

**任务 ID**: TASK_V3_DB_FIX_001  
**优先级**: P1（重要）  
**状态**: completed
**完成日期**: 2026-03-24 10:30  
**创建日期**: 2026-03-24 08:40  
**预计工期**: 0.5 天  
**todo.db ID**: 待分配  

---

## 📋 问题描述

**反馈人**: 三木  
**反馈时间**: 2026-03-24 08:34  

监控功能反馈：数据库缺少 `company_events` 和 `stocks` 表，导致事件监控和特殊处理状态检查未能执行。不影响当前盘前简报功能，但建议后续完善数据库结构。

---

## 🎯 任务目标

补充缺失的两个数据库表，支持黑天鹅检测和舆情因子计算功能。

---

## 📐 表结构设计

### 1. company_events（公司公告事件表）

```sql
CREATE TABLE IF NOT EXISTS company_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL,           -- 股票代码
  stock_name TEXT NOT NULL,        -- 股票名称
  event_type TEXT NOT NULL,        -- 事件类型（announcement/news/financial 等）
  event_time DATETIME NOT NULL,    -- 事件时间
  title TEXT NOT NULL,             -- 事件标题
  content TEXT,                    -- 事件内容
  source TEXT,                     -- 数据来源
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ts_code (ts_code),
  INDEX idx_event_time (event_time)
);
```

### 2. stocks（股票基本信息表）

```sql
CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL UNIQUE,    -- 股票代码
  stock_name TEXT NOT NULL,        -- 股票名称
  list_status TEXT,                -- 上市状态（L 上市/D 退市/P 暂停）
  special_treatment TEXT,          -- 特殊处理状态（*ST/ST/正常）
  industry_code_l1 TEXT,           -- 一级行业代码
  industry_name_l1 TEXT,           -- 一级行业名称
  industry_code_l2 TEXT,           -- 二级行业代码
  industry_name_l2 TEXT,           -- 二级行业名称
  industry_code_l3 TEXT,           -- 三级行业代码
  industry_name_l3 TEXT,           -- 三级行业名称
  list_date DATE,                  -- 上市日期
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ts_code (ts_code),
  INDEX idx_industry (industry_name_l1)
);
```

---

## ✅ 验收标准

- [x] 两个表结构创建成功
- [x] 字段类型和索引正确
- [x] `black-swan-check.js` 查询正常
- [x] `sentiment-factor.js` 查询正常
- [x] 不影响现有表结构和数据

---

## 📁 交付物

1. `database/migrations/v3.0_add_company_tables.sql` - 数据库迁移脚本
2. `docs/fixes/TASK_V3_DB_FIX_001.md` - 修复文档
3. `docs/runtime/TASK_V3_DB_FIX_001_STATUS.md` - 运行时状态
4. 更新 `docs/PROJECT_LESSONS.md` - 项目经验记录

---

## 🔗 相关文件

- `api/black-swan-check.js` - 引用 `company_events` 和 `stocks` 表
- `api/sentiment-factor.js` - 引用 `company_events` 表
- `stock-system.db` 当前结构

---

## 📝 备注

- 本任务为修复性质，不阻塞 V3 版主流程
- 可在 TASK_V3_001 开发间隙完成
- 建议由 Claude Code 一并处理
