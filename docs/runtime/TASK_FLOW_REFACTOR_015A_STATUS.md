# TASK_FLOW_REFACTOR_015A 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:10  
**完成时间**: 2026-03-27 18:15  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（Claude Code 本轮调用未稳定返回，已按最小补丁收口）  

## 任务目标

修复单条导入条件单时策略上下文丢失的问题，确保 `conditional-order.html` 在通过 `?import=` 导入策略后，创建请求会透传：

- `strategySource`
- `strategyConfigId`
- `strategyConfigName`
- `templateId`
- `templateName`

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/conditional-order.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-order-import-context.test.js`

## 已完成

- 已新增复现测试，先确认单条导入创建请求确实缺少策略上下文
- `conditional-order.html` 现已增加 `importedStrategyContext` 最小状态承接
- `parseImportPayload()` 已支持读取导入载荷中的策略身份字段
- `handleImportFromQuery()` 导入成功后会保留当前策略上下文
- `createOrder()` 创建请求现在会合并 `importedStrategyContext`
- `resetCreateForm()` 和 `closeCreateModal()` 会清掉临时上下文，避免污染后续手动创建

## 验收结果

- 通过
- 复验命令：
  - `node test/conditional-order-import-context.test.js`
  - `node test/conditional-order-batch-context.test.js`

## 边界情况

- 这一步只修复了“条件单页消费导入上下文并在创建时透传”。
- `analysis.html` 当前跳转到 `conditional-order.html?import=...` 时，还没有把选股/分析链路里的策略身份一起塞进导入载荷；这会作为下一步单独收口。

## 下一步建议

1. 继续做 `analysis.html -> conditional-order.html` 的导入载荷补齐
2. 后续再补一条跨页面回归，确认从分析页点击“导入条件单”后，最终创建请求含完整策略身份
