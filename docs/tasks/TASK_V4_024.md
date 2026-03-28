# TASK_V4_024 - 回测引擎支持核心仓 + 卫星仓联合回测

**创建时间**: 2026-03-25
**优先级**: P0
**阶段**: 阶段 5 - 回测引擎适配
**状态**: ✅ 已完成 (2026-03-25)
**验收状态**: ✅ 已通过

---

## 📋 任务描述

改造回测引擎，支持核心仓和卫星仓的联合回测。

---

## 🎯 验收标准

- [x] 创建 `backtest-core.js`（核心仓回测逻辑）
- [x] 创建 `backtest-satellite.js`（卫星仓网格交易逻辑）
- [x] 修改 `backtest.js` 支持联合回测
- [x] 支持核心仓/卫星仓占比配置
- [x] 支持分别计算收益和合并计算收益
- [x] 回测报告包含核心仓、卫星仓、合并收益

---

## 📐 技术方案

**回测引擎结构**:
```javascript
// backtest.js - 主引擎
class JointBacktestEngine {
  constructor(config) {
    this.coreWeight = config.coreWeight;      // 核心仓占比
    this.satelliteWeight = config.satelliteWeight; // 卫星仓占比
    this.coreEngine = new CoreBacktestEngine(config);
    this.satelliteEngine = new SatelliteBacktestEngine(config);
  }

  async run(data) {
    const coreResult = await this.coreEngine.run(data);
    const satelliteResult = await this.satelliteEngine.run(data);
    return this.mergeResults(coreResult, satelliteResult);
  }
}
```

**核心仓策略**:
- 趋势跟踪策略
- 使用因子快照数据进行选股
- 日线级别调仓
- 长期持有

**卫星仓策略**:
- 网格交易策略
- 使用分钟线数据进行高频交易
- 震荡市获取超额收益
- 短线操作

---

## 📁 交付物

- ✅ `api/backtest-core.js` - 核心仓回测引擎
- ✅ `api/backtest-satellite.js` - 卫星仓网格交易引擎
- ✅ 修改后的 `api/backtest.js` - 联合回测API

---

## 🔗 依赖关系

- 依赖：TASK_V4_019（投资组合配置）✅
- 依赖：TASK_V4_020（网格交易参数配置）✅

---

## 📝 实现

### 新增API接口

1. **POST /api/backtest/joint/run** - 运行联合回测
   - 参数：startDate, endDate, initialCapital, coreWeight, satelliteWeight, satelliteStock, gridConfig
   - 返回：联合回测结果（核心仓、卫星仓、合并收益）

2. **GET /api/backtest/joint/config** - 获取联合回测默认配置

### 关键类

- `JointBacktestEngine` - 联合回测引擎
- `CoreBacktestEngine` - 核心仓回测引擎
- `SatelliteBacktestEngine` - 卫星仓回测引擎

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
