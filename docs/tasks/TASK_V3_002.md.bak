# TASK_V3_002 - 行业 Top3 自动筛选

**版本**: V3.0  
**优先级**: P0  
**状态**: pending  
**创建日期**: 2026-03-24  
**预计工期**: 0.5 天  

---

## 📋 任务描述

基于 TASK_V3_001 的行业评分结果，自动筛选 Top3 行业。

---

## 🎯 目标

1. 从行业评分排行榜中自动筛选 Top3
2. 支持配置 Top N（默认 3）
3. 输出 Top3 行业列表供后续个股筛选使用

---

## 📐 技术规范

### 输入
- 行业评分排行榜（来自 TASK_V3_001）
- Top N 配置（默认 3）

### 处理逻辑
```python
def select_top_industries(industry_scores, top_n=3):
    """
    筛选 Top N 行业
    
    Args:
        industry_scores: 行业评分排行榜（已排序）
        top_n: 筛选数量
    
    Returns:
        list: Top N 行业列表
    """
    # 按综合评分降序排序，取前 N 个
    top_industries = sorted(
        industry_scores,
        key=lambda x: x['total_score'],
        reverse=True
    )[:top_n]
    
    return top_industries
```

### 输出
```json
{
  "top_industries": [
    {"rank": 1, "industry": "AI 算力", "total_score": 83.5},
    {"rank": 2, "industry": "创新药", "total_score": 81.2},
    {"rank": 3, "industry": "新能源", "total_score": 79.8}
  ],
  "selected_count": 3,
  "timestamp": "2026-03-24T10:00:00Z"
}
```

---

## ✅ 验收标准

- [ ] 正确筛选 Top3 行业
- [ ] 支持配置 Top N（1-10）
- [ ] 输出格式符合规范
- [ ] 单元测试通过率 100%

---

## 📁 交付物

1. `api/industry-select.js` - 行业筛选 API
2. `api/server.js` - 新增路由 `/api/industry/top`
3. `docs/tasks/TASK_V3_002.md` - 任务文档（本文件）

---

## 🔗 依赖关系

- 前置任务：TASK_V3_001（4 维度行业自动评分）
- 后续任务：TASK_V3_003（Top3 行业内个股 7 因子评分）
