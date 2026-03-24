# TASK_V3_001 - 4 维度行业自动评分

**版本**: V3.0  
**优先级**: P0  
**状态**: completed  
**创建日期**: 2026-03-24  
**预计工期**: 1 天  

---

## 📋 任务描述

实现 4 维度行业自动评分功能，替代当前手动选择行业的流程。

### 当前流程（V2）
```
用户手动选择行业 → 手动选择个股
```

### 目标流程（V3）
```
4 维度行业评分 → 自动输出 Top3 行业 → 7 因子个股评分 → 自动输出 Top10 股票
```

---

## 🎯 目标

1. 实现 4 维度（政策/商业化/舆论/资本）行业自动评分
2. 支持权重配置（默认：25%/30%/25%/20%）
3. 输出行业评分排行榜

---

## 📐 技术规范

### 输入
- 行业列表（全市场行业）
- 4 维度权重配置（可调整）

### 处理逻辑
```python
def score_industry(industry, weights):
    """
    计算行业综合评分
    
    Args:
        industry: 行业名称
        weights: dict(policy, commercial, public, capital)
    
    Returns:
        float: 综合评分 (0-100)
    """
    # 1. 获取 4 维度原始数据
    policy_score = get_policy_score(industry)      # 政策支持力度
    commercial_score = get_commercial_score(industry)  # 商业化显现
    public_score = get_public_score(industry)      # 舆论热度
    capital_score = get_capital_score(industry)    # 资本关注度
    
    # 2. 加权计算
    total = (
        policy_score * weights['policy'] +
        commercial_score * weights['commercial'] +
        public_score * weights['public'] +
        capital_score * weights['capital']
    )
    
    return total
```

### 输出
- 行业评分排行榜（按综合评分降序）
- JSON 格式：
```json
[
  {
    "rank": 1,
    "industry": "AI 算力",
    "policy_score": 85,
    "commercial_score": 90,
    "public_score": 75,
    "capital_score": 80,
    "total_score": 83.5
  },
  ...
]
```

---

## ✅ 验收标准

- [x] 支持全市场行业自动评分
- [x] 权重可配置（默认 25/30/25/20）
- [x] 输出评分排行榜（JSON 格式）
- [ ] 单元测试通过率 100%
- [x] 性能：全市场行业评分 < 5 秒（实测 967ms）

---

## 📁 交付物

1. `api/industry-score.js` - 行业评分 API
2. `api/server.js` - 新增路由 `/api/industry/score`
3. `docs/tasks/TASK_V3_001.md` - 任务文档（本文件）
4. `docs/runtime/TASK_V3_001_STATUS.md` - 运行时状态
5. `docs/handover/TASK_V3_001_HANDOVER.md` - 交接文档

---

## 🔗 依赖关系

- 前置任务：无
- 后续任务：TASK_V3_002（行业 Top3 自动筛选）

---

## 📝 备注

- 4 维度数据源已在现有系统中实现
- 本任务仅实现评分逻辑，不涉及 UI 改造
- UI 改造在 TASK_V3_005 中实现
