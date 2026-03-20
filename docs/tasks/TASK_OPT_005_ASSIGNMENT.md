# 任务分配单 - TASK_OPT_005

## 任务信息
- **任务编号**: TASK_OPT_005
- **任务名称**: 模拟账户数据库设计 - 创建账户表、交易记录表、持仓表
- **项目**: 股票投资系统设计共识实施
- **分配时间**: 2026-03-19 17:55 (Asia/Shanghai)
- **项目经理**: 灵爪
- **程序员**: Codex
- **验收员**: Claude Code

## 任务背景
根据设计共识 v1.5，需要实现模拟账户系统，用于条件单触发的自动交易模拟。第一步是设计数据库结构。

## 设计共识参考
文件：`stock-system/docs/DESIGN_CONSENSUS.md` 第九节

### 目标数据结构
需要创建三个表：
1. **账户表 (simulation_account)** - 存储账户基本信息
2. **交易记录表 (simulation_trade)** - 存储每次买入/卖出记录
3. **持仓表 (simulation_position)** - 存储当前持仓情况

## 程序员任务内容
**分配给：Codex**

**工作内容：**

1. **创建数据库文件** (`stock-system/data/simulation.db`)
   - 使用 SQLite 3 创建数据库
   - 设置适当的表和索引

2. **账户表设计** (simulation_account)
   - 字段：`account_id`, `initial_capital`, `available_cash`, `total_market_value`, `total_assets`, `created_at`
   - 初始资金规则：用户输入，不大于100万的整数（1~1,000,000）
   - 主键：`account_id` (UUID格式)

3. **交易记录表设计** (simulation_trade)
   - 字段：`trade_id`, `account_id`, `stock_code`, `trade_type` (buy/sell), `trade_price`, `trade_volume`, `trade_amount`, `commission`, `tax`, `total_cost`, `trade_time`, `triggered_by`
   - 成本计算：佣金、印花税、过户费
   - 主键：`trade_id` (UUID格式)

4. **持仓表设计** (simulation_position)
   - 字段：`position_id`, `account_id`, `stock_code`, `stock_name`, `hold_volume`, `avg_cost`, `current_price`, `market_value`, `floating_pnl`, `floating_pnl_pct`
   - 主键：`position_id` (UUID格式)

5. **数据库连接模块**
   - 创建 `stock-system/scripts/simulation-db.js`
   - 实现基本的 CRUD 操作
   - 提供账户创建、交易记录、持仓更新等函数

6. **测试脚本**
   - 创建 `stock-system/scripts/test-simulation-db.mjs`
   - 测试数据库连接和基本操作
   - 模拟创建账户、记录交易、更新持仓

## 验收标准
**验收员：Claude Code**

- [ ] 数据库文件创建成功 (`stock-system/data/simulation.db`)
- [ ] 三个表的结构符合设计共识第九节定义
- [ ] 适当的索引和约束（如外键约束）
- [ ] 数据库连接模块工作正常
- [ ] 测试脚本成功运行，无错误
- [ ] 数据完整性验证（账户余额、持仓数量等计算正确）
- [ ] 支持并发访问（如果未来需要）

## 交付物
1. 数据库文件 (`stock-system/data/simulation.db`)
2. SQL 建表脚本 (`stock-system/docs/db/simulation_schema.sql`)
3. 数据库连接模块 (`stock-system/scripts/simulation-db.js`)
4. 测试脚本 (`stock-system/scripts/test-simulation-db.mjs`)
5. API 文档（使用方法说明）

## 时间安排
- 开发时间：预计 2-3 小时
- 验收时间：开发完成后立即安排

## 备注
- 此任务为模拟账户系统的基础，后续所有模拟交易功能都依赖此数据库
- Codex 需要设置 pty:true 模式执行
- 严格按照项目操作规范执行
- 开发完成后立即通知项目经理安排验收

---
*项目经理：灵爪*
*分配时间：2026-03-19 17:55*