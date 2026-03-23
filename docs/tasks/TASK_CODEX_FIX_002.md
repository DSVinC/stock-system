# TASK_CODEX_FIX_002 - 修复 portfolio.js 清仓丢弃损益问题

**创建时间**: 2026-03-23 11:30  
**优先级**: P1  
**负责人**: Claude Code  
**验收员**: Codex  
**状态**: pending  
**来源**: PR #4 Codex 第二次审查

---

## 📋 问题描述

`POST /api/portfolio/account/:id/clear-positions` 清仓时丢弃已实现损益。

**Codex 评论**:
> For any account whose holdings have moved since entry, this API now inserts sell trades at current prices and then resets `current_cash`/`total_value` back to `initial_cash`. That discards the realized gain or loss from the liquidation and leaves the account balance inconsistent with the trades you just wrote.

---

## 🎯 修复内容

### 问题分析
清仓 API 在卖出所有持仓后，将账户余额重置为初始资金，导致已实现损益丢失。

### 修复方案
1. 计算清仓后的实际现金（初始现金 + 卖出所得）
2. 更新 `current_cash` 为实际金额
3. 计算并保留已实现损益

---

## ✅ 验收标准

- [ ] 读取 `api/portfolio.js` 清仓逻辑
- [ ] 修复清仓后余额计算
- [ ] 测试清仓功能：有盈利的持仓清仓后余额正确
- [ ] 测试清仓功能：有亏损的持仓清仓后余额正确

---

## 📁 修改文件

- `api/portfolio.js`

---

*创建时间：2026-03-23 11:30*
