# TASK_CONDITIONAL_UI_001 - 条件单主界面开发

**优先级**: P1  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 13:20  
**预计完成**: 2026-03-22 18:00  
**依赖**: TASK_ANALYZE_STRUCT_003 完成（API 接口）

---

## 📋 任务描述

实现条件单主界面 (`conditional-order.html`) 的核心功能，包括条件单列表展示、启用/禁用、删除等操作。

---

## 🎯 验收标准

### 1. 条件单列表
- [ ] 表格展示所有条件单（股票名称、代码、触发条件、动作、状态）
- [ ] 状态标识：启用（绿色）、禁用（灰色）、已触发（蓝色）
- [ ] 支持按状态筛选（全部/启用/禁用/已触发）
- [ ] 支持按股票搜索

### 2. 操作功能
- [ ] 启用/禁用切换（toggle 开关）
- [ ] 删除条件单（带确认提示）
- [ ] 编辑条件单（跳转到编辑页面）
- [ ] 批量操作（批量启用/禁用/删除）

### 3. 执行记录
- [ ] 查看条件单执行历史
- [ ] 显示执行时间、执行价格、执行数量
- [ ] 执行状态：成功/失败/部分成交

### 4. 空状态
- [ ] 无条件单时显示引导文案
- [ ] "新建条件单"按钮醒目

---

## 🔧 实施步骤

### Step 1: 数据结构设计

```javascript
// 条件单数据结构
{
  id: "cond_001",
  ts_code: "300750.SZ",
  stock_name: "宁德时代",
  trigger_type: "price_above", // price_above, price_below, ma_cross, etc.
  trigger_value: 200.50,
  action: "buy", // buy or sell
  position_pct: 20, // 仓位百分比
  stop_loss: 180.00,
  status: "enabled", // enabled, disabled, triggered
  created_at: "2026-03-22T10:00:00Z",
  updated_at: "2026-03-22T12:00:00Z"
}
```

### Step 2: 列表渲染

```javascript
async function renderConditionalOrders() {
  const orders = await fetchConditionalOrders();
  const tbody = document.querySelector('#order-list tbody');
  tbody.innerHTML = orders.map(order => `
    <tr data-id="${order.id}">
      <td>${order.stock_name}</td>
      <td>${order.ts_code}</td>
      <td>${formatTrigger(order)}</td>
      <td>${formatAction(order)}</td>
      <td><span class="status-${order.status}">${order.status}</span></td>
      <td>
        <button onclick="toggleOrder('${order.id}')">${order.status === 'enabled' ? '禁用' : '启用'}</button>
        <button onclick="deleteOrder('${order.id}')">删除</button>
      </td>
    </tr>
  `).join('');
}
```

### Step 3: API 接口

- `GET /api/conditional/orders` - 获取条件单列表
- `PUT /api/conditional/:id/toggle` - 启用/禁用
- `DELETE /api/conditional/:id` - 删除条件单
- `GET /api/conditional/:id/history` - 执行历史

---

## 📁 相关文件

- 目标文件：`conditional-order.html`
- API 文件：`api/conditional.js`（新建）
- 样式文件：`css/conditional.css`（可选）

---

## ✅ 验收检查清单

- [ ] 列表渲染正确
- [ ] 筛选/搜索功能正常
- [ ] 启用/禁用切换正常
- [ ] 删除功能正常（带确认）
- [ ] 空状态显示正确
- [ ] Git 提交规范（feat(ui): 条件单主界面）
- [ ] Codex 验收通过

---

## 🔗 相关任务

- TASK_CONDITIONAL_IMPORT_001: 导入功能
- TASK_CONDITIONAL_TRIGGER_001: 触发条件配置器
- TASK_CONDITIONAL_ACTION_001: 执行动作配置
