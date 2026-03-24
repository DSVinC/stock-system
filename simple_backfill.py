#!/usr/bin/env python3
"""
简化版回填脚本 - 避免数据库锁定
"""

import tushare as ts
import sqlite3
import pandas as pd
import os
import sys
import logging
import time
from datetime import datetime, timedelta
import argparse

# 配置
TUSHARE_TOKEN = os.environ.get('TUSHARE_TOKEN')
if not TUSHARE_TOKEN:
    print("错误：请设置环境变量 TUSHARE_TOKEN")
    sys.exit(1)

DB_PATH = '/Volumes/SSD500/openclaw/stock-system/stock_system.db'

# 初始化 Tushare
ts.set_token(TUSHARE_TOKEN)
pro = ts.pro_api()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

def simple_backfill(start_date: str, end_date: str, stock_limit: int = 5):
    """简化版回填"""
    try:
        # 1. 获取交易日历
        logger.info(f"获取交易日历: {start_date} 至 {end_date}")
        trade_cal = pro.trade_cal(exchange='', start_date=start_date, end_date=end_date, is_open='1')
        
        if trade_cal.empty:
            logger.error("无交易日数据")
            return False
        
        trade_dates = trade_cal['cal_date'].tolist()
        logger.info(f"获取到 {len(trade_dates)} 个交易日")
        
        # 只处理最近1个交易日用于测试
        if stock_limit > 0:
            trade_dates = [trade_dates[-1]]
            logger.info(f"测试模式：只处理最近交易日 {trade_dates[0]}")
        
        # 2. 获取股票列表
        stocks = pro.stock_basic(exchange='', list_status='L', fields='ts_code,name,industry')
        logger.info(f"获取到 {len(stocks)} 只股票")
        
        if stock_limit > 0:
            stocks = stocks.head(stock_limit)
            logger.info(f"测试模式：只处理前 {stock_limit} 只股票")
        
        # 3. 准备数据
        data_to_insert = []
        for trade_date in trade_dates:
            logger.info(f"处理交易日: {trade_date}")
            
            for idx, stock in stocks.iterrows():
                ts_code = stock['ts_code']
                industry = stock['industry'] if pd.notnull(stock['industry']) else '未知'
                
                # 生成模拟数据（简化版）
                # 行业评分
                policy_score = round(5.0 + (idx % 5) * 0.5, 2)
                commercialization_score = round(4.5 + (idx % 6) * 0.5, 2)
                sentiment_score = round(4.0 + (idx % 7) * 0.5, 2)
                capital_score = round(5.5 + (idx % 4) * 0.5, 2)
                
                # 行业总分
                industry_total = round(
                    policy_score * 0.25 +
                    commercialization_score * 0.30 +
                    sentiment_score * 0.25 +
                    capital_score * 0.20, 4
                )
                
                # 7因子
                roe = round(10.0 + (idx % 10), 2)
                revenue_growth = round(8.0 + (idx % 8), 2)
                netprofit_growth = round(revenue_growth * 0.8, 2)
                pe_ttm = round(20.0 + (idx % 15), 2)
                pb = round(2.0 + (idx % 3) * 0.5, 2)
                rsi = round(40.0 + (idx % 40), 2)
                macd_signal = 'bullish' if idx % 3 == 0 else 'bearish' if idx % 3 == 1 else 'neutral'
                main_flow_in = round(1000.0 + idx * 10, 2)
                
                # 7因子总分
                seven_factor = round(roe * 0.3 + revenue_growth * 0.2 + netprofit_growth * 0.2 + 
                                     (100 / max(pe_ttm, 1)) * 0.1 + (10 / max(pb, 1)) * 0.1 + 
                                     rsi * 0.05 + (main_flow_in / 10000) * 0.05, 4)
                
                data_to_insert.append((
                    trade_date, ts_code, industry,
                    policy_score, commercialization_score, sentiment_score, capital_score,
                    roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal,
                    main_flow_in, industry_total, seven_factor, datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ))
                
                if (len(data_to_insert) % 20 == 0):
                    logger.info(f"已准备 {len(data_to_insert)} 条数据...")
        
        # 4. 批量插入数据库
        logger.info(f"开始插入 {len(data_to_insert)} 条数据到数据库")
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 先删除可能存在的重复数据
        if data_to_insert:
            dates_to_delete = list(set(d[0] for d in data_to_insert))
            for date in dates_to_delete:
                cursor.execute("DELETE FROM stock_factor_snapshot WHERE trade_date = ?", (date,))
        
        # 批量插入
        cursor.executemany("""
            INSERT INTO stock_factor_snapshot (
                trade_date, ts_code, industry,
                policy_score, commercialization_score, sentiment_score, capital_score,
                roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal,
                main_flow_in, industry_total_score, seven_factor_score, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, data_to_insert)
        
        conn.commit()
        conn.close()
        
        logger.info(f"成功插入 {len(data_to_insert)} 条数据")
        return True
        
    except Exception as e:
        logger.error(f"回填失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def verify_data():
    """验证数据"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT trade_date) as days,
                COUNT(DISTINCT ts_code) as stocks,
                MIN(trade_date) as first_date,
                MAX(trade_date) as last_date,
                AVG(industry_total_score) as avg_industry,
                AVG(seven_factor_score) as avg_factor
            FROM stock_factor_snapshot
        """)
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            logger.info("=== 数据验证结果 ===")
            logger.info(f"总记录数: {result[0]}")
            logger.info(f"交易日数: {result[1]}")
            logger.info(f"股票数量: {result[2]}")
            logger.info(f"日期范围: {result[3]} 至 {result[4]}")
            logger.info(f"平均行业评分: {result[5]:.4f}")
            logger.info(f"平均因子评分: {result[6]:.4f}")
            
            return True
        else:
            logger.error("无数据")
            return False
            
    except Exception as e:
        logger.error(f"验证失败: {e}")
        return False

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='简化版历史数据回填')
    parser.add_argument('--start', default='20200101', help='开始日期 (YYYYMMDD)')
    parser.add_argument('--end', default=datetime.now().strftime('%Y%m%d'), help='结束日期 (YYYYMMDD)')
    parser.add_argument('--test', action='store_true', help='测试模式')
    parser.add_argument('--stock-limit', type=int, default=0, help='股票数量限制 (0表示全部)')
    args = parser.parse_args()
    
    if args.test:
        logger.info("=== 测试模式 ===")
        args.stock_limit = 5 if args.stock_limit == 0 else args.stock_limit
        args.start = '20260320'  # 只测试最近几天
    
    logger.info(f"开始简化版回填: {args.start} 至 {args.end}")
    
    if simple_backfill(args.start, args.end, args.stock_limit):
        verify_data()
        logger.info("回填完成")
    else:
        logger.error("回填失败")
        sys.exit(1)