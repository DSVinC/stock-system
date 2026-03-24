# TASK_V3_001 任务分配单

**分配日期**: 2026-03-24 08:35  
**分配人**: 灵爪（项目经理）  
**执行人**: Claude Code（程序员）  
**验收人**: Gemini CLI / Codex（验收员）  

---

## 📋 任务信息

| 字段 | 值 |
|------|-----|
| **任务 ID** | TASK_V3_001 |
| **任务名称** | 4 维度行业自动评分 |
| **优先级** | P0（重要紧急） |
| **预计工期** | 1 天 |
| **状态** | in_progress |
| **todo.db ID** | 119 |

---

## 🎯 任务目标

实现 4 维度（政策/商业化/舆论/资本）行业自动评分功能，替代当前手动选择行业的流程。

**输入**: 行业列表 + 权重配置（默认 25%/30%/25%/20%）  
**输出**: 行业评分排行榜（JSON 格式）

---

## 📐 技术要求

### 核心函数
```python
def score_industry(industry, weights):
    """计算行业综合评分"""
    # 1. 获取 4 维度原始数据
    policy_score = get_policy_score(industry)
    commercial_score = get_commercial_score(industry)
    public_score = get_public_score(industry)
    capital_score = get_capital_score(industry)
    
    # 2. 加权计算
    total = (policy_score * weights['policy'] +
             commercial_score * weights['commercial'] +
             public_score * weights['public'] +
             capital_score * weights['capital'])
    
    return total
```

### API 路由
- `POST /api/industry/score` - 获取行业评分排行榜

### 交付文件
1. `api/industry-score.js` - 行业评分 API
2. `api/server.js` - 新增路由
3. `docs/tasks/TASK_V3_001.md` - 任务文档（已存在）
4. `docs/runtime/TASK_V3_001_STATUS.md` - 运行时状态（需创建）
5. `docs/handover/TASK_V3_001_HANDOVER.md` - 交接文档（完成后创建）

---

## ✅ 验收标准

- [ ] 支持全市场行业自动评分
- [ ] 权重可配置（默认 25/30/25/20）
- [ ] 输出评分排行榜（JSON 格式）
- [ ] 单元测试通过率 100%
- [ ] 性能：全市场行业评分 < 5 秒

---

## 📝 执行要求

1. **开发前**: 先阅读 `docs/tasks/TASK_V3_001.md` 了解完整需求
2. **开发中**: 每完成一个子步骤，更新 `docs/runtime/TASK_V3_001_STATUS.md`
3. **完成后**: 
   - 本地自测通过
   - 创建交接文档 `docs/handover/TASK_V3_001_HANDOVER.md`
   - 通知项目经理安排验收

---

## 🔗 依赖关系

- **前置任务**: 无
- **后续任务**: TASK_V3_002（行业 Top3 自动筛选）

---

## 📊 进度跟踪

| 日期 | 阶段 | 状态 | 备注 |
|------|------|------|------|
| 2026-03-24 08:35 | 任务分配 | ✅ done | 灵爪分配 |
| 2026-03-24 | 开发中 | ⏳ pending | 待 Claude Code 开始 |
| 2026-03-24 | 开发完成 | ⏳ pending | 待自测通过 |
| 2026-03-24 | 验收 | ⏳ pending | 待验收员验收 |

---

**备注**: 本任务为 V3 版阶段 0 的第一个任务，完成后启动 TASK_V3_002
