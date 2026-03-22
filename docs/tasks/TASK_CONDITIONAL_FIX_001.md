# TASK_CONDITIONAL_FIX_001 - 条件单功能紧急修复

**优先级**: P0 (阻塞)  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 13:45  
**预计完成**: 2026-03-22 15:00  
**依赖**: 无

---

## 📋 问题清单（Codex 验收 ec8b2ce）

### 1. 高优先级：表单提交函数名不匹配
- **问题**: 表单 `onsubmit="saveOrder(event)"` 但实际定义的是 `createOrder(e)`
- **影响**: 导入和手动创建都无法提交
- **修复**: 统一为 `createOrder` 或 `saveOrder`

### 2. 高优先级：导入映射不支持 volume_ratio
- **问题**: `mapImportedCondition()` 只支持 price/rsi/pe/pct_change/ma_cross
- **影响**: 上游 schema 的 volume_ratio 条件会抛错
- **修复**: 添加 volume_ratio/macd/main_force_net 等字段映射

### 3. 中优先级：UI 核心操作缺失
- **问题**: 列表缺少启用/禁用切换、删除、编辑、批量操作、历史记录
- **影响**: TASK_CONDITIONAL_UI_001 验收不通过
- **修复**: 至少完成 toggle 和删除功能

### 4. 中优先级：价格穿越判定字段错误
- **问题**: 代码用 `previousPrice` 但行情返回 `prevClose`
- **影响**: price_above/below 退化成静态比较
- **修复**: 统一使用 `prevClose` 字段

---

## 🎯 验收标准

- [ ] 4 个问题全部修复
- [ ] `node --check conditional-order.html` 内联脚本语法正确
- [ ] 导入功能可完整提交创建
- [ ] Codex 验收通过

---

## 🔧 修复步骤

### Fix 1: 修正 onsubmit 绑定
```html
<!-- 605 行 -->
<form id="create-form" onsubmit="createOrder(event)">
```

### Fix 2: 补齐 volume_ratio 映射
```javascript
// mapImportedCondition 中添加
if (field === 'volume_ratio') {
  return createLegacyCompatibleCondition('volume_ratio_above', { ratio: value });
}
```

### Fix 3: 添加 toggle/delete 功能
```javascript
async function toggleOrder(id) {
  const order = orders.find(o => o.id === id);
  const newStatus = order.status === 'enabled' ? 'disabled' : 'enabled';
  await fetch(`/api/conditional-order/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: newStatus })
  });
  loadOrders();
}
```

### Fix 4: 统一 prevClose 字段
```javascript
// evaluateCrossCondition 中
const prevPrice = marketData.prevClose || marketData.previousPrice || marketData.price;
```

---

## ✅ 验收检查清单

- [ ] Fix 1: onsubmit 绑定修正
- [ ] Fix 2: volume_ratio 映射添加
- [ ] Fix 3: toggle/delete 功能实现
- [ ] Fix 4: prevClose 字段统一
- [ ] Git 提交规范：fix(conditional): 修复 Codex 验收问题
- [ ] Codex 验收通过
