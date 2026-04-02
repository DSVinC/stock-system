# 任务分配单：TASK_MOCK_004

**任务名称**: 偏差检测 + 二次迭代触发（人工）  
**优先级**: P1  
**预计工时**: 3h  
**状态**: completed  

---

## 任务描述

基于 `mock_performance` 的偏差结果，提供人工触发二次迭代的 API，不做自动触发。

## 核心功能

1. 校验账户最新绩效是否存在且 `is_deviation_exceeded = 1`
2. 从 mock 账户和策略版本恢复迭代上下文（策略类型、参数、股票池、区间）
3. 手动触发并创建新的迭代任务

## API 端点

**POST /api/iteration/trigger-by-deviation**

## 验收标准

- [x] 仅人工触发，不自动触发
- [x] 偏差未超阈值时返回明确错误
- [x] 偏差超阈值时可成功创建迭代任务
- [x] 触发上下文写入任务输入摘要

## 相关文件

- `api/iteration-manager.js`
- `docs/design/2026-04-01-mock-account-design.md`

## 完成说明（2026-04-01）

- 已新增 `POST /api/iteration/trigger-by-deviation`。
- 已实现：不存在绩效、未超阈值、账户不存在、样本不足等场景的明确报错。
- 已实现：触发成功时复用迭代任务创建链路，并写入 trigger 上下文。
