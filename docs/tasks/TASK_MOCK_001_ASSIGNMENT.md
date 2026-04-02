# 任务分配单：TASK_MOCK_001

**任务名称**: 数据库迁移：4 张模拟表  
**优先级**: P0  
**预计工时**: 2h  
**状态**: completed  

---

## 任务描述

创建独立模拟账户系统所需的 4 张数据库表。

## 数据库表

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| `mock_account` | 模拟账户表 | account_id, strategy_version_id, initial_capital, current_capital, status |
| `mock_position` | 模拟持仓表 | position_id, account_id, ts_code, quantity, avg_cost, market_value |
| `mock_trade` | 模拟交易表 | trade_id, account_id, action, price, simulated_price, slippage_rate, pnl |
| `mock_performance` | 模拟绩效表 | performance_id, total_return, sharpe_ratio, backtest_deviation, is_deviation_exceeded |

## 实现要求

1. 创建迁移脚本 `db/migrations/018_create_mock_tables.sql`（`016` 已占用）
2. 所有表使用 TEXT 主键（UUID）
3. 添加必要的外键约束和索引
4. 执行迁移并验证表结构

## 验收标准

- [x] 迁移脚本创建成功
- [x] 4 张表结构正确
- [x] 外键约束生效
- [x] 索引创建成功
- [x] 插入测试数据无错误

## 相关文件

- `db/migrations/018_create_mock_tables.sql` - 迁移脚本
- `docs/design/2026-04-01-mock-account-design.md` - 完整设计文档

## 验收记录

- 主库已创建表：`mock_account/mock_position/mock_trade/mock_performance`
- 外键检查：`PRAGMA foreign_key_list(...)` 通过
- 索引检查：4 表索引均存在
- 插入联调：`mock_account -> mock_position -> mock_trade -> mock_performance` 成功并完成清理

---

**创建时间**: 2026-04-01  
**创建者**: 灵爪
