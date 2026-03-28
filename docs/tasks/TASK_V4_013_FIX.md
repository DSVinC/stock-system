# TASK_V4_013_FIX - 修复选股界面行业数据导流逻辑

**创建时间**: 2026-03-25  
**优先级**: P0 (阻塞性问题)  
**阶段**: 阶段 1 - 移除选股一键回测  
**状态**: pending

---

## 📋 任务描述

修复 TASK_V4_013 移除一键回测按钮时引入的功能回归问题：
- select.html 变成纯展示页面
- 未将推荐的行业数据（Top 3）写入 `localStorage.selectedDirections`
- 导致无法导流到 analysis.html 或 monitor-pool

---

## 🎯 验收标准

- [ ] select.html 在加载选股结果后，将 Top 3 行业数据写入 `localStorage.selectedDirections`
- [ ] 数据格式与 analysis.html 期望的格式一致
- [ ] 验证从 select.html → analysis.html 的导流正常
- [ ] 验证从 select.html → monitor-pool.html 的流程正常
- [ ] 一键回测按钮仍然保持移除状态

---

## 📐 技术方案

**修改文件**:
- `stock-system/select.html` - 在 `renderTop3Industries` 函数中添加 localStorage 写入逻辑

**关键代码**:
```javascript
// 在渲染 Top 3 行业后，保存选中方向到 localStorage
localStorage.setItem('selectedDirections', JSON.stringify(top3Industries));
```

---

## 📁 交付物

- 修复后的 select.html
- 验收报告

---

## 🔗 依赖关系

- 依赖 TASK_V4_013（已完成按钮移除）

---

## 📝 备注

验收发现的问题：移除一键回测功能时误删了行业数据导流逻辑。
