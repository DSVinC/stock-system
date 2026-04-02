# TASK_MOCK_004 - 偏差检测 + 二次迭代人工触发 - 交接文档

**创建时间**: 2026-04-02 08:40  
**开发者**: Codex  
**状态**: 已完成

---

## 任务目标
基于模拟绩效偏差，提供人工确认后触发二次迭代的接口能力。

## 实施结果
新增接口：
- `POST /api/iteration/trigger-by-deviation`

设计约束：
- 仅人工触发，不自动触发
- 无绩效记录直接报错
- 未超阈值直接报错
- 上下文完整时才创建迭代任务

## 验证结果
- 语法校验通过
- 接口 smoke 通过（含异常分支）

## 交接说明
- 当前是“人工确认再迭代”模式，符合设计共识中“二次触发需要手动执行”要求。
- 若未来要自动触发，必须新增明确开关并补风控防抖策略。

## 相关文件
- `api/iteration-manager.js`
- `docs/tasks/TASK_MOCK_004_ASSIGNMENT.md`
- `docs/runtime/TASK_MOCK_004_STATUS.md`
- `memory/project/stock_system/2026-04-01T23-27-00-task-mock-004-005.json`
