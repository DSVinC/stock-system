# TASK_V4_021 - 回测界面策略模板选择器

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 4 - 回测界面配置  
**状态**: done
**完成时间**: 2026-03-25 19:50
**验收结果**: 通过 - 策略模板选择器已加载 3 个模板，默认模板自动选中

---

## 📋 任务描述

在回测界面添加策略模板选择器，与选股界面类似。

---

## 🎯 验收标准

- [ ] 在 backtest.html 添加策略模板选择器 UI
- [ ] 下拉框显示所有可用模板
- [ ] 选择模板后自动填充默认参数
- [ ] 支持手动调整行业权重和七因子权重
- [ ] 界面美观，符合现有风格

---

## 📐 技术方案

**UI 组件**:
```html
<div class="strategy-template-selector">
  <label>策略模板：</label>
  <select id="strategyTemplate"></select>
  <button id="loadTemplate">加载模板</button>
</div>

<div class="weights-config">
  <h4>行业权重</h4>
  <div class="weight-sliders">...</div>
  <h4>七因子权重</h4>
  <div class="weight-sliders">...</div>
</div>
```

---

## 📁 交付物

- 修改后的 `backtest.html`
- 修改后的 `backtest.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_014（策略模板加载 API）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
