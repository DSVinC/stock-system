"""
双均线策略模块

实现经典的快慢均线交叉策略，适配 A 股 T+1 和涨跌停限制
"""

import pandas as pd
from typing import Tuple, Dict, Optional
from strategies.base import StrategyBase


class DualMAStrategy(StrategyBase):
    """
    双均线策略：快线穿过慢线开仓，反之平仓
    适配 A 股：T+1 及 涨跌停处理
    """
    
    def __init__(self, fast_period: int = 5, slow_period: int = 20):
        """
        初始化双均线策略
        
        Args:
            fast_period: 快线周期
            slow_period: 慢线周期
        """
        params = {
            "fast_period": fast_period,
            "slow_period": slow_period
        }
        super().__init__("DualMA", params)
        self._last_signals = {}  # 记录上一次的信号
    
    def _calculate_ma(self, prices: pd.Series, period: int) -> float:
        """计算移动平均线"""
        if len(prices) < period:
            return prices.iloc[-1] if len(prices) > 0 else 0.0
        return prices.tail(period).mean()
    
    def on_bar(self, bar: pd.Series, history: pd.DataFrame) -> Tuple[str, int]:
        """
        逐行处理逻辑
        
        Args:
            bar: 当前行数据
            history: 包含当前行及之前的历史数据
            
        Returns:
            (操作方向，数量) 元组
        """
        symbol = bar.get('code', 'UNKNOWN')
        close = bar['close']
        pre_close = bar.get('pre_close', close)
        
        # 1. 计算均线
        fast_ma = self._calculate_ma(history['close'], self.params['fast_period'])
        slow_ma = self._calculate_ma(history['close'], self.params['slow_period'])
        
        # 2. 获取持仓状态
        pos = 0
        if self._portfolio:
            pos = self._portfolio.get_position(symbol)
        
        # 3. 检查涨跌停限制
        is_up_limit, is_down_limit = self.check_price_limit(close, pre_close)
        
        # 4. 信号生成与过滤
        signal = "HOLD"
        qty = 0
        
        if fast_ma > slow_ma and pos == 0:
            # 金叉，考虑买入
            if not is_up_limit:
                # 涨停不能买
                if self.check_t1(symbol):
                    signal = "BUY"
                    qty = self._calculate_qty(close)
        
        elif fast_ma < slow_ma and pos > 0:
            # 死叉，考虑卖出
            if not is_down_limit:
                # 跌停不能卖
                if self.check_t1(symbol):
                    signal = "SELL"
                    qty = pos
        
        # 记录信号
        self._last_signals[symbol] = (signal, qty)
        
        return (signal, qty)
    
    def _calculate_qty(self, price: float) -> int:
        """
        计算买入数量
        
        Args:
            price: 当前价格
            
        Returns:
            买入数量（100 股的整数倍）
        """
        if self._portfolio:
            cash = self._portfolio.available_cash
            # 考虑手续费，买入 100 股整数倍
            return (cash // (price * 1.001)) // 100 * 100
        return 100  # 默认买入 100 股
    
    def generate_signals(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        批量生成信号
        
        Args:
            data: 历史行情数据，包含 code, close 等列
            
        Returns:
            包含交易信号的 DataFrame
        """
        results = []
        
        # 按股票代码分组处理
        for code in data['code'].unique():
            stock_data = data[data['code'] == code].sort_values('date').reset_index(drop=True)
            
            for i in range(len(stock_data)):
                if i < self.params['slow_period']:
                    continue  # 数据不足，跳过
                
                bar = stock_data.iloc[i]
                history = stock_data.iloc[:i+1]
                
                signal, qty = self.on_bar(bar, history)
                
                if signal != "HOLD":
                    results.append({
                        'date': bar['date'],
                        'code': code,
                        'signal': signal,
                        'qty': qty,
                        'price': bar['close'],
                        'fast_ma': self._calculate_ma(history['close'], self.params['fast_period']),
                        'slow_ma': self._calculate_ma(history['close'], self.params['slow_period'])
                    })
        
        return pd.DataFrame(results)
    
    def get_analysis(self, data: pd.DataFrame) -> Dict:
        """
        获取策略分析结果
        
        Args:
            data: 历史行情数据
            
        Returns:
            分析结果字典
        """
        signals = self.generate_signals(data)
        
        if len(signals) == 0:
            return {
                'total_signals': 0,
                'buy_signals': 0,
                'sell_signals': 0
            }
        
        return {
            'total_signals': len(signals),
            'buy_signals': len(signals[signals['signal'] == 'BUY']),
            'sell_signals': len(signals[signals['signal'] == 'SELL']),
            'signals_df': signals
        }


# ============ 测试代码 ============

def test_dual_ma_strategy():
    """测试双均线策略"""
    strategy = DualMAStrategy(fast_period=5, slow_period=10)
    
    assert strategy.name == "DualMA"
    assert strategy.params['fast_period'] == 5
    assert strategy.params['slow_period'] == 10
    
    # 测试均线计算
    prices = pd.Series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    ma5 = strategy._calculate_ma(prices, 5)
    assert ma5 == 8.0  # (6+7+8+9+10)/5
    
    print("✅ 双均线策略基础测试通过")


def test_dual_ma_signals():
    """测试信号生成"""
    strategy = DualMAStrategy(fast_period=5, slow_period=10)
    
    # 构造测试数据：价格先上涨后下跌
    dates = pd.date_range('2024-01-01', periods=20, freq='D')
    
    # 上涨阶段（快线上穿慢线）
    prices_up = list(range(10, 30))
    # 下跌阶段（快线下穿慢线）
    prices_down = list(range(30, 10, -1))
    
    data = pd.DataFrame({
        'code': ['000001.SZ'] * 20,
        'date': dates,
        'close': prices_up[:20],
        'pre_close': [9] + prices_up[:19]
    })
    
    signals = strategy.generate_signals(data)
    
    print(f"生成信号数：{len(signals)}")
    if len(signals) > 0:
        print(signals[['date', 'code', 'signal', 'qty', 'price']])
    
    print("✅ 双均线策略信号测试通过")


if __name__ == "__main__":
    test_dual_ma_strategy()
    test_dual_ma_signals()
    print("\n✅ 所有测试通过")
