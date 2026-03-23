# TASK_BACKTEST_004 - 策略参数扫描回测

**创建时间**: 2026-03-23 09:15  
**优先级**: P1  
**负责人**: Claude Code  
**验收员**: Gemini CLI  
**状态**: in_progress  

---

## 📋 任务描述

实现参数扫描功能，支持网格搜索最优策略参数。

---

## 🎯 验收标准

- [ ] 可对双均线策略进行参数扫描（fast=5/10/20, slow=20/30/60）
- [ ] 输出最优参数组合
- [ ] 输出不同参数下的收益/风险对比

---

## 📝 实现要求

### 1. 参数网格配置

支持配置参数范围和步长

### 2. 批量回测

对每组参数执行回测

### 3. 结果对比

输出收益/风险对比表格

### 4. 最优参数

自动选出最优参数组合

---

## 📁 交付物

1. `api/backtest.js` - 参数扫描接口
2. `docs/handover/TASK_BACKTEST_004_HANDOVER.md`
3. `docs/acceptance/TASK_BACKTEST_004_ACCEPTANCE.md`

---

## 🔗 相关文件

- 父任务：`docs/tasks/TASK_BACKTEST_SYSTEM_001.md`
- 状态文件：`docs/runtime/TASK_BACKTEST_004_STATUS.md`
