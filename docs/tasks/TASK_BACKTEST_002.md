# TASK_BACKTEST_002 - 回测引擎核心功能

**创建时间**: 2026-03-23 09:15  
**优先级**: P0  
**负责人**: Claude Code  
**验收员**: Gemini CLI  
**状态**: in_progress  

---

## 📋 任务描述

完善 `api/backtest.js`，实现回测引擎核心功能：历史数据加载、策略信号回放、交易记录生成、收益统计。

---

## 🎯 验收标准

- [ ] POST `/api/backtest/run` 接口可执行回测
- [ ] 回测结果包含完整的收益统计（收益率、夏普比率、最大回撤）
- [ ] 支持自定义回测时间范围

---

## 📝 实现要求

### 1. 历史数据加载

从 `stock_daily` 表加载历史行情数据

### 2. 策略信号回放

根据策略配置生成买卖信号

### 3. 交易记录生成

记录每笔交易的买入/卖出信息到 `backtest_trade` 表

### 4. 收益统计

计算：
- 累计收益率
- 年化收益率
- 夏普比率
- 最大回撤
- 胜率

---

## 📁 交付物

1. `api/backtest.js` - 完整回测引擎
2. `docs/handover/TASK_BACKTEST_002_HANDOVER.md`
3. `docs/acceptance/TASK_BACKTEST_002_ACCEPTANCE.md`

---

## 🔗 相关文件

- 父任务：`docs/tasks/TASK_BACKTEST_SYSTEM_001.md`
- 状态文件：`docs/runtime/TASK_BACKTEST_002_STATUS.md`
- 源文件：`api/backtest.js`
