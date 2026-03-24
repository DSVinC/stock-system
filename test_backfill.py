#!/usr/bin/env python3
"""
简化版回填测试脚本
"""

import tushare as ts
import sqlite3
import pandas as pd
import os
import sys
import logging
from datetime import datetime

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

def test_tushare_connection():
    """测试 Tushare 连接"""
    try:
        # 获取今日日期
        today = datetime.now().strftime('%Y%m%d')
        
        # 测试获取交易日历
        trade_dates = pro.trade_cal(exchange='', start_date='20260320', end_date=today, is_open='1')
        logger.info(f"获取到交易日历: {len(trade_dates)} 个交易日")
        print(f"最近的交易日: {trade_dates.iloc[0]['cal_date']} to {trade_dates.iloc[-1]['cal_date']}")
        
        # 测试获取股票列表
        stocks = pro.stock_basic(exchange='', list_status='L', fields='ts_code,name,industry')
        logger.info(f"获取到股票列表: {len(stocks)} 只股票")
        print(f"前3只股票: {stocks[['ts_code', 'name']].head(3).to_string()}")
        
        return True
    except Exception as e:
        logger.error(f"Tushare 连接测试失败: {e}")
        return False

def test_database_connection():
    """测试数据库连接"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_factor_snapshot'")
        table_exists = cursor.fetchone() is not None
        
        if table_exists:
            # 获取表结构
            cursor.execute("PRAGMA table_info(stock_factor_snapshot)")
            columns = cursor.fetchall()
            logger.info(f"表 stock_factor_snapshot 存在，有 {len(columns)} 列")
            print("表结构:")
            for col in columns:
                print(f"  {col[1]} ({col[2]})")
        else:
            logger.warning(f"表 stock_factor_snapshot 不存在")
        
        conn.close()
        return True
    except Exception as e:
        logger.error(f"数据库连接测试失败: {e}")
        return False

def test_small_backfill():
    """小规模回填测试"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 先清理可能存在的测试数据
        cursor.execute("DELETE FROM stock_factor_snapshot WHERE trade_date IN ('20260323', '20260324')")
        conn.commit()
        logger.info("已清理测试数据")
        
        # 插入少量测试数据
        test_data = [
            ('20260324', '000001.SZ', '银行', 7.5, 6.8, 5.9, 6.5, 25.3, 15.2, 18.5, 22.5, 4.2, 55.0, 'bullish', 1000.0, 6.8, 7.1, datetime.now().strftime('%Y-%m-%d %H:%M:%S')),
            ('20260324', '600519.SH', '白酒', 8.7, 8.5, 7.2, 9.5, 30.1, 12.5, 15.8, 35.2, 8.5, 60.0, 'bullish', 2800.0, 8.5, 8.8, datetime.now().strftime('%Y-%m-%d %H:%M:%S')),
            ('20260323', '000001.SZ', '银行', 7.4, 6.7, 5.8, 6.4, 25.1, 15.1, 18.3, 22.3, 4.1, 54.5, 'bullish', 980.0, 6.7, 7.0, datetime.now().strftime('%Y-%m-%d %H:%M:%S')),
            ('20260323', '600519.SH', '白酒', 8.6, 8.4, 7.1, 9.4, 29.8, 12.3, 15.6, 34.8, 8.3, 59.5, 'bullish', 2750.0, 8.4, 8.7, datetime.now().strftime('%Y-%m-%d %H:%M:%S')),
        ]
        
        cursor.executemany("""
            INSERT INTO stock_factor_snapshot 
            (trade_date, ts_code, industry, policy_score, commercialization_score, sentiment_score, 
             capital_score, roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal, 
             main_flow_in, industry_total_score, seven_factor_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, test_data)
        
        conn.commit()
        logger.info(f"插入了 {len(test_data)} 条测试数据")
        
        # 验证数据
        cursor.execute("SELECT trade_date, COUNT(*) as count FROM stock_factor_snapshot GROUP BY trade_date ORDER BY trade_date DESC")
        results = cursor.fetchall()
        
        print("测试数据验证:")
        for date, count in results:
            print(f"  交易日 {date}: {count} 条记录")
        
        cursor.execute("SELECT COUNT(*) as total FROM stock_factor_snapshot")
        total = cursor.fetchone()[0]
        print(f"  总计: {total} 条记录")
        
        conn.close()
        return True
    except Exception as e:
        logger.error(f"小规模回填测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("=== 回填测试开始 ===")
    
    # 测试 Tushare 连接
    print("1. 测试 Tushare 连接...")
    if not test_tushare_connection():
        print("Tushare 连接测试失败")
        sys.exit(1)
    
    # 测试数据库连接
    print("\n2. 测试数据库连接...")
    if not test_database_connection():
        print("数据库连接测试失败")
        sys.exit(1)
    
    # 测试小规模回填
    print("\n3. 测试小规模回填...")
    if test_small_backfill():
        print("✅ 所有测试通过")
    else:
        print("❌ 小规模回填测试失败")