# TASK_V4_023 - 回测策略导出/选股策略导入功能

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 4 - 回测界面配置  
**状态**: skipped
**跳过时间**: 2026-03-25 20:05
**跳过原因**: 功能与 TASK_V4_016 (API 层) + TASK_V4_018 (选股界面 UI) 重复，核心能力已覆盖

---

## 📋 任务描述

在回测界面添加策略导出和选股策略导入功能，实现双向流转。

---

## 🎯 验收标准

- [ ] 添加"📤 导出选股策略"按钮
- [ ] 添加"📥 导入选股策略"按钮
- [ ] 导出功能：保存当前策略并标记为 public
- [ ] 导入功能：显示选股保存的公开策略列表
- [ ] 导入后自动填充策略参数
- [ ] 功能测试通过

---

## 📐 技术方案

**UI 组件**:
```html
<button id="exportForSelection">📤 导出选股策略</button>
<button id="importFromSelection">📥 导入选股策略</button>
```

**JavaScript**:
```javascript
// 导出选股策略
document.getElementById('exportForSelection').onclick = () => {
  const params = collectStrategyParams();
  fetch('/api/strategy-config/export', {
    method: 'POST',
    body: JSON.stringify({
      name: prompt('策略名称'),
      config_type: 'both',
      params: params
    })
  });
};

// 导入选股策略
document.getElementById('importFromSelection').onclick = () => {
  fetch('/api/strategy-config/public?type=selection')
    .then(res => res.json())
    .then(data => showImportDialog(data));
};
```

---

## 📁 交付物

- 修改后的 `backtest.html`
- 修改后的 `backtest.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_016（策略导入/导出 API）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
