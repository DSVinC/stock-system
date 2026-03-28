# TASK_V4_FIX_006 - 修复核心仓/卫星仓比例调整不生效问题

**创建时间**: 2026-03-25 20:40  
**优先级**: P0 (阻塞发布)  
**阶段**: V4 修复  
**状态**: in_progress  
**根因分析完成时间**: 2026-03-25 20:50

---

## 📋 问题描述

**现象**: 不管怎么调整核心仓和卫星仓的比例，回测结果都一样  

---

## 🔍 根因分析

### 问题 1: 前端调用错误的 API 端点

**前端** (`backtest.html` 第 2410 行):
```javascript
const response = await fetch('/api/backtest/run', { ... });
```

**后端**:
- `/api/backtest/run` → `runBacktest()` → 使用 `BacktestEngine`（旧单策略引擎）
- `/api/backtest/joint/run` → `runJointBacktest()` → 使用 `JointBacktestEngine`（新联合回测引擎）

**结论**: 前端调用的是旧 API，不支持核心仓/卫星仓配置

### 问题 2: 参数名不匹配

**前端传递**:
```javascript
portfolio: {
  coreRatio: portfolioConfig.core / 100,
  satelliteRatio: portfolioConfig.satellite / 100
}
```

**后端期望** (`runJointBacktest`):
```javascript
{
  coreWeight: 0.7,
  satelliteWeight: 0.3
}
```

---

## 🎯 修复方案

### 方案 A: 前端调用联合回测 API（推荐）

修改前端调用 `/api/backtest/joint/run`，并修正参数名：

```javascript
// backtest.html - runBacktest() 函数
const response = await fetch('/api/backtest/joint/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    startDate,
    endDate,
    initialCash,
    coreWeight: portfolioConfig.core / 100,      // 修改参数名
    satelliteWeight: portfolioConfig.satellite / 100,
    stocks: selectedStocks.map(s => s.code),
    strategy: strategyConfig,
    gridTrading: { ... }
  })
});
```

### 方案 B: 修改旧 API 支持投资组合参数

修改 `/api/backtest/run` 接收 `portfolio` 参数，内部调用联合回测引擎。

**不推荐**: 会混淆新旧逻辑，增加维护成本。

---

## 📁 需要修改的文件

- `backtest.html` - 修改 API 端点和参数名

---

## 📝 备注

- 需要同时检查批量回测是否也有同样问题
- 需要确保联合回测引擎正确使用权重参数计算合并收益
