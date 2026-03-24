# 策略评分标准配置文档

**版本**: v1.1  
**创建时间**: 2026-03-23  
**更新时间**: 2026-03-23 (v1.1 - 基于 2024-2025 最新市场数据)  
**来源**: 
- Gemini Deep Research 专业咨询
- 私募排排网 2025 年 3 月统计报告
- 中信证券量化策略 2025 年度展望报告
- 东财 Choice 数据
**适用市场**: A 股  
**适用策略**: 中长期量化策略（行业 + 因子选股）

---

## 📊 评分配置总览

### 核心设计原则

> **风险调整后收益（Sharpe/Calmar）权重最高，回撤控制次之，绝对收益再次之。**

**理由**: A 股市场高波动、牛短熊长，单纯追求收益率往往会导致巨大的回撤风险。

---

## 🎯 评分指标配置 (JSON)

```json
{
  "strategy_scoring_config": {
    "version": "1.1",
    "market": "A-Share",
    "strategy_type": "industry_7factor",
    "holding_period": "medium_long_term",
    "data_sources": [
      "私募排排网 2025 年 3 月统计报告",
      "中信证券量化策略 2025 年度展望报告",
      "东财 Choice 数据"
    ],
    "metrics": {
      "sharpe_ratio": {
        "name": "夏普比率",
        "direction": "higher_better",
        "description": "衡量每单位总风险带来的超额回报",
        "market_benchmark": {
          "average": 1.67,
          "top_100b": 2.18,
          "excellent": 2.5
        },
        "thresholds": {
          "excellent": 2.5,
          "good": 1.8,
          "fair": 1.2,
          "pass": 1.0,
          "danger": 0.5
        },
        "weight": 0.25,
        "score_calculation": "min(actual / excellent, 1.0)"
      },
      "max_drawdown": {
        "name": "最大回撤",
        "direction": "lower_better",
        "description": "最大资金回撤，专业机构风控红线",
        "market_benchmark": {
          "market_neutral_limit": -0.08,
          "index_enhancement_alpha": -0.05,
          "warning_line": 0.90,
          "liquidation_line": 0.85
        },
        "thresholds": {
          "excellent": -0.10,
          "good": -0.15,
          "fair": -0.20,
          "pass": -0.20,
          "danger": -0.30
        },
        "weight": 0.20,
        "score_calculation": "min(abs(actual) / abs(danger), 1.0)"
      },
      "annualized_return": {
        "name": "年化收益率",
        "direction": "higher_better",
        "description": "年化收益率，含 Alpha+Beta",
        "market_benchmark": {
          "alpha_expected": 0.12,
          "total_return_range": [0.12, 0.22]
        },
        "thresholds": {
          "excellent": 0.22,
          "good": 0.18,
          "fair": 0.12,
          "pass": 0.15,
          "danger": 0.08
        },
        "weight": 0.20,
        "score_calculation": "min(actual / excellent, 1.0)"
      },
      "calmar_ratio": {
        "name": "卡玛比率",
        "direction": "higher_better",
        "description": "收益与最大回撤的比值，实盘参考意义极强",
        "market_benchmark": {
          "target": 2.5
        },
        "thresholds": {
          "excellent": 2.5,
          "good": 1.8,
          "fair": 1.2,
          "pass": 1.5,
          "danger": 0.8
        },
        "weight": 0.15,
        "score_calculation": "min(actual / excellent, 1.0)"
      },
      "profit_loss_ratio": {
        "name": "盈亏比",
        "direction": "higher_better",
        "description": "单次交易获利与亏损的比例，决定系统健壮性",
        "market_benchmark": {
          "multi_factor": 1.35,
          "trend_following": 2.5,
          "mean_reversion": 1.2
        },
        "thresholds": {
          "excellent": 2.0,
          "good": 1.5,
          "fair": 1.2,
          "pass": 1.35,
          "danger": 1.0
        },
        "weight": 0.10,
        "score_calculation": "min(actual / excellent, 1.0)"
      },
      "win_rate": {
        "name": "胜率",
        "direction": "higher_better",
        "description": "盈利交易占比",
        "market_benchmark": {
          "multi_factor": 0.54,
          "trend_following": 0.40,
          "mean_reversion": 0.60
        },
        "thresholds": {
          "excellent": 0.60,
          "good": 0.55,
          "fair": 0.50,
          "pass": 0.53,
          "danger": 0.45
        },
        "weight": 0.05,
        "score_calculation": "min(actual / excellent, 1.0)"
      },
      "turnover_rate": {
        "name": "年化换手率 (倍)",
        "direction": "lower_better",
        "description": "过高会侵蚀手续费和滑点（印花税 0.05% 单边）",
        "market_benchmark": {
          "medium_freq_optimal": [30, 60],
          "medium_long_term": [10, 20],
          "cost_at_50x": 0.05
        },
        "thresholds": {
          "excellent": 15,
          "good": 25,
          "fair": 40,
          "pass": 50,
          "danger": 80
        },
        "weight": 0.05,
        "score_calculation": "min(actual / danger, 1.0)"
      }
    },
    "total_weight_check": 1.0,
    "pass_score": 0.75,
    "excellent_score": 0.85
  }
}
```

---

## 📝 详细指标说明

### 1. 夏普比率 (Sharpe Ratio) - 权重 25%

**含义**: 衡量每单位总风险带来的超额回报

**方向**: 值越大越好

**市场基准 (2024-2025)**:
- **平均水平**: 1.67 (全市场量化私募)
- **百亿私募平均**: 2.18
- **优秀水平**: 2.5 - 3.0

**阈值说明**:
| 等级 | 阈值 | 说明 |
|------|------|------|
| 优秀 | ≥ 2.5 | 顶尖量化策略，接近百亿私募水平 |
| 良好 | ≥ 1.8 | 超过市场平均，具备实盘价值 |
| 合格 | ≥ 1.0 | 可接受，继续优化 |
| 危险 | < 0.5 | 风险调整收益过低，需重新设计 |

**为什么权重最高**: 它是衡量策略综合素质的"金标准"，综合了收益和稳定性。

**来源**: 私募排排网 2025 年 3 月统计报告、东财 Choice 数据

---

### 2. 最大回撤 (Max Drawdown) - 权重 20%

**含义**: 最大资金回撤幅度

**方向**: 值越小越好（负数，绝对值越小越好）

**市场基准 (2024-2025)**:
- **市场中性策略风控红线**: -5% ~ -8%
- **指数增强超额回撤**: -3% ~ -5%
- **预警线**: 净值 0.90
- **止损/清盘线**: 净值 0.80 ~ 0.85
- **日限额**: 单日波动 1.5% ~ 2.0%

**阈值说明**:
| 等级 | 阈值 | 说明 |
|------|------|------|
| 优秀 | ≤ -10% | 接近市场中性策略风控标准 |
| 良好 | ≤ -15% | 专业机构可接受范围 |
| 合格 | ≤ -20% | 触及预警线，需警惕 |
| 危险 | ≤ -30% | 接近清盘线，大多数投资者会心理崩盘 |

**A 股特殊性**: 
- 2024 年初小微盘流动性危机导致大量策略回撤超 30%
- 幸存者偏差严重，回测中 15% 的回撤实盘可能演变为 20-25%
- 职业量化团队单日净值波动限额通常设在 1.5% - 2.0%

**来源**: 中信证券量化策略 2025 年度展望报告

---

### 3. 年化收益率 (Annualized Return) - 权重 20%

**含义**: 策略年化收益率（Alpha + Beta）

**方向**: 值越大越好

**市场基准 (2024-2025)**:
- **Alpha 预期**: 8% - 15%（中低频策略）
- **总收益预期**: 12% - 22%（含 Beta）
- **百亿私募平均**: 约 18%

