# TASK_V3_004 - 个股 Top10 自动筛选

**版本**: V3.0  
**优先级**: P0  
**状态**: pending  
**创建日期**: 2026-03-24  
**预计工期**: 0.5 天  

---

## 📋 任务描述

基于 TASK_V3_003 的个股评分结果，自动筛选 Top10 股票。

---

## 🎯 目标

1. 从个股评分排行榜中自动筛选 Top10
2. 支持配置 Top N（默认 10）
3. 输出核心股票池列表

---

## 📐 技术规范

### 输入
- 个股评分列表（来自 TASK_V3_003）
- Top N 配置（默认 10）

### 处理逻辑
```python
def select_top_stocks(stock_scores, top_n=10):
    """
    筛选 Top N 股票
    
    Args:
        stock_scores: 个股评分列表（已排序）
        top_n: 筛选数量
    
    Returns:
        list: Top N 股票列表
    """
    # 按综合评分降序排序，取前 N 个
    top_stocks = sorted(
        stock_scores,
        key=lambda x: x['total_score'],
        reverse=True
    )[:top_n]
    
    return top_stocks
```

### 输出
```json
{
  "core_pool": [
    {"rank": 1, "ts_code": "000001.SZ", "stock_name": "平安银行", "total_score": 85.2},
    {"rank": 2, "ts_code": "000002.SZ", "stock_name": "万科 A", "total_score": 83.5},
    ...
  ],
  "selected_count": 10,
  "timestamp": "2026-03-24T10:00:00Z"
}
```

---

## ✅ 验收标准

- [ ] 正确筛选 Top10 股票
- [ ] 支持配置 Top N（1-20）
- [ ] 输出格式符合规范
- [ ] 单元测试通过率 100%

---

## 📁 交付物

1. `api/stock-select.js` - 个股筛选 API
2. `api/server.js` - 新增路由 `/api/stock/top`
3. `docs/tasks/TASK_V3_004.md` - 任务文档（本文件）

---

## 🔗 依赖关系

- 前置任务：TASK_V3_003（Top3 行业内个股 7 因子评分）
- 后续任务：TASK_V3_005（选股 UI 改造）、TASK_V3_006（选股→分钟线获取触发）
