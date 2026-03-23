# TASK_CODEX_FIX_005 - 修复 backtest.js 报告模板字段名错误

**创建时间**: 2026-03-23 11:30  
**优先级**: P2  
**负责人**: Claude Code  
**验收员**: Codex  
**状态**: pending  
**来源**: PR #4 Codex 第二次审查

---

## 📋 问题描述

`api/backtest.js` 报告模板中使用 `trade.qty` 而非 `quantity`。

**Codex 评论**:
> The backtest engine records trades with a `quantity` field in `buy()`/`sell()`, so this template now multiplies `undefined * trade.price` for every row. Generated reports therefore show `NaN` in the amount column.

---

## 🎯 修复内容

### 问题分析
回测引擎记录交易时使用 `quantity` 字段，但报告模板读取 `trade.qty`，导致金额为 NaN。

### 修复方案
1. 查找 HTML 模板中所有 `trade.qty` 引用
2. 替换为 `trade.quantity`
3. 查找 Markdown 模板中所有 `trade.qty` 引用
4. 替换为 `trade.quantity`

---

## ✅ 验收标准

- [ ] 读取 `api/backtest.js` 定位报告模板
- [ ] 替换 HTML 模板中 `trade.qty` → `trade.quantity`
- [ ] 替换 Markdown 模板中 `trade.qty` → `trade.quantity`
- [ ] 运行 `node --check api/backtest.js` 语法检查通过
- [ ] 测试回测报告：交易金额显示正确数值（非 NaN）

---

## 📁 修改文件

- `api/backtest.js`

---

*创建时间：2026-03-23 11:30*
