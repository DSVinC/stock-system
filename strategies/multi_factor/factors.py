"""
多因子策略 - 因子计算模块

计算价值、动量、质量等因子
"""

import pandas as pd
import numpy as np
from typing import List, Dict


def calculate_value_factor(df: pd.DataFrame) -> pd.Series:
    """
    计算价值因子（PE 倒数）
    
    Args:
        df: 包含 pe 列的 DataFrame
        
    Returns:
        价值因子序列
    """
    # PE 倒数，PE 越低因子值越高
    return 1 / df['pe'].replace(0, np.nan).replace(-np.inf, np.nan)


def calculate_momentum_factor(df: pd.DataFrame, period: int = 20) -> pd.Series:
    """
    计算动量因子（N 日收益率）
    
    Args:
        df: 包含 close 列的 DataFrame
        period: 回看周期
        
    Returns:
        动量因子序列
    """
    return df['close'].pct_change(period)


def calculate_quality_factor(df: pd.DataFrame) -> pd.Series:
    """
    计算质量因子（ROE）
    
    Args:
        df: 包含 roe 列的 DataFrame
        
    Returns:
        质量因子序列
    """
    return df['roe']


def calculate_all_factors(df: pd.DataFrame, momentum_period: int = 20) -> pd.DataFrame:
    """
    计算所有因子
    
    Args:
        df: 包含 pe, roe, close 列的 DataFrame
        momentum_period: 动量因子回看周期
        
    Returns:
        包含所有因子的 DataFrame
    """
    result = df.copy()
    
    # 计算各因子
    result['f_value'] = calculate_value_factor(result)
    result['f_momentum'] = calculate_momentum_factor(result, momentum_period)
    result['f_quality'] = calculate_quality_factor(result)
    
    return result


# ============ 测试代码 ============

def test_factor_calculation():
    """测试因子计算"""
    # 构造测试数据
    data = pd.DataFrame({
        'code': ['000001.SZ', '000002.SZ', '000003.SZ'],
        'pe': [10, 20, 15],
        'roe': [0.15, 0.10, 0.20],
        'close': [100, 110, 105]
    })
    
    # 计算因子
    result = calculate_all_factors(data)
    
    # 验证价值因子（PE 倒数）
    assert abs(result['f_value'].iloc[0] - 0.1) < 0.001  # 1/10
    assert abs(result['f_value'].iloc[1] - 0.05) < 0.001  # 1/20
    
    # 验证质量因子（ROE）
    assert abs(result['f_quality'].iloc[0] - 0.15) < 0.001
    
    print("✅ 因子计算测试通过")


if __name__ == "__main__":
    test_factor_calculation()
    print("\n✅ 所有测试通过")
