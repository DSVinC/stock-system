#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
A股个股分析脚本 - 基于tushare + 新浪财经的专业投资分析工具

使用方法:
    python3 stock_analyzer.py [股票代码或名称]
    
示例:
    python3 stock_analyzer.py 300058.SZ
    python3 stock_analyzer.py 蓝色光标
    python3 stock_analyzer.py 600519
"""

import argparse
import os
import sys
import subprocess
import json
import tushare as ts
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


# 新浪财经脚本路径
SINA_SCRIPT_DIR = "/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/scripts"
QUIET = False


def init_tushare():
    """初始化tushare pro接口"""
    token = os.getenv('TUSHARE_TOKEN')
    if not token:
        # 尝试从.env文件读取
        env_path = os.path.expanduser('~/.openclaw/workspace/.env')
        if os.path.exists(env_path):
            with open(env_path, 'r') as f:
                for line in f:
                    if line.startswith('TUSHARE_TOKEN='):
                        token = line.strip().split('=', 1)[1]
                        break
    
    if not token:
        print("错误：未设置TUSHARE_TOKEN环境变量")
        print("请先设置token：export TUSHARE_TOKEN=your_token")
        sys.exit(1)
    
    return ts.pro_api(token)


def to_float(value, default=0.0):
    """安全转换数字"""
    try:
        if value is None:
            return default
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def to_int(value, default=0):
    """安全转换整数"""
    try:
        if value is None or pd.isna(value):
            return default
        return int(float(value))
    except Exception:
        return default


def make_json_safe(value):
    """递归转换 numpy/pandas 类型，确保能被 JSON 序列化"""
    if isinstance(value, dict):
        return {str(key): make_json_safe(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [make_json_safe(item) for item in value]

    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.floating):
        if np.isnan(value) or np.isinf(value):
            return None
        return float(value)

    if isinstance(value, np.bool_):
        return bool(value)

    if isinstance(value, np.ndarray):
        return [make_json_safe(item) for item in value.tolist()]

    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()

    if isinstance(value, pd.Series):
        return {str(key): make_json_safe(item) for key, item in value.to_dict().items()}

    if isinstance(value, pd.DataFrame):
        return [make_json_safe(record) for record in value.to_dict(orient='records')]

    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    return value


def info(message):
    if not QUIET:
        print(message)


def get_realtime_quote_sina(symbol):
    """使用新浪财经获取实时行情"""
    try:
        # 转换代码格式
        if '.' in symbol:
            # 300308.SZ -> sz300308
            code_parts = symbol.split('.')
            sina_symbol = code_parts[1].lower() + code_parts[0]
        else:
            sina_symbol = symbol
        
        # 调用新浪财经脚本
        result = subprocess.run(
            ['node', f'{SINA_SCRIPT_DIR}/quote.cjs', sina_symbol],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if data.get('code') == 0 and 'data' in data:
                return data['data']
        
        return None
    except Exception as e:
        info(f"⚠️ 新浪财经查询失败: {e}")
        return None


def search_symbol_sina(query):
    """使用新浪财经搜索股票代码"""
    try:
        result = subprocess.run(
            ['node', f'{SINA_SCRIPT_DIR}/search-symbol.cjs', query],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if data.get('code') == 0 and 'data' in data:
                return data['data']
        
        return None
    except Exception as e:
        info(f"⚠️ 新浪财经搜索失败: {e}")
        return None


def get_stock_code(pro, query):
    """根据名称或代码查找股票 - 优先使用新浪财经搜索"""
    # 如果已经是代码格式
    if '.' in query:
        return query
    
    # 先尝试新浪财经搜索
    info(f"🔍 使用新浪财经搜索: {query}")
    sina_result = search_symbol_sina(query)
    
    if sina_result and len(sina_result) > 0:
        # 取第一个匹配结果
        match = sina_result[0]
        symbol = match.get('symbol', '')
        name = match.get('name', '')
        
        # 转换格式: sz300308 -> 300308.SZ
        if symbol.startswith('sz'):
            ts_code = symbol[2:] + '.SZ'
        elif symbol.startswith('sh'):
            ts_code = symbol[2:] + '.SH'
        elif symbol.startswith('bj'):
            ts_code = symbol[2:] + '.BJ'
        else:
            ts_code = symbol
        
        info(f"✓ 新浪财经匹配: {name} ({ts_code})")
        return ts_code
    
    # 备用：使用tushare搜索
    info(f"🔍 使用Tushare搜索: {query}")
    df = pro.stock_basic(exchange='', list_status='L', fields='ts_code,name,industry')
    result = df[df['name'].str.contains(query, na=False)]
    
    if len(result) == 0:
        info(f"未找到股票：{query}")
        sys.exit(1)
    elif len(result) == 1:
        return result.iloc[0]['ts_code']
    else:
        info(f"找到多个匹配结果，请选择：")
        for i, row in result.iterrows():
            info(f"  {row['ts_code']} - {row['name']} ({row['industry']})")
        sys.exit(1)


def calculate_technical_indicators(df):
    """计算技术指标"""
    df = df.sort_values('trade_date', ascending=True).reset_index(drop=True)
    close = df['close']
    high = df['high']
    low = df['low']
    
    # 移动平均线
    df['ma5'] = close.rolling(window=5).mean()
    df['ma10'] = close.rolling(window=10).mean()
    df['ma20'] = close.rolling(window=20).mean()
    df['ma60'] = close.rolling(window=60).mean()
    
    # MACD
    exp1 = close.ewm(span=12, adjust=False).mean()
    exp2 = close.ewm(span=26, adjust=False).mean()
    df['macd_dif'] = exp1 - exp2
    df['macd_dea'] = df['macd_dif'].ewm(span=9, adjust=False).mean()
    df['macd_bar'] = 2 * (df['macd_dif'] - df['macd_dea'])
    
    # RSI
    delta = close.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    # 布林带
    df['bb_middle'] = close.rolling(window=20).mean()
    df['bb_std'] = close.rolling(window=20).std()
    df['bb_upper'] = df['bb_middle'] + (df['bb_std'] * 2)
    df['bb_lower'] = df['bb_middle'] - (df['bb_std'] * 2)
    
    return df


def analyze_technical(df, realtime_data=None):
    """技术面分析 - 优先使用实时数据"""
    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest
    
    # 如果有实时数据，使用实时价格
    if realtime_data:
        current_price = realtime_data.get('price', latest['close'])
        change = realtime_data.get('change', 0)
        pct_chg = realtime_data.get('percent', 0)
        high = realtime_data.get('high', latest['high'])
        low = realtime_data.get('low', latest['low'])
        vol = realtime_data.get('volume', latest['vol']) / 100  # 新浪是股，tushare是手
        amount = realtime_data.get('amount', latest['amount'])
        pre_close = realtime_data.get('preClose', latest['pre_close'] if 'pre_close' in latest else latest['close'])
    else:
        current_price = latest['close']
        change = latest.get('change', 0)
        pct_chg = latest.get('pct_chg', 0)
        high = latest['high']
        low = latest['low']
        vol = latest['vol']
        amount = latest['amount']
        pre_close = latest.get('pre_close', latest['close'])
    
    analysis = {
        'price': current_price,
        'pre_close': pre_close,
        'change': change,
        'pct_chg': pct_chg,
        'high': high,
        'low': low,
        'vol': vol,
        'amount': amount,
        'ma5': latest['ma5'],
        'ma10': latest['ma10'],
        'ma20': latest['ma20'],
        'ma60': latest['ma60'],
        'macd_dif': latest['macd_dif'],
        'macd_dea': latest['macd_dea'],
        'macd_bar': latest['macd_bar'],
        'rsi': latest['rsi'],
        'bb_upper': latest['bb_upper'],
        'bb_middle': latest['bb_middle'],
        'bb_lower': latest['bb_lower'],
    }
    
    # 均线判断
    if analysis['price'] > analysis['ma5'] > analysis['ma10'] > analysis['ma20']:
        analysis['ma_signal'] = "多头排列（强势）"
    elif analysis['price'] < analysis['ma5'] < analysis['ma10'] < analysis['ma20']:
        analysis['ma_signal'] = "空头排列（弱势）"
    else:
        analysis['ma_signal'] = "震荡整理"
    
    # MACD判断
    if prev['macd_dif'] < prev['macd_dea'] and latest['macd_dif'] > latest['macd_dea']:
        analysis['macd_signal'] = "金叉形成（买入信号）"
    elif prev['macd_dif'] > prev['macd_dea'] and latest['macd_dif'] < latest['macd_dea']:
        analysis['macd_signal'] = "死叉形成（卖出信号）"
    elif latest['macd_dif'] > latest['macd_dea']:
        analysis['macd_signal'] = "多头排列（看涨）"
    else:
        analysis['macd_signal'] = "空头排列（看跌）"
    
    # RSI判断
    if analysis['rsi'] > 80:
        analysis['rsi_signal'] = "超买区域（警惕回调）"
    elif analysis['rsi'] > 50:
        analysis['rsi_signal'] = "强势区域"
    elif analysis['rsi'] > 20:
        analysis['rsi_signal'] = "弱势区域"
    else:
        analysis['rsi_signal'] = "超卖区域（关注反弹）"
    
    # 布林带判断
    if analysis['price'] > analysis['bb_upper']:
        analysis['bb_signal'] = "突破上轨（超买）"
    elif analysis['price'] < analysis['bb_lower']:
        analysis['bb_signal'] = "突破下轨（超卖）"
    else:
        analysis['bb_signal'] = "轨道内运行"
    
    return analysis


def analyze_fundamental(pro, ts_code):
    """基本面分析"""
    try:
        # 利润表
        income = pro.income(ts_code=ts_code, limit=4)
        fina = pro.fina_indicator(ts_code=ts_code, limit=4)
        
        fundamental = {
            'income': income,
            'fina': fina,
            'revenue_q3': income.iloc[0]['total_revenue'] / 1e8 if len(income) > 0 else 0,
            'profit_q3': income.iloc[0]['n_income'] / 1e8 if len(income) > 0 else 0,
            'roe': fina.iloc[0]['roe'] if len(fina) > 0 else 0,
            'gross_margin': fina.iloc[0]['grossprofit_margin'] if len(fina) > 0 else 0,
        }
        return fundamental
    except Exception as e:
        return {'error': str(e)}


def analyze_capital(pro, ts_code):
    """资金面分析"""
    try:
        end_date = datetime.now().strftime('%Y%m%d')
        start_date = (datetime.now() - timedelta(days=90)).strftime('%Y%m%d')
        
        daily = pro.daily(ts_code=ts_code, start_date=start_date, end_date=end_date)
        daily = daily.sort_values('trade_date', ascending=True)
        
        # 成交量分析
        avg_vol_5 = daily['vol'].tail(5).mean()
        avg_vol_20 = daily['vol'].tail(20).mean()
        latest = daily.iloc[-1]
        
        # 涨跌幅
        change_5d = (latest['close'] - daily.iloc[-5]['close']) / daily.iloc[-5]['close'] * 100 if len(daily) >= 5 else 0
        change_20d = (latest['close'] - daily.iloc[-20]['close']) / daily.iloc[-20]['close'] * 100 if len(daily) >= 20 else 0
        change_60d = (latest['close'] - daily.iloc[-60]['close']) / daily.iloc[-60]['close'] * 100 if len(daily) >= 60 else 0
        
        capital = {
            'latest_volume': to_float(latest['vol']),
            'latest_amount': to_float(latest['amount']),
            'avg_vol_5': avg_vol_5,
            'avg_vol_20': avg_vol_20,
            'vol_ratio': latest['vol'] / avg_vol_20 if avg_vol_20 > 0 else 1,
            'change_5d': change_5d,
            'change_20d': change_20d,
            'change_60d': change_60d,
        }
        
        # 融资融券
        try:
            margin = pro.margin_detail(ts_code=ts_code, limit=5)
            if len(margin) > 0:
                capital['margin_balance'] = margin.iloc[0]['rzrqye'] / 1e8  # 亿元
        except:
            capital['margin_balance'] = 0
        
        # 股东人数
        try:
            holders = pro.stk_holdernumber(ts_code=ts_code, limit=4)
            if len(holders) > 0:
                capital['holder_num'] = holders.iloc[0]['holder_num']
        except:
            capital['holder_num'] = 0
        
        return capital
    except Exception as e:
        return {'error': str(e)}


def analyze_valuation(pro, ts_code):
    """估值分析"""
    try:
        daily_basic = pro.daily_basic(ts_code=ts_code, limit=1)
        if len(daily_basic) > 0:
            row = daily_basic.iloc[0]
            profit_growth = 0
            try:
                fina = pro.fina_indicator(ts_code=ts_code, limit=1)
                if len(fina) > 0:
                    profit_growth = to_float(fina.iloc[0].get('netprofit_yoy'))
            except Exception:
                profit_growth = 0

            pe_ttm = to_float(row.get('pe_ttm') or row.get('pe'))
            peg = pe_ttm / profit_growth if profit_growth > 0 else 0
            return {
                'pe': to_float(row.get('pe')),
                'pe_ttm': pe_ttm,
                'pb': to_float(row.get('pb')),
                'ps': to_float(row.get('ps')),
                'dv_ttm': to_float(row.get('dv_ttm')),
                'turnover_rate': to_float(row.get('turnover_rate')),
                'volume_ratio': to_float(row.get('volume_ratio')),
                'total_mv': to_float(row.get('total_mv')) / 1e4,  # 亿元
                'circ_mv': to_float(row.get('circ_mv')) / 1e4,  # 亿元
                'profit_growth': profit_growth,
                'peg': peg,
            }
        return {}
    except Exception as e:
        return {'error': str(e)}


def get_valuation_judgment(metric, value):
    """估值判断"""
    value = to_float(value)
    if value <= 0:
        return "暂无数据"

    if metric == 'pe':
        if value < 15:
            return "偏低"
        if value <= 35:
            return "合理"
        return "偏高"

    if metric == 'pb':
        if value < 1.5:
            return "偏低"
        if value <= 4:
            return "合理"
        return "偏高"

    if metric == 'peg':
        if value == 0:
            return "暂无数据"
        if value < 0.8:
            return "偏低"
        if value <= 1.5:
            return "合理"
        return "偏高"

    return "合理"


def build_committee_opinion(decision, score, score_factors, technical, valuation, fundamental):
    """构建委员会决策意见 - 基于实际评分因素给出具体结论"""
    
    if decision == '买入':
        base_opinion = "【结论】可分批建仓，建议初始仓位不超过30%。"
    elif decision == '观望':
        base_opinion = "【结论】暂列观察池，等待更明确信号后再决策。"
    else:
        base_opinion = "【结论】当前不建议参与，等待趋势或估值修复。"
    
    # 添加评分依据
    factors_text = "、".join(score_factors[:4]) if score_factors else "综合评估"
    
    # 添加风险提示
    pe = to_float(valuation.get('pe_ttm') or valuation.get('pe'))
    pb = to_float(valuation.get('pb'))
    roe = to_float(fundamental.get('roe'))
    
    risk_warnings = []
    if pe > 50:
        risk_warnings.append(f"PE({pe:.1f})偏高")
    if pb > 5:
        risk_warnings.append(f"PB({pb:.1f})偏高")
    if roe < 8:
        risk_warnings.append(f"ROE({roe:.1f}%)偏低")
    
    risk_text = ""
    if risk_warnings:
        risk_text = f"【风险提示】{'；'.join(risk_warnings)}，需警惕估值回调风险。"
    
    # 添加纪律要求
    if decision == '买入':
        discipline = f"【操作纪律】跌破MA20({to_float(technical.get('ma20')):.2f}元)减仓50%，跌破MA60({to_float(technical.get('ma60')):.2f}元)清仓。"
    elif decision == '观望':
        discipline = f"【触发条件】站稳MA20({to_float(technical.get('ma20')):.2f}元)+成交量放大至1.5倍以上可建仓。"
    else:
        discipline = f"【关注指标】PE降至35倍以下或股价站稳MA60({to_float(technical.get('ma60')):.2f}元)再评估。"
    
    return f"风险管理委员会意见：评分{score}/10，主要依据：{factors_text}。{base_opinion}{risk_text}{discipline}"


def build_strategies(decision, price, technical, valuation, fundamental):
    """构建投资策略 - v2 结构化输出

    返回:
        dict: 包含 v2 结构化策略数据
    """

    ma10 = to_float(technical.get('ma10'))
    ma20 = to_float(technical.get('ma20'))
    ma60 = to_float(technical.get('ma60'))
    bb_upper = to_float(technical.get('bb_upper'))
    bb_lower = to_float(technical.get('bb_lower'))
    pe = to_float(valuation.get('pe_ttm') or valuation.get('pe'))
    roe = to_float(fundamental.get('roe'))

    # 计算建仓区间和止损价
    if decision == '买入':
        entry_1 = min(ma10, price * 0.98)
        entry_2 = min(ma20, price * 0.95)
        stop_loss = ma60

        # v2 结构化策略 - aggressive
        aggressive = {
            'risk_level': 'aggressive',
            'actions': [
                {
                    'sequence': 1,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '<=', 'value': round(entry_1, 2), 'unit': '元'}
                    ],
                    'position_percent': 10,
                    'stop_loss': round(stop_loss, 2),
                    'note': '第一笔建仓'
                },
                {
                    'sequence': 2,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '<=', 'value': round(entry_2, 2), 'unit': '元'}
                    ],
                    'position_percent': 10,
                    'note': '加仓'
                },
                {
                    'sequence': 3,
                    'action_type': 'sell',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '<=', 'value': round(stop_loss, 2), 'unit': '元'}
                    ],
                    'position_percent': 100,
                    'note': '止损'
                }
            ],
            'summary_text': f"第一笔买入价：{entry_1:.2f}元（仓位10%），加仓价：{entry_2:.2f}元（再10%），止损：{ma60:.2f}元。"
        }

        # v2 结构化策略 - balanced
        balanced = {
            'risk_level': 'balanced',
            'actions': [
                {
                    'sequence': 1,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '<=', 'value': round(ma20, 2), 'unit': '元'},
                        {'type': 'indicator', 'field': 'volume_ratio', 'operator': '>', 'value': 1.2, 'unit': '倍'}
                    ],
                    'position_percent': 8,
                    'stop_loss': round(stop_loss, 2),
                    'note': '第一笔建仓'
                },
                {
                    'sequence': 2,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '<=', 'value': round(ma20 * 0.98, 2), 'unit': '元'}
                    ],
                    'position_percent': 8,
                    'note': '第二笔加仓'
                }
            ],
            'summary_text': f"第一笔：{ma20:.2f}元（仓位8%），第二笔：{ma20*0.98:.2f}元（再8%），需成交量>1.2倍均量确认。"
        }

        # v2 结构化策略 - conservative
        if pe > 40:
            conservative = {
                'risk_level': 'conservative',
                'actions': [
                    {
                        'sequence': 1,
                        'action_type': 'hold',
                        'trigger_conditions': [
                            {'type': 'price', 'field': 'price', 'operator': '<=', 'value': round(ma20 * 0.95, 2), 'unit': '元'}
                        ],
                        'position_percent': 0,
                        'note': '观望，等待估值回归'
                    }
                ],
                'summary_text': f"观望。等待PE降至35倍以下或股价回调至{ma20*0.95:.2f}元以下再考虑。"
            }
        else:
            conservative = {
                'risk_level': 'conservative',
                'actions': [
                    {
                        'sequence': 1,
                        'action_type': 'hold',
                        'trigger_conditions': [
                            {'type': 'price', 'field': 'price', 'operator': '>=', 'value': round(ma20, 2), 'unit': '元'},
                            {'type': 'indicator', 'field': 'volume_ratio', 'operator': '>=', 'value': 1.5, 'unit': '倍'}
                        ],
                        'position_percent': 0,
                        'note': '观望，等待确认信号'
                    }
                ],
                'summary_text': f"观望。等待股价站稳{ma20:.2f}元且成交量持续放大3日以上。"
            }

        # 结构化数据用于条件单等场景
        structured_strategy = {
            'buyZone': [round(min(entry_1, entry_2), 2), round(max(entry_1, entry_2), 2)],
            'stopLoss': round(stop_loss, 2),
            'firstBuyPercent': 0.10,
            'maxPosition': 0.20,
            'riskProfile': 'aggressive'
        }

    elif decision == '观望':
        entry_1 = ma20
        entry_2 = ma20 * 0.98
        stop_loss = ma60

        # v2 结构化策略 - aggressive
        aggressive = {
            'risk_level': 'aggressive',
            'actions': [
                {
                    'sequence': 1,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '<=', 'value': round(ma20, 2), 'unit': '元'}
                    ],
                    'position_percent': 5,
                    'stop_loss': round(stop_loss, 2),
                    'note': '试探性建仓'
                },
                {
                    'sequence': 2,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '>=', 'value': round(ma10, 2), 'unit': '元'}
                    ],
                    'position_percent': 10,
                    'note': '确认站稳后加仓'
                }
            ],
            'summary_text': f"试探性建仓：{ma20:.2f}元（仓位5%），确认站稳{ma10:.2f}元后加仓至15%。"
        }

        # v2 结构化策略 - balanced
        balanced = {
            'risk_level': 'balanced',
            'actions': [
                {
                    'sequence': 1,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '>=', 'value': round(ma20, 2), 'unit': '元'},
                        {'type': 'indicator', 'field': 'volume_ratio', 'operator': '>', 'value': 1.2, 'unit': '倍'}
                    ],
                    'position_percent': 5,
                    'stop_loss': round(stop_loss, 2),
                    'note': '第一笔建仓（等待信号确认）'
                },
                {
                    'sequence': 2,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '>=', 'value': round(ma20 * 1.02, 2), 'unit': '元'}
                    ],
                    'position_percent': 5,
                    'note': '第二笔加仓'
                }
            ],
            'summary_text': f"等待明确信号：站稳{ma20:.2f}元+成交量放大，第一笔{ma20:.2f}元（5%），第二笔{ma20*1.02:.2f}元（再5%）。"
        }

        # v2 结构化策略 - conservative
        conservative = {
            'risk_level': 'conservative',
            'actions': [
                {
                    'sequence': 1,
                    'action_type': 'hold',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '>=', 'value': round(ma20, 2), 'unit': '元'}
                    ],
                    'position_percent': 0,
                    'note': '继续观望'
                }
            ],
            'summary_text': f"继续观望。关注两点：1)股价站稳{ma20:.2f}元；2)PE降至{pe*0.9:.0f}倍以下。满足任一可小仓位试水。"
        }

        structured_strategy = {
            'buyZone': [round(entry_2, 2), round(entry_1, 2)],
            'stopLoss': round(stop_loss, 2),
            'firstBuyPercent': 0.08,
            'maxPosition': 0.15,
            'riskProfile': 'balanced'
        }

    else:  # 回避
        entry_1 = bb_lower
        entry_2 = bb_lower * 0.97
        stop_loss = bb_lower * 0.95

        # v2 结构化策略 - aggressive
        aggressive = {
            'risk_level': 'aggressive',
            'actions': [
                {
                    'sequence': 1,
                    'action_type': 'buy',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '<=', 'value': round(bb_lower, 2), 'unit': '元'}
                    ],
                    'position_percent': 3,
                    'stop_loss': round(stop_loss, 2),
                    'note': '超跌博弈反弹'
                }
            ],
            'summary_text': f"暂不介入。若超跌至{bb_lower:.2f}元附近可小仓位(3%)博弈反弹，严格止损{bb_lower*0.97:.2f}元。"
        }

        # v2 结构化策略 - balanced
        balanced = {
            'risk_level': 'balanced',
            'actions': [
                {
                    'sequence': 1,
                    'action_type': 'hold',
                    'trigger_conditions': [
                        {'type': 'price', 'field': 'price', 'operator': '>=', 'value': round(ma60, 2), 'unit': '元'}
                    ],
                    'position_percent': 0,
                    'note': '等待趋势修复'
                }
            ],
            'summary_text': f"观望。等待趋势修复：股价站稳MA60({ma60:.2f}元)且MACD金叉后再评估。"
        }

        # v2 结构化策略 - conservative
        conservative = {
            'risk_level': 'conservative',
            'actions': [
                {
                    'sequence': 1,
                    'action_type': 'hold',
                    'trigger_conditions': [],
                    'position_percent': 0,
                    'note': '回避'
                }
            ],
            'summary_text': f"回避。当前PE({pe:.1f})或技术形态不支持买入，建议关注其他标的。"
        }

        structured_strategy = {
            'buyZone': [round(entry_2, 2), round(entry_1, 2)],
            'stopLoss': round(stop_loss, 2),
            'firstBuyPercent': 0.05,
            'maxPosition': 0.10,
            'riskProfile': 'conservative'
        }

    return {
        'strategies': {
            'aggressive': aggressive,
            'balanced': balanced,
            'conservative': conservative,
        },
        'structured_strategy': structured_strategy
    }


def build_target_prices(technical, valuation):
    """目标价格测算 - v2 结构化输出"""
    current_price = to_float(technical.get('price'))
    ma10 = to_float(technical.get('ma10'), current_price)
    ma20 = to_float(technical.get('ma20'), current_price)
    bb_upper = to_float(technical.get('bb_upper'), current_price)
    pe_ttm = to_float(valuation.get('pe_ttm') or valuation.get('pe'))
    peg = to_float(valuation.get('peg'))

    short_target = max(current_price * 1.05, ma10)
    mid_target = max(current_price * 1.10, ma20)
    long_target = max(current_price * 1.18, bb_upper)

    if 0 < pe_ttm < 20:
        short_target = max(short_target, current_price * 1.08)
        mid_target = max(mid_target, current_price * 1.15)
        long_target = max(long_target, current_price * 1.25)
    elif pe_ttm > 45:
        short_target = min(short_target, current_price * 1.03)
        mid_target = min(mid_target, current_price * 1.07)
        long_target = min(long_target, current_price * 1.12)

    logic_prefix = "技术修复"
    if 0 < peg <= 1.5:
        logic_prefix = "业绩增长+估值匹配"
    elif peg > 1.5:
        logic_prefix = "业绩兑现消化高估值"

    # v2 结构化输出 - period 使用 short/mid/long
    return [
        {
            'period': 'short',
            'price': round(short_target, 2),
            'logic': f'{logic_prefix}，回归 MA10 附近',
            'expected_return': round((short_target / current_price - 1) * 100, 2) if current_price > 0 else 0,
        },
        {
            'period': 'mid',
            'price': round(mid_target, 2),
            'logic': f'{logic_prefix}，回归 MA20/中期估值中枢',
            'expected_return': round((mid_target / current_price - 1) * 100, 2) if current_price > 0 else 0,
        },
        {
            'period': 'long',
            'price': round(long_target, 2),
            'logic': f'{logic_prefix}，向布林上轨与中长期预期扩展',
            'expected_return': round((long_target / current_price - 1) * 100, 2) if current_price > 0 else 0,
        },
    ]


def build_structured_payload(ts_code, basic_info, technical, fundamental, capital, valuation, realtime_data=None):
    """构建结构化分析结果"""
    stock_name = basic_info.get('name', ts_code)
    industry = basic_info.get('industry', '')
    price = to_float(technical.get('price'))
    report_score = 6.0

    if price > to_float(technical.get('ma20')):
        report_score += 1.0
    if '金叉' in technical.get('macd_signal', '') or '多头' in technical.get('macd_signal', ''):
        report_score += 1.0
    if 0 < to_float(valuation.get('pe_ttm') or valuation.get('pe')) <= 35:
        report_score += 1.0
    if to_float(capital.get('vol_ratio')) >= 1:
        report_score += 0.5
    if to_float(fundamental.get('roe')) >= 8:
        report_score += 0.5

    report_score = min(10, round(report_score, 1))
    if report_score >= 8.4:
        decision = '买入'
    elif report_score >= 6.4:
        decision = '观望'
    else:
        decision = '回避'

    # 保留score_factors用于委员会意见
    score_factors = []
    if price > to_float(technical.get('ma20')):
        score_factors.append('股价在MA20上方')
    if '金叉' in technical.get('macd_signal', '') or '多头' in technical.get('macd_signal', ''):
        score_factors.append('MACD多头信号')
    if 0 < to_float(valuation.get('pe_ttm') or valuation.get('pe')) <= 35:
        score_factors.append('PE估值合理')
    if to_float(capital.get('vol_ratio')) >= 1:
        score_factors.append('成交量活跃')
    if to_float(fundamental.get('roe')) >= 8:
        score_factors.append('ROE良好')

    # 添加扣分因素
    if price <= to_float(technical.get('ma20')):
        score_factors.append('股价跌破MA20')
    if '死叉' in technical.get('macd_signal', ''):
        score_factors.append('MACD死叉')
    pe_val = to_float(valuation.get('pe_ttm') or valuation.get('pe'))
    if pe_val > 50:
        score_factors.append('PE估值偏高')
        report_score -= 0.3
    elif to_float(capital.get('vol_ratio')) < 0.8:
        report_score -= 0.2
        score_factors.append('成交量萎缩')
    
    # 基本面评分（最高+0.5分）
    roe = to_float(fundamental.get('roe'))
    if roe >= 15:
        report_score += 0.3
        score_factors.append('ROE优秀')
    elif roe >= 10:
        report_score += 0.2
        score_factors.append('ROE良好')
    elif roe < 5:
        report_score -= 0.3
        score_factors.append('ROE偏低')
    
    # 限制分数范围（0-10 分量程）
    report_score = max(0.0, min(10.0, round(report_score, 1)))
    
    technical_table = [
        {'indicator': 'MA5', 'value': round(to_float(technical.get('ma5')), 2), 'judgment': '股价在MA5上方' if price >= to_float(technical.get('ma5')) else '股价跌破MA5'},
        {'indicator': 'MA10', 'value': round(to_float(technical.get('ma10')), 2), 'judgment': '股价在MA10上方' if price >= to_float(technical.get('ma10')) else '股价跌破MA10'},
        {'indicator': 'MA20', 'value': round(to_float(technical.get('ma20')), 2), 'judgment': technical.get('ma_signal', '暂无')},
        {'indicator': 'MA60', 'value': round(to_float(technical.get('ma60')), 2), 'judgment': '股价在MA60上方' if price >= to_float(technical.get('ma60')) else '股价跌破MA60'},
        {'indicator': 'MACD DIF', 'value': round(to_float(technical.get('macd_dif')), 4), 'judgment': technical.get('macd_signal', '暂无')},
        {'indicator': 'MACD DEA', 'value': round(to_float(technical.get('macd_dea')), 4), 'judgment': '多头占优' if to_float(technical.get('macd_dif')) >= to_float(technical.get('macd_dea')) else '空头占优'},
        {'indicator': 'MACD柱', 'value': round(to_float(technical.get('macd_bar')), 4), 'judgment': '红柱' if to_float(technical.get('macd_bar')) >= 0 else '绿柱'},
        {'indicator': 'RSI(14)', 'value': round(to_float(technical.get('rsi')), 2), 'judgment': technical.get('rsi_signal', '暂无')},
        {'indicator': '布林上轨', 'value': round(to_float(technical.get('bb_upper')), 2), 'judgment': '压力位'},
        {'indicator': '布林中轨', 'value': round(to_float(technical.get('bb_middle')), 2), 'judgment': technical.get('bb_signal', '暂无')},
        {'indicator': '布林下轨', 'value': round(to_float(technical.get('bb_lower')), 2), 'judgment': '支撑位'},
    ]

    pe_value = to_float(valuation.get('pe_ttm') or valuation.get('pe'))
    pb_value = to_float(valuation.get('pb'))
    peg_value = to_float(valuation.get('peg'))
    valuation_table = [
        {'indicator': 'PE(TTM)', 'value': round(pe_value, 2), 'judgment': get_valuation_judgment('pe', pe_value)},
        {'indicator': 'PB', 'value': round(pb_value, 2), 'judgment': get_valuation_judgment('pb', pb_value)},
        {'indicator': 'PEG', 'value': round(peg_value, 2), 'judgment': get_valuation_judgment('peg', peg_value)},
        {'indicator': 'PS', 'value': round(to_float(valuation.get('ps')), 2), 'judgment': '偏高' if to_float(valuation.get('ps')) > 6 else '合理'},
    ]

    fund_flow = {
        '成交量(万手)': round(to_float(capital.get('latest_volume')) / 1e4, 2),
        '成交额(亿元)': round(to_float(capital.get('latest_amount')) / 1e5, 2),
        '5日均量(万手)': round(to_float(capital.get('avg_vol_5')) / 1e4, 2),
        '20日均量(万手)': round(to_float(capital.get('avg_vol_20')) / 1e4, 2),
        '量比': round(to_float(capital.get('vol_ratio')), 2),
        '融资融券余额(亿元)': round(to_float(capital.get('margin_balance')), 2),
        '股东人数(户)': to_int(capital.get('holder_num')),
    }

    target_prices = build_target_prices(technical, valuation)

    bull_points = [
        f"当前价格 {price:.2f} 元，{technical.get('ma_signal', '均线信号待观察')}。",
        f"{technical.get('macd_signal', 'MACD信号待观察')}，RSI 为 {to_float(technical.get('rsi')):.2f}。",
        f"ROE {to_float(fundamental.get('roe')):.2f}% 、毛利率 {to_float(fundamental.get('gross_margin')):.2f}% 。",
        f"PE(TTM) {pe_value:.2f}、PB {pb_value:.2f}，估值处于 {get_valuation_judgment('pe', pe_value)} 区间。",
        f"量比 {to_float(capital.get('vol_ratio')):.2f}，融资融券余额 {to_float(capital.get('margin_balance')):.2f} 亿元。",
    ]
    bear_points = [
        f"若价格跌破 MA20 {to_float(technical.get('ma20')):.2f} 元，趋势会重新转弱。",
        f"布林带信号为 {technical.get('bb_signal', '暂无')}，短线波动仍需提防。",
        f"若 PEG 升至 {peg_value:.2f} 且业绩增速放缓，高估值压力会变大。",
        f"股东人数 {to_int(capital.get('holder_num'))} 户，筹码集中度仍需继续跟踪。",
        "外部数据源若异常，盘中判断会失真，需要暂停追单。",
    ]

    return {
        'stock_code': ts_code,
        'stock_name': stock_name,
        'industry': industry,
        'report_score': report_score,
        'decision': decision,
        'generated_at': datetime.now().isoformat(),
        'stock': {
            'name': stock_name,
            'ts_code': ts_code,
            'industry': industry,
            'area': basic_info.get('area', ''),
        },
        'summary': {
            'current_price': round(price, 2),
            'change': round(to_float(technical.get('change')), 2),
            'pct_chg': round(to_float(technical.get('pct_chg')), 2),
            'high': round(to_float(technical.get('high')), 2),
            'low': round(to_float(technical.get('low')), 2),
            'volume': round(to_float(capital.get('latest_volume')) / 1e4, 2),
            'amount': round(to_float(capital.get('latest_amount')) / 1e5, 2),
            'total_mv': round(to_float(valuation.get('total_mv')), 2),
            'report_score': report_score,
            'rating': f"{'★' * int(round(report_score))}{'☆' * (5 - int(round(report_score)))}",
            'decision': decision,
        },
        'technical': {
            **{key: round(to_float(technical.get(key)), 4 if 'macd' in key else 2) for key in ['price', 'pre_close', 'change', 'pct_chg', 'high', 'low', 'vol', 'amount', 'ma5', 'ma10', 'ma20', 'ma60', 'macd_dif', 'macd_dea', 'macd_bar', 'rsi', 'bb_upper', 'bb_middle', 'bb_lower']},
            'ma_signal': technical.get('ma_signal', ''),
            'macd_signal': technical.get('macd_signal', ''),
            'rsi_signal': technical.get('rsi_signal', ''),
            'bb_signal': technical.get('bb_signal', ''),
            'table': technical_table,
        },
        'valuation': {
            **valuation,
            'table': valuation_table,
        },
        'capital': {
            **capital,
            'fund_flow': fund_flow,
        },
        'fundamental': {
            'revenue_q3': round(to_float(fundamental.get('revenue_q3')), 2),
            'profit_q3': round(to_float(fundamental.get('profit_q3')), 2),
            'roe': round(to_float(fundamental.get('roe')), 2),
            'gross_margin': round(to_float(fundamental.get('gross_margin')), 2),
        },
        'bull_points': bull_points,
        'bear_points': bear_points,
        'committee_opinion': build_committee_opinion(decision, report_score, score_factors, technical, valuation, fundamental),
        'watch_points': [
            '实时价格能否持续运行在 MA20 上方',
            '下一期财报营收和净利润增速是否继续改善',
            '融资融券余额和成交量是否同步提升',
            '行业政策、集采、订单或新产品进展',
            '股东人数变化是否显示筹码进一步集中',
        ],
        'strategies': build_strategies(decision, price, technical, valuation, fundamental)['strategies'],
        'buyZone': build_strategies(decision, price, technical, valuation, fundamental)['structured_strategy']['buyZone'],
        'stopLoss': build_strategies(decision, price, technical, valuation, fundamental)['structured_strategy']['stopLoss'],
        'targetPrice': target_prices[1]['price'] if len(target_prices) > 1 else target_prices[0]['price'],
        'strategy': build_strategies(decision, price, technical, valuation, fundamental)['structured_strategy'],
        'operations': {
            'short_term': {
                'buy_zone': [round(to_float(technical.get('ma10')), 2), round(to_float(technical.get('ma20')), 2)],
                'stop_loss': round(to_float(technical.get('ma60')), 2),
                'summary': f"短线关注 {to_float(technical.get('ma10')):.2f}-{to_float(technical.get('ma20')):.2f} 元区间承接，失守则止损。",
                'conditions': [
                    {'type': 'price', 'field': 'price', 'operator': '>=', 'value': round(to_float(technical.get('ma20')), 2)}
                ]
            },
            'mid_term': {
                'buy_zone': [round(to_float(technical.get('ma20')), 2), round(to_float(technical.get('ma60')), 2)],
                'target_price': target_prices[1]['price'] if len(target_prices) > 1 else None,
                'summary': "中线重点看业绩、资金和价格是否共振，只有三者同步转强才考虑加仓。",
                'conditions': []
            },
            'long_term': {
                'target_price': target_prices[2]['price'] if len(target_prices) > 2 else None,
                'summary': "长线继续跟踪行业景气、产品兑现与估值中枢变化。",
                'conditions': []
            }
        },
        'target_prices': target_prices,
        'realtime_quote': realtime_data or {},
    }


def generate_report(pro, ts_code, basic_info, technical, fundamental, capital, valuation, realtime_data=None):
    """生成分析报告"""
    payload = build_structured_payload(ts_code, basic_info, technical, fundamental, capital, valuation, realtime_data)

    report = [
        f"# {payload['stock']['name']}（{ts_code}）投资分析报告",
        "",
        f"**报告生成日期：** {datetime.now().strftime('%Y年%m月%d日 %H:%M')}",
        "**数据来源：** 新浪财经实时 + Tushare历史/财务/资金",
        "**投资风格：** 价值 + 成长",
        "",
        "---",
        "",
        "# 核心信息",
        "",
        "| 项目 | 内容 |",
        "|------|------|",
        f"| **股票名称** | {payload['stock']['name']} |",
        f"| **股票代码** | {payload['stock']['ts_code']} |",
        f"| **所属行业** | {payload['stock']['industry']} |",
        f"| **当前价格** | {payload['summary']['current_price']:.2f} 元 |",
        f"| **今日涨跌** | {payload['summary']['change']:+.2f} 元 ({payload['summary']['pct_chg']:+.2f}%) |",
        f"| **今日最高** | {payload['summary']['high']:.2f} 元 |",
        f"| **今日最低** | {payload['summary']['low']:.2f} 元 |",
        f"| **总市值** | {payload['summary']['total_mv']:.2f} 亿元 |",
        f"| **推荐评分** | {payload['summary']['rating']}（{payload['summary']['report_score']:.1f}/10） |",
        f"| **最终决策** | **{payload['summary']['decision']}** |",
        "",
        "---",
        "",
        "# 关键技术指标",
        "",
        "| 指标 | 数值 | 判断 |",
        "|------|------|------|",
    ]

    for item in payload['technical']['table']:
        precision = 4 if 'MACD' in item['indicator'] else 2
        report.append(f"| **{item['indicator']}** | {to_float(item['value']):.{precision}f} {'元' if item['indicator'].startswith('MA') or '布林' in item['indicator'] else ''}| {item['judgment']} |")

    report.extend([
        "",
        "## 技术信号总结",
        "",
        f"- **均线排列：** {payload['technical']['ma_signal']}",
        f"- **MACD信号：** {payload['technical']['macd_signal']}",
        f"- **RSI信号：** {payload['technical']['rsi_signal']}",
        f"- **布林带：** {payload['technical']['bb_signal']}",
        "",
        "---",
        "",
        "# 估值分析",
        "",
        "| 指标 | 数值 | 判断 |",
        "|------|------|------|",
    ])

    for item in payload['valuation']['table']:
        report.append(f"| **{item['indicator']}** | {to_float(item['value']):.2f} | {item['judgment']} |")

    report.extend([
        "",
        "---",
        "",
        "# 资金面数据",
        "",
        "| 指标 | 数值 |",
        "|------|------|",
    ])

    for key, value in payload['capital']['fund_flow'].items():
        if isinstance(value, float):
            report.append(f"| **{key}** | {value:.2f} |")
        else:
            report.append(f"| **{key}** | {value} |")

    report.extend([
        "",
        "---",
        "",
        "# 核心争议点（多方 vs 空方）",
        "",
        "## 多方观点",
    ])
    report.extend([f"- {item}" for item in payload['bull_points']])
    report.extend([
        "",
        "## 空方观点",
    ])
    report.extend([f"- {item}" for item in payload['bear_points']])
    report.extend([
        "",
        "---",
        "",
        "# 风险管理委员会决策意见",
        "",
        payload['committee_opinion'],
        "",
        "---",
        "",
        "# 关键观察点",
        "",
    ])
    report.extend([f"{index + 1}. {item}" for index, item in enumerate(payload['watch_points'])])
    report.extend([
        "",
        "---",
        "",
        "# 适合你的策略",
        "",
        f"## 激进型\n- {payload['strategies']['aggressive']['summary_text']}",
        "",
        f"## 稳健型\n- {payload['strategies']['balanced']['summary_text']}",
        "",
        f"## 保守型\n- {payload['strategies']['conservative']['summary_text']}",
        "",
        "---",
        "",
        "# 操作建议",
        "",
        f"- **短线（1周）**：{payload['operations']['short_term']['summary']}",
        f"- **中线（1-3个月）**：{payload['operations']['mid_term']['summary']}",
        f"- **长线（6个月以上）**：{payload['operations']['long_term']['summary']}",
        "",
        "---",
        "",
        "# 目标价格测算",
        "",
        "| 时间 | 目标价 | 对应逻辑 | 预期涨幅 |",
        "|------|--------|----------|----------|",
    ])

    # v2: target_prices 使用 period: short/mid/long 和 price 字段
    period_labels = {'short': '1个月', 'mid': '3个月', 'long': '6个月'}
    for item in payload['target_prices']:
        period_label = period_labels.get(item['period'], item['period'])
        report.append(f"| {period_label} | {to_float(item['price']):.2f} 元 | {item['logic']} | {to_float(item['expected_return']):+.2f}% |")

    report.extend([
        "",
        "---",
        "",
        "# 风险控制",
        "",
        f"- **硬止损**：若价格跌破 {to_float(payload['technical']['bb_lower']):.2f} 元且量能放大，重新评估持仓逻辑。",
        f"- **动态止损**：若股价重新跌破 {to_float(payload['technical']['ma20']):.2f} 元，趋势确认失效。",
        "- **时间止损**：若后续财报不能延续营收/利润改善，则下调研究优先级。",
        "",
        "**免责声明：** 本报告基于公开数据生成，不构成投资建议。股市有风险，投资需谨慎。",
    ])

    return '\n'.join(report)


def main():
    """主函数"""
    global QUIET
    parser = argparse.ArgumentParser(description='A股个股分析')
    parser.add_argument('query', nargs='?', help='股票代码或名称')
    parser.add_argument('--json', action='store_true', dest='as_json', help='输出 JSON')
    args = parser.parse_args()

    if not args.query:
        print("使用方法: python3 stock_analyzer.py [股票代码或名称]")
        print("示例: python3 stock_analyzer.py 300058.SZ")
        sys.exit(1)

    query = args.query
    quiet = args.as_json
    QUIET = quiet

    def log(message):
        if not quiet:
            print(message)

    log(f"🔍 正在分析: {query}")
    log("-" * 60)
    
    # 初始化
    pro = init_tushare()
    
    # 获取股票代码 - 优先使用新浪财经搜索
    ts_code = get_stock_code(pro, query)
    log(f"✓ 股票代码: {ts_code}")
    
    # 获取基础信息
    basic = pro.stock_basic(ts_code=ts_code, fields='ts_code,name,industry,area')
    basic_info = basic.iloc[0].to_dict()
    log(f"✓ 股票名称: {basic_info['name']}")
    
    # 获取新浪财经实时数据
    log("✓ 正在获取新浪财经实时行情...")
    realtime_data = get_realtime_quote_sina(ts_code)
    
    if realtime_data:
        log(f"✓ 实时价格: {realtime_data.get('price', 'N/A')} 元")
        log(f"✓ 涨跌幅: {realtime_data.get('percent', 0):+.2f}%")
    else:
        log("⚠️ 新浪财经获取失败，使用Tushare数据")
    
    # 获取日线数据并计算技术指标（Tushare用于历史数据）
    end_date = datetime.now().strftime('%Y%m%d')
    start_date = (datetime.now() - timedelta(days=180)).strftime('%Y%m%d')
    daily = pro.daily(ts_code=ts_code, start_date=start_date, end_date=end_date)
    
    if len(daily) == 0:
        log("错误：无法获取股票数据")
        sys.exit(1)
    
    log(f"✓ 获取到 {len(daily)} 个交易日数据")
    
    # 计算技术指标
    daily = calculate_technical_indicators(daily)
    technical = analyze_technical(daily, realtime_data)
    
    # 基本面分析
    log("✓ 正在分析基本面...")
    fundamental = analyze_fundamental(pro, ts_code)
    
    # 资金面分析
    log("✓ 正在分析资金面...")
    capital = analyze_capital(pro, ts_code)
    
    # 估值分析
    log("✓ 正在分析估值...")
    valuation = analyze_valuation(pro, ts_code)

    payload = build_structured_payload(ts_code, basic_info, technical, fundamental, capital, valuation, realtime_data)
    
    # 生成报告
    log("✓ 正在生成报告...")
    report = generate_report(pro, ts_code, basic_info, technical, fundamental, capital, valuation, realtime_data)
    
    # 保存报告到 report/stockana/ 文件夹
    report_dir = "/Users/vvc/.openclaw/workspace/report/stockana"
    os.makedirs(report_dir, exist_ok=True)
    output_file = f"{report_dir}/{basic_info['name']}_分析报告_{datetime.now().strftime('%Y%m%d')}.md"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    payload['report_path'] = output_file
    payload = make_json_safe(payload)

    if args.as_json:
        print(json.dumps(payload, ensure_ascii=False))
        return

    log("-" * 60)
    log(f"✅ 分析报告已生成: {output_file}")
    print()
    print(report)


if __name__ == "__main__":
    main()
