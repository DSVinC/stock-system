# TASK_V4_026 - 回测引擎支持使用选股时点的快照数据

**创建时间**: 2026-03-25
**优先级**: P0
**阶段**: 阶段 5 - 回测引擎适配
**状态**: completed

---

## 📋 任务描述

改造回测引擎，支持使用选股时点的快照数据，防止未来函数。

---

## 🎯 验收标准

- [x] 回测引擎接收选股时点参数（selectionDate）
- [x] 使用 selectionDate 的 stock_factor_snapshot 数据选股
- [x] 回测区间使用 selectionDate 之后的历史数据
- [x] 回测报告记录选股时点和回测区间
- [x] 验证无未来函数问题

---

## 📐 技术方案

**数据加载逻辑**:
```javascript
class BacktestEngine {
  async loadData(selectionDate, backtestStart, backtestEnd) {
    // 选股使用 selectionDate 的快照数据
    const selectionData = await fetch(`/api/factor-snapshot?date=${selectionDate}`);

    // 回测使用 backtestStart ~ backtestEnd 的历史数据
    const backtestData = await fetch(`/api/factor-snapshot?start=${backtestStart}&end=${backtestEnd}`);

    return { selectionData, backtestData };
  }
}
```

---

## 📁 交付物

- [x] 修改后的 `backtest.js`
- [x] 修改后的 `backtest-core.js`
- [x] 修改后的 `backtest-engine.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_022（回测界面选股按钮）
- 依赖：现有 stock_factor_snapshot 表

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`

**关键设计**：防止未来函数的核心实现

---

## ✅ 实现摘要

### 修改的文件

1. **api/backtest-engine.js** - 因子快照回测引擎
   - 添加 `selectionDate` 配置参数
   - 新增 `getSelectionSnapshot()` 方法获取选股时点快照
   - 新增 `validateNoFutureFunction()` 方法验证未来函数防护
   - 新增 `getNextTradingDate()` 方法获取下一个交易日
   - 修改 `run()` 方法支持 selectionDate 参数
   - 修改 `generateResults()` 方法记录选股时点信息

2. **api/backtest-core.js** - 核心仓回测引擎
   - 添加 `selectionDate` 配置参数
   - 新增选股时点相关方法
   - 修改 `run()` 方法支持 selectionDate 参数
   - 修改 `generateResults()` 方法记录选股时点信息

3. **api/backtest.js** - API 入口
   - `runFactorSnapshotBacktest()` 支持 selectionDate 参数
   - `runJointBacktest()` 支持 selectionDate 参数
   - `JointBacktestEngine.run()` 支持 selectionDate 参数
   - `mergeResults()` 记录选股时点信息

### 核心算法

**选股时点数据处理流程**:
1. 接收 `selectionDate` 参数
2. 获取 `selectionDate` 的快照数据进行选股
3. 计算回测开始日期（selectionDate 的下一个交易日）
4. 回测过程中使用选股结果，不重新选股
5. 回测报告记录选股时点和回测区间

**未来函数防护**:
- 选股时只使用 selectionDate 及之前的数据
- 回测从 selectionDate 的下一个交易日开始
- 记录 `futureFunctionProtection` 标志
