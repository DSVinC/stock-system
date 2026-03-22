# TASK_UI_FIX_008 - 条件单 UI 剩余功能补齐

**优先级**: P1  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 14:05  
**预计完成**: 2026-03-22 16:00  
**依赖**: TASK_CONDITIONAL_UI_001

---

## 📋 问题清单（Codex 复验）

### 1. 编辑条件单功能缺失
- **现状**: 按钮存在，但 `editOrder(id)` 只提示"待补充"
- **要求**: 点击编辑后回填表单，可修改后保存
- **修复**: 实现编辑模式（回填 + 保存）

### 2. 批量操作缺失
- **要求**: 批量启用/禁用/删除
- **修复**: 添加复选框 + 批量操作按钮

### 3. 执行历史缺失
- **要求**: 查看条件单触发记录（时间/价格/数量/状态）
- **修复**: 添加执行历史查看功能（可简化为弹窗展示）

---

## 🎯 验收标准

### 编辑功能
- [ ] 点击"编辑"按钮后，表单回填当前条件单数据
- [ ] 修改后可保存更新
- [ ] 编辑时弹窗标题变为"编辑条件单"

### 批量操作
- [ ] 列表每行有复选框
- [ ] 顶部有"批量启用"/"批量禁用"/"批量删除"按钮
- [ ] 批量操作有确认提示

### 执行历史
- [ ] 每行有"查看历史"按钮
- [ ] 弹窗显示触发记录列表
- [ ] 记录包含：触发时间、触发价格、执行动作、状态

---

## 🔧 实施建议

### 编辑功能（优先级最高）
```javascript
async function editOrder(id) {
  const order = orders.find(o => o.id === id);
  if (!order) return;
  
  // 回填表单
  const form = getCreateForm();
  form.ts_code.value = order.ts_code;
  form.stock_name.value = order.stock_name;
  form.action.value = order.action;
  // ... 回填其他字段
  
  // 记录编辑 ID
  editingOrderId = id;
  
  // 打开弹窗
  showCreateModal();
}
```

### 批量操作
```javascript
function batchToggle(status) {
  const selected = getSelectedOrderIds();
  selected.forEach(id => {
    api(`/api/conditional-order/${id}/toggle`, { method: 'PUT' });
  });
  loadOrders();
}
```

### 执行历史
```javascript
async function showHistory(id) {
  const result = await api(`/api/conditional-order/${id}/history`);
  // 弹窗显示历史记录
}
```

---

## ✅ 验收检查清单

- [ ] 编辑功能可正常回填和保存
- [ ] 批量操作可正常执行
- [ ] 执行历史可查看
- [ ] Git 提交规范：fix(conditional-ui): 补齐编辑/批量/历史功能
- [ ] Codex 验收通过
