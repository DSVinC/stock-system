# TASK_V4_020 - 回测界面网格交易参数配置

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 4 - 回测界面配置  
**状态**: ✅ 已完成 (2026-03-25)

---

## 📋 任务描述

在回测界面添加网格交易参数配置（用于卫星仓）。

---

## 🎯 验收标准

- [ ] 添加"网格交易参数配置"折叠面板
- [ ] 网格间距输入框（默认 5%）
- [ ] 最大仓位输入框（默认 10%）
- [ ] 触发阈值输入框（默认 3%）
- [ ] 参数验证（合理范围）
- [ ] 配置保存到回测请求参数中

---

## 📐 技术方案

**UI 组件**:
```html
<details class="grid-params">
  <summary>🔲 网格交易参数配置</summary>
  <div class="params-form">
    <label>网格间距：<input type="number" id="gridSize" value="5" min="1" max="20">%</label>
    <label>最大仓位：<input type="number" id="maxPosition" value="10" min="1" max="100">%</label>
    <label>触发阈值：<input type="number" id="triggerThreshold" value="3" min="1" max="10">%</label>
  </div>
</details>
```

---

## 📁 交付物

- 修改后的 `backtest.html`
- 修改后的 `backtest.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_019（投资组合配置）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
