# TASK_MOCK_005 - 模拟账户管理 API 套件 - 交接文档

**创建时间**: 2026-04-02 08:40  
**开发者**: Codex  
**状态**: 已完成

---

## 任务目标
提供模拟账户域的统一管理接口，覆盖账户生命周期、交易记录、绩效与告警查询。

## 实施结果
新增模块：
- `api/mock-account.js`

挂载路由：
- `/api/mock/*`

已实现接口：
- `POST /api/mock/account/create`
- `GET /api/mock/account/list`
- `POST /api/mock/account/stop`
- `GET /api/mock/trade/list`
- `GET /api/mock/performance/current`
- `GET /api/mock/performance/deviation`
- `GET /api/mock/performance/alerts`

## 验证结果
- 语法校验通过
- API smoke 通过（创建/查询/停止链路可用）

## 交接说明
- 接口默认与 `mock_trade` / `mock_position` / `mock_performance` 联动查询。
- 新增前端页面应直接复用该套 API，避免重复封装临时接口。

## 相关文件
- `api/mock-account.js`
- `api/server.js`
- `docs/tasks/TASK_MOCK_005_ASSIGNMENT.md`
- `docs/runtime/TASK_MOCK_005_STATUS.md`
- `memory/project/stock_system/2026-04-01T23-27-00-task-mock-004-005.json`
