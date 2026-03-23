"""
多因子策略模块
"""

from strategies.multi_factor.factors import (
    calculate_value_factor,
    calculate_momentum_factor,
    calculate_quality_factor,
    calculate_all_factors
)
from strategies.multi_factor.scoring import (
    winsorize,
    standardize,
    process_factors,
    synthesize_score,
    calculate_total_score
)
from strategies.multi_factor.strategy import MultiFactorStrategy

__all__ = [
    'calculate_value_factor',
    'calculate_momentum_factor',
    'calculate_quality_factor',
    'calculate_all_factors',
    'winsorize',
    'standardize',
    'process_factors',
    'synthesize_score',
    'calculate_total_score',
    'MultiFactorStrategy'
]
