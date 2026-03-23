# TASK_UI_IMPROVEMENTS - 交接文档

**任务 ID**: TASK_UI_IMPROVEMENTS_001  
**创建时间**: 2026-03-23 00:17  
**类型**: P1 UI 改进功能  

---

## 📋 任务概述

优化股票系统 UI 交互体验，包括导航栏排序、条件单导入流程、决策建议统一。

---

## 🎯 子任务清单

### TASK_UI_001 - 导航栏全局排序
**文件**: index.html, select.html, analyze.html, analysis.html, portfolio.html, conditional-order.html, backtest.html  
**修改**: 所有页面的导航栏顺序统一为：
选股分析 → 个股分析 → 监控池 → 条件单 → 回测系统 → 账户管理

### TASK_UI_002 - 条件单导入分析报告流程优化
**文件**: conditional-order.html, api/analysis.js  
**功能**:
- 监控池选股（单选/多选）
- 选择分析报告
- 选择投资风格（激进/稳健/保守）
- 自动映射生成条件单

### TASK_UI_003 - 个股分析决策建议统一
**文件**: analysis.html, api/analysis.js  
**功能**:
- 卡片展示与报告一致
- 报告每日首次自动生成
- 统一决策建议格式和推荐评分

---

## 📊 开发流程

1. **Claude Code 开发**: 并行创建/修改所有文件
2. **PR 评论 @codex**: 提交验收评论
3. **3 分钟检查**: 检查 PR 结果
4. **修复**: 根据 Codex 评论修复
5. **Gemini 验收**: 提交 Gemini CLI 验收
6. **浏览器验收**: 灵爪用浏览器功能验收

---

## 🔗 相关文档

- [任务文档](../tasks/TASK_UI_IMPROVEMENTS_001.md)
- [项目操作规范](../../skills/项目操作规范/SKILL.md)

---

**最后更新**: 2026-03-23 00:17
