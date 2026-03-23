# TASK_105 - 方向股列表界面适配 v2

**任务 ID**: TASK_105  
**创建时间**: 2026-03-23  
**优先级**: 🔴重要紧急  
**状态**: in_progress  
**项目经理**: 灵爪  
**程序员**: Claude Code  
**验收员**: Gemini CLI / Codex

---

## 📋 任务概述

修改方向股列表界面（select.html），使其能够显示 v2 结构化策略数据，包括决策建议、推荐分数、触发条件等。

---

## 🎯 目标

1. **卡片升级**：方向股卡片显示决策建议（买入/卖出/持有）
2. **推荐分数**：显示综合推荐分数（0-10 分）
3. **策略摘要**：显示 aggressive/balanced/conservative 三种策略的核心建议
4. **快速导入**：添加"导入到条件单"按钮

---

## 📁 交付物

- `public/select.html` - 修改后的方向股列表界面
- `public/css/select.css` - 新增卡片样式（如需要）
- `docs/runtime/TASK_105_STATUS.md` - 运行状态
- `docs/handover/TASK_105_HANDOVER.md` - 交接文档
- `docs/acceptance/TASK_105_ACCEPTANCE.md` - 验收报告

---

## 🔗 依赖关系

- **前置任务**: 
  - TASK_103 (stock_analyzer.py 结构化改造) ✅ 已完成
  - TASK_104 (analysis.js API 适配 v2) ✅ 已完成
- **后续任务**: TASK_100 (回测界面核心功能)

---

## ⏱️ 预计工时

- 开发：1-2 小时
- 测试：30 分钟
- 验收：30 分钟
