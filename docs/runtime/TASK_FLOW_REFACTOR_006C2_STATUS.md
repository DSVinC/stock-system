# TASK_FLOW_REFACTOR_006C2 实时状态

**状态**: done  
**开始时间**: 2026-03-27 13:05  
**完成时间**: 2026-03-27 13:50  
**负责人**: Codex（方案/验收）  
**开发执行**: 待派发  

## 任务目标

评估条件单后端与数据库是否需要真正持久化执行流程中的策略身份字段，为后续“执行反馈 -> 策略管理”回流准备可靠的存储基础。

## 当前发现

1. 前端链路已打通到 `conditional-order.html`
   - `TASK_FLOW_REFACTOR_006C1` 已完成前端透传

2. 后端 API 尚未消费这些字段
   - `api/conditional-order.js#createConditionalOrder()` 未接收：
     - `strategySource`
     - `strategyConfigId`
     - `strategyConfigName`
     - `templateId`
     - `templateName`

3. 真实数据库表结构存在 schema 漂移
   - 当前 `/Volumes/SSD500/openclaw/stock-system/stock_system.db` 的 `conditional_order` 表不包含：
     - `report_id`
     - `remark`
     - 任何策略身份字段
   - 但现有代码中已有多处写入：
     - `api/conditional-order.js` 写 `report_id`
     - `api/report-storage.js` 写 `remark`

## 当前判断

- 这一步不能直接按“加 5 个字段”推进
- 需要先厘清：
  1. `conditional_order` 表应以什么版本为准
  2. `report_id / remark` 这类已漂移字段是否要先统一
  3. 策略身份字段是直接加在 `conditional_order` 表，还是进入独立的执行上下文表

## 当前决策

- 已确定采用 **方案 B：`conditional_order_context` 侧表**
- 理由：
  1. `conditional_order` 主表已有 schema 漂移，继续扩主表会放大旧问题
  2. 执行上下文更适合作为可演进的侧表，承接后续 `strategy_id / version / report_id`
  3. 后续执行反馈回流研究流程时，侧表更适合做附加维度，不污染主交易记录主表

## 已完成子任务

- `TASK_FLOW_REFACTOR_006C2A` ✅
  - 新增 `conditional_order_context` migration
  - `createConditionalOrder()` 已写入侧表
  - 持久化测试通过
- `TASK_FLOW_REFACTOR_006C2B` ✅
  - 条件单列表 / 详情查询已联表返回上下文字段
  - 查询测试通过
- `TASK_FLOW_REFACTOR_006C2C1` ✅
  - `report-storage#importToOrderFromReport()` 已停止依赖主表 `remark`
  - 报告导入说明与 `report_id` 已改写入 `conditional_order_context`
  - 导入 schema 修复测试通过
- `TASK_FLOW_REFACTOR_006C2C2` ✅
  - `backtest-to-conditional#createConditionalOrderInDB()` 已补写 `conditional_order_context`
  - 研究流来源与导入原因可随条件单持久化
  - 回测导入上下文测试通过
- `TASK_FLOW_REFACTOR_006C2C3` ✅
  - `createFromReport()` 已停止依赖主表 `report_id`
  - 每个从报告创建的条件单都补写侧表上下文
  - 报告导入旧写法已统一到 side table 方案

## 下一步建议

## 当前结论

- `TASK_FLOW_REFACTOR_006C2` 已完成
- 执行流中的三条条件单创建路径现已全部对齐 `conditional_order_context`：
  1. `createConditionalOrder()`
  2. `report-storage#importToOrderFromReport()`
  3. `backtest-to-conditional#createConditionalOrderInDB()`
  4. `conditional-order#createFromReport()`

## 下一步建议

1. 进入“执行反馈 -> 研究流回流”的字段与页面设计
2. 再决定哪些上下文需要在条件单列表/详情页显式展示