**阈值说明**:
| 等级 | 阈值 | 说明 |
|------|------|------|
| 优秀 | ≥ 22% | 接近百亿私募优秀水平 |
| 良好 | ≥ 18% | 超过市场平均预期 |
| 合格 | ≥ 12% | 达到中长期策略合理预期 |
| 危险 | < 8% | 低于 Alpha 预期，策略可能失效 |

**基准选择**: 需对比基准（如沪深 300 或中证 500）。

**来源**: 中信证券量化策略 2025 年度展望报告

---

### 4. 卡玛比率 (Calmar Ratio) - 权重 15%

**含义**: 年化收益率 / 最大回撤

**方向**: 值越大越好

**阈值说明**:
| 等级 | 阈值 | 说明 |
|------|------|------|
| 优秀 | ≥ 2.5 | 风险收益比极佳 |
| 良好 | ≥ 1.5 | 实盘参考意义强 |
| 合格 | ≥ 1.0 | 可接受 |
| 危险 | < 0.8 | 收益无法覆盖风险 |

**为什么重要**: Calmar 比 Sharpe 更关注极端风险，对于私募或大资金尤其重要。

---

### 5. 盈亏比 (Profit/Loss Ratio) - 权重 10%

**含义**: 单次交易获利与亏损的比例

**方向**: 值越大越好

**市场基准 (2024-2025)**:

| 策略类型 | 典型盈亏比 | 说明 |
|---------|-----------|------|
| 趋势跟踪 | 2.5:1 - 3.5:1 | 依靠少数大级别行情 |
| 均值回归 | 1.1:1 - 1.4:1 | 收益稳定但怕极端行情 |
| 多因子 | 1.2:1 - 1.5:1 | A 股主流，统计优势累积 |

**阈值说明**:
| 等级 | 阈值 | 说明 |
|------|------|------|
| 优秀 | ≥ 2.0 | 接近趋势跟踪策略水平 |
| 良好 | ≥ 1.5 | 超过多因子策略平均 |
| 合格 | ≥ 1.2 | 可接受 |
| 危险 | < 1.0 | 亏多赚少，策略失效 |

**为什么重要**: 盈亏比体现了策略的容错空间，比单纯追求胜率更科学。

**来源**: 中信证券量化策略 2025 年度展望报告

---

### 6. 胜率 (Win Rate) - 权重 5%

**含义**: 盈利交易占比

**方向**: 值越大越好

**市场基准 (2024-2025)**:

| 策略类型 | 典型胜率 | 说明 |
|---------|---------|------|
| 趋势跟踪 | 35% - 45% | 依靠少数大级别行情获利 |
| 均值回归 | 55% - 65% | 收益稳定但怕单边极端行情 |
| 多因子 | 52% - 56% | A 股主流，依靠统计优势累积 |

**阈值说明**:
| 等级 | 阈值 | 说明 |
|------|------|------|
| 优秀 | ≥ 60% | 接近均值回归策略上限 |
| 良好 | ≥ 55% | 超过多因子策略平均 |
| 合格 | ≥ 50% | 可接受 |
| 危险 | < 45% | 需配合高盈亏比 (>2.5) |

**为什么权重低**: 趋势策略胜率通常不高，45% 以上配合高盈亏比即可盈利。胜率需与盈亏比结合分析。

---

### 7. 年化换手率 (Turnover Rate) - 权重 5%

**含义**: 年化换手倍数

**方向**: 值越小越好（在同等收益下）

**市场基准 (2024-2025)**:
- **印花税**: 0.05%（单边，2023 年 8 月减半后）
- **中频最优区间**: 30 - 60 倍
- **中长期策略**: 10 - 20 倍
- **摩擦成本**: 年化 50 倍换手约 4% - 6%（含佣金、印花税、冲击成本）

**阈值说明**:
| 等级 | 阈值 | 说明 |
|------|------|------|
| 优秀 | ≤ 15 倍 | 低频交易，成本极低 |
| 良好 | ≤ 25 倍 | 中长期策略最优区间 |
| 合格 | ≤ 40 倍 | 可接受 |
| 危险 | ≥ 80 倍 | 摩擦成本过高，侵蚀收益 |

