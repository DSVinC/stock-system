#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BaoStock 分钟线数据获取脚本

功能：
1. 支持获取 1/5/15/30/60 分钟 K 线
2. 支持全市场或指定股票代码列表
3. 支持日期范围查询
4. 数据保存到 stock_minute 表
5. 自动去重
6. 进度显示（每 100 只股票打印一次）
7. 错误重试机制（失败后重试 3 次）

用法：
    # 获取单只股票 5 分钟线
    python fetch_minute_data.py --code 000001.SZ --start 2025-01-01 --end 2026-01-01

    # 获取多只股票 15 分钟线
    python fetch_minute_data.py --codes 000001.SZ,000002.SZ,000858.SZ --frequency 15

    # 获取全市场 1 分钟线（使用股票列表文件）
    python fetch_minute_data.py --all --frequency 1

    # 强制刷新数据
    python fetch_minute_data.py --code 000001.SZ --force
"""

import argparse
import baostock as bs
import sqlite3
import os
import sys
import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple

# 配置参数
CONFIG = {
    'DB_PATH': os.path.join(os.path.dirname(__file__), '..', 'stock_system.db'),
    'MAX_RETRIES': 3,
    'RETRY_DELAY_MS': 3000,
    'RATE_LIMIT_DELAY_MS': 2000,
    'PROGRESS_INTERVAL': 100,
    'SUPPORTED_FREQUENCIES': ['1', '5', '15', '30', '60'],
    'DEFAULT_FREQUENCY': '5',
}

class Logger:
    """日志工具类"""

    @staticmethod
    def info(message: str, **kwargs):
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        extra = ' | '.join([f'{k}={v}' for k, v in kwargs.items()]) if kwargs else ''
        print(f"[{timestamp}] [INFO] {message}{' | ' + extra if extra else ''}")

    @staticmethod
    def warn(message: str, **kwargs):
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        extra = ' | '.join([f'{k}={v}' for k, v in kwargs.items()]) if kwargs else ''
        print(f"[{timestamp}] [WARN] {message}{' | ' + extra if extra else ''}")

    @staticmethod
    def error(message: str, **kwargs):
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        extra = ' | '.join([f'{k}={v}' for k, v in kwargs.items()]) if kwargs else ''
        print(f"[{timestamp}] [ERROR] {message}{' | ' + extra if extra else ''}", file=sys.stderr)

    @staticmethod
    def progress(message: str, **kwargs):
        """进度显示"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        extra = ' | '.join([f'{k}={v}' for k, v in kwargs.items()]) if kwargs else ''
        print(f"[{timestamp}] [📊 PROGRESS] {message}{' | ' + extra if extra else ''}")


