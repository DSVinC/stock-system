#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BaoStock 分钟线数据获取脚本
通过标准输入输出与 Node.js 通信
"""

import sys
import json
import baostock as bs
from datetime import datetime, timedelta

def login():
    """登录 BaoStock"""
    lg = bs.login()
    if lg.error_code != '0':
        return False, lg.error_msg
    return True, '登录成功'

def logout():
    """登出 BaoStock"""
    bs.logout()

def get_minute_data(ts_code, start_date, end_date, frequency='5', adjustflag='3'):
    try:
        # BaoStock 分钟线数据使用 YYYY-MM-DD 格式
        # 如果输入是 YYYYMMDD 格式，转换为 YYYY-MM-DD
        if len(start_date) == 8 and '-' not in start_date:
            start_date_fmt = f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}"
        else:
            start_date_fmt = start_date

        if len(end_date) == 8 and '-' not in end_date:
            end_date_fmt = f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}"
        else:
            end_date_fmt = end_date

        # 查询分钟线数据 (不请求 adjustflag 字段)
        rs = bs.query_history_k_data_plus(
            ts_code,
            fields="date,time,code,open,high,low,close,volume,amount",
            start_date=start_date_fmt,
            end_date=end_date_fmt,
            frequency=frequency,
            adjustflag=adjustflag
        )

        if rs is None:
            return [], "BaoStock 返回 None"

        if rs.error_code != '0':
            return [], f"BaoStock 错误: {rs.error_msg}"

        data_list = []
        while rs.next():
            row = rs.get_row_data()
            # date 格式: YYYY-MM-DD, time 格式: YYYYMMDDHHMMSSSSS
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

            record = {
                'ts_code': ts_code.replace('sh.', '').replace('sz.', '') + ('.SH' if ts_code.startswith('sh') else '.SZ'),
                'trade_date': trade_date,
                'trade_time': trade_time,
                'open': float(row[3]) if row[3] else 0,
                'high': float(row[4]) if row[4] else 0,
                'low': float(row[5]) if row[5] else 0,
                'close': float(row[6]) if row[6] else 0,
                'vol': float(row[7]) if row[7] else 0,
                'amount': float(row[8]) if row[8] else 0,
                'adj_factor': 1.0,
                'pre_close': None,
                'change': None,
                'pct_change': None
            }

            data_list.append(record)

        return data_list, None

    except Exception as e:
        return [], str(e)

def main():
    """主函数：从标准输入读取参数，输出 JSON 结果"""
    try:
        # 读取输入参数
        input_data = sys.stdin.read()
        params = json.loads(input_data)

        action = params.get('action')
        ts_code = params.get('ts_code')
        start_date = params.get('start_date')
        end_date = params.get('end_date')

        # 登录
        success, msg = login()
        if not success:
            result = {'success': False, 'error': msg}
            print(json.dumps(result, ensure_ascii=False))
            return

        if action == 'fetch':
            # 获取分钟线数据
            data, error = get_minute_data(ts_code, start_date, end_date)
            if error:
                result = {'success': False, 'error': error}
            else:
                result = {
                    'success': True,
                    'ts_code': ts_code,
                    'start_date': start_date,
                    'end_date': end_date,
                    'count': len(data),
                    'data': data
                }

        elif action == 'test':
            # 测试连接
            result = {'success': True, 'message': 'BaoStock 连接测试成功'}

        else:
            result = {'success': False, 'error': f'未知操作: {action}'}

        # 登出
        logout()

        # 输出结果
        print(json.dumps(result, ensure_ascii=False))

    except Exception as e:
        result = {'success': False, 'error': str(e)}
        print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
