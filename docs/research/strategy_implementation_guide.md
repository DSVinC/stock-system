# 策略模板库工程实现指南

**来源**: Gemini Deep Research  
**日期**: 2026-03-23  
**用途**: 指导策略模板库的代码实现

---

## 1. 策略基类设计 (Strategy Base Class)

一个健壮的基类是策略复用的核心。它需要定义标准的生命周期钩子，并封装底层的数据访问和交易逻辑。

```python
from abc import ABC, abstractmethod
from datetime import datetime
import pandas as pd

class StrategyBase(ABC):
    """
    量化策略基类，定义统一接口
    """
    def __init__(self, name: str, params: dict = None):
        self.name = name
        self.params = params or {}
        self.portfolio = None  # 关联持仓对象
        self.data_engine = None  # 关联数据引擎
        self.is_initialized = False

    def initialize(self):
        """策略初始化，如加载初始数据、设置技术指标等"""
        print(f"[{self.name}] Initializing with params: {self.params}")
        self.is_initialized = True

    @abstractmethod
    def on_bar(self, bar_data: pd.DataFrame):
        """
        逐 K 线驱动逻辑（实盘/回测核心）
        :param bar_data: 当前时刻的行情数据
        """
        pass

    @abstractmethod
    def generate_signals(self) -> pd.DataFrame:
        """
        批量生成信号（研究/选股核心）
        """
        pass

    def calculate_position(self, signal: float, current_price: float) -> int:
        """
        仓位计算逻辑（风控预留）
        :param signal: 信号强度 (-1.0 到 1.0)
        """
        # 默认简单的等权或全仓逻辑，子类可覆盖
        pass

    def on_order_status(self, order_id: str, status: str):
        """订单状态回调"""
        pass
```

---

## 2. 趋势跟踪：双均线交叉策略 (Dual MA)

针对 A 股环境，增加了 **T+1 检查** 和 **涨跌停限制** 的逻辑。

```python
class DualMAStrategy(StrategyBase):
    """
    双均线策略：快线穿过慢线开仓，反之平仓
    适配 A 股：T+1 及 涨跌停处理
    """
    def __init__(self, fast_period=5, slow_period=20):
        params = {"fast_period": fast_period, "slow_period": slow_period}
        super().__init__("DualMA", params)

    def on_bar(self, bar: pd.Series, history: pd.DataFrame):
        """
        逐行处理逻辑
        bar: 当前行数据
        history: 包含当前行及之前的历史数据
        """
        symbol = bar['code']
        close = bar['close']
        
        # 1. 计算均线
        fast_ma = history['close'].tail(self.params['fast_period']).mean()
        slow_ma = history['close'].tail(self.params['slow_period']).mean()
        
        # 2. 获取持仓状态 (假设通过 self.portfolio 获取)
        pos = self.portfolio.get_position(symbol)
        
        # 3. 信号生成与过滤
        # 涨停不能买，跌停不能卖 (A 股限制)
        is_up_limit = close >= bar['pre_close'] * 1.099
        is_down_limit = close <= bar['pre_close'] * 0.901

        if fast_ma > slow_ma and pos == 0:
            if not is_up_limit:
                return "BUY", self.calculate_qty(close)
        
        elif fast_ma < slow_ma and pos > 0:
            # T+1 检查：判断持仓是否为今日买入
            if self.portfolio.is_tradable(symbol) and not is_down_limit:
                return "SELL", pos
        
        return "HOLD", 0

    def calculate_qty(self, price):
        # 简单的买入 100 股整数倍逻辑
        cash = self.portfolio.available_cash
        return (cash // (price * 1.001)) // 100 * 100
```

---

## 3. 多因子策略框架 (Multi-Factor Framework)

该框架侧重于横截面选股和定期再平衡。

```python
class MultiFactorStrategy(StrategyBase):
    """
    多因子打分策略
    因子：价值 (PE_inv), 动量 (Return_20), 质量 (ROE)
    """
    def __init__(self, top_n=10):
        super().__init__("MultiFactor", {"top_n": top_n})

    def process_factors(self, df: pd.DataFrame):
        """因子标准化与合成"""
        # 1. 计算因子
        df['f_value'] = 1 / df['pe']  # 价值因子（PE 倒数）
        df['f_mom'] = df['close'].pct_change(20)  # 20 日动量
        df['f_quality'] = df['roe']
        
        # 2. 预处理：去极值、标准化 (Z-Score)
        factor_cols = ['f_value', 'f_mom', 'f_quality']
        for col in factor_cols:
            # 缩尾处理
            median = df[col].median()
            std = df[col].std()
            df[col] = df[col].clip(median - 3*std, median + 3*std)
            # 标准化
            df[col] = (df[col] - df[col].mean()) / df[col].std()
            
        # 3. 等权合成总分
        df['total_score'] = df[factor_cols].mean(axis=1)
        return df

    def rebalance(self, current_date, market_data: pd.DataFrame):
        """
        定期再平衡逻辑（如每月第一个交易日）
        """
        # 1. 计算全市场得分
        scored_df = self.process_factors(market_data)
        
        # 2. 选取 Top N 股票
        selected = scored_df.sort_values(by='total_score', ascending=False).head(self.params['top_n'])
        target_list = selected['code'].tolist()
        
        # 3. 生成交易指令：卖出不在名单内的，买入新进名单的
        current_pos = self.portfolio.get_all_symbols()
        to_sell = set(current_pos) - set(target_list)
        to_buy = set(target_list) - set(current_pos)
        
        return {"sell": list(to_sell), "buy": list(to_buy)}
```

