# TASK_V3_003 - Top3 行业内个股 7 因子评分

**版本**: V3.0  
**优先级**: P0  
**状态**: ✅ 已完成  
**创建日期**: 2026-03-24  
**预计工期**: 1 天  

---

## 📋 任务描述

在 TASK_V3_002 筛选的 Top3 行业内，对个股进行 7 因子自动评分。

---

## 🎯 目标

1. 获取 Top3 行业内的所有个股
2. 对每只股票进行 7 因子评分
3. 输出个股评分列表

---

## 📐 技术规范

### 输入
- Top3 行业列表（来自 TASK_V3_002）
- 7 因子权重配置

### 7 因子
1. 政策敏感度
2. 商业化显现
3. 舆论热度
4. 资本关注度
5. 技术面强度
6. 估值合理性
7. 成长确定性

### 处理逻辑
```python
def score_stocks_in_industries(top_industries, factor_weights):
    """
    对 Top3 行业内的个股进行 7 因子评分
    
    Args:
        top_industries: Top3 行业列表
        factor_weights: 7 因子权重配置
    
    Returns:
        list: 个股评分列表
    """
    all_stocks = []
    
    for industry in top_industries:
        # 1. 获取行业内的所有个股
        stocks = get_stocks_by_industry(industry['industry'])
        
        # 2. 对每只股票进行 7 因子评分
        for stock in stocks:
            stock_score = calculate_seven_factors(stock, factor_weights)
            stock_score['industry'] = industry['industry']
            all_stocks.append(stock_score)
    
    return all_stocks
```

### 输出
```json
[
  {
    "ts_code": "000001.SZ",
    "stock_name": "平安银行",
    "industry": "金融",
    "factor_scores": {
      "policy": 80,
      "commercial": 85,
      "public": 70,
      "capital": 75,
      "technical": 82,
      "valuation": 78,
      "growth": 88
    },
    "total_score": 79.7
  },
  ...
]
```

---

## ✅ 验收标准

- [ ] 正确获取 Top3 行业内的所有个股
- [ ] 7 因子评分计算准确
- [ ] 输出格式符合规范
- [ ] 性能：Top3 行业内个股评分 < 10 秒

---

## 📁 交付物

1. `api/stock-score.js` - 个股评分 API
2. `api/server.js` - 新增路由 `/api/stock/score`
3. `docs/tasks/TASK_V3_003.md` - 任务文档（本文件）

---

## 🔗 依赖关系

- 前置任务：TASK_V3_002（行业 Top3 自动筛选）
- 后续任务：TASK_V3_004（个股 Top10 自动筛选）
