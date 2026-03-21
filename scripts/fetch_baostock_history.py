#!/usr/bin/env python3
"""
使用 BaoStock 批量获取 A 股历史数据
功能：
1. 获取全市场股票代码列表
2. 批量下载历史 K 线数据（默认 1990 年至今）
3. 保存到 stock_system.db 的 stock_daily 表

用法：
    python fetch_baostock_history.py [--stocks 500] [--days 1000] [--test]
"""

import baostock as bs
import pandas as pd
import sqlite3
import os
import sys
import argparse
from datetime import datetime

# 数据库路径
DB_PATH = "/Volumes/SSD500/openclaw/stock-system/stock_system.db"

def create_table(conn):
    """创建 stock_daily 表"""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stock_daily (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_date TEXT NOT NULL,
            ts_code TEXT NOT NULL,
            stock_name TEXT,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume REAL,
            amount REAL,
            pe REAL,
            pb REAL,
            market_cap REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(trade_date, ts_code)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trade_date ON stock_daily(trade_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ts_code ON stock_daily(ts_code)")
    conn.commit()
    print("✅ 数据表创建完成")

def get_stock_list(conn, market='A'):
    """获取 A 股全部股票列表"""
    print("📋 正在获取 A 股股票列表...")
    
    # 查询股票基本资料
    stock_df = bs.query_stock_basic()
    
    if stock_df.error_code != '0':
        print(f"❌ 获取股票列表失败：{stock_df.error_msg}")
        return []
    
    stock_list = stock_df.get_data()
    
    if stock_list.empty:
        print("❌ 未获取到股票数据")
        return []
    
    # 过滤 A 股个股（type=1，排除指数 type=2）
    a_stocks = stock_list[stock_list['type'] == '1']
    
    print(f"✅ 获取到 {len(a_stocks)} 只 A 股股票")
    
    # 保存到临时表
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stock_list (
            ts_code TEXT PRIMARY KEY,
            stock_name TEXT,
            market TEXT,
            status TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    for _, row in a_stocks.iterrows():
        cursor.execute("""
            INSERT OR REPLACE INTO stock_list (ts_code, stock_name, market, status, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (row['code'], row['code_name'], row['code'].startswith('sh') and 'SH' or 'SZ', 
              row.get('status', '1'), datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
    
    conn.commit()
    return a_stocks['code'].tolist()

def fetch_history_data(ts_code, start_date='1990-01-01', end_date=None):
    """获取单只股票的历史 K 线数据"""
    if end_date is None:
        end_date = datetime.now().strftime('%Y-%m-%d')
    
    # 查询历史 K 线数据（ts_code 格式：sh.000001）
    # 注意：pe/pb 等指标需要单独 API 获取，这里先获取基础行情数据
    rs = bs.query_history_k_data_plus(
        ts_code,
        fields="date,open,high,low,close,volume,amount",
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="3"  # 不复权
    )
    
    if rs.error_code != '0':
        print(f"  ❌ {ts_code} 获取失败：{rs.error_msg}")
        return None
    
    data_df = rs.get_data()
    return data_df

def save_to_db(conn, ts_code, data_df):
    """保存数据到数据库"""
    if data_df is None or data_df.empty:
        return 0
    
    cursor = conn.cursor()
    count = 0
    
    for _, row in data_df.iterrows():
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO stock_daily 
                (trade_date, ts_code, stock_name, open, high, low, close, volume, amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row['date'],
                ts_code,
                ts_code[2:],  # 简单使用代码后几位作为名称
                float(row['open']) if row['open'] else None,
                float(row['high']) if row['high'] else None,
                float(row['low']) if row['low'] else None,
                float(row['close']) if row['close'] else None,
                float(row['volume']) if row['volume'] else None,
                float(row['amount']) if row['amount'] else None
            ))
            count += 1
        except Exception as e:
            print(f"    ⚠️ 保存 {row['date']} 失败：{e}")
            continue
    
    conn.commit()
    return count

def main():
    parser = argparse.ArgumentParser(description='BaoStock 批量获取 A 股历史数据')
    parser.add_argument('--stocks', type=int, default=0, help='测试模式：只获取前 N 只股票')
    parser.add_argument('--days', type=int, default=0, help='测试模式：只获取最近 N 天数据')
    parser.add_argument('--test', action='store_true', help='测试模式：只获取 1 只股票 1 天数据')
    args = parser.parse_args()
    
    # 计算日期范围
    end_date = datetime.now().strftime('%Y-%m-%d')
    if args.test:
        start_date = end_date
        test_stocks = 1
    elif args.days > 0:
        from datetime import timedelta
        start_date = (datetime.now() - timedelta(days=args.days)).strftime('%Y-%m-%d')
        test_stocks = args.stocks if args.stocks > 0 else 0
    else:
        start_date = '1990-01-01'
        test_stocks = args.stocks if args.stocks > 0 else 0
    
    print(f"🚀 BaoStock 历史数据下载")
    print(f"📅 日期范围：{start_date} 至 {end_date}")
    if test_stocks > 0:
        print(f"🧪 测试模式：仅处理前 {test_stocks} 只股票")
    
    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    create_table(conn)
    
    # 登录 BaoStock
    print("🔐 登录 BaoStock...")
    lg = bs.login()
    if lg.error_code != '0':
        print(f"❌ 登录失败：{lg.error_msg}")
        return
    print("✅ 登录成功")
    
    try:
        # 获取股票列表
        stock_list = get_stock_list(conn)
        
        if not stock_list:
            print("❌ 未获取到股票列表")
            return
        
        # 测试模式限制股票数量
        if test_stocks > 0:
            stock_list = stock_list[:test_stocks]
        
        # 批量下载数据
        total_records = 0
        success_count = 0
        fail_count = 0
        
        print(f"📥 开始下载 {len(stock_list)} 只股票的历史数据...")
        
        for i, ts_code in enumerate(stock_list):
            try:
                # 获取历史数据
                data_df = fetch_history_data(ts_code, start_date, end_date)
                
                if data_df is not None and not data_df.empty:
                    # 保存到数据库
                    count = save_to_db(conn, ts_code, data_df)
                    total_records += count
                    success_count += 1
                    
                    if (i + 1) % 10 == 0 or (i + 1) == len(stock_list):
                        print(f"  进度：{i+1}/{len(stock_list)} | 成功：{success_count} | 记录数：{total_records}")
                else:
                    fail_count += 1
                    print(f"  ⚠️ {ts_code} 无数据")
                
            except Exception as e:
                fail_count += 1
                print(f"  ❌ {ts_code} 处理失败：{e}")
                continue
        
        # 统计结果
        print("\n" + "="*50)
        print("✅ 下载完成！")
        print(f"📊 统计:")
        print(f"  - 股票总数：{len(stock_list)}")
        print(f"  - 成功：{success_count}")
        print(f"  - 失败：{fail_count}")
        print(f"  - 总记录数：{total_records}")
        print("="*50)
        
    finally:
        # 登出
        bs.logout()
        conn.close()
        print("👋 已退出 BaoStock")

if __name__ == '__main__':
    main()
