# TASK_FLOW_REFACTOR_016C 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:51  
**完成时间**: 2026-03-27 18:55  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（最小补丁收口）  

## 任务目标

修复监控池批量创建条件单的真实运行态问题，让“监控池 -> 条件单”这条支线不仅能跳转，还能真正落单并保留策略上下文。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/conditional-order.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-order-batch-create-trigger.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-order-batch-context.test.js`

## 已完成

- 已定位并修复两个真实问题：
  1. 批量创建仍在使用旧接口 `/api/conditional-order/create`，真实运行返回 `404`
  2. 批量条件选择里的 `price_cross_up/down` 需要归一化为当前统一 `trigger_type`
- `executeBatchCreate()` 现在：
  - 调用 `POST /api/conditional-order`
  - 会把 `price_cross_up/down` 归一化为 `price_above/price_below`
  - 继续保留策略身份字段透传
- 浏览器运行态已确认：
  - 监控池勾选股票
  - 跳转到条件单页批量创建
  - 填写条件和仓位后成功落单
  - 新条件单保留 `strategy_source / strategy_config_id / template_id`

## 验收结果

- 通过
- 复验命令：
  - `node test/conditional-order-batch-create-trigger.test.js`
  - `node test/conditional-order-batch-context.test.js`
  - 浏览器冒烟：
    - `temp/monitor_batch_create_smoke.js`

## 边界情况

- 批量创建买入单仍然要求填写仓位占比、数量或金额之一；这不是 bug，是当前业务规则。
- 浏览器冒烟里用的是测试股票 `111111.SZ`，只用于验证链路，不代表真实标的质量。

## 下一步建议

1. 把这条浏览器冒烟固化成正式回归脚本，避免未来再出现“页面能跳转但接口已改名”的问题
2. 继续验证更完整的执行流：
   - 选股/分析 -> 监控池 -> 条件单
