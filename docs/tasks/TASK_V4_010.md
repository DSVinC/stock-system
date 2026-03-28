# TASK_V4_010: 核心仓回测逻辑实现

**阶段**: V4 优化阶段 - 阶段 2  
**优先级**: 🔴 P0 重要紧急  
**状态**: in_progress  
**创建日期**: 2026-03-25  
**预计完成**: 2026-03-25

---

## 📋 任务描述

实现核心仓回测逻辑 `backtest-core.js`，支持趋势策略回测（双周调仓），包含 7 因子评分选股、行业权重配置、核心仓仓位管理等功能。

---

## 🎯 验收标准

- [ ] 创建 `api/backtest-core.js` 模块（≥15KB）
- [ ] 支持双周调仓策略（每 10 个交易日调仓一次）
- [ ] 支持 7 因子评分选股
- [ ] 支持四维度行业权重配置
- [ ] 支持核心仓仓位管理（70-80% 总资金）
- [ ] 输出 7 个核心指标（总收益率、年化收益率、夏普比率、最大回撤、胜率、盈亏比、交易次数）
- [ ] 生成回测报告 JSON
- [ ] 单元测试通过率 100%

---

## 📁 交付物

### 新增文件
1. `api/backtest-core.js` - 核心仓回测引擎
2. `test/backtest-core.test.js` - 单元测试

### 修改文件
1. `api/server.js` - 挂载核心仓回测 API 路由

---

## 🔧 技术实现

### 核心仓策略逻辑

```javascript
// 双周调仓
const REBALANCE_INTERVAL = 10; // 交易日

// 选股逻辑
1. 四维度行业评分 → Top3 行业
2. 行业内 7 因子评分 → Top5 个股
3. 等权重配置（每只股票 5-7%）

// 交易规则
- 买入：调仓日买入新选股
- 卖出：调仓日卖出不在新选股列表的股票
- 持仓：持有至下次调仓
```

### 输入参数

```json
{
  "start_date": "2025-01-01",
  "end_date": "2026-03-25",
  "initial_capital": 1000000,
  "core_ratio": 0.75,
  "industry_weights": {
    "policy": 0.25,
    "commercialization": 0.30,
    "sentiment": 0.25,
    "capital": 0.20
  },
  "seven_factor_min_score": 0.75,
  "rebalance_interval": 10
}
```

### 输出报告

```json
{
  "strategy_type": "core_trend",
  "total_return": 0.25,
  "annualized_return": 0.18,
  "sharpe_ratio": 1.5,
  "max_drawdown": -0.12,
  "win_rate": 0.65,
  "profit_loss_ratio": 2.1,
  "trade_count": 24,
  "final_capital": 1250000,
  "positions": [...],
  "trades": [...]
}
```

---

## 🧪 测试用例

1. 双周调仓逻辑测试
2. 7 因子评分选股测试
3. 行业权重应用测试
4. 仓位管理测试
5. 指标计算测试
6. 边界情况测试（休市日、停牌等）

---

## 🔗 依赖任务

- TASK_V4_003: 策略配置数据库表创建 ✅
- TASK_V4_004: 策略配置 API 模块创建 ✅
- TASK_V4_005: 策略配置页面创建 ✅

---

## 📝 开发记录

### 2026-03-25 15:55
- 任务创建
- 开始开发

---

**验收人**: Gemini CLI  
**验收时间**: 待定  
**验收结论**: 待验收
