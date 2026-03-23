# TASK_99 - 条件单设计优化：因子权重条件面板

**任务 ID**: TASK_99  
**创建时间**: 2026-03-23  
**优先级**: 🟡重要  
**状态**: in_progress  
**项目经理**: 灵爪  
**程序员**: Claude Code  
**验收员**: Gemini CLI / Codex

---

## 📋 任务概述

优化条件单创建界面，新增因子权重条件面板，让用户可以基于多因子评分设置触发条件。

---

## 🎯 目标

1. **因子选择器**：用户可选择关注的因子（PE、PB、ROE、营收增速等）
2. **权重配置**：为每个因子设置权重
3. **综合评分阈值**：设置综合评分触发条件
4. **预览与建议**：实时预览因子评分并给出建议

---

## 📁 交付物

- `public/conditional-order.html` - 条件单界面升级
- `public/js/factor-panel.js` - 因子面板逻辑（新建）
- `docs/runtime/TASK_99_STATUS.md` - 运行状态
- `docs/handover/TASK_99_HANDOVER.md` - 交接文档
- `docs/acceptance/TASK_99_ACCEPTANCE.md` - 验收报告

---

## 🔗 依赖关系

- **前置任务**: TASK_103/TASK_104 (v2 结构化改造) ✅ 进行中
- **相关任务**: TASK_105 (方向股列表界面适配 v2)

---

## ⏱️ 预计工时

- 开发：2-3 小时
- 测试：30 分钟
- 验收：30 分钟