class DatabaseManager:
    """数据库管理类"""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or CONFIG['DB_PATH']
        self.conn = None

    def connect(self):
        """连接数据库"""
        try:
            self.conn = sqlite3.connect(self.db_path)
            Logger.info('数据库连接成功', path=self.db_path)
            return self.conn
        except Exception as e:
            Logger.error('数据库连接失败', error=str(e))
            raise

    def close(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()

    def save_minute_data(self, ts_code: str, data: List[Dict], frequency: str = '5') -> Tuple[int, int]:
        """
        保存分钟线数据到数据库

        返回: (saved_count, skipped_count)
        """
        if not data:
            return 0, 0

        cursor = self.conn.cursor()
        saved = 0
        skipped = 0

        for record in data:
            try:
                cursor.execute("""
                    INSERT OR REPLACE INTO stock_minute (
                        ts_code, trade_date, trade_time, open, high, low, close,
                        vol, amount, adj_factor, data_source, fetch_status, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, [
                    record['ts_code'],
                    record['trade_date'],
                    record['trade_time'],
                    record['open'],
                    record['high'],
                    record['low'],
                    record['close'],
                    record['vol'],
                    record['amount'],
                    record.get('adj_factor', 1.0),
                    'baostock',
                    'success'
                ])
                saved += 1
            except Exception as e:
                Logger.warn('插入数据失败', ts_code=ts_code, trade_date=record['trade_date'],
                           trade_time=record['trade_time'], error=str(e))
                skipped += 1

        self.conn.commit()

        # 更新统计信息
        self._update_stats(ts_code, data, frequency)

        return saved, skipped

    def _update_stats(self, ts_code: str, data: List[Dict], frequency: str = '5'):
        """更新数据统计信息"""
        if not data:
            return

        cursor = self.conn.cursor()

        # 按日期分组
        date_groups = {}
        for record in data:
            trade_date = record['trade_date']
            if trade_date not in date_groups:
                date_groups[trade_date] = []
            date_groups[trade_date].append(record)

        # 根据频率计算预期记录数
        expected_records_map = {
            '1': 240,   # 1分钟线：每天 240 条
            '5': 48,    # 5分钟线：每天 48 条
            '15': 16,   # 15分钟线：每天 16 条
            '30': 8,    # 30分钟线：每天 8 条
            '60': 4,    # 60分钟线：每天 4 条
        }
        expected_records = expected_records_map.get(frequency, 48)

        for trade_date, records in date_groups.items():
            total_records = len(records)
            missing_records = max(0, expected_records - total_records)
            data_quality = 'complete' if missing_records == 0 else \
                          'partial' if total_records >= expected_records * 0.8 else 'missing'

            times = sorted([r['trade_time'] for r in records])
            earliest_time = times[0] if times else None
            latest_time = times[-1] if times else None

            try:
                cursor.execute("""
                    INSERT OR REPLACE INTO stock_minute_stats (
                        ts_code, trade_date, total_records, missing_records,
                        earliest_time, latest_time, data_quality, last_checked
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, [ts_code, trade_date, total_records, missing_records,
                     earliest_time, latest_time, data_quality])
            except Exception as e:
                Logger.warn('更新统计信息失败', ts_code=ts_code, trade_date=trade_date, error=str(e))

        self.conn.commit()

    def check_existing_data(self, ts_code: str, start_date: str, end_date: str) -> Dict:
        """检查现有数据覆盖情况"""
        cursor = self.conn.cursor()

        start_date_fmt = start_date.replace('-', '')
        end_date_fmt = end_date.replace('-', '')

        cursor.execute("""
            SELECT COUNT(*) as total_dates,
                   SUM(CASE WHEN data_quality = 'complete' THEN 1 ELSE 0 END) as complete_dates
            FROM stock_minute_stats
            WHERE ts_code = ? AND trade_date BETWEEN ? AND ?
        """, [ts_code, start_date_fmt, end_date_fmt])

        row = cursor.fetchone()

        if row and row[0]:
            total_dates = row[0]
            complete_dates = row[1] or 0
            coverage = (complete_dates / total_dates * 100) if total_dates > 0 else 0

            return {
                'total_dates': total_dates,
                'complete_dates': complete_dates,
                'coverage': round(coverage, 2)
            }

        return {'total_dates': 0, 'complete_dates': 0, 'coverage': 0}

    def get_stock_list(self) -> List[str]:
        """从数据库获取股票列表"""
        cursor = self.conn.cursor()

        try:
            cursor.execute("SELECT DISTINCT ts_code FROM stock_list")
            rows = cursor.fetchall()
            return [row[0] for row in rows]
        except:
            return []


class BaoStockClient:
    """BaoStock API 客户端"""

    def __init__(self):
        self.logged_in = False

    def login(self) -> Tuple[bool, str]:
        """登录 BaoStock"""
        try:
            lg = bs.login()
            if lg.error_code != '0':
                return False, lg.error_msg
            self.logged_in = True
            return True, '登录成功'
        except Exception as e:
            return False, str(e)

    def logout(self):
        """登出 BaoStock"""
        if self.logged_in:
            bs.logout()
            self.logged_in = False

    def get_minute_data(self, ts_code: str, start_date: str, end_date: str,
                        frequency: str = '5', retries: int = CONFIG['MAX_RETRIES']) -> Tuple[List[Dict], Optional[str]]:
        """
        获取分钟线数据（带重试机制）

        参数：
            ts_code: 股票代码（000001.SZ 格式）
            start_date: 开始日期（YYYY-MM-DD 格式）
            end_date: 结束日期（YYYY-MM-DD 格式）
            frequency: 分钟线频率（1/5/15/30/60）
            retries: 重试次数

        返回：(data_list, error_message)
        """
        last_error = None

        for attempt in range(1, retries + 1):
            try:
                # 转换股票代码格式 (000001.SZ -> sz.000001)
                bs_code = self._convert_code(ts_code)

                # 转换日期格式
                start_date_fmt = start_date.replace('-', '') if '-' in start_date else start_date
                end_date_fmt = end_date.replace('-', '') if '-' in end_date else end_date

                # 查询分钟线数据
                rs = bs.query_history_k_data_plus(
                    bs_code,
                    fields="date,time,code,open,high,low,close,volume,amount",
                    start_date=start_date_fmt,
                    end_date=end_date_fmt,
                    frequency=frequency,
                    adjustflag='3'  # 不复权
                )

                if rs is None:
                    last_error = "BaoStock 返回 None"
                    if attempt < retries:
                        time.sleep(CONFIG['RETRY_DELAY_MS'] / 1000)
                    continue

                if rs.error_code != '0':
                    last_error = f"BaoStock 错误: {rs.error_msg}"
                    if attempt < retries:
                        time.sleep(CONFIG['RETRY_DELAY_MS'] / 1000)
                    continue

                data_list = []
                while rs.next():
                    row = rs.get_row_data()
                    record = self._parse_row(row, ts_code, frequency)
                    data_list.append(record)

                return data_list, None

            except Exception as e:
                last_error = str(e)
                if attempt < retries:
                    Logger.warn(f'获取数据失败，准备重试 ({attempt}/{retries})',
                               ts_code=ts_code, error=str(e))
                    time.sleep(CONFIG['RETRY_DELAY_MS'] / 1000)

        return [], last_error

    def _convert_code(self, ts_code: str) -> str:
        """转换股票代码格式 (000001.SZ -> sz.000001)"""
        if '.' in ts_code:
            code, market = ts_code.split('.')
            return f"{market.lower()}.{code}"
        return ts_code

    def _parse_row(self, row: List, ts_code: str, frequency: str) -> Dict:
        """解析数据行"""
        date_str = row[0]
        time_str = row[1]

        # 转换时间格式 (格式为 YYYYMMDDHHMMSSSSS)
        if len(time_str) >= 12:
            hour = time_str[8:10]
            minute = time_str[10:12]
            trade_time = f"{hour}:{minute}:00"
        else:
            trade_time = "00:00:00"

        # 转换日期格式 YYYY-MM-DD -> YYYYMMDD
        trade_date = date_str.replace('-', '')

        return {
            'ts_code': ts_code,
            'trade_date': trade_date,
            'trade_time': trade_time,
            'open': float(row[3]) if row[3] else 0,
            'high': float(row[4]) if row[4] else 0,
            'low': float(row[5]) if row[5] else 0,
            'close': float(row[6]) if row[6] else 0,
            'vol': float(row[7]) if row[7] else 0,
            'amount': float(row[8]) if row[8] else 0,
            'adj_factor': 1.0,
            'frequency': frequency
        }

    def get_stock_list(self) -> List[Dict]:
        """获取 A 股股票列表"""
        try:
            rs = bs.queryStockBasic()

            if rs.error_code != '0':
                Logger.error('获取股票列表失败', error=rs.error_msg)
                return []

            stock_list = []
            while rs.next():
                row = rs.get_row_data()
                code = row[0]
                code_name = row[1]
                # type: 1=股票, 2=指数
                stock_type = row[18] if len(row) > 18 else '1'
                status = row[32] if len(row) > 32 else '1'

                # 只获取正常上市的股票
                if stock_type == '1' and status == '1':
                    market = 'SH' if code.startswith('sh') else 'SZ' if code.startswith('sz') else 'BJ'
                    stock_list.append({
                        'code': code.replace('sh.', '').replace('sz.', '').replace('bj.', '') + '.' + market,
                        'name': code_name,
                        'market': market
                    })

            return stock_list

        except Exception as e:
            Logger.error('获取股票列表失败', error=str(e))
            return []


class MinuteDataFetcher:
    """分钟线数据获取器"""

    def __init__(self, db_path: str = None):
        self.db = DatabaseManager(db_path)
        self.baostock = BaoStockClient()

    def init(self):
        """初始化"""
        self.db.connect()

        success, msg = self.baostock.login()
        if not success:
            raise Exception(f'BaoStock 登录失败: {msg}')

        Logger.info('初始化完成')

    def close(self):
        """清理资源"""
        self.baostock.logout()
        self.db.close()

    def fetch_single(self, ts_code: str, start_date: str, end_date: str,
                    frequency: str = '5', force: bool = False) -> Dict:
        """
        获取单只股票的分钟线数据

        返回：结果字典
        """
        Logger.info('开始获取分钟线数据', ts_code=ts_code, start=start_date,
                   end=end_date, frequency=frequency)

        # 检查现有数据
        if not force:
            existing = self.db.check_existing_data(ts_code, start_date, end_date)
            if existing['coverage'] > 80:
                Logger.info('数据已存在，跳过获取', ts_code=ts_code,
                           coverage=f"{existing['coverage']}%")
                return {
                    'success': True,
                    'ts_code': ts_code,
                    'message': '数据已存在',
                    'coverage': existing['coverage'],
                    'skipped': True
                }

        # 获取数据
        data, error = self.baostock.get_minute_data(ts_code, start_date, end_date, frequency)

        if error:
            Logger.error('获取数据失败', ts_code=ts_code, error=error)
            return {
                'success': False,
                'ts_code': ts_code,
                'error': error
            }

        # 保存数据
        saved, skipped = self.db.save_minute_data(ts_code, data, frequency)

        Logger.info('分钟线数据获取完成', ts_code=ts_code, saved=saved, skipped=skipped)

        return {
            'success': True,
            'ts_code': ts_code,
            'saved': saved,
            'skipped': skipped,
            'total': len(data)
        }

    def fetch_batch(self, codes: List[str], start_date: str, end_date: str,
                   frequency: str = '5', force: bool = False) -> Dict:
        """
        批量获取分钟线数据

        包含进度显示（每 100 只股票打印一次）
        """
        Logger.info('开始批量获取分钟线数据', count=len(codes), frequency=frequency)

        results = []
        start_time = time.time()

        for i, ts_code in enumerate(codes):
            try:
                result = self.fetch_single(ts_code, start_date, end_date, frequency, force)
                results.append(result)

                # 进度显示：每 100 只股票打印一次
                if (i + 1) % CONFIG['PROGRESS_INTERVAL'] == 0 or (i + 1) == len(codes):
                    elapsed = time.time() - start_time
                    success_count = sum(1 for r in results if r.get('success'))
                    fail_count = sum(1 for r in results if not r.get('success'))
                    avg_time = elapsed / (i + 1) * 1000
                    estimated_remaining = (len(codes) - i - 1) * avg_time / 1000

                    Logger.progress(
                        f'进度: {i + 1}/{len(codes)} ({(i + 1) / len(codes) * 100:.1f}%)',
                        processed=i + 1,
                        total=len(codes),
                        success=success_count,
                        failed=fail_count,
                        elapsed=f'{elapsed:.1f}s',
                        avg_time=f'{avg_time:.0f}ms/stock',
                        estimated_remaining=f'{estimated_remaining:.1f}s'
                    )

                # 请求间延迟
                if i < len(codes) - 1:
                    time.sleep(CONFIG['RATE_LIMIT_DELAY_MS'] / 1000)

            except Exception as e:
                Logger.error('处理股票失败', ts_code=ts_code, error=str(e))
                results.append({
                    'success': False,
                    'ts_code': ts_code,
                    'error': str(e)
                })

        # 汇总结果
        total_time = time.time() - start_time
        success_count = sum(1 for r in results if r.get('success'))
        fail_count = len(results) - success_count

        summary = {
            'total': len(results),
            'success': success_count,
            'failed': fail_count,
            'success_rate': f'{success_count / len(results) * 100:.2f}%',
            'total_time': f'{total_time:.1f}s',
            'avg_time_per_stock': f'{total_time / len(results):.2f}s'
        }

        Logger.info('批量获取完成', **summary)

        return {
            'results': results,
            'summary': summary
        }


def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(
        description='BaoStock 分钟线数据获取工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 获取单只股票 5 分钟线
  python fetch_minute_data.py --code 000001.SZ --start 2025-01-01 --end 2026-01-01

  # 获取多只股票 15 分钟线
  python fetch_minute_data.py --codes 000001.SZ,000002.SZ --frequency 15

  # 强制刷新数据
  python fetch_minute_data.py --code 000001.SZ --force

分钟线频率:
  1  - 1分钟线
  5  - 5分钟线 (默认)
  15 - 15分钟线
  30 - 30分钟线
  60 - 60分钟线
        """
    )

    parser.add_argument('--code', type=str, help='单只股票代码 (如: 000001.SZ)')
    parser.add_argument('--codes', type=str, help='多只股票代码，逗号分隔 (如: 000001.SZ,000002.SZ)')
    parser.add_argument('--all', action='store_true', help='获取全市场数据')
    parser.add_argument('--start', type=str, help='开始日期 (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, help='结束日期 (YYYY-MM-DD)')
    parser.add_argument('--frequency', type=str, default='5',
                       choices=['1', '5', '15', '30', '60'],
                       help='分钟线频率 (默认: 5)')
    parser.add_argument('--force', action='store_true', help='强制刷新数据')
    parser.add_argument('--db', type=str, help='数据库路径')

    return parser.parse_args()


def main():
    """主函数"""
    args = parse_args()

    # 验证参数
    if not args.code and not args.codes and not args.all:
        Logger.error('请指定股票代码 (--code), 股票列表 (--codes), 或全市场 (--all)')
        sys.exit(1)

    # 验证频率参数
    if args.frequency not in CONFIG['SUPPORTED_FREQUENCIES']:
        Logger.error(f"不支持的频率: {args.frequency}，支持的频率: {', '.join(CONFIG['SUPPORTED_FREQUENCIES'])}")
        sys.exit(1)

    # 设置日期范围
    end_date = args.end or datetime.now().strftime('%Y-%m-%d')
    start_date = args.start or (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')

    # 初始化获取器
    fetcher = MinuteDataFetcher(args.db)

    try:
        fetcher.init()

        # 获取股票代码列表
        codes = []
        if args.code:
            codes = [args.code]
        elif args.codes:
            codes = [c.strip() for c in args.codes.split(',')]
        elif args.all:
            Logger.info('获取全市场股票列表...')
            stock_list = fetcher.baostock.get_stock_list()
            codes = [s['code'] for s in stock_list]
            Logger.info(f'共获取到 {len(codes)} 只股票')

        # 获取数据
        if len(codes) == 1:
            result = fetcher.fetch_single(codes[0], start_date, end_date,
                                         args.frequency, args.force)
        else:
            result = fetcher.fetch_batch(codes, start_date, end_date,
                                        args.frequency, args.force)

        # 输出结果
        import json
        print(json.dumps(result, ensure_ascii=False, indent=2))

    except Exception as e:
        Logger.error('执行失败', error=str(e))
        sys.exit(1)
    finally:
        fetcher.close()


if __name__ == '__main__':
    main()