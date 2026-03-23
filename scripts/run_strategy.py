#!/usr/bin/env python3
"""
策略执行脚本

用法:
    python scripts/run_strategy.py --strategy dual_ma --config config/strategies.json
    python scripts/run_strategy.py --strategy multi_factor --top-n 10
"""

import argparse
import json
import sys
import os
from datetime import datetime

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from strategies import DualMAStrategy, MultiFactorStrategy


def load_strategy_config(config_path: str) -> dict:
    """加载策略配置文件"""
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_market_data() -> pd.DataFrame:
    """
    加载市场数据
    
    实际使用时应从数据库或 API 加载
    这里使用模拟数据用于测试
    """
    # 模拟数据
    dates = pd.date_range('2024-01-01', periods=60, freq='D')
    
    data_list = []
    for i in range(1, 11):  # 10 只股票
        code = f'00000{i}.SZ'
        base_price = 100 + i * 10
        
        # 生成随机价格序列
        import random
        random.seed(i)
        prices = [base_price]
        for _ in range(59):
            change = random.uniform(-0.05, 0.05)
            prices.append(prices[-1] * (1 + change))
        
        for j, date in enumerate(dates):
            data_list.append({
                'date': date,
                'code': code,
                'close': prices[j],
                'pre_close': prices[j-1] if j > 0 else prices[j],
                'pe': 10 + i * 2,
                'roe': 0.1 + i * 0.02
            })
    
    return pd.DataFrame(data_list)


def run_dual_ma_strategy(config: dict) -> pd.DataFrame:
    """运行双均线策略"""
    params = config['strategies']['dual_ma']['parameters']
    strategy = DualMAStrategy(
        fast_period=params['fast_period'],
        slow_period=params['slow_period']
    )
    
    print(f"📊 运行双均线策略 (快线={params['fast_period']}, 慢线={params['slow_period']})")
    
    # 加载数据
    data = load_market_data()
    
    # 生成信号
    signals = strategy.generate_signals(data)
    
    print(f"✅ 生成 {len(signals)} 个交易信号")
    
    return signals


def run_multi_factor_strategy(config: dict) -> pd.DataFrame:
    """运行多因子策略"""
    params = config['strategies']['multi_factor']['parameters']
    strategy = MultiFactorStrategy(
        top_n=params['top_n'],
        factor_weights=params['factor_weights']
    )
    
    print(f"📊 运行多因子策略 (Top{params['top_n']}, 权重={params['factor_weights']})")
    
    # 加载数据
    data = load_market_data()
    
    # 获取最新日期的推荐股票
    latest_date = data['date'].max()
    latest_data = data[data['date'] == latest_date]
    
    top_stocks = strategy.get_top_stocks(latest_data)
    
    print(f"✅ 推荐 {len(top_stocks)} 只股票")
    print(top_stocks.to_string())
    
    return top_stocks


def export_signals(signals: pd.DataFrame, output_path: str):
    """导出信号到 CSV"""
    signals.to_csv(output_path, index=False, encoding='utf-8-sig')
    print(f"📁 信号已导出到：{output_path}")


def export_signals_to_db(signals: pd.DataFrame, db_path: str, strategy_id: str):
    """将信号导出到 SQLite 数据库（TASK_BACKTEST_001）"""
    import sqlite3
    
    # 连接数据库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 创建表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS strategy_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            strategy_id TEXT NOT NULL,
            date TEXT NOT NULL,
            code TEXT NOT NULL,
            signal TEXT NOT NULL,
            qty INTEGER DEFAULT 0,
            price REAL NOT NULL,
            score REAL,
            created_at TEXT NOT NULL
        )
    ''')
    
    # 插入数据
    created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    inserted = 0
    
    for _, row in signals.iterrows():
        try:
            # 转换日期为字符串
            date_val = row.get('date', datetime.now())
            if hasattr(date_val, 'strftime'):
                date_str = date_val.strftime('%Y-%m-%d')
            else:
                date_str = str(date_val)
            
            cursor.execute('''
                INSERT INTO strategy_signals (strategy_id, date, code, signal, qty, price, score, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                strategy_id,
                date_str,
                str(row.get('code', row.get('ts_code', 'UNKNOWN'))),
                str(row.get('signal', 'HOLD')),
                int(row.get('qty', row.get('position', 0))),
                float(row.get('price', row.get('close', 0))),
                float(row.get('score', 0)) if row.get('score') is not None else None,
                created_at
            ))
            inserted += 1
        except Exception as e:
            print(f"⚠️ 插入失败：{e}")
    
    conn.commit()
    conn.close()
    print(f"📊 已导入 {inserted} 条信号到数据库：{db_path}")


def main():
    parser = argparse.ArgumentParser(description='策略执行脚本')
    parser.add_argument('--strategy', type=str, required=True,
                        choices=['dual_ma', 'multi_factor'],
                        help='策略名称')
    parser.add_argument('--config', type=str, default='config/strategies.json',
                        help='配置文件路径')
    parser.add_argument('--output', type=str, default=None,
                        help='输出文件路径')
    parser.add_argument('--top-n', type=int, default=None,
                        help='多因子策略选股数量（覆盖配置）')
    # TASK_BACKTEST_001: 数据库导出参数
    parser.add_argument('--db-export', action='store_true',
                        help='启用数据库导出')
    parser.add_argument('--db-path', type=str, default=None,
                        help='数据库路径')
    parser.add_argument('--strategy-id', type=str, default=None,
                        help='策略 ID')
    
    args = parser.parse_args()
    
    # 加载配置
    config = load_strategy_config(args.config)
    
    print(f"🚀 策略执行开始 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"📁 配置文件：{args.config}")
    print()
    
    # 运行策略
    if args.strategy == 'dual_ma':
        signals = run_dual_ma_strategy(config)
    elif args.strategy == 'multi_factor':
        signals = run_multi_factor_strategy(config)
    else:
        print(f"❌ 未知策略：{args.strategy}")
        sys.exit(1)
    
    # 导出信号
    if args.output:
        export_signals(signals, args.output)
    
    # TASK_BACKTEST_001: 数据库导出
    if args.db_export:
        if not args.db_path:
            print("❌ 数据库导出需要指定 --db-path")
            sys.exit(1)
        if not args.strategy_id:
            print("❌ 数据库导出需要指定 --strategy-id")
            sys.exit(1)
        export_signals_to_db(signals, args.db_path, args.strategy_id)
    
    print()
    print(f"✅ 策略执行完成 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()
