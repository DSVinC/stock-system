# TASK_MOCK_002 - 模拟交易引擎 API - 交接文档

**创建时间**: 2026-04-02 08:40  
**开发者**: Codex  
**状态**: 已完成

---

## 任务目标
提供模拟账户交易执行 API，实现买卖撮合、成本与滑点计算、账户与持仓联动更新。

## 实施结果
新增接口：
- `POST /api/mock/trade/execute`

核心规则：
- 默认滑点：`0.001`
- 佣金率：`0.00025`，最低 `5`
- 卖出印花税：`0.001`

数据库联动：
- 写入 `mock_trade`
- 更新 `mock_position`
- 更新 `mock_account.current_capital / available_capital`

## 验证结果
- 语法校验通过：`api/mock-trade.js`、`api/server.js`
- BUY/SELL API 本地 smoke 通过
- 测试数据已清理

## 交接说明
- 该接口依赖 `TASK_MOCK_001` 的表结构。
- 若后续新增交易类型（分批、组合单），应在该接口上扩展，不建议新增平行写库入口。

## 相关文件
- `api/mock-trade.js`
- `api/server.js`
- `docs/tasks/TASK_MOCK_002_ASSIGNMENT.md`
- `docs/runtime/TASK_MOCK_002_STATUS.md`
- `memory/project/stock_system/2026-04-01T22-22-00-task-mock-002.json`
