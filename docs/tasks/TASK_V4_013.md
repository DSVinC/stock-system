# TASK_V4_013 - 移除选股界面一键回测按钮

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 1 - 移除选股一键回测  
**状态**: ✅ 已完成 (2026-03-25 修复)
**验收状态**: ✅ 已通过 (修复后)
**修复记录**: 添加 localStorage.setItem('selectedDirections') 导流逻辑

---

## 📋 任务描述

移除选股界面（select.html）中的"一键回测"按钮和相关代码。

---

## 🎯 验收标准

- [ ] 移除 select.html 中的"一键回测"按钮 HTML
- [ ] 移除相关的 JavaScript 函数（如 runBacktest 等）
- [ ] 移除相关的 CSS 样式
- [ ] 验证选股界面正常加载
- [ ] 验证选股功能正常（选行业→选个股→监控池）

---

## 📐 技术方案

**修改文件**:
- `stock-system/select.html` - 移除按钮和相关代码
- `stock-system/select.js` - 移除相关函数（如有）

---

## 📁 交付物

- 修改后的 select.html
- 修改后的 select.js（如有）

---

## 🔗 依赖关系

- 无依赖

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
