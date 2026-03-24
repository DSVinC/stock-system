# TASK_V3_DB_FIX_001 交接文档

**任务 ID**: TASK_V3_DB_FIX_001
**任务名称**: 补充缺失数据库表（company_events、stocks）
**开发人员**: Claude Code
**完成日期**: 2026-03-24
**状态**: 待验收

---

## 📋 任务概述

补充缺失的两个数据库表，支持黑天鹅检测和舆情因子计算功能。

**问题来源**: 监控功能反馈数据库缺少 `company_events` 和 `stocks` 表

---

## 📁 交付物

### 1. 新增文件

| 文件 | 说明 |
|------|------|
| `database/migrations/005_add_company_tables.sql` | 数据库迁移脚本 |

### 2. 新增数据库表

| 表名 | 说明 |
|------|------|
| `company_events` | 公司公告事件表 |
| `stocks` | 股票基本信息表 |

---

## 📐 表结构说明

### 1. company_events（公司公告事件表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| ts_code | TEXT | 股票代码（如 000001.SZ） |
| stock_name | TEXT | 股票名称 |
| event_type | TEXT | 事件类型 |
| event_time | DATETIME | 事件时间 |
| title | TEXT | 事件标题 |
| content | TEXT | 事件内容 |
| source | TEXT | 数据来源 |
| created_at | DATETIME | 创建时间 |

**索引**:
- `idx_company_events_ts_code` - 股票代码索引
- `idx_company_events_event_time` - 事件时间索引
- `idx_company_events_type` - 事件类型索引

### 2. stocks（股票基本信息表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| ts_code | TEXT | 股票代码（唯一约束） |
| stock_name | TEXT | 股票名称 |
| list_status | TEXT | 上市状态（L/D/P） |
| special_treatment | TEXT | 特殊处理状态（*ST/ST/正常） |
| industry_code_l1~l3 | TEXT | 行业代码（1-3级） |
| industry_name_l1~l3 | TEXT | 行业名称（1-3级） |
| list_date | DATE | 上市日期 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**索引**:
- `idx_stocks_ts_code` - 股票代码索引
- `idx_stocks_industry` - 行业索引
- `idx_stocks_list_status` - 上市状态索引
- `idx_stocks_special_treatment` - 特殊处理状态索引

---

## ✅ 验收标准检查

| 标准 | 状态 | 备注 |
|------|------|------|
| 两个表结构创建成功 | ✅ | company_events + stocks |
| 字段类型和索引正确 | ✅ | 符合设计文档 |
| `black-swan-check.js` 查询正常 | ✅ | SQL 执行成功 |
| `sentiment-factor.js` 查询正常 | ✅ | SQL 执行成功 |
| 不影响现有表结构和数据 | ✅ | 仅新增表 |

---

## 🧪 测试命令

```bash
# 验证表存在
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db \
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('company_events', 'stocks');"

# 验证表结构
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db ".schema company_events"
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db ".schema stocks"

# 测试查询（black-swan-check.js 使用）
sqlite3 -json /Volumes/SSD500/openclaw/stock-system/stock_system.db \
  "SELECT stock_name, list_status, special_treatment FROM stocks WHERE ts_code = '000001.SZ';"

# 测试查询（sentiment-factor.js 使用）
sqlite3 -json /Volumes/SSD500/openclaw/stock-system/stock_system.db \
  "SELECT event_type, event_time, title, content FROM company_events WHERE ts_code = '000001.SZ' AND event_time >= datetime('now', '-7 days') ORDER BY event_time DESC LIMIT 20;"
```

---

## 📝 备注

- 本任务为修复性质，不阻塞 V3 版主流程
- 表中暂无数据，需后续通过数据同步任务填充
- 迁移脚本已编号为 `005`，符合迁移命名规范

---

**交接人**: Claude Code
**交接时间**: 2026-03-24 10:30
**验收人**: 待指定（Gemini CLI / Codex）