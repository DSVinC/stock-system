"""
多因子策略 - 因子打分模块

因子标准化、去极值、合成
"""

import pandas as pd
import numpy as np
from typing import List, Dict


def winsorize(series: pd.Series, n_std: float = 3.0) -> pd.Series:
    """
    缩尾处理（去极值）
    
    Args:
        series: 因子序列
        n_std: 标准差倍数
        
    Returns:
        去极值后的序列
    """
    median = series.median()
    std = series.std()
    
    lower = median - n_std * std
    upper = median + n_std * std
    
    return series.clip(lower, upper)


def standardize(series: pd.Series) -> pd.Series:
    """
    标准化（Z-Score）
    
    Args:
        series: 因子序列
        
    Returns:
        标准化后的序列
    """
    mean = series.mean()
    std = series.std()
    
    if std == 0 or np.isnan(std):
        return pd.Series(0, index=series.index)
    
    return (series - mean) / std


def process_factors(df: pd.DataFrame, factor_cols: List[str]) -> pd.DataFrame:
    """
    因子预处理（去极值 + 标准化）
    
    Args:
        df: 包含因子列的 DataFrame
        factor_cols: 因子列名列表
        
    Returns:
        预处理后的 DataFrame
    """
    result = df.copy()
    
    for col in factor_cols:
        # 1. 缩尾处理
        result[col] = winsorize(result[col])
        # 2. 标准化
        result[col] = standardize(result[col])
    
    return result


def synthesize_score(df: pd.DataFrame, factor_cols: List[str], weights: List[float] = None) -> pd.Series:
    """
    合成因子总分
    
    Args:
        df: 包含因子列的 DataFrame
        factor_cols: 因子列名列表
        weights: 各因子权重（默认等权）
        
    Returns:
        因子总分序列
    """
    if weights is None:
        # 等权合成
        return df[factor_cols].mean(axis=1)
    else:
        # 加权合成
        weights = np.array(weights)
        weights = weights / weights.sum()  # 归一化
        return (df[factor_cols] * weights).sum(axis=1)


def calculate_total_score(df: pd.DataFrame, factor_cols: List[str], 
                          weights: List[float] = None) -> pd.DataFrame:
    """
    计算因子总分（完整流程）
    
    Args:
        df: 包含因子列的 DataFrame
        factor_cols: 因子列名列表
        weights: 各因子权重（默认等权）
        
    Returns:
        包含总分的 DataFrame
    """
    # 1. 预处理（去极值 + 标准化）
    processed = process_factors(df, factor_cols)
    
    # 2. 合成总分
    result = processed.copy()
    result['total_score'] = synthesize_score(processed, factor_cols, weights)
    
    return result


# ============ 测试代码 ============

def test_winsorize():
    """测试缩尾处理"""
    # 构造含极端值的数据
    data = pd.Series([1, 2, 3, 4, 5, 100])  # 100 是极端值
    
    result = winsorize(data, n_std=2.0)
    
    # 极端值应该被截断
    assert result.iloc[-1] < 100
    
    print("✅ 缩尾处理测试通过")


def test_standardize():
    """测试标准化"""
    data = pd.Series([1, 2, 3, 4, 5])
    
    result = standardize(data)
    
    # 标准化后均值为 0，标准差为 1
    assert abs(result.mean()) < 0.001
    assert abs(result.std() - 1.0) < 0.001
    
    print("✅ 标准化测试通过")


def test_score_synthesis():
    """测试分数合成"""
    data = pd.DataFrame({
        'f1': [1, 2, 3, 4, 5],
        'f2': [5, 4, 3, 2, 1],
        'f3': [3, 3, 3, 3, 3]
    })
    
    result = calculate_total_score(data, ['f1', 'f2', 'f3'])
    
    # 等权合成，第 3 行三个因子都是 3，总分应该是 3
    assert abs(result['total_score'].iloc[2] - 3.0) < 0.001
    
    print("✅ 分数合成测试通过")


if __name__ == "__main__":
    test_winsorize()
    test_standardize()
    test_score_synthesis()
    print("\n✅ 所有测试通过")
