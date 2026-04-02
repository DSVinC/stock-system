# 任务分配单：TASK_MOCK_005

**任务名称**: 模拟账户管理 API  
**优先级**: P1  
**预计工时**: 3h  
**状态**: completed  

---

## 任务描述

实现独立模拟账户的管理接口，支持账户、交易查询、绩效与告警查询。

## 核心功能

1. 模拟账户创建/列表/停止
2. 模拟交易记录查询
3. 当前绩效、偏差账户、偏差告警查询

## API 端点

- `POST /api/mock/account/create`
- `GET /api/mock/account/list`
- `POST /api/mock/account/stop`
- `GET /api/mock/trade/list`
- `GET /api/mock/performance/current`
- `GET /api/mock/performance/deviation`
- `GET /api/mock/performance/alerts`

## 验收标准

- [x] 账户创建与状态变更正确
- [x] 交易查询条件有效
- [x] 绩效和偏差查询返回正确
- [x] API 路由已挂载到 `/api/mock/*`

## 相关文件

- `api/mock-account.js`
- `api/server.js`

## 完成说明（2026-04-01）

- 新增 `api/mock-account.js`，落地 7 个接口。
- `api/server.js` 已挂载 `/api/mock` 路由。
- 已完成本地 API 闭环验收（create -> trade -> performance -> alerts -> stop），并清理测试数据。
