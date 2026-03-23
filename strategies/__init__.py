"""
策略模块初始化
"""

from strategies.base import StrategyBase
from strategies.trend_following.dual_ma import DualMAStrategy
from strategies.multi_factor.strategy import MultiFactorStrategy

__all__ = [
    'StrategyBase',
    'DualMAStrategy',
    'MultiFactorStrategy'
]
