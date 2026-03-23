# TASK_CODEX_FIX_004 - 修复 backtest.js annualizedReturn 计算缺失

**创建时间**: 2026-03-23 11:30  
**优先级**: P2  
**负责人**: Claude Code  
**验收员**: Codex  
**状态**: pending  
**来源**: PR #4 Codex 第二次审查

---

## 📋 问题描述

`api/backtest.js` 中 `annualizedReturn` 未在报告中计算。

**Codex 评论**:
> Both report templates render `metrics.annualizedReturn`, but `calculateMetrics()` never assigns that field and `generateReport()` never adds it. Every generated report therefore prints `NaN%` for annualized return.

---

## 🎯 修复内容

### 问题分析
回测报告模板显示 `metrics.annualizedReturn`，但 `calculateMetrics()` 函数从未计算该字段。

### 修复方案
1. 在 `calculateMetrics()` 函数中添加年化收益率计算
2. 年化收益率公式：`(1 + totalReturn)^(365/days) - 1`
3. 确保 `generateReport()` 包含该字段

---

## ✅ 验收标准

- [ ] 读取 `api/backtest.js` 定位 `calculateMetrics()` 函数
- [ ] 添加 `annualizedReturn` 计算逻辑
- [ ] 运行 `node --check api/backtest.js` 语法检查通过
- [ ] 测试回测报告：年化收益率显示正确数值（非 NaN）

---

## 📁 修改文件

- `api/backtest.js`

---

*创建时间：2026-03-23 11:30*
