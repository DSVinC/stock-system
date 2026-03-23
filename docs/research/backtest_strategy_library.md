# A 股量化回测系统策略模板库设计建议书

**来源**: Gemini Deep Research  
**日期**: 2026-03-23  
**用途**: 指导股票系统回测模块的策略模板库设计

---

## 1. 策略模板分类体系 (Strategy Taxonomy)

一个专业的策略库应基于不同的收益来源（Alpha/Beta）和交易逻辑进行分层分类：

### 1.1 权益类策略 (Equity Strategies)

| 策略类型 | 说明 | 适用场景 |
|---------|------|---------|
| **多因子模型** (Multi-Factor) | A 股最主流的量化路径 | 中长期持仓 |
| **趋势跟踪** (Trend Following) | 利用动量效应 | 趋势行情 |
| **均值回归** (Mean Reversion) | 基于偏离均值的统计回归 | 震荡行情 |
| **事件驱动** (Event-Driven) | 捕捉特定公告带来的超额收益 | 特定事件窗口 |

**因子大类**：
- 价值 (Value)
- 成长 (Growth)
- 质量 (Quality)
- 动量 (Momentum)
- 低波动 (Low Volatility)

### 1.2 统计套利与另类策略

| 策略类型 | 说明 |
|---------|------|
| **统计套利** (Statistical Arbitrage) | 基于协整关系的配对交易或跨品种套利 |
| **高频/日内策略** (Intraday/HFT) | A 股 T+1 限制下可通过底仓进行 T+0 交易 |
| **机器学习策略** | 利用 XGBoost, LSTM, Transformer 模型 |

---

## 2. 每种策略的核心参数设计

参数化是策略工程化的核心。每个模板应包含以下三类参数：

### 2.1 趋势跟踪模板

```json
{
  "strategy_type": "trend_following",
  "parameters": {
    "fast_period": 5,
    "slow_period": 20,
    "entry_threshold": 0.02,
    "exit_threshold": -0.01,
    "volume_filter": 1.5,
    "atr_multiplier": 2.0
  }
}
```

**核心参数**：
- **回看周期** (Look-back Window): `fast_period`, `slow_period`
- **入场/出场阈值** (Thresholds): 突破百分比或 ATR 倍数
- **过滤器** (Filters): 成交量放大倍数、波动率限制

### 2.2 多因子模板

```json
{
  "strategy_type": "multi_factor",
  "parameters": {
    "factor_pool": ["value", "momentum", "quality"],
    "factor_weights": [0.4, 0.3, 0.3],
    "rebalance_frequency": "monthly",
    "stock_universe": "csi500",
    "quantile_limit": 0.2
  }
}
```

**核心参数**：
- **因子池** (Factor Universe): 选取的因子列表及其权重
- **再平衡频率** (Rebalancing Frequency): 月度、周度
- **选股范围** (Stock Universe): 全 A、中证 500、沪深 300 等
- **分位数限制** (Quantile): 选取因子得分前 N% 的股票

### 2.3 均值回归模板

```json
{
  "strategy_type": "mean_reversion",
  "parameters": {
    "window": 20,
    "zscore_entry": -2.0,
    "zscore_exit": -0.5,
    "stop_loss": -0.1
  }
}
```

**核心参数**：
- **基准偏离度** (Z-Score Threshold): 偏离均值多少个标准差触发交易
- **窗口期** (Window): 计算均值和标准差的滚动周期

---

## 3. 回测引擎需要支持的功能特性

一个专业的 A 股回测引擎必须处理中国市场特有的逻辑：

### 3.1 市场规则模拟

| 功能 | 说明 | 重要性 |
|------|------|--------|
| **T+1 制度模拟** | 严格限制买入后次日方可卖出 | ⭐⭐⭐ |
| **涨跌停处理** | 封死涨停无法买入，封死跌停无法卖出 | ⭐⭐⭐ |
| **撮合机制** | 支持收盘价/开盘价/VWAP 撮合 | ⭐⭐ |

### 3.2 数据处理质量

| 功能 | 说明 |
|------|------|
| **复权计算** | 必须支持前复权和后复权数据，以处理高送转 |
| **幸存者偏差处理** | 必须包含已退市股票的数据 |
| **停牌处理** | 模拟停牌期间无法交易，及复牌后的价格跳空 |

