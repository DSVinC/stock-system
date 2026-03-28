# TASK_V4_022 - 回测界面选股按钮和配置面板

**创建时间**: 2026-03-25  
**优先级**: P0  
**阶段**: 阶段 4 - 回测界面配置  
**状态**: ✅ 已完成 (2026-03-25)
**验收状态**: ✅ 已通过

---

## 📋 任务描述

在回测界面添加"选股"按钮和选股配置面板，使用时点数据进行选股。

---

## 🎯 验收标准

- [ ] 在回测配置表单中添加"🎯 选股"按钮
- [ ] 点击按钮弹出选股配置面板
- [ ] 选股配置面板包含：时间段选择、策略参数配置
- [ ] 选股使用时间段起点的数据（防止未来函数）
- [ ] 选股结果保存到临时变量
- [ ] 选股结果可在回测中使用

---

## 📐 技术方案

**UI 组件**:
```html
<div class="selection-config">
  <label>回测时间段：[2020-01-01] ~ [2026-03-24]</label>
  <button id="runSelection">🎯 选股</button>
  <div id="selectionResult" style="display:none">
    <p>选股结果：Top3 行业 × Top5 个股 = 15 只股票</p>
    <p>选股时点：2020-01-01</p>
  </div>
</div>
```

**JavaScript**:
```javascript
document.getElementById('runSelection').onclick = () => {
  const startDate = document.getElementById('startDate').value;
  const params = collectStrategyParams();
  
  fetch('/api/select', {
    method: 'POST',
    body: JSON.stringify({
      date: startDate,  // 使用起点数据选股
      params: params
    })
  })
  .then(res => res.json())
  .then(data => showSelectionResult(data));
};
```

---

## 📁 交付物

- 修改后的 `backtest.html`
- 修改后的 `backtest.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_021（策略模板选择器）
- 依赖：现有 `/api/select` 接口

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
