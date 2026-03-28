# TASK_MONITOR_FIX_001 - 条件单监控修复任务

**优先级**: P1  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 14:25  
**预计完成**: 2026-03-22 15:00  
**依赖**: TASK_CONDITIONAL_MONITOR_001 验收未通过

---

## 📋 问题清单（Codex 验收发现）

### 1. `pe_percentile` 条件不可用
- **现状**: 监控上下文 `buildOrderContext` 没有提供 `marketData.pePercentile` 字段
- **影响**: PE 分位条件单永远不触发
- **修复**: 补齐 PE 分位数据，或明确禁用该条件类型

### 2. 真实联调证据不足
- **现状**: 测试只是依赖注入 mock 通过，没有真实调用新浪财经/Tushare/飞书
- **影响**: 无法证明真实链路可用
- **修复**: 用真实环境跑一次手工验收

### 3. 环境依赖理解偏差
- **现状**: 说法"缺少新浪 token"与代码不符
- **事实**: 
  - 实时行情：依赖本地 `sina-ashare-mcp` 脚本
  - 技术面/基本面：依赖 `TUSHARE_TOKEN`
  - 真实阻塞点：TUSHARE_TOKEN 和飞书运行环境
- **修复**: 明确文档说明实际依赖关系

---

## 🎯 验收标准（修复后）

### 核心功能
- [ ] `pe_percentile` 条件可正常触发（补全数据或禁用）
- [ ] 真实环境手工验收通过（新浪财经/Tushare/飞书）
- [ ] 环境依赖说明文档更新

### PE 分位修复方案（二选一）
- **方案 A**: 补齐 `marketData.pePercentile` 数据
  - 在 `buildOrderContext` 中调用 `getPEHistory` 计算 PE 分位
  - 将 `pePercentile` 注入到 `marketData`
- **方案 B**: 明确禁用该条件类型
  - 在监控层检测 `pe_percentile` 条件，抛出"暂不支持"错误
  - 更新文档说明该限制

### 真实环境验收
- [ ] 配置正确的 `TUSHARE_TOKEN`
- [ ] 确保 `sina-ashare-mcp` 脚本可正常运行
- [ ] 测试飞书推送功能（推送一条测试消息）
- [ ] 运行 `node scripts/conditional-order-monitor.mjs` 并验证日志

---

## 🔧 实施建议

### 补齐 PE 分位数据
```javascript
async function getPEHistory(ts_code) {
  // 调用 Tushare API 获取历史 PE 数据
  // 计算当前 PE 在历史中的分位
  return { pePercentile: 0.25 }; // 示例
}

async function buildOrderContext(order, dependencies, cache) {
  // ... 现有逻辑
  
  if (requirements.needsPEPercentile) {
    const peHistory = await getPEHistory(order.ts_code);
    marketData.pePercentile = peHistory.pePercentile;
  }
  
  return { conditions: requirements.conditions, marketData, technicalData };
}
```

### 真实环境验收脚本
```javascript
// scripts/test-real-monitor.mjs
import { checkAllConditionalOrders } from '../api/monitor-conditional.js';

async function main() {
  console.log('🔧 开始真实环境验收测试...');
  
  // 创建一个测试条件单
  const testOrder = {
    ts_code: '000001.SZ',
    conditions: JSON.stringify([{ type: 'price', operator: '>=', value: 1 }]),
    action: 'buy',
    quantity: 100,
    account_id: 1
  };
  
  // 运行监控
  const result = await checkAllConditionalOrders();
  console.log('📊 验收结果:', result);
  
  if (result.success && result.triggered > 0) {
    console.log('✅ 真实环境验收通过！');
  } else {
    console.log('⚠️ 验收发现问题:', result);
  }
}

main().catch(console.error);
```

---

## ✅ 验收检查清单

- [ ] `pe_percentile` 条件问题已修复
- [ ] 真实环境验收测试通过
- [ ] 环境依赖文档更新
- [ ] Git 提交规范：fix(monitor): 修复 pe_percentile 条件 + 真实环境验收
- [ ] Codex 复验通过

---

## 📝 备注

- 当前已有 `TUSHARE_TOKEN` 环境变量（`[Keychain 中的 skills/tushare/token]`）
- 新浪财经 MCP 脚本位置：`/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/scripts`
- 飞书 open_id：`ou_a21807011c59304bedfaf2f7440f5361`
- 修复后重新验收 TASK_CONDITIONAL_MONITOR_001
