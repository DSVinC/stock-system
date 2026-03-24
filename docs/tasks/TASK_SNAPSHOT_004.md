# TASK_SNAPSHOT_004: 编写历史数据回填脚本

**任务 ID**: TASK_SNAPSHOT_004  
**任务名称**: 编写历史数据回填脚本  
**优先级**: P0  
**创建时间**: 2026-03-24  
**预计工作量**: 2-3 小时  
**状态**: in_progress

---

## 📋 任务描述

编写 Python 脚本，从 Tushare 等数据源获取历史数据，回填到 `stock_factor_snapshot` 表（2020-至今）。

---

## 🎯 验收标准

| 标准 | 目标值 | 验证方法 |
|------|--------|---------|
| 数据完整性 | 2020-01-01 至 2026-03-24 所有交易日 | SQL 统计 |
| 股票覆盖 | 全部 A 股（~5000 只） | SQL 统计 |
| 因子计算 | 4 维度 +7 因子全部有值 | 抽样检查 |
| 执行时间 | <30 分钟 | 运行计时 |
| 错误处理 | 网络异常可重试 | 手动测试 |

---

## 📊 回填数据范围

| 维度 | 范围 |
|------|------|
| **时间** | 2020-01-01 至 2026-03-24 |
| **股票** | 全部 A 股（~5000 只） |
| **频率** | 每个交易日 |
| **预计数据量** | ~5000 股 × 1500 交易日 ≈ 750 万条 |

---

## 💡 实现方案

### 数据源映射

| 因子 | 数据源 | Tushare 接口 |
|------|--------|-------------|
| **4 维度行业因子** | | |
| policy_score | 政策事件库 | policy_events（本地计算） |
| commercialization_score | 财报数据 | fina_indicator |
| sentiment_score | 市场关注度 | daily + daily_basic（计算） |
| capital_score | 北向资金 + 机构持仓 | stock_holdernorth + fund_hold |
| **7 因子个股因子** | | |
| roe | 财报 | fina_indicator |
| revenue_growth | 财报 | income |
| netprofit_growth | 财报 | income |
| pe_ttm | 行情 | daily_basic |
| pb | 行情 | daily_basic |
| rsi | 行情计算 | daily（计算） |
| macd_signal | 行情计算 | daily（计算） |
| main_flow_in | 资金流 | moneyflow |

---

## 🔧 脚本结构

### 主脚本：`scripts/backfill_snapshot.py`

```python
#!/usr/bin/env python3
"""
历史数据回填脚本
用途：回填 stock_factor_snapshot 表（2020-至今）
"""

import tushare as ts
import sqlite3
import pandas as pd
from datetime import datetime, timedelta
import argparse
import logging

# 配置
TUSHARE_TOKEN = 'xxx'  # 从环境变量读取
DB_PATH = '/Volumes/SSD500/openclaw/stock-system/stock_system.db'
START_DATE = '20200101'
END_DATE = '20260324'

# 初始化
ts.set_token(TUSHARE_TOKEN)
pro = ts.pro_api()

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
logger = logging.getLogger(__name__)


def get_trade_dates(start_date, end_date):
    """获取交易日历"""
    df = pro.trade_cal(exchange='SSE', start_date=start_date, end_date=end_date, is_open='1')
    return df['cal_date'].tolist()


def get_all_stocks():
    """获取全部 A 股列表"""
    df = pro.stock_basic(exchange='', list_status='L', fields='ts_code,symbol,name,area,industry,list_date')
    return df


def calculate_industry_scores(trade_date, industry):
    """
    计算 4 维度行业评分
    
    Returns:
        dict: {policy_score, commercialization_score, sentiment_score, capital_score}
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
    
    return scores


def calculate_seven_factors(trade_date, ts_code):
    """
    计算 7 因子个股评分
    
    Returns:
        dict: {roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal, main_flow_in}
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
    
    return factors


def backfill_single_day(trade_date, stocks_df):
    """回填单个交易日数据"""
    logger.info(f"处理交易日：{trade_date}")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    for idx, row in stocks_df.iterrows():
        ts_code = row['ts_code']
        industry = row['industry']
        
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
                industry_total, seven_factor_score
            ))
            
        except Exception as e:
            logger.error(f"处理 {ts_code} 失败：{e}")
            continue
    
    conn.commit()
    conn.close()
    logger.info(f"交易日 {trade_date} 完成")


def main():
    parser = argparse.ArgumentParser(description='历史数据回填脚本')
    parser.add_argument('--start', default=START_DATE, help='开始日期 (YYYYMMDD)')
    parser.add_argument('--end', default=END_DATE, help='结束日期 (YYYYMMDD)')
    parser.add_argument('--batch-size', type=int, default=100, help='每批处理的交易日数量')
    args = parser.parse_args()
    
    logger.info(f"开始回填：{args.start} 至 {args.end}")
    
    # 获取交易日历
    trade_dates = get_trade_dates(args.start, args.end)
    logger.info(f"共 {len(trade_dates)} 个交易日")
    
    # 获取股票列表
    stocks_df = get_all_stocks()
    logger.info(f"共 {len(stocks_df)} 只股票")
    
    # 分批处理
    for i in range(0, len(trade_dates), args.batch_size):
        batch_dates = trade_dates[i:i+args.batch_size]
        for trade_date in batch_dates:
            backfill_single_day(trade_date, stocks_df)
    
    logger.info("回填完成！")


if __name__ == '__main__':
    main()
```

---

## 📝 实施步骤

### 步骤 1: 创建脚本框架

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
mkdir -p scripts
touch scripts/backfill_snapshot.py
chmod +x scripts/backfill_snapshot.py
```

### 步骤 2: 实现数据查询函数

逐个实现以下函数：
- `query_policy_score()` - 政策评分查询
- `query_commercialization_score()` - 商业化评分查询
- `query_sentiment_score()` - 市场关注度计算
- `query_capital_score()` - 资本认可评分查询
- `query_roe()` - ROE 查询
- `query_growth()` - 增速查询
- `query_valuation()` - 估值查询
- `calculate_technicals()` - 技术指标计算
- `query_moneyflow()` - 资金流查询

### 步骤 3: 测试单只股票

```bash
python scripts/backfill_snapshot.py --start 20260301 --end 20260324 --batch-size 1
```

### 步骤 4: 批量回填

```bash
# 先回填最近 3 个月（测试）
python scripts/backfill_snapshot.py --start 20260101 --end 20260324

# 验证数据
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db <<EOF
SELECT trade_date, COUNT(*) as stock_count
FROM stock_factor_snapshot
GROUP BY trade_date
ORDER BY trade_date DESC
LIMIT 20;
EOF

# 全量回填（2020-至今）
python scripts/backfill_snapshot.py --start 20200101 --end 20260324 --batch-size 50
```

---

## ⚠️ 注意事项

1. **Tushare Token**: 从环境变量读取，不要硬编码
2. **API 限流**: Tushare 有调用限制，需要控制频率
3. **分批处理**: 每批 50-100 个交易日，避免内存溢出
4. **错误处理**: 网络异常时重试
5. **断点续传**: 支持从中断点继续

---

## 📚 关联文档

- 设计共识：`docs/DESIGN_CONSENSUS.md` 第 15.2 节
- 关联任务：TASK_SNAPSHOT_005（执行回填）

---

_创建时间：2026-03-24_
