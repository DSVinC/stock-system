# 任务分配单：TASK_MOCK_002

**任务名称**: 模拟交易引擎 API  
**优先级**: P0  
**预计工时**: 4h  
**状态**: completed  

---

## 任务描述

实现模拟交易引擎，处理条件单触发时的模拟交易执行。

## 核心功能

1. **模拟成交价计算**
   - 买入：price × (1 + slippageRate)
   - 卖出：price × (1 - slippageRate)
   - 默认滑点：0.1%

2. **交易成本计算**
   - 佣金：万分之 2.5，最低 5 元
   - 印花税：卖出时千分之 1

3. **持仓更新**
   - 买入：增加持仓数量，更新平均成本
   - 卖出：减少持仓数量，计算盈亏

## API 端点

**POST /api/mock/trade/execute**
```javascript
{
  "account_id": "mock_xxx",
  "ts_code": "003002.SZ",
  "action": "BUY",
  "quantity": 1000,
  "price": 52.30,
  "slippage_rate": 0.001
}
```

## 验收标准

- [x] API 端点正确实现
- [x] 模拟成交价计算正确
- [x] 交易成本计算正确
- [x] mock_trade 记录正确写入
- [x] mock_position 正确更新

## 相关文件

- `api/mock-trade.js` - 模拟交易引擎
- `docs/design/2026-04-01-mock-account-design.md` - 完整设计

## 完成说明（2026-04-01）

- 新增 `POST /api/mock/trade/execute`，实现 BUY/SELL 全流程。
- 计算规则已实现：
  - 滑点默认 `0.1%`（可传 `slippage_rate` 覆盖）
  - 佣金 `0.025%`，最低 `5` 元
  - 印花税仅 SELL 生效，税率 `0.1%`
- 执行结果已写入 `mock_trade`，并同步更新 `mock_position` 和 `mock_account` 资金字段。
- 已完成真实库回归：测试账户买入+卖出成功，数据库链路验证通过并已清理测试数据。

---

**创建时间**: 2026-04-01  
**创建者**: 灵爪
