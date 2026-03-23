"""
策略基类模块

定义量化策略的统一接口和基类
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, Optional, Tuple
import pandas as pd


class StrategyBase(ABC):
    """
    量化策略基类，定义统一接口
    
    Attributes:
        name: 策略名称
        params: 策略参数字典
        portfolio: 关联的持仓对象
        data_engine: 关联的数据引擎
        is_initialized: 是否已初始化
    """
    
    def __init__(self, name: str, params: Optional[Dict] = None):
        """
        初始化策略基类
        
        Args:
            name: 策略名称
            params: 策略参数字典
        """
        self.name = name
        self.params = params or {}
        self._portfolio = None
        self._data_engine = None
        self.is_initialized = False
    
    @property
    def portfolio(self):
        """获取关联的持仓对象"""
        return self._portfolio
    
    @portfolio.setter
    def portfolio(self, value):
        """设置关联的持仓对象"""
        self._portfolio = value
    
    @property
    def data_engine(self):
        """获取关联的数据引擎"""
        return self._data_engine
    
    @data_engine.setter
    def data_engine(self, value):
        """设置关联的数据引擎"""
        self._data_engine = value
    
    def initialize(self):
        """
        策略初始化，如加载初始数据、设置技术指标等
        """
        print(f"[{self.name}] Initializing with params: {self.params}")
        self.is_initialized = True
    
    @abstractmethod
    def on_bar(self, bar_data: pd.DataFrame) -> Tuple[str, int]:
        """
        逐 K 线驱动逻辑（实盘/回测核心）
        
        Args:
            bar_data: 当前时刻的行情数据
            
        Returns:
            (操作方向，数量) 元组，如 ("BUY", 100)
        """
        pass
    
    @abstractmethod
    def generate_signals(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        批量生成信号（研究/选股核心）
        
        Args:
            data: 历史行情数据
            
        Returns:
            包含交易信号的 DataFrame
        """
        pass
    
    def calculate_position(self, signal: float, current_price: float) -> int:
        """
        仓位计算逻辑（风控预留）
        
        Args:
            signal: 信号强度 (-1.0 到 1.0)
            current_price: 当前价格
            
        Returns:
            目标持仓数量
        """
        # 默认简单的等权或全仓逻辑，子类可覆盖
        if signal > 0.5:
            return 100  # 买入 100 股
        elif signal < -0.5:
            return 0  # 卖出
        return -1  # 持有
    
    def on_order_status(self, order_id: str, status: str):
        """
        订单状态回调
        
        Args:
            order_id: 订单 ID
            status: 订单状态
        """
        pass
    
    def check_t1(self, symbol: str) -> bool:
        """
        检查是否满足 T+1 交易规则
        
        Args:
            symbol: 股票代码
            
        Returns:
            是否可交易
        """
        if self._portfolio is None:
            return True
        return self._portfolio.is_tradable(symbol)
    
    def check_price_limit(self, close: float, pre_close: float) -> Tuple[bool, bool]:
        """
        检查涨跌停限制
        
        Args:
            close: 当前价格
            pre_close: 昨收价
            
        Returns:
            (是否涨停，是否跌停) 元组
        """
        is_up_limit = close >= pre_close * 1.099
        is_down_limit = close <= pre_close * 0.901
        return (is_up_limit, is_down_limit)


# ============ 测试代码 ============

class MockPortfolio:
    """模拟持仓对象，用于测试"""
    
    def __init__(self):
        self.available_cash = 100000.0
        self._tradable = True
    
    def get_position(self, symbol: str) -> int:
        return 0
    
    def is_tradable(self, symbol: str) -> bool:
        return self._tradable


class TestDataEngine:
    """模拟数据引擎，用于测试"""
    
    def __init__(self, data: pd.DataFrame):
        self._data = data
    
    def get_history(self, symbol: str, days: int) -> pd.DataFrame:
        return self._data.tail(days)


class ConcreteStrategy(StrategyBase):
    """具体策略实现，用于测试"""
    
    def on_bar(self, bar_data: pd.DataFrame) -> Tuple[str, int]:
        return ("HOLD", 0)
    
    def generate_signals(self, data: pd.DataFrame) -> pd.DataFrame:
        return pd.DataFrame()


def test_strategy_base():
    """测试策略基类"""
    strategy = ConcreteStrategy("TestStrategy", {"param1": 1})
    
    assert strategy.name == "TestStrategy"
    assert strategy.params["param1"] == 1
    assert strategy.is_initialized is False
    
    strategy.initialize()
    assert strategy.is_initialized is True


def test_t1_check():
    """测试 T+1 检查"""
    strategy = ConcreteStrategy("TestStrategy")
    portfolio = MockPortfolio()
    strategy.portfolio = portfolio
    
    # MockPortfolio 默认返回 True
    assert strategy.check_t1("000001.SZ") is True


def test_price_limit_check():
    """测试涨跌停检查"""
    strategy = ConcreteStrategy("TestStrategy")
    
    # 涨停
    is_up, is_down = strategy.check_price_limit(11.0, 10.0)
    assert is_up is True
    assert is_down is False
    
    # 跌停
    is_up, is_down = strategy.check_price_limit(9.0, 10.0)
    assert is_up is False
    assert is_down is True


if __name__ == "__main__":
    test_strategy_base()
    test_t1_check()
    test_price_limit_check()
    print("✅ 所有测试通过")
