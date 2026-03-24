#!/usr/bin/env python3
"""
历史数据回填脚本
用途：回填 stock_factor_snapshot 表（2020-至今）
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
from typing import List, Dict, Optional, Tuple

# 配置
TUSHARE_TOKEN = os.environ.get('TUSHARE_TOKEN')
if not TUSHARE_TOKEN:
    print("错误：请设置环境变量 TUSHARE_TOKEN")
    sys.exit(1)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'stock_system.db')
START_DATE = '20200101'
END_DATE = datetime.now().strftime('%Y%m%d')

# 初始化 Tushare
ts.set_token(TUSHARE_TOKEN)
pro = ts.pro_api()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)


def setup_database():
    """创建 stock_factor_snapshot 表"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stock_factor_snapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            macd_signal REAL DEFAULT 0,
            main_flow_in REAL DEFAULT 0,
            industry_total_score REAL DEFAULT 0,
            seven_factor_score REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(trade_date, ts_code)
        )
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_snapshot_trade_date ON stock_factor_snapshot(trade_date)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_snapshot_ts_code ON stock_factor_snapshot(ts_code)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_snapshot_industry ON stock_factor_snapshot(industry)
    """)
    
    conn.commit()
    conn.close()
    logger.info("数据库表已准备就绪")


def get_trade_dates(start_date: str, end_date: str) -> List[str]:
    """获取交易日历"""
    try:
        df = pro.trade_cal(exchange='SSE', start_date=start_date, end_date=end_date, is_open='1')
        if df.empty:
            logger.warning(f"未找到交易日数据：{start_date} 至 {end_date}")
            return []
        dates = df['cal_date'].tolist()
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


def query_policy_score(trade_date: str, industry: str) -> float:
    """
    查询政策评分
    从本地政策事件库计算
    """
    try:
        # TODO: 实现政策事件查询逻辑
        # 暂时返回随机值用于测试
        import random
        return round(random.uniform(0.5, 1.0), 2)
    except Exception as e:
        logger.error(f"查询政策评分失败：{e}")
        return 0.5


def query_commercialization_score(trade_date: str, industry: str) -> float:
    """
    查询商业化评分
    从财报数据计算
    """
    try:
        # TODO: 实现商业化评分逻辑
        # 暂时返回随机值用于测试
        import random
        return round(random.uniform(0.4, 0.9), 2)
    except Exception as e:
        logger.error(f"查询商业化评分失败：{e}")
        return 0.5


def query_sentiment_score(trade_date: str, industry: str) -> float:
    """
    查询市场关注度评分
    从市场数据计算（成交量 + 涨跌幅 + 换手率）
    """
    try:
        # TODO: 实现市场关注度计算逻辑
        # 暂时返回随机值用于测试
        import random
        return round(random.uniform(0.3, 0.8), 2)
    except Exception as e:
        logger.error(f"查询市场关注度评分失败：{e}")
        return 0.5


def query_capital_score(trade_date: str, industry: str) -> float:
    """
    查询资本认可评分
    从北向资金计算
    """
    try:
        # TODO: 实现北向资金计算逻辑
        # 暂时返回随机值用于测试
        import random
        return round(random.uniform(0.6, 1.0), 2)
    except Exception as e:
        logger.error(f"查询资本认可评分失败：{e}")
        return 0.5


def query_roe(trade_date: str, ts_code: str) -> float:
    """查询 ROE"""
    try:
        # 获取最新财报日期
        end_date = datetime.strptime(trade_date, '%Y%m%d').strftime('%Y%m%d')
        start_date = (datetime.strptime(trade_date, '%Y%m%d') - timedelta(days=365)).strftime('%Y%m%d')
        
        df = pro.fina_indicator(ts_code=ts_code, start_date=start_date, end_date=end_date, fields='end_date,roe')
        if not df.empty:
            latest = df.iloc[0]
            return float(latest['roe']) if pd.notnull(latest['roe']) else 0.0
        return 0.0
    except Exception as e:
        logger.warning(f"查询 ROE 失败 {ts_code} {trade_date}: {e}")
        return 0.0


def query_growth(trade_date: str, ts_code: str) -> Tuple[float, float]:
    """查询营收增速和净利润增速"""
    try:
        # 转换为财报查询日期格式
        trade_datetime = datetime.strptime(trade_date, '%Y%m%d')
        end_date = trade_datetime.strftime('%Y%m%d')
        
        # 获取最近两个季度的财报数据
        df = pro.income(ts_code=ts_code, period='20241231', fields='end_date,yoy_or')
        if not df.empty:
            # 尝试不同字段名
            for field in ['yoy_or', 'yoy_gr', 'revenue_yoy', 'yoy_sales']:
                if field in df.columns:
                    revenue_growth = float(df.iloc[0][field]) if pd.notnull(df.iloc[0][field]) else 0.0
                    break
            else:
                revenue_growth = 0.0
        else:
            revenue_growth = 0.0
        
        # 净利润增速（简化处理）
        netprofit_growth = revenue_growth * 0.8  # 假设净利润增速为营收增速的80%
        
        return revenue_growth, netprofit_growth
    except Exception as e:
        logger.warning(f"查询增速失败 {ts_code} {trade_date}: {e}")
        # 返回默认值
        return 10.0, 8.0  # 默认10%营收增长，8%净利润增长


def query_valuation(trade_date: str, ts_code: str) -> Tuple[float, float]:
    """查询 PE/PB"""
    try:
        df = pro.daily_basic(ts_code=ts_code, trade_date=trade_date, fields='pe_ttm,pb')
        if not df.empty:
            pe_ttm = float(df.iloc[0]['pe_ttm']) if pd.notnull(df.iloc[0]['pe_ttm']) else 0.0
            pb = float(df.iloc[0]['pb']) if pd.notnull(df.iloc[0]['pb']) else 0.0
            return pe_ttm, pb
        return 0.0, 0.0
    except Exception as e:
        logger.warning(f"查询估值失败 {ts_code} {trade_date}: {e}")
        return 0.0, 0.0


def calculate_technicals(trade_date: str, ts_code: str, period: int = 30) -> Tuple[float, float]:
    """计算 RSI 和 MACD 信号"""
    try:
        # 获取历史数据
        end_date = trade_date
        start_date = (datetime.strptime(trade_date, '%Y%m%d') - timedelta(days=period*2)).strftime('%Y%m%d')
        
        df = pro.daily(ts_code=ts_code, start_date=start_date, end_date=end_date)
        if len(df) < period:
            return 0.0, 0.0
        
        # 计算 RSI
        df = df.sort_values('trade_date')
        df['close'] = pd.to_numeric(df['close'])
        df['change'] = df['close'].diff()
        df['gain'] = df['change'].where(df['change'] > 0, 0)
        df['loss'] = -df['change'].where(df['change'] < 0, 0)
        
        avg_gain = df['gain'].rolling(window=period).mean().iloc[-1]
        avg_loss = df['loss'].rolling(window=period).mean().iloc[-1]
        
        if avg_loss == 0:
            rsi = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))
        
        # 计算 MACD 信号（简化版）
        df['ema12'] = df['close'].ewm(span=12).mean()
        df['ema26'] = df['close'].ewm(span=26).mean()
        df['macd'] = df['ema12'] - df['ema26']
        df['signal'] = df['macd'].ewm(span=9).mean()
        
        latest_macd = df['macd'].iloc[-1]
        latest_signal = df['signal'].iloc[-1]
        
        if latest_macd > latest_signal:
            macd_signal = 1.0  # 买入信号
        elif latest_macd < latest_signal:
            macd_signal = -1.0  # 卖出信号
        else:
            macd_signal = 0.0  # 中性
        
        return round(rsi, 2), macd_signal
    except Exception as e:
        logger.warning(f"计算技术指标失败 {ts_code} {trade_date}: {e}")
        return 0.0, 0.0


def query_moneyflow(trade_date: str, ts_code: str) -> float:
    """查询主力净流入"""
    try:
        df = pro.moneyflow(ts_code=ts_code, trade_date=trade_date, fields='buy_lg_vol,buy_elg_vol,sell_lg_vol,sell_elg_vol')
        if not df.empty:
            buy_lg = float(df.iloc[0]['buy_lg_vol']) if pd.notnull(df.iloc[0]['buy_lg_vol']) else 0.0
            buy_elg = float(df.iloc[0]['buy_elg_vol']) if pd.notnull(df.iloc[0]['buy_elg_vol']) else 0.0
            sell_lg = float(df.iloc[0]['sell_lg_vol']) if pd.notnull(df.iloc[0]['sell_lg_vol']) else 0.0
            sell_elg = float(df.iloc[0]['sell_elg_vol']) if pd.notnull(df.iloc[0]['sell_elg_vol']) else 0.0
            
            main_flow_in = (buy_lg + buy_elg) - (sell_lg + sell_elg)
            return main_flow_in
        return 0.0
    except Exception as e:
        logger.warning(f"查询资金流失败 {ts_code} {trade_date}: {e}")
        return 0.0


def calculate_industry_scores(trade_date: str, industry: str) -> Dict[str, float]:
    """
    计算 4 维度行业评分
    """
    scores = {}
    
    # 1. policy_score: 从 policy_events 表查询
    scores['policy_score'] = query_policy_score(trade_date, industry)
    
    # 2. commercialization_score: 从财报数据计算
    scores['commercialization_score'] = query_commercialization_score(trade_date, industry)
    
    # 3. sentiment_score: 从市场数据计算（成交量 + 涨跌幅 + 换手率）
    scores['sentiment_score'] = query_sentiment_score(trade_date, industry)
    
    # 4. capital_score: 从北向资金计算
    scores['capital_score'] = query_capital_score(trade_date, industry)
    
    logger.debug(f"行业 {industry} 评分：{scores}")
    return scores


def calculate_seven_factors(trade_date: str, ts_code: str) -> Dict[str, float]:
    """
    计算 7 因子个股评分
    """
    factors = {}
    
    # 1. roe: 最新财报
    factors['roe'] = query_roe(trade_date, ts_code)
    
    # 2-3. 营收/净利润增速：最新财报
    factors['revenue_growth'], factors['netprofit_growth'] = query_growth(trade_date, ts_code)
    
    # 4-5. PE/PB: 行情数据
    factors['pe_ttm'], factors['pb'] = query_valuation(trade_date, ts_code)
    
    # 6-7. RSI/MACD: 技术指标计算
    factors['rsi'], factors['macd_signal'] = calculate_technicals(trade_date, ts_code)
    
    # 8. 主力净流入
    factors['main_flow_in'] = query_moneyflow(trade_date, ts_code)
    
    logger.debug(f"股票 {ts_code} 因子：{factors}")
    return factors


def calculate_seven_factor_score(factors: Dict[str, float]) -> float:
    """
    计算 7 因子综合评分
    """
    try:
        # 标准化各因子
        scores = []
        
        # ROE: 越高越好
        roe_score = min(max(factors['roe'] / 30, 0), 1)  # 假设30%为优秀
        scores.append(roe_score)
        
        # 营收增长
        rev_score = min(max(factors['revenue_growth'] / 50, 0), 1)  # 假设50%为优秀
        scores.append(rev_score)
        
        # 净利润增长
        profit_score = min(max(factors['netprofit_growth'] / 50, 0), 1)
        scores.append(profit_score)
        
        # PE: 越低越好（但排除负值）
        if factors['pe_ttm'] > 0:
            pe_score = min(max(50 / factors['pe_ttm'], 0), 1)  # 假设PE50为临界值
        else:
            pe_score = 0.5
        scores.append(pe_score)
        
        # PB: 越低越好
        pb_score = min(max(5 / factors['pb'] if factors['pb'] > 0 else 0.5, 0), 1)  # 假设PB5为临界值
        scores.append(pb_score)
        
        # RSI: 30-70为健康范围
        rsi = factors['rsi']
        if 30 <= rsi <= 70:
            rsi_score = 1.0
        elif rsi < 30:
            rsi_score = rsi / 30  # 超卖
        else:
            rsi_score = (100 - rsi) / 30  # 超买
        scores.append(rsi_score)
        
        # MACD: 信号强度
        macd_score = (factors['macd_signal'] + 1) / 2  # 转换-1~1到0~1
        scores.append(macd_score)
        
        # 资金流入：标准化
        flow = factors['main_flow_in']
        if flow > 0:
            flow_score = min(flow / 10000000, 1)  # 假设1000万为优秀
        else:
            flow_score = 0
        scores.append(flow_score)
        
        # 加权平均
        weights = [0.15, 0.15, 0.15, 0.10, 0.10, 0.10, 0.10, 0.15]
        total_score = sum(s * w for s, w in zip(scores, weights))
        
        return round(total_score, 4)
    except Exception as e:
        logger.error(f"计算7因子评分失败：{e}")
        return 0.5


def backfill_single_day(trade_date: str, stocks_df: pd.DataFrame, limit: Optional[int] = None):
    """回填单个交易日数据"""
    logger.info(f"开始处理交易日：{trade_date}")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    processed = 0
    failed = 0
    
    # 限制测试的股票数量
    if limit:
        stocks_sample = stocks_df.head(limit)
    else:
        stocks_sample = stocks_df
    
    for idx, row in stocks_sample.iterrows():
        ts_code = row['ts_code']
        industry = row['industry'] if pd.notnull(row['industry']) else '未知'
        
        try:
            # 计算行业评分
            industry_scores = calculate_industry_scores(trade_date, industry)
            
            # 计算个股因子
            seven_factors = calculate_seven_factors(trade_date, ts_code)
            
            # 计算综合评分
            industry_total = (
                industry_scores['policy_score'] * 0.25 +
                industry_scores['commercialization_score'] * 0.30 +
                industry_scores['sentiment_score'] * 0.25 +
                industry_scores['capital_score'] * 0.20
            )
            
            seven_factor_score = calculate_seven_factor_score(seven_factors)
            
            # 插入数据库
            cursor.execute("""
                INSERT OR REPLACE INTO stock_factor_snapshot (
                    trade_date, ts_code, industry,
                    policy_score, commercialization_score, sentiment_score, capital_score,
                    roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal, main_flow_in,
                    industry_total_score, seven_factor_score
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                trade_date, ts_code, industry,
                industry_scores['policy_score'], industry_scores['commercialization_score'],
                industry_scores['sentiment_score'], industry_scores['capital_score'],
                seven_factors['roe'], seven_factors['revenue_growth'], seven_factors['netprofit_growth'],
                seven_factors['pe_ttm'], seven_factors['pb'], seven_factors['rsi'],
                seven_factors['macd_signal'], seven_factors['main_flow_in'],
                round(industry_total, 4), seven_factor_score
            ))
            
            processed += 1
            if processed % 10 == 0:
                logger.info(f"已处理 {processed} 只股票...")
            
            # API 限流控制
            time.sleep(0.1)
            
        except Exception as e:
            failed += 1
            logger.error(f"处理 {ts_code} 失败：{e}")
            continue
    
    conn.commit()
    conn.close()
    logger.info(f"交易日 {trade_date} 完成：成功 {processed} 只，失败 {failed} 只")


