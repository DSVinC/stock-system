# TASK_FLOW_REFACTOR_015G 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:40  
**完成时间**: 2026-03-27 18:43  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（最小补丁收口）  

## 任务目标

让条件单列表真正显示策略 feedback 标签，执行流页面能直接看到研究流沉淀下来的反馈状态、置信度和关键统计。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/conditional-order.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-order-render-context.test.js`

## 已完成

- 条件单列表股票名下方已新增反馈信息块
- 现在会展示：
  - `反馈: 正向/分化/谨慎/暂无反馈`
  - `置信度: 高/中/低/无`
  - `样本: N 笔`
  - `盈亏: 数值`
- 保持了既有策略来源标签和策略名称显示
- 无 feedback 时不会渲染空标签

## 验收结果

- 通过
- 复验命令：
  - `node test/conditional-order-render-context.test.js`
  - `node test/conditional-order-context-query.test.js`

## 边界情况

- 这一步只做列表展示，没有扩到详情弹窗或历史记录。
- 当前 `total_pnl` 直接按数值显示，后面如果需要统一货币格式，再做单独文案/格式化任务。

## 下一步建议

1. 检查监控池导入/创建路径是否也携带并显示相同策略身份
2. 后续可补浏览器级回归，确认真实条件单列表能稳定显示 feedback 标签