**A 股特殊性**: 
- 2023 年 8 月印花税减半后，最优换手率区间上移
- 考虑冲击成本，年化 50 倍换手的摩擦成本约为 4% - 6%
- T+1 制度下无法日内反向交易，换手率必须严格限制

**来源**: 中信证券量化策略 2025 年度展望报告

---

## 🇨🇳 A 股市场特殊性考虑

### 1. T+1 制度与滑点

- A 股无法日内反向交易
- 回测中的换手率必须严格限制
- 滑点设置应不低于单边 0.1% - 0.15%（包含印花税）

### 2. "胖尾"风险

- A 股容易出现非理性的连续跌停或黑天鹅事件
- **最大回撤**的评分阈值比美股市场更严苛
- 对极端风险的容忍度更低

### 3. 基准选择

评分时应区分策略类型：
- **小票策略**: 基准应设为中证 1000 或国证 2000
- **蓝筹策略**: 基准应为沪深 300

### 4. 行业周期性

- A 股行业轮动极快
- 建议在评分标准中隐含对"行业集中度"的负面考量
- 若配置过分集中，即使得分高也应扣除稳定性分值

---

## 🧮 综合评分计算公式

```python
def calculate_strategy_score(metrics):
    """
    计算策略综合评分
    
    Args:
        metrics: dict, 包含各指标实际值
        
    Returns:
        tuple: (综合评分，各指标得分详情)
    """
    config = STRATEGY_SCORING_CONFIG['metrics']
    
    scores = {}
    
    # 越大越好的指标
    higher_better = ['sharpe_ratio', 'annualized_return', 'calmar_ratio', 
                     'profit_loss_ratio', 'win_rate']
    
    for metric_name in higher_better:
        actual = metrics[metric_name]
        excellent = config[metric_name]['thresholds']['excellent']
        scores[metric_name] = min(actual / excellent, 1.0)
    
    # 越小越好的指标
    lower_better = ['max_drawdown', 'turnover_rate']
    
    for metric_name in lower_better:
        actual = abs(metrics[metric_name])
        danger = abs(config[metric_name]['thresholds']['danger'])
        scores[metric_name] = min(actual / danger, 1.0)
    
    # 加权计算
    total_score = sum(
        scores[metric_name] * config[metric_name]['weight']
        for metric_name in config
    )
    
    return total_score, scores


def evaluate_strategy(metrics):
    """
    评估策略是否合格
    
    Returns:
        str: 'excellent' / 'pass' / 'fail'
    """
    score, _ = calculate_strategy_score(metrics)
    
    if score >= EXCELLENT_SCORE:  # 0.90
        return 'excellent'
    elif score >= PASS_SCORE:  # 0.75
        return 'pass'
    else:
        return 'fail'
```

---

## 📋 使用示例

### 示例 1: 优秀策略

```python
metrics = {
    'sharpe_ratio': 2.1,        # 优秀
    'max_drawdown': -0.12,      # 良好
    'annualized_return': 0.28,  # 优秀
    'calmar_ratio': 2.3,        # 良好
    'profit_loss_ratio': 2.6,   # 优秀
    'win_rate': 0.52,           # 良好
    'turnover_rate': 35         # 良好
}

score, details = calculate_strategy_score(metrics)
# score ≈ 0.92 (excellent)
# → 自动进入下一轮：参数优化 + 版本生成
```

### 示例 2: 合格策略

```python
metrics = {
    'sharpe_ratio': 1.3,        # 良好
    'max_drawdown': -0.19,      # 合格
    'annualized_return': 0.16,  # 良好
    'calmar_ratio': 1.6,        # 良好
    'profit_loss_ratio': 1.7,   # 良好
    'win_rate': 0.49,           # 合格
    'turnover_rate': 45         # 良好
}

score, details = calculate_strategy_score(metrics)
# score ≈ 0.78 (pass)
# → 进入参数优化环节
```

### 示例 3: 不合格策略