---

## 4. 系统集成与数据流设计

策略库不应独立运行，它通过 **引擎层** 与现有系统交互。

### 4.1 数据流模型

```
┌─────────────────┐                           ┌─────────────────────┐
│  数据库：SQLite  │ ←── (Read/Write) ───→    │  Python 策略引擎    │
│  - stock_data   │                           │  - 策略计算         │
│  - portfolio_   │                           │  - 信号生成         │
│    position     │                           │  - 风险控制         │
│  - conditional_ │                           └──────────┬──────────┘
│    order        │                                      │
└────────┬────────┘                                      │
         │ (SQL)                                         │ (Job Queue/Trigger)
         │                                               ↓
         │                                    ┌─────────────────────┐
         │                                    │  Node.js API        │
         │                                    │  (Express)          │
         │                                    └──────────┬──────────┘
         │                                               │
         │                                    (REST/WS)  │
         │                                               ↓
         │                                    ┌─────────────────────┐
         └──────────────────────────────────→ │  前端 Dashboard     │
              (直接读取条件单)                 │  - 信号展示         │
                                              │  - 参数配置         │
                                              └─────────────────────┘
```

### 4.2 集成代码示例 (Python 端写入条件单)

```python
import sqlite3

def export_signals_to_db(signals_df):
    """将信号转化为系统可执行的条件单"""
    conn = sqlite3.connect('stock_system.db')
    cursor = conn.cursor()
    
    for _, row in signals_df.iterrows():
        # 插入到 conditional_order 表
        cursor.execute("""
            INSERT INTO conditional_order 
            (symbol, side, price_type, status, strategy_id, created_at)
            VALUES (?, ?, 'MARKET', 'PENDING', ?, ?)
        """, (row['symbol'], row['side'], 'STRAT_001', datetime.now()))
    
    conn.commit()
    conn.close()
```

### 4.3 前端集成建议

**监控界面**：
- 使用 JavaScript 的 `setInterval` 每秒请求一次 Express 接口 `/api/orders`
- 实时展示策略生成的信号和订单状态

**参数调优**：
- 在前端 HTML 中设置 Input 表单（如 Fast Period, Slow Period）
- 通过 API 传递给 Python 脚本，更新策略配置

---

## 5. 推荐目录结构

```
stock-system/
├── strategies/
│   ├── __init__.py
│   ├── base.py              # 策略基类
│   ├── trend_following.py   # 趋势跟踪模板
│   │   ├── dual_ma.py       # 双均线策略
│   │   └── breakout.py      # 突破策略
│   ├── multi_factor.py      # 多因子模板
│   │   ├── factors.py       # 因子计算
│   │   └── scoring.py       # 因子打分
│   └── mean_reversion.py    # 均值回归模板
├── backtest/
│   ├── __init__.py
│   ├── engine.py            # 回测引擎
│   ├── metrics.py           # 绩效评估
│   └── risk.py              # 风险控制
├── scripts/
│   ├── run_strategy.py      # 策略执行入口
│   └── export_signals.py    # 信号导出脚本
└── config/
    └── strategies.json      # 策略参数配置
```

---

## 6. 下一步行动

| 优先级 | 任务 | 预计工时 |
|--------|------|---------|
| P0 | 实现策略基类 (`strategies/base.py`) | 2h |
| P0 | 开发双均线策略 (`strategies/trend_following/dual_ma.py`) | 3h |
| P0 | 开发多因子策略框架 (`strategies/multi_factor/`) | 4h |
| P1 | 完善回测引擎，支持 T+1、涨跌停 | 6h |
| P1 | 实现绩效评估模块 | 3h |
| P2 | 创建前端策略配置界面 | 4h |
| P2 | 实现策略参数热更新 | 2h |

---

## 7. 关键设计决策

### 7.1 为什么选择松耦合集成？

- **Python** 在量化计算、数据处理方面有丰富生态（pandas, numpy, talib）
- **Node.js** 在 Web 服务、实时推送方面有优势
- 通过 **SQLite** 作为中间存储，两者解耦，独立演进

### 7.2 为什么策略要参数化？

- 便于回测优化（参数网格搜索）
- 便于用户自定义（前端配置）
- 便于策略版本管理

### 7.3 为什么要处理 A 股特殊规则？

- **T+1**: 当日买入不可卖出，否则回测结果虚高
- **涨跌停**: 涨停买不进、跌停卖不出，否则成交假设不现实
- **停牌**: 停牌期间无法交易，复牌可能跳空

---

*本报告由 Gemini Deep Research 生成，经灵爪整理归档*
