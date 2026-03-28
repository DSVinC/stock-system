# TASK_V3_007 - 回测系统集成

**版本**: V3.0  
**优先级**: P0  
**状态**: pending  
**创建日期**: 2026-03-24  
**预计工期**: 2-3 天  

---

## 📋 任务描述

集成回测系统，支持基于历史快照数据的策略回测。

---

## 🎯 目标

1. 实现日线回测引擎
2. 支持选股策略回测
3. 输出回测报告（夏普比率、最大回撤等）
4. 与选股系统联动

---

## 📐 技术规范

### 输入
- 选股策略配置（行业权重、7 因子阈值）
- 回测时间范围
- 初始资金

### 处理逻辑
```python
def run_backtest(strategy_config, start_date, end_date, initial_capital):
    """
    执行回测
    
    Returns:
        dict: 回测报告（夏普比率、最大回撤、年化收益等）
    """
    # 1. 从 stock_factor_snapshot 获取历史数据
    # 2. 按策略配置选股
    # 3. 模拟交易
    # 4. 计算绩效指标
```

### 输出
```json
{
  "sharpe_ratio": 2.1,
  "max_drawdown": -0.15,
  "annualized_return": 0.28,
  "total_return": 0.45,
  "win_rate": 0.62,
  "trade_count": 156
}
```

---

## ✅ 验收标准

- [ ] 回测引擎正常工作
- [ ] 支持选股策略回测
- [ ] 输出完整回测报告
- [ ] 与 stock_factor_snapshot 数据联动
- [ ] 性能：1 年回测 < 30 秒

---

## 📁 交付物

1. `api/backtest.js` - 回测 API
2. `scripts/run_backtest.mjs` - 回测脚本
3. `docs/tasks/TASK_V3_007.md` - 任务文档

---

## 🔗 依赖关系

- 前置任务：TASK_SNAPSHOT_005（历史快照数据）
- 后续任务：TASK_V3_008（分钟线回测策略）
