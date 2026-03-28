# TASK_V3_104 - 7 指标计算模块

**版本**: V3.0  
**优先级**: P0  
**状态**: ✅ 已完成  
**创建日期**: 2026-03-24  
**预计工期**: 1 天  

---

## 📋 任务描述

实现回测报告的 7 个核心绩效指标计算模块。

---

## 🎯 目标

1. 实现 7 个绩效指标计算
2. 支持多种频率（日/周/月）
3. 与回测引擎集成

---

## 📐 技术规范

### 7 个核心指标

| 指标 | 公式 | 说明 |
|------|------|------|
| **总收益率** | (期末值 - 期初值) / 期初值 | 总体收益 |
| **年化收益率** | (1 + 总收益率)^(365/天数) - 1 | 年化收益 |
| **夏普比率** | (年化收益率 - 无风险利率) / 波动率 | 风险调整后收益 |
| **最大回撤** | max((峰值 - 谷值) / 峰值) | 最大亏损幅度 |
| **波动率** | std(日收益率) × √252 | 收益波动程度 |
| **胜率** | 盈利交易次数 / 总交易次数 | 成功概率 |
| **交易次数** | count(trades) | 总交易数 |

### 计算模块
```javascript
class PerformanceMetrics {
  constructor(trades, initialCapital, riskFreeRate = 0.03) {
    this.trades = trades;
    this.initialCapital = initialCapital;
    this.riskFreeRate = riskFreeRate;
  }

  calculateTotalReturn() { /* ... */ }
  calculateAnnualizedReturn() { /* ... */ }
  calculateSharpeRatio() { /* ... */ }
  calculateMaxDrawdown() { /* ... */ }
  calculateVolatility() { /* ... */ }
  calculateWinRate() { /* ... */ }
  calculateTradeCount() { /* ... */ }

  getAllMetrics() {
    return {
      totalReturn: this.calculateTotalReturn(),
      annualizedReturn: this.calculateAnnualizedReturn(),
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: this.calculateMaxDrawdown(),
      volatility: this.calculateVolatility(),
      winRate: this.calculateWinRate(),
      tradeCount: this.calculateTradeCount()
    };
  }
}
```

---

## ✅ 验收标准

- [ ] 7 个指标计算正确
- [ ] 与回测引擎集成
- [ ] 单元测试通过
- [ ] 边界情况处理完善

---

## 📁 交付物

1. `api/backtest-report.js` - 7 指标计算模块
2. `test/backtest-report.test.js` - 单元测试
3. `api/server.js` - 路由集成（如需要）

---

## 🔗 依赖关系

- 前置任务：TASK_V3_103（回测结果缓存）
- 后续任务：阶段 2（网格交易回测）

---

## 📝 备注

- 无风险利率默认 3%（年化）
- 波动率使用年化（×√252）
- 边界情况：空交易列表、单笔交易等
