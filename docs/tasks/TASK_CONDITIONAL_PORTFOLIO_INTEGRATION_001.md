# TASK_CONDITIONAL_PORTFOLIO_INTEGRATION_001 - 条件单与投资组合集成

**优先级**: P1  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 14:30  
**预计完成**: 2026-03-22 15:30  
**依赖**: TASK_CONDITIONAL_MONITOR_001 完成

---

## 📋 任务描述

将条件单系统与现有投资组合系统深度集成，实现：
1. 条件单创建时验证投资组合账户
2. 执行时自动更新投资组合持仓
3. 在投资组合页面展示条件单触发历史
4. 投资组合账户支持条件单策略回测

**背景**: 条件单执行器已完成，监控系统已集成，现在需要将条件单与核心投资组合系统连接，形成完整的投资闭环。

---

## 🎯 验收标准

### 账户验证
- [ ] 条件单创建时验证 `account_id` 是否存在且有效
- [ ] 条件单创建时验证账户有足够资金/持仓
- [ ] 条件单列表显示账户名称（关联查询）

### 执行集成
- [ ] 条件单执行器正确更新投资组合持仓
- [ ] 执行历史在投资组合交易记录中可见
- [ ] 投资组合账户现金、市值、收益实时更新

### UI 集成
- [ ] `portfolio.html` 页面增加"条件单"标签页
- [ ] 投资组合详情页显示相关条件单
- [ ] 条件单页面显示对应的投资组合账户

### 回测支持
- [ ] 投资组合回测支持导入条件单策略
- [ ] 回测引擎能模拟条件单触发和执行
- [ ] 回测结果包含条件单策略表现

---

## 🔧 实施建议

### 1. 条件单创建验证
```javascript
// api/conditional-order.js
async function createOrder(req, res) {
  const { account_id, ... } = req.body;
  
  // 验证账户存在
  const account = await db.getPromise(
    'SELECT * FROM portfolio_account WHERE id = ?',
    [account_id]
  );
  if (!account) {
    return res.status(400).json({ 
      error: '投资组合账户不存在', 
      code: 'ACCOUNT_NOT_FOUND' 
    });
  }
  
  // 验证资金/持仓
  if (action === 'buy') {
    const cash = Number(account.current_cash);
    // 根据数量/金额/仓位计算所需资金
    if (requiredCash > cash) {
      return res.status(400).json({ 
        error: '账户资金不足', 
        code: 'INSUFFICIENT_FUNDS' 
      });
    }
  }
}
```

### 2. 投资组合页面集成
```html
<!-- portfolio.html -->
<div class="tabs">
  <button class="tab-btn active" data-tab="overview">概览</button>
  <button class="tab-btn" data-tab="positions">持仓</button>
  <button class="tab-btn" data-tab="history">交易历史</button>
  <button class="tab-btn" data-tab="conditionals">条件单</button>
</div>

<div id="conditionals-tab" class="tab-content">
  <h3>条件单</h3>
  <div id="conditional-orders-list"></div>
  <a href="conditional-order.html" class="btn">创建新条件单</a>
</div>
```

### 3. 回测引擎集成
```javascript
// api/backtest.js
async function runBacktest(strategy, params, account_id) {
  if (strategy === 'conditional') {
    // 获取该账户的所有条件单
    const orders = await db.allPromise(`
      SELECT * FROM conditional_order 
      WHERE account_id = ? AND status = 'enabled'
    `, [account_id]);
    
    // 模拟条件单触发
    const simulationResult = simulateConditionalOrders(
      orders, 
      historicalData,
      { commission: 0.001, boardLot: 100 }
    );
    
    return simulationResult;
  }
}
```

### 4. 数据表关联增强
```sql
-- 在 portfolio_trade 表添加条件单关联
ALTER TABLE portfolio_trade 
ADD COLUMN conditional_order_id INTEGER REFERENCES conditional_order(id);

-- 创建条件单执行历史视图
CREATE VIEW view_conditional_executions AS
SELECT 
  co.id AS order_id,
  co.ts_code,
  co.stock_name,
  co.action,
  co.status,
  co.trigger_count,
  pt.trade_date,
  pt.quantity,
  pt.price,
  pt.amount,
  pa.name AS account_name
FROM conditional_order co
LEFT JOIN portfolio_trade pt ON pt.conditional_order_id = co.id
LEFT JOIN portfolio_account pa ON co.account_id = pa.id;
```

---

## ✅ 验收检查清单

- [ ] 条件单创建时账户验证成功
- [ ] 执行器正确更新投资组合持仓和现金
- [ ] 投资组合页面显示条件单标签页
- [ ] 条件单页面显示投资组合账户信息
- [ ] 回测引擎支持条件单策略回测
- [ ] SQL 视图创建成功
- [ ] 所有语法检查通过
- [ ] Git 提交规范：feat(portfolio-integration): 条件单与投资组合集成
- [ ] Codex 验收通过

---

## 📝 备注

- 此任务需要修改多个文件：`api/conditional-order.js`, `portfolio.html`, `api/backtest.js`, `api/server.js`
- 需要数据库迁移（添加外键约束）
- 需要确保向后兼容性（不影响现有功能）
- 测试时需要准备真实的投资组合账户和股票数据