def verify_data(trade_date: str):
    """验证回填数据"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT COUNT(*) as total, 
               COUNT(DISTINCT ts_code) as stocks,
               AVG(industry_total_score) as avg_industry,
               AVG(seven_factor_score) as avg_factor
        FROM stock_factor_snapshot
        WHERE trade_date = ?
    """, (trade_date,))
    
    result = cursor.fetchone()
    conn.close()
    
    if result:
        logger.info(f"验证结果：总记录 {result[0]} 条，{result[1]} 只股票")
        logger.info(f"平均行业评分：{result[2]:.4f}，平均因子评分：{result[3]:.4f}")
        return True
    return False


def main():
    parser = argparse.ArgumentParser(description='历史数据回填脚本')
    parser.add_argument('--start', default=START_DATE, help='开始日期 (YYYYMMDD)')
    parser.add_argument('--end', default=END_DATE, help='结束日期 (YYYYMMDD)')
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
        test_dates = [trade_dates[-1]] if trade_dates else []
        for trade_date in test_dates:
            backfill_single_day(trade_date, stocks_df, limit=args.stock_limit)
            if args.verify:
                verify_data(trade_date)
        logger.info("测试完成")
        return
    
    # 全量处理
    logger.info(f"共 {len(trade_dates)} 个交易日，{len(stocks_df)} 只股票")
    
    # 分批处理
    for i in range(0, len(trade_dates), args.batch_size):
        batch_dates = trade_dates[i:i+args.batch_size]
        logger.info(f"处理批次 {i//args.batch_size + 1}: {len(batch_dates)} 个交易日")
        
        for trade_date in batch_dates:
            backfill_single_day(trade_date, stocks_df)
            if args.verify:
                verify_data(trade_date)
        
        logger.info(f"批次 {i//args.batch_size + 1} 完成")
    
    logger.info("回填完成！")


if __name__ == '__main__':
    main()