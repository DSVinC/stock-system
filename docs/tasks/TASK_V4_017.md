# TASK_V4_017 - 选股界面策略模板选择器

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 3 - 选股界面策略配置  
**状态**: ✅ 已完成 (2026-03-25)
**验收状态**: ✅ 已通过 (CSS 语法错误已修复)

---

## 📋 任务描述

在选股界面添加策略模板选择器，用户可选择不同的策略模板。

---

## 🎯 验收标准

- [ ] 在 select.html 添加策略模板选择器 UI
- [ ] 下拉框显示所有可用模板（从 API 加载）
- [ ] 选择模板后自动填充默认参数
- [ ] 支持手动调整参数
- [ ] 界面美观，符合现有风格

---

## 📐 技术方案

**UI 组件**:
```html
<div class="strategy-template-selector">
  <label>策略模板：</label>
  <select id="strategyTemplate">
    <option value="CORE_FACTOR_V1">四维度 + 七因子策略</option>
    <option value="MONEYFLOW_V1">资金流策略</option>
    <option value="ROTATION_V1">行业轮动策略</option>
  </select>
  <button id="loadTemplate">加载模板</button>
</div>
```

**JavaScript**:
```javascript
// 加载模板列表
fetch('/api/strategy-template/list')
  .then(res => res.json())
  .then(data => populateSelect(data));

// 加载模板参数
fetch(`/api/strategy-template/${templateId}`)
  .then(res => res.json())
  .then(data => fillParams(data.params));
```

---

## 📁 交付物

- 修改后的 `select.html`
- 修改后的 `select.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_014（策略模板加载 API）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
