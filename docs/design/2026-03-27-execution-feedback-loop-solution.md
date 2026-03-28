# 执行反馈回流研究流 - 最小闭环方案

**创建时间**: 2026-03-27 13:58  
**作者**: Codex  
**状态**: 拟实施  

---

## 1. 目标

在不污染主交易表的前提下，把执行流中的关键结果回流到研究流，让后续策略管理/策略迭代能够回答两个问题：

1. 某个策略版本在真实执行链路里的表现如何
2. 哪些条件单/交易结果应该反向影响策略评分与版本选择

---

## 2. 现状

当前已经具备：

- `strategy_versions`
- `strategy_score_records`
- `conditional_order`
- `conditional_order_context`
- `portfolio_trade`

其中：

- `conditional_order_context` 已能保存执行流上下文：
  - `strategy_source`
  - `strategy_config_id`
  - `strategy_config_name`
  - `template_id`
  - `template_name`
  - `strategy_id`
  - `strategy_version`
  - `report_id`

缺失的是：

- 一个专门承接“执行结果反馈”的最小数据表
- 一个把条件单触发/模拟成交/平仓结果沉淀为研究流可消费记录的统一入口

---

## 3. 方案比较

### 方案 A：继续往 `portfolio_trade` / `strategy_score_records` 加反馈列

优点：
- 表少

缺点：
- 会污染已有主表
- 执行事件和策略评分强耦合
- 后续字段扩展很快失控

### 方案 B：新增 `execution_feedback` 单表（采用）

优点：
- 与当前 `conditional_order_context` 设计一致
- 主交易表保持稳定
- 方便逐步扩展事件类型
- 更适合后续把反馈映射回 `strategy_versions`

缺点：
- 需要多一张表
- 需要一层汇聚逻辑

---

## 4. 最小表设计

```sql
CREATE TABLE execution_feedback (
  feedback_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  conditional_order_id INTEGER,
  trade_id INTEGER,
  account_id INTEGER,
  ts_code TEXT NOT NULL,
  strategy_source TEXT,
  strategy_config_id INTEGER,
  strategy_config_name TEXT,
  template_id INTEGER,
  template_name TEXT,
  strategy_id TEXT,
  strategy_version TEXT,
  version_id TEXT,
  report_id TEXT,
  action TEXT,
  quantity INTEGER,
  price REAL,
  amount REAL,
  realized_pnl REAL,
  realized_return REAL,
  holding_days INTEGER,
  payload_json TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 说明

- `event_type` 初期只做 3 类：
  - `conditional_trigger`
  - `simulated_trade`
  - `position_closed`
- `version_id` 对应 `strategy_versions.version_id`
- `payload_json` 只存扩展信息，主分析字段仍用显式列，便于后续查询和排序

---

## 5. 关联策略版本的方法

### 第一阶段

优先复用 `conditional_order_context`：

1. 条件单创建时已经带入：
   - `strategy_source`
   - `strategy_id`
   - `strategy_version`
   - `report_id`
2. 执行时读取：
   - `conditional_order.id`
   - `conditional_order_context.*`
3. 尝试映射到：
   - `strategy_versions.version_id`

### 映射规则

1. 如果 `conditional_order_context.strategy_version` 已直接对应 `strategy_versions.version_id`
   - 直接写入 `execution_feedback.version_id`
2. 否则先保留：
   - `strategy_source`
   - `strategy_config_id`
   - `template_id`
   - `strategy_id`
   - `strategy_version`
3. 后续再补一层“策略版本解析器”

---

## 6. 最小落地范围

### 第 1 步

新增 `execution_feedback` migration

### 第 2 步

在“条件单执行成功 -> 写入 `portfolio_trade`”后，同步写一条 `simulated_trade`

### 第 3 步

在条件单触发但未成交的路径，写一条 `conditional_trigger`

### 第 4 步

当仓位真正关闭时，补一条 `position_closed`

---

## 7. 避免过早复杂化

1. 先不改 `portfolio_trade` 表结构
2. 先不把 `strategy_score_records` 直接和反馈表强绑定
3. 先只做“记录事实”，不急着自动重算评分
4. 初期只保证：
   - 能查到某次成交来自哪类策略上下文
   - 能按策略版本/上下文聚合执行反馈

---

## 8. 结论

采用 **方案 B：新增 `execution_feedback` 单表**。

原因：

1. 与当前 `conditional_order_context` 的 side table 方向一致
2. 能最小成本建立“执行流 -> 研究流”的反馈桥
3. 不会继续扩大已有交易主表的 schema 风险
