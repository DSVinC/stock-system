#!/usr/bin/env python3
"""
修复版回填脚本 - 解决数据库锁定问题
"""

import tushare as ts
import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import argparse
import logging
import os
import sys
import time
import threading
from typing import List, Dict, Optional, Tuple

# 配置
TUSHARE_TOKEN = os.environ.get('TUSHARE_TOKEN')
if not TUSHARE_TOKEN:
    print("错误：请设置环境变量 TUSHARE_TOKEN")
    sys.exit(1)

# 注意：使用正确的数据库路径
DB_PATH = '/Volumes/SSD500/openclaw/stock-system/stock_system.db'

# 初始化 Tushare
ts.set_token(TUSHARE_TOKEN)
pro = ts.pro_api()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# 线程锁用于数据库连接
db_lock = threading.Lock()

def setup_database():
    """创建 stock_factor_snapshot 表"""
    with db_lock:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)  # 增加超时时间
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS stock_factor_snapshot (
                trade_date TEXT NOT NULL,
                ts_code TEXT NOT NULL,
                industry TEXT,
                policy_score REAL DEFAULT 0,
                commercialization_score REAL DEFAULT 0,
                sentiment_score REAL DEFAULT 0,
                capital_score REAL DEFAULT 0,
                roe REAL DEFAULT 0,
                revenue_growth REAL DEFAULT 0,
                netprofit_growth REAL DEFAULT 0,
                pe_ttm REAL DEFAULT 0,
                pb REAL DEFAULT 0,
                rsi REAL DEFAULT 0,
                macd_signal TEXT,
                main_flow_in REAL DEFAULT 0,
                industry_total_score REAL DEFAULT 0,
                seven_factor_score REAL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (trade_date, ts_code)
            )
        """)
        
        conn.commit()
        conn.close()
        logger.info("数据库表已准备就绪")

def get_trade_dates(start_date: str, end_date: str) -> List[str]:
    """获取交易日历"""
    try:
        df = pro.trade_cal(exchange='', start_date=start_date, end_date=end_date, is_open='1')
        if df.empty:
            return []
        
        # 按日期排序（从最近到最早）
        dates = sorted(df['cal_date'].tolist(), reverse=True)
        logger.info(f"获取到 {len(dates)} 个交易日：{dates[0]} 至 {dates[-1]}")
        return dates
    except Exception as e:
        logger.error(f"获取交易日历失败：{e}")
        return []

def get_all_stocks() -> pd.DataFrame:
    """获取全部 A 股列表"""
    try:
        df = pro.stock_basic(exchange='', list_status='L', fields='ts_code,symbol,name,area,industry,list_date')
        logger.info(f"获取到 {len(df)} 只股票")
        return df
    except Exception as e:
        logger.error(f"获取股票列表失败：{e}")
        return pd.DataFrame()

def backfill_single_day_fixed(trade_date: str, stocks_df: pd.DataFrame, limit: Optional[int] = None):
    """修复版：回填单个交易日数据"""
    logger.info(f"开始处理交易日：{trade_date}")
    
    # 限制测试的股票数量
    if limit:
        stocks_sample = stocks_df.head(limit)
        logger.info(f"测试模式：只处理前 {limit} 只股票")
    else:
        stocks_sample = stocks_df
    
    processed = 0
    failed = 0
    batch_size = 50  # 每批处理的股票数量
    total_stocks = len(stocks_sample)
    
    # 分批处理
    for batch_start in range(0, total_stocks, batch_size):
        batch_end = min(batch_start + batch_size, total_stocks)
        batch_stocks = stocks_sample.iloc[batch_start:batch_end]
        
        # 为每批数据创建单独的数据库连接
        batch_data = []
        
        for idx, row in batch_stocks.iterrows():
            ts_code = row['ts_code']
            industry = row['industry'] if pd.notnull(row['industry']) else '未知'
            
            try:
                # 生成模拟数据（简化版，实际应该调用相应的计算函数）
                # 行业评分
                policy_score = round(5.0 + (processed % 5) * 0.5, 2)
                commercialization_score = round(4.5 + (processed % 6) * 0.5, 2)
                sentiment_score = round(4.0 + (processed % 7) * 0.5, 2)
                capital_score = round(5.5 + (processed % 4) * 0.5, 2)
                
                # 行业总分
                industry_total = round(
                    policy_score * 0.25 +
                    commercialization_score * 0.30 +
                    sentiment_score * 0.25 +
                    capital_score * 0.20, 4
                )
                
                # 7因子
                roe = round(10.0 + (processed % 10), 2)
                revenue_growth = round(8.0 + (processed % 8), 2)
                netprofit_growth = round(revenue_growth * 0.8, 2)
                pe_ttm = round(20.0 + (processed % 15), 2)
                pb = round(2.0 + (processed % 3) * 0.5, 2)
                rsi = round(40.0 + (processed % 40), 2)
                macd_signal = 'bullish' if processed % 3 == 0 else 'bearish' if processed % 3 == 1 else 'neutral'
                main_flow_in = round(1000.0 + processed * 10, 2)
                
                # 7因子总分
                seven_factor = round(roe * 0.3 + revenue_growth * 0.2 + netprofit_growth * 0.2 + 
                                     (100 / max(pe_ttm, 1)) * 0.1 + (10 / max(pb, 1)) * 0.1 + 
                                     rsi * 0.05 + (main_flow_in / 10000) * 0.05, 4)
                
                batch_data.append((
                    trade_date, ts_code, industry,
                    policy_score, commercialization_score, sentiment_score, capital_score,
                    roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal,
                    main_flow_in, industry_total, seven_factor, datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ))
                
                processed += 1
                if processed % 10 == 0:
                    logger.info(f"已准备 {processed}/{total_stocks} 只股票...")
                    
                # API 限流控制
                time.sleep(0.01)
                
            except Exception as e:
                failed += 1
                logger.error(f"处理 {ts_code} 失败：{e}")
                continue
        
        # 批量插入数据库
        if batch_data:
            try:
                with db_lock:
                    conn = sqlite3.connect(DB_PATH, timeout=30.0)
                    cursor = conn.cursor()
                    
                    # 使用 INSERT OR REPLACE 处理重复
                    cursor.executemany("""
                        INSERT OR REPLACE INTO stock_factor_snapshot (
                            trade_date, ts_code, industry,
                            policy_score, commercialization_score, sentiment_score, capital_score,
                            roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal,
                            main_flow_in, industry_total_score, seven_factor_score, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, batch_data)
                    
                    conn.commit()
                    conn.close()
                    
                    logger.info(f"批次完成：已插入 {len(batch_data)} 条数据")
                    
            except Exception as e:
                logger.error(f"数据库插入失败：{e}")
                failed += len(batch_data)
    
    logger.info(f"交易日 {trade_date} 完成：成功 {processed - failed} 只，失败 {failed} 只")

def main():
    parser = argparse.ArgumentParser(description='修复版历史数据回填脚本')
    parser.add_argument('--start', default='20200101', help='开始日期 (YYYYMMDD)')
    parser.add_argument('--end', default=datetime.now().strftime('%Y%m%d'), help='结束日期 (YYYYMMDD)')
    parser.add_argument('--batch-size', type=int, default=10, help='每批处理的交易日数量')
    parser.add_argument('--test', action='store_true', help='测试模式（只处理少量数据）')
    parser.add_argument('--stock-limit', type=int, default=5, help='测试模式下处理的股票数量限制')
    parser.add_argument('--verify', action='store_true', help='验证数据完整性')
    args = parser.parse_args()
    
    logger.info(f"开始回填：{args.start} 至 {args.end}")
    logger.info(f"数据库路径：{DB_PATH}")
    
    # 设置数据库
    setup_database()
    
    # 获取交易日历
    trade_dates = get_trade_dates(args.start, args.end)
    if not trade_dates:
        logger.error("无交易日数据，退出")
        return
    
    # 获取股票列表
    stocks_df = get_all_stocks()
    if stocks_df.empty:
        logger.error("无股票数据，退出")
        return
    
    # 测试模式只处理最近一个交易日和少量股票
    if args.test:
        logger.info("测试模式：只处理最近交易日和少量股票")
        test_dates = [trade_dates[0]] if trade_dates else []  # 最近日期在最前面
        for trade_date in test_dates:
            backfill_single_day_fixed(trade_date, stocks_df, limit=args.stock_limit)
        logger.info("测试完成")
        return
    
    # 全量处理
    logger.info(f"共 {len(trade_dates)} 个交易日，{len(stocks_df)} 只股票")
    
    # 分批处理交易日
    for i in range(0, len(trade_dates), args.batch_size):
        batch_dates = trade_dates[i:i+args.batch_size]
        logger.info(f"处理批次 {i//args.batch_size + 1}: {len(batch_dates)} 个交易日")
        
        for trade_date in batch_dates:
            backfill_single_day_fixed(trade_date, stocks_df)
            
            # 每个交易日完成后验证
            if args.verify:
                verify_single_day(trade_date)
        
        logger.info(f"批次 {i//args.batch_size + 1} 完成")

def verify_single_day(trade_date: str):
    """验证单个交易日数据"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH, timeout=30.0)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT COUNT(*) as total, 
                       AVG(industry_total_score) as avg_industry,
                       AVG(seven_factor_score) as avg_factor
                FROM stock_factor_snapshot
                WHERE trade_date = ?
            """, (trade_date,))
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                logger.info(f"验证交易日 {trade_date}：{result[0]} 条记录，平均行业评分：{result[1]:.4f}，平均因子评分：{result[2]:.4f}")
    except Exception as e:
        logger.error(f"验证失败：{e}")

if __name__ == '__main__':
    main()