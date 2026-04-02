#!/usr/bin/env python3
"""
使用 AkShare 获取公司公告
替代新浪财经 MCP 的免费方案

调用方式:
    python3 fetch_announcements_akshare.py 603305 100
    python3 fetch_announcements_akshare.py sh600519 50

输出格式: JSON
"""

import akshare as ak
import json
import sys
import warnings

# 忽略 OpenSSL 警告
warnings.filterwarnings('ignore', category=UserWarning)


def normalize_symbol(symbol):
    """
    标准化股票代码格式
    支持输入：600519, 000001, sh600519, sz000001, 600519.SH, 000001.SZ
    输出：600519 (纯数字)
    """
    if not symbol:
        return ''
    
    symbol = str(symbol).strip().upper()
    
    # 移除前缀和后缀
    symbol = symbol.replace('SH', '').replace('SZ', '').replace('.', '')
    symbol = symbol.replace('SH', '').replace('SZ', '')  # 处理小写
    
    # 提取 6 位数字
    import re
    match = re.search(r'(\d{6})', symbol)
    if match:
        return match.group(1)
    
    return symbol


def fetch_announcements(symbol, limit=100):
    """
    获取公司公告
    
    Args:
        symbol (str): 股票代码（如 603305 或 sh603305）
        limit (int): 获取数量限制（默认 100）
    
    Returns:
        dict: {
            'success': bool,
            'data': list,  # 公告列表
            'error': str   # 错误信息（如果有）
        }
    """
    try:
        # 标准化股票代码
        symbol_clean = normalize_symbol(symbol)
        if not symbol_clean:
            return {
                'success': False,
                'error': f'Invalid stock symbol: {symbol}',
                'data': []
            }
        
        # 获取公告数据
        df = ak.stock_news_em(symbol=symbol_clean)
        
        if df is None or len(df) == 0:
            return {
                'success': True,
                'data': [],
                'message': f'No announcements found for {symbol}'
            }
        
        # 转换为标准格式
        announcements = []
        for _, row in df.head(limit).iterrows():
            # 提取日期部分
            pub_time = str(row['发布时间'])
            ann_date = pub_time.split(' ')[0].replace('-', '') if pub_time else ''
            
            announcements.append({
                'ts_code': symbol.upper(),
                'stock_name': '',  # AkShare 不返回股票名称
                'title': str(row['新闻标题']),
                'content': str(row['新闻内容']),
                'ann_date': ann_date,
                'pub_time': pub_time,
                'source': str(row['文章来源']),
                'url': str(row['新闻链接']),
                'data_source': 'akshare'
            })
        
        return {
            'success': True,
            'data': announcements,
            'count': len(announcements)
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'data': []
        }


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Missing symbol argument',
            'usage': 'python3 fetch_announcements_akshare.py <symbol> [limit]'
        }, ensure_ascii=False))
        sys.exit(1)
    
    symbol = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    
    result = fetch_announcements(symbol, limit)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
