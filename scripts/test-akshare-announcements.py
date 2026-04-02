#!/usr/bin/env python3
"""
测试 AkShare 公告接口
替代新浪财经 MCP 的免费方案
"""

import akshare as ak
import pandas as pd
from datetime import datetime

def test_single_stock(symbol, stock_name):
    """测试单只股票公告获取"""
    print(f'📋 测试获取 {stock_name}({symbol}) 公告...\n')
    
    try:
        df = ak.stock_news_em(symbol=symbol)
        print(f'✅ 获取成功，共 {len(df)} 条公告\n')
        
        if len(df) > 0:
            print('最新公告：')
            for idx, row in df.head(5).iterrows():
                print(f"  {idx + 1}. {row['新闻标题']}")
                print(f"     日期：{row['发布时间']}")
                print(f"     来源：{row['文章来源']}")
                print(f"     链接：{row['新闻链接']}\n")
        
        return df
    except Exception as e:
        print(f'❌ 获取失败：{e}\n')
        return None

def test_multiple_stocks():
    """测试批量获取多只股票公告"""
    print('\n📊 测试批量获取公告...\n')
    
    stocks = [
        ('603305', '旭升集团'),
        ('002709', '天赐材料'),
        ('300750', '宁德时代')
    ]
    
    all_announcements = []
    
    for symbol, name in stocks:
        try:
            df = ak.stock_news_em(symbol=symbol)
            if len(df) > 0:
                df['stock_name'] = name
                df['ts_code'] = symbol
                all_announcements.append(df)
                print(f'✅ {name}: {len(df)} 条公告')
        except Exception as e:
            print(f'❌ {name}: {e}')
    
    if all_announcements:
        combined = pd.concat(all_announcements, ignore_index=True)
        print(f'\n总计：{len(combined)} 条公告')
        return combined
    
    return None

def classify_announcement_type(title):
    """公告标题风险分类"""
    risk_keywords = [
        ('立案调查|行政处罚|监管函|警示函', 'regulatory_risk', 'high'),
        ('退市 | 终止上市 | 暂停上市', 'delisting_risk', 'high'),
        ('业绩预亏 | 亏损 | 下滑', 'earnings_warning', 'medium'),
        ('减持 | 减持计划', 'shareholder_reduction', 'medium'),
        ('中标 | 重大合同 | 回购 | 增持', 'positive', 'low'),
        ('股东大会 | 董事会 | 监事会', 'corporate_governance', 'low'),
        ('分红 | 派息 | 转增', 'dividend', 'low')
    ]
    
    import re
    for pattern, event_type, risk_tag in risk_keywords:
        if re.search(pattern, title, re.IGNORECASE):
            return event_type, risk_tag
    
    return 'general_announcement', 'low'

def test_risk_classification():
    """测试公告风险分类"""
    print('\n⚠️  测试公告风险分类...\n')
    
    test_titles = [
        '关于公司被立案调查的公告',
        '2025 年年度业绩预亏公告',
        '关于股东减持股份计划的公告',
        '关于中标重大项目的公告',
        '2025 年年度股东大会决议公告',
        '关于 2025 年年度分红派息的公告'
    ]
    
    for title in test_titles:
        event_type, risk_tag = classify_announcement_type(title)
        emoji = '🔴' if risk_tag == 'high' else '🟡' if risk_tag == 'medium' else '🟢'
        print(f'  {emoji} {title}')
        print(f'     类型：{event_type}, 风险：{risk_tag}\n')

def main():
    """主测试函数"""
    print('=' * 60)
    print('AkShare 公告接口测试')
    print('=' * 60 + '\n')
    
    # 测试单只股票
    test_single_stock('603305', '旭升集团')
    
    # 测试批量获取
    test_multiple_stocks()
    
    # 测试风险分类
    test_risk_classification()
    
    print('\n✅ 所有测试完成！\n')

if __name__ == '__main__':
    main()
