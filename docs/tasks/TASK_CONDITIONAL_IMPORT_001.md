# TASK_CONDITIONAL_IMPORT_001 - 条件单导入界面开发

**优先级**: P1  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 12:35  
**预计完成**: 2026-03-22 18:00  
**依赖**: TASK_ANALYZE_STRUCT_002, TASK_ANALYZE_STRUCT_003, TASK_ANALYZE_STRUCT_004 完成  

---

## 📋 任务描述

在 `conditional-order.html` 中实现导入功能，支持从个股分析页面跳转后自动预填条件单表单。

**背景**: TASK_ANALYZE_STRUCT_004 已完成"导入条件单"按钮，点击后跳转到 `conditional-order.html?import=...`，但目标页面没有处理导入参数的逻辑。

---

## 🎯 验收标准

### 1. 参数解析
- [ ] 页面加载时检查 URL 是否有 `?import=` 参数
- [ ] 解析 `import` 参数中的策略数据（JSON 格式）
- [ ] 提取 `stock_code`、`stock_name`、`strategy.actions`、`stop_loss` 等数据

### 2. 表单预填
- [ ] 自动打开"新建条件单"弹窗
- [ ] 预填股票名称、代码
- [ ] 预填动作类型（buy/sell）
- [ ] 预填触发条件（价格、指标等）
- [ ] 预填仓位百分比
- [ ] 预填止损价

### 3. 用户体验
- [ ] 导入成功提示
- [ ] 导入失败时显示错误信息
- [ ] 用户可以修改预填内容
- [ ] 支持取消导入，手动创建

### 4. 数据验证
- [ ] 验证导入数据格式正确
- [ ] 验证股票存在
- [ ] 验证触发条件合法

---

## 🔧 实施步骤

### Step 1: 添加 URL 参数解析

**文件**: `conditional-order.html` (JavaScript 部分)

```javascript
// 页面加载时检查导入参数
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const importData = params.get('import');
  
  if (importData) {
    try {
      const strategy = JSON.parse(decodeURIComponent(importData));
      handleImportStrategy(strategy);
    } catch (e) {
      showToast('导入数据格式错误', 'error');
    }
  }
});
```

### Step 2: 实现导入处理函数

```javascript
async function handleImportStrategy(strategy) {
  const { ts_code, risk_level, actions, summary_text } = strategy;
  
  // 获取股票详情
  const stockInfo = await fetchStockInfo(ts_code);
  
  // 打开新建弹窗
  showCreateModal();
  
  // 预填表单
  const form = document.getElementById('create-order-form');
  form.stock_name.value = stockInfo.name;
  form.ts_code.value = ts_code;
  form.action.value = actions[0]?.action_type || 'buy';
  form.position_percent.value = actions[0]?.position_percent || 10;
  form.stop_loss.value = actions[0]?.stop_loss || '';
  
  // 预填触发条件
  const conditions = actions[0]?.trigger_conditions || [];
  renderTriggerConditions(conditions);
  
  showToast('已导入策略，请确认后提交', 'success');
}
```

### Step 3: 添加触发条件渲染

```javascript
function renderTriggerConditions(conditions) {
  const container = document.getElementById('trigger-conditions');
  container.innerHTML = '';
  
  conditions.forEach((cond, index) => {
    const row = document.createElement('div');
    row.className = 'condition-row';
    row.innerHTML = `
      <select name="condition_type_${index}">
        <option value="price" ${cond.type === 'price' ? 'selected' : ''}>价格</option>
        <option value="indicator" ${cond.type === 'indicator' ? 'selected' : ''}>指标</option>
      </select>
      <input type="text" name="condition_field_${index}" value="${cond.field || ''}" placeholder="字段">
      <select name="condition_op_${index}">
        <option value=">=" ${cond.operator === '>=' ? 'selected' : ''}>>=</option>
        <option value="<=" ${cond.operator === '<=' ? 'selected' : ''}><=</option>
        <option value=">" ${cond.operator === '>' ? 'selected' : ''}>></option>
        <option value="<" ${cond.operator === '<' ? 'selected' : ''}><</option>
      </select>
      <input type="number" name="condition_value_${index}" value="${cond.value || ''}" step="0.01">
    `;
    container.appendChild(row);
  });
}
```

---

## ✅ 验收检查清单

- [ ] URL 参数解析正确
- [ ] 表单自动预填
- [ ] 触发条件正确渲染
- [ ] 用户可修改预填内容
- [ ] 导入成功/失败提示
- [ ] Git 提交规范（feat: 条件单导入功能）
- [ ] Codex 验收通过

---

## 🔗 相关文档

- 上游任务：`TASK_ANALYZE_STRUCT_004`
- 策略数据格式：`docs/schema/analyzer-output-v2.md`

---

_🐾 灵爪监督于 2026-03-22 12:35_
