# TASK_V4_018 - 选股策略保存/导入功能

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 3 - 选股界面策略配置  
**状态**: pending

---

## 📋 任务描述

在选股界面添加策略保存和导入功能，支持保存当前配置和导入回测策略。

---

## 🎯 验收标准

- [ ] 添加"保存当前策略"按钮
- [ ] 添加"导入回测策略"按钮
- [ ] 保存策略时弹出命名对话框
- [ ] 导入策略时显示公开策略列表供选择
- [ ] 保存/导入后更新界面参数
- [ ] 功能测试通过

---

## 📐 技术方案

**UI 组件**:
```html
<button id="saveStrategy">💾 保存当前策略</button>
<button id="importStrategy">📥 导入回测策略</button>
```

**JavaScript**:
```javascript
// 保存策略
document.getElementById('saveStrategy').onclick = () => {
  const params = collectParams();
  fetch('/api/strategy-config/save', {
    method: 'POST',
    body: JSON.stringify({
      name: prompt('策略名称'),
      config_type: 'selection',
      params: params
    })
  });
};

// 导入策略
document.getElementById('importStrategy').onclick = () => {
  fetch('/api/strategy-config/public')
    .then(res => res.json())
    .then(data => showImportDialog(data));
};
```

---

## 📁 交付物

- 修改后的 `select.html`
- 修改后的 `select.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_016（策略导入/导出 API）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
