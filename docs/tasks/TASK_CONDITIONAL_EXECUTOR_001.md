# TASK_CONDITIONAL_EXECUTOR_001 - 条件单执行器开发

**优先级**: P0 (核心功能)  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 14:15  
**预计完成**: 2026-03-22 16:00  
**依赖**: TASK_CONDITIONAL_UI_001, TASK_CONDITIONAL_TRIGGER_001 完成

---

## 📋 任务描述

实现条件单执行器，当触发条件满足时自动执行交易动作（买入/卖出）。

**背景**: 条件单 UI 和触发配置器已完成，现在需要实现核心的执行逻辑，当监控引擎检测到条件满足时，自动执行交易并记录执行历史。

---

## 🎯 验收标准

### 核心功能
- [ ] 执行器接口 `executeConditionalOrder(orderId, marketData, technicalData)`
- [ ] 支持买入/卖出两种交易动作
- [ ] 支持多种订单类型（价格单、金额单、仓位百分比单）
- [ ] 执行成功后写入 `portfolio_trade` 表（执行历史）
- [ ] 执行成功后更新条件单状态（trigger_count + 1，达到 max_trigger_count 后禁用）

### 交易动作
- [ ] 买入：调用 `api/portfolio.js` 的买入接口
- [ ] 卖出：调用 `api/portfolio.js` 的卖出接口
- [ ] 支持数量/金额/仓位百分比三种下单方式
- [ ] 仓位百分比基于当前账户可用资金计算

### 执行记录
- [ ] 记录字段：conditional_order_id, ts_code, stock_name, action, quantity, price, amount, trade_date, remark
- [ ] 执行成功后返回执行结果（成功/失败 + 原因）

### 错误处理
- [ ] 资金不足时返回错误（不执行）
- [ ] 持仓不足时返回错误（不执行）
- [ ] 股票停牌时返回错误（不执行）
- [ ] 执行失败时不更新条件单状态

---

## 🔧 实施建议

### 执行器接口
```javascript
// api/conditional-executor.js
async function executeConditionalOrder(orderId, marketData, technicalData) {
  // 1. 获取条件单详情
  const order = await getConditionalOrder(orderId);
  
  // 2. 验证条件是否触发
  const triggered = await checkConditions(order.conditions, marketData, technicalData);
  if (!triggered) return { success: false, reason: '条件未触发' };
  
  // 3. 执行交易动作
  const result = await executeTradeAction(order);
  if (!result.success) return result;
  
  // 4. 记录执行历史
  await recordExecution(order, result);
  
  // 5. 更新条件单状态
  await updateOrderStatus(orderId, result);
  
  return { success: true, ...result };
}
```

### 交易执行
```javascript
async function executeTradeAction(order) {
  const { action, order_type, quantity, amount, position_pct, ts_code } = order;
  
  // 计算实际交易数量/金额
  let finalQuantity, finalAmount;
  if (order_type === 'quantity') {
    finalQuantity = quantity;
  } else if (order_type === 'amount') {
    finalAmount = amount;
  } else if (order_type === 'position') {
    // 基于可用资金计算
    finalAmount = availableFunds * (position_pct / 100);
  }
  
  // 调用 portfolio API
  if (action === 'buy') {
    return await buyStock(ts_code, finalQuantity, finalAmount);
  } else {
    return await sellStock(ts_code, finalQuantity, finalAmount);
  }
}
```

---

## ✅ 验收检查清单

- [ ] 执行器模块创建 (`api/conditional-executor.js`)
- [ ] 执行器接口导出
- [ ] 买入/卖出功能正常
- [ ] 执行历史记录正常
- [ ] 条件单状态更新正常
- [ ] 错误处理完善
- [ ] Git 提交规范：feat(executor): 条件单执行器
- [ ] Codex 验收通过

---

## 📝 备注

- 执行器由监控引擎 (`api/monitor-conditional.js`) 调用
- 执行历史记录在 `portfolio_trade` 表，通过 `conditional_order_id` 关联
- 执行失败时不更新条件单状态，允许下次继续尝试
