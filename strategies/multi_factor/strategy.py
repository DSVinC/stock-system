"""
多因子策略主类

实现多因子打分选股策略
"""

import pandas as pd
from typing import Dict, List, Tuple, Set
from strategies.base import StrategyBase
from strategies.multi_factor import factors, scoring


class MultiFactorStrategy(StrategyBase):
    """
    多因子打分策略
    因子：价值 (PE 倒数), 动量 (20 日收益), 质量 (ROE)
    """
    
    def __init__(self, top_n: int = 10, factor_weights: List[float] = None):
        """
        初始化多因子策略
        
        Args:
            top_n: 选取前 N 只股票
            factor_weights: 因子权重 [价值，动量，质量]
        """
        params = {
            "top_n": top_n,
            "factor_weights": factor_weights or [0.4, 0.3, 0.3]
        }
        super().__init__("MultiFactor", params)
        self._current_holdings: Set[str] = set()
    
    def process_factors(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        因子处理与合成
        
        Args:
            df: 包含基础数据的 DataFrame
            
        Returns:
            包含因子总分的 DataFrame
        """
        # 1. 计算因子
        result = factors.calculate_all_factors(df)
        
        # 2. 因子预处理和合成
        factor_cols = ['f_value', 'f_momentum', 'f_quality']
        result = scoring.calculate_total_score(
            result, 
            factor_cols, 
            self.params['factor_weights']
        )
        
        return result
    
    def rebalance(self, market_data: pd.DataFrame) -> Dict[str, List[str]]:
        """
        再平衡逻辑
        
        Args:
            market_data: 全市场数据
            
        Returns:
            {'buy': [...], 'sell': [...]} 字典
        """
        # 1. 计算全市场得分
        scored_df = self.process_factors(market_data)
        
        # 2. 选取 Top N 股票
        valid_data = scored_df.dropna(subset=['total_score'])
        if len(valid_data) == 0:
            return {'buy': [], 'sell': list(self._current_holdings)}
        
        selected = valid_data.sort_values(by='total_score', ascending=False).head(self.params['top_n'])
        target_list = set(selected['code'].tolist())
        
        # 3. 生成交易指令
        to_sell = self._current_holdings - target_list
        to_buy = target_list - self._current_holdings
        
        # 更新持仓记录
        self._current_holdings = target_list
        
        return {
            'buy': list(to_buy),
            'sell': list(to_sell)
        }
    
    def on_bar(self, bar: pd.Series, history: pd.DataFrame) -> Tuple[str, int]:
        """
        逐 K 线处理（多因子策略主要用于定期再平衡）
        
        Args:
            bar: 当前行数据
            history: 历史数据
            
        Returns:
            (操作方向，数量) 元组
        """
        # 多因子策略通常用于定期再平衡，不在 on_bar 中频繁交易
        return ("HOLD", 0)
    
    def generate_signals(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        批量生成信号
        
        Args:
            data: 历史行情数据
            
        Returns:
            包含交易信号的 DataFrame
        """
        # 多因子策略的信号是基于再平衡日的选股结果
        results = []
        
        # 按日期分组处理
        for date in data['date'].unique():
            day_data = data[data['date'] == date]
            
            if len(day_data) < 10:  # 数据太少，跳过
                continue
            
            try:
                scored = self.process_factors(day_data)
                valid = scored.dropna(subset=['total_score'])
                
                if len(valid) == 0:
                    continue
                
                top_stocks = valid.sort_values(by='total_score', ascending=False).head(self.params['top_n'])
                
                for _, row in top_stocks.iterrows():
                    results.append({
                        'date': date,
                        'code': row['code'],
                        'signal': 'BUY',
                        'score': row['total_score'],
                        'price': row.get('close', 0)
                    })
            except Exception as e:
                # 某天数据有问题，跳过
                continue
        
        return pd.DataFrame(results)
    
    def get_top_stocks(self, market_data: pd.DataFrame) -> pd.DataFrame:
        """
        获取推荐股票列表
        
        Args:
            market_data: 全市场数据
            
        Returns:
            推荐股票 DataFrame
        """
        scored = self.process_factors(market_data)
        valid = scored.dropna(subset=['total_score'])
        
        if len(valid) == 0:
            return pd.DataFrame()
        
        result = valid.sort_values(by='total_score', ascending=False).head(self.params['top_n'])
        return result[['code', 'total_score', 'f_value', 'f_momentum', 'f_quality']]


# ============ 测试代码 ============

def test_multi_factor_strategy():
    """测试多因子策略"""
    strategy = MultiFactorStrategy(top_n=5)
    
    assert strategy.name == "MultiFactor"
    assert strategy.params['top_n'] == 5
    
    print("✅ 多因子策略基础测试通过")


def test_rebalance():
    """测试再平衡逻辑"""
    strategy = MultiFactorStrategy(top_n=3)
    
    # 构造测试数据
    data = pd.DataFrame({
        'code': [f'00000{i}.SZ' for i in range(1, 11)],
        'pe': [10, 20, 15, 25, 12, 18, 22, 16, 14, 19],
        'roe': [0.20, 0.10, 0.15, 0.08, 0.18, 0.12, 0.09, 0.16, 0.17, 0.11],
        'close': [100, 110, 105, 115, 102, 108, 112, 106, 104, 109]
    })
    
    result = strategy.rebalance(data)
    
    assert 'buy' in result
    assert 'sell' in result
    assert len(result['buy']) <= 3
    
    print(f"推荐买入：{result['buy']}")
    print("✅ 再平衡测试通过")


if __name__ == "__main__":
    test_multi_factor_strategy()
    test_rebalance()
    print("\n✅ 所有测试通过")