```python
metrics = {
    'sharpe_ratio': 0.6,        # 危险
    'max_drawdown': -0.28,      # 危险
    'annualized_return': 0.06,  # 危险
    'calmar_ratio': 0.9,        # 危险
    'profit_loss_ratio': 1.2,   # 危险
    'win_rate': 0.42,           # 危险
    'turnover_rate': 80         # 合格
}

score, details = calculate_strategy_score(metrics)
# score ≈ 0.45 (fail)
# → 需要重新设计策略或切换策略库
```

---

## 🔄 策略迭代决策树

```
回测完成
    │
    ▼
计算综合评分
    │
    ├── score ≥ 0.90 (excellent)
    │       │
    │       ▼
    │   直接生成版本号 → 模拟验证
    │
    ├── 0.75 ≤ score < 0.90 (pass)
    │       │
    │       ▼
    │   Optuna 参数优化 → 更新配置 → 生成版本号 → 模拟验证
    │
    └── score < 0.75 (fail)
            │
            ▼
        二次迭代决策
            │
            ├── 方案 A：调整评分标准阈值
            │   (放宽/收紧某些指标)
            │
            └── 方案 B：切换策略库
                (趋势/均值回归/多因子)
```

---

## 📁 配置文件位置

- **评分配置**: `config/strategy_score_config.json`
- **评分引擎**: `api/strategy-scorer.js`
- **版本管理**: `api/strategy-version-manager.js`

---

## 🔗 关联文档

- [策略优化决策记录](./strategy_optimization_decision.md)
- [回测策略库设计](./backtest_strategy_library.md)
- [策略实现指南](./strategy_implementation_guide.md)

---

## 📊 2024-2025 A 股量化市场基准总结

### 市场整体情况

| 指标 | 市场平均 | 百亿私募平均 | 优秀水平 |
|------|---------|------------|---------|
| 夏普比率 | 1.67 | 2.18 | 2.5 - 3.0 |
| 年化收益 (总) | - | 约 18% | 22%+ |
| Alpha 预期 | 8% - 15% | 12% - 18% | 15%+ |
| 最大回撤风控 | -5% ~ -8% | -3% ~ -5% | -10% 以内 |

### 不同策略类型典型表现

| 策略类型 | 胜率 | 盈亏比 | 年化换手 | 适用场景 |
|---------|------|--------|---------|---------|
| 趋势跟踪 | 35% - 45% | 2.5:1 - 3.5:1 | 10 - 30 倍 | 趋势行情 |
| 均值回归 | 55% - 65% | 1.1:1 - 1.4:1 | 30 - 60 倍 | 震荡行情 |
| 多因子 | 52% - 56% | 1.2:1 - 1.5:1 | 15 - 50 倍 | 全市场 |

### 风控标准

| 指标 | 阈值 | 说明 |
|------|------|------|
| 预警线 | 净值 0.90 | 触及后需提交风控报告 |
| 止损线 | 净值 0.80 - 0.85 | 触及后强制平仓 |
| 日波动限额 | 1.5% - 2.0% | 单日净值波动上限 |
| 行业集中度 | ≤ 5% | 单一行业最大敞口 |
| 风格偏离 | ≤ 15% | 市值/估值等风格因子偏离 |

### 因子配置建议 (2025)

| 因子类型 | 推荐权重 | 说明 |
|---------|---------|------|
| 基本面因子 | 30% | 提供中长期稳定性 |
| 价量因子 | 40% | A 股主要收益来源 |
| 替代数据/AI | 20% | 舆情、研报、文本挖掘 |
| 风格风控 | 10% | 动态控制市值、行业敞口 |

---

**数据来源**:
- 私募排排网 2025 年 3 月统计报告
- 中信证券量化策略 2025 年度展望报告
- 东财 Choice 数据

**下次回顾**: 实盘模拟验证后（预计 2026-04-01），根据实际表现调整阈值

---

**文档版本历史**:
- v1.0 (2026-03-23): 初始版本，基于 Gemini Deep Research
- v1.1 (2026-03-23): 基于 2024-2025 最新市场数据更新（私募排排网/中信证券）
