# TASK_CONDITIONAL_MONITOR_001 - 条件单监控集成与定时任务

**优先级**: P1  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 14:20  
**预计完成**: 2026-03-22 15:30  
**依赖**: TASK_CONDITIONAL_EXECUTOR_001 完成

---

## 📋 任务描述

将条件单执行器集成到监控系统中，并配置定时任务，实现自动化的条件单触发监控。

**背景**: 条件单执行器已完成，现在需要将其集成到监控系统中，并配置定时任务（每 5 分钟检查一次），实现真正的自动化条件单触发。

---

## 🎯 验收标准

### 监控集成
- [ ] 监控模块 `api/monitor-conditional.js` 已改造为调用执行器
- [ ] 监控模块能获取实时行情数据（复用新浪 MCP）
- [ ] 监控模块能检查所有启用中的条件单
- [ ] 监控模块能按条件逻辑判断是否触发

### 定时任务
- [ ] 创建定时任务配置文件 `cron/conditional-order-monitor.json`
- [ ] 配置每 5 分钟执行一次条件单监控
- [ ] 定时任务脚本调用 `scripts/monitor-service.mjs` 或 `api/monitor-conditional.js`

### 执行流程
- [ ] 每轮监控：获取所有 `enabled` 状态的条件单
- [ ] 对每个条件单：获取实时行情 + 检查条件是否满足
- [ ] 条件满足时：调用执行器 `executeConditionalOrder`
- [ ] 记录监控日志（触发/未触发数量）

### 错误处理
- [ ] 行情获取失败时跳过，记录日志
- [ ] 执行器调用失败时记录错误，继续监控其他条件单
- [ ] 有异常时不会中断整个监控循环

---

## 🔧 实施建议

### 监控循环
```javascript
// api/monitor-conditional.js
async function monitorConditionalOrders() {
  const db = await getDatabase();
  const orders = await db.allPromise(`
    SELECT * FROM conditional_order 
    WHERE status = 'enabled' 
    AND start_date <= date('now')
    AND end_date >= date('now')
  `);
  
  let triggered = 0;
  let total = orders.length;
  
  for (const order of orders) {
    try {
      // 获取实时行情
      const marketData = await getRealtimeQuote(order.ts_code);
      if (!marketData) continue;
      
      // 检查条件
      const shouldTrigger = checkCondition(order, marketData, {});
      if (!shouldTrigger) continue;
      
      // 执行交易
      const result = await executeConditionalOrder(order.id, marketData, {});
      if (result.success) {
        triggered++;
        console.log(`[条件单触发] ${order.ts_code} ${order.action} ${result.quantity}股`);
      }
    } catch (error) {
      console.error(`[条件单监控错误] ${order.ts_code}:`, error.message);
    }
  }
  
  return { triggered, total };
}
```

### 定时任务配置
```json
{
  "name": "条件单监控",
  "description": "每5分钟检查一次条件单是否触发",
  "schedule": "*/5 * * * *",
  "command": "node scripts/monitor-service.mjs",
  "env": {
    "NODE_ENV": "production"
  }
}
```

### 监控脚本
```javascript
// scripts/monitor-service.mjs
import { monitorConditionalOrders } from '../api/monitor-conditional.js';

async function main() {
  console.log(`[${new Date().toISOString()}] 🔍 开始条件单监控检查...`);
  const result = await monitorConditionalOrders();
  console.log(`[${new Date().toISOString()}] ✅ 检查完成: 触发 ${result.triggered}/${result.total} 个条件单`);
}

main().catch(console.error);
```

---

## ✅ 验收检查清单

- [ ] 监控模块能正常获取实时行情
- [ ] 监控模块能正确判断条件是否满足
- [ ] 监控模块能调用执行器完成交易
- [ ] 定时任务配置文件创建完成
- [ ] 定时任务能正常运行
- [ ] 监控日志记录完整
- [ ] 错误处理完善，不中断监控
- [ ] Git 提交规范：feat(monitor): 条件单监控集成 + 定时任务
- [ ] Codex 验收通过

---

## 📝 备注

- 监控模块已存在，但需要改造为使用新的执行器
- 实时行情可使用现有的 `getRealtimeQuote` 函数（复用新浪 MCP）
- 定时任务配置后需要重启 Gateway 生效
- 监控日志应包括时间、触发数量、错误信息等
