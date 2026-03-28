# TASK_V4_019 - 回测界面投资组合配置

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 4 - 回测界面配置  
**状态**: ✅ 已完成 (2026-03-25)
**验收状态**: ✅ 已通过

---

## 📋 任务描述

在回测界面添加投资组合配置：核心仓占比、卫星仓占比。

---

## 🎯 验收标准

- [ ] 在 backtest.html 添加投资组合配置区域
- [ ] 核心仓占比滑块（0-100%，默认 70%）
- [ ] 卫星仓占比滑块（0-100%，默认 30%）
- [ ] 两个占比之和必须为 100%（自动调整）
- [ ] 实时显示占比数值
- [ ] 配置保存到回测请求参数中

---

## 📐 技术方案

**UI 组件**:
```html
<div class="portfolio-config">
  <h3>📊 投资组合配置</h3>
  <div class="slider-group">
    <label>核心仓占比：<span id="corePercent">70%</span></label>
    <input type="range" id="coreSlider" min="0" max="100" value="70">
  </div>
  <div class="slider-group">
    <label>卫星仓占比：<span id="satellitePercent">30%</span></label>
    <input type="range" id="satelliteSlider" min="0" max="100" value="30">
  </div>
</div>
```

**JavaScript**:
```javascript
// 联动滑块
coreSlider.oninput = () => {
  satelliteSlider.value = 100 - coreSlider.value;
  updateDisplay();
};
```

---

## 📁 交付物

- 修改后的 `backtest.html`（或回测配置文件）
- 修改后的 `backtest.js`

---

## 🔗 依赖关系

- 无依赖

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