---

## 4. 风险控制与绩效评估指标

### 4.1 绩效评估 (Performance Metrics)

| 指标 | 公式/说明 | 用途 |
|------|----------|------|
| **年化收益率** (CAGR) | 核心盈利能力 | 收益 |
| **夏普比率** (Sharpe) | 单位风险下的超额收益 | 风险调整收益 |
| **索提诺比率** (Sortino) | 专注于下行风险 | 下行风险 |
| **信息比率** (IR) | 相对于基准的稳定超额收益 | 超额收益稳定性 |
| **卡玛比率** (Calmar) | 年化收益/最大回撤 | 回撤调整收益 |

### 4.2 风险控制 (Risk Metrics)

| 指标 | 说明 |
|------|------|
| **最大回撤** (Max Drawdown) | 衡量极端亏损情况 |
| **年化波动率** (Volatility) | 收益的稳定性 |
| **换手率** (Turnover Rate) | 衡量交易频率和冲击成本 |
| **VaR / CVaR** | 统计意义上的潜在亏损空间 |

---

## 5. 业界最佳实践与常见陷阱

### 5.1 最佳实践 (Best Practices)

1. **参数平原** (Parameter Planes)
   - 寻找在参数小幅波动下依然稳健的区间
   - 避免孤立的最优参数（参数孤岛）

2. **样本外测试** (Out-of-Sample Testing)
   - 将数据分为训练集、验证集和测试集
   - 防止过度拟合

3. **蒙特卡洛模拟**
   - 通过打乱收益序列顺序
   - 测试策略在不同市场环境下的韧性

### 5.2 常见陷阱 (Common Pitfalls)

| 陷阱 | 说明 | 解决方案 |
|------|------|---------|
| **未来函数** (Look-ahead Bias) | 使用 T 日收盘后的信息在 T 日交易 | 严格数据对齐 |
| **忽略交易成本** | 印花税、佣金、冲击成本 | 全成本模拟 |
| **过拟合** (Overfitting) | 参数过多，历史完美实盘失效 | 简化模型、OOS 测试 |
| **忽略流动性** | 回测成交额 > 实际日成交额 | 设置成交额限制 |

### 5.3 针对 A 股的特殊性建议

1. **因子衰减** (Factor Decay)
   - A 股因子拥挤度高
   - 策略库应包含"因子衰减监控"功能

2. **基准对比**
   - 必须对比中证全指或对应风格指数
   - A 股的 Beta 波动极大

---

## 6. 策略模板库工程实现建议

### 6.1 目录结构

```
stock-system/
├── strategies/
│   ├── base.py              # 策略基类
│   ├── trend_following.py   # 趋势跟踪模板
│   ├── multi_factor.py      # 多因子模板
│   ├── mean_reversion.py    # 均值回归模板
│   └── event_driven.py      # 事件驱动模板
├── backtest/
│   ├── engine.py            # 回测引擎
│   ├── metrics.py           # 绩效评估
│   └── risk.py              # 风险控制
└── config/
    └── strategies.json      # 策略参数配置
```

### 6.2 策略基类接口

```python
class StrategyTemplate:
    def __init__(self, params: dict):
        self.params = params
    
    def generate_signals(self, data: pd.DataFrame) -> pd.Series:
        """生成交易信号"""
        pass
    
    def calculate_position(self, signal: float, portfolio: dict) -> float:
        """计算目标仓位"""
        pass
    
    def get_risk_metrics(self, returns: pd.Series) -> dict:
        """计算风险指标"""
        pass
```

---

## 7. 下一步行动

1. **实现策略基类** (`strategies/base.py`)
2. **开发趋势跟踪模板** (`strategies/trend_following.py`)
3. **开发多因子模板** (`strategies/multi_factor.py`)
4. **完善回测引擎**，支持 T+1、涨跌停等 A 股特性
5. **实现绩效评估模块**，包含所有核心指标
6. **创建策略参数配置文件**，支持 JSON 导入导出

---

*本报告由 Gemini Deep Research 生成，经灵爪整理归档*
