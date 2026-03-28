# TASK_V5_000 - V5 自动迭代系统总体规划

**创建时间**: 2026-03-25 21:10  
**优先级**: P0  
**阶段**: V5  
**状态**: pending  
**预计工时**: 16-20h

---

## 📋 任务概述

V5 自动迭代系统是在 V4 回测系统重构完成后的下一阶段，实现策略参数的自动迭代优化、评分可视化、版本管理等功能。

**核心目标**:
1. 实现策略参数自动迭代优化（Optuna 或 JS 替代方案）
2. 实现策略评分可视化面板（雷达图/柱状图/趋势图）
3. 实现策略版本管理（创建、对比、回退）
4. 实现策略回测报告模板（标准化报告）
5. 实现二次迭代决策逻辑（失败原因分析 + 方案选择）

---

## 🎯 任务清单

| 任务 ID | 任务名称 | 优先级 | 预计工时 | 状态 |
|---------|----------|--------|---------|------|
| **TASK_V5_001** | 创建策略版本数据库表 | P0 | 1h | pending |
| **TASK_V5_002** | 实现策略评分器（strategy-scorer.js） | P0 | 2h | pending |
| **TASK_V5_003** | 实现自迭代管理页面（前端） | P0 | 3h | pending |
| **TASK_V5_004** | 实现策略评分可视化面板 | P1 | 2h | pending |
| **TASK_V5_005** | 实现策略版本对比功能 | P1 | 2h | pending |
| **TASK_V5_006** | 实现策略回测报告模板 | P1 | 2h | pending |
| **TASK_V5_007** | 实现 Optuna 参数优化集成 | P0 | 3h | pending |
| **TASK_V5_008** | 实现二次迭代决策逻辑 | P1 | 2h | pending |
| **TASK_V5_009** | 实现策略库 4 类策略详细设计 | P1 | 2h | pending |
| **TASK_V5_010** | 实现模拟账户验证周期标准 | P2 | 1h | pending |
| **TASK_V5_011** | 实现实盘前检查清单标准化 | P2 | 1h | pending |

**总计**: 21 小时

---

## 🔗 依赖关系

### 前置依赖（V4 修复阶段）
- TASK_V4_FIX_001：选股时点未生效
- TASK_V4_FIX_003：策略参数配置 + 一键自迭代按钮
- TASK_V4_FIX_004：回测指标缺失
- TASK_V4_FIX_006：核心仓/卫星仓比例不生效

### 设计文档依赖
- `docs/DESIGN_CONSENSUS.md` - 第十节：策略迭代自动化流程
- `docs/design/STRATEGY_SCORE_CONFIG.md` - 策略评分标准配置
- `docs/DESIGN_CONSENSUS.md` - 第十三节：待讨论事项（P2 事项）

---

## 📐 技术方案

### 1. 策略版本数据库表（TASK_V5_001）

**表结构**（参考 DESIGN_CONSENSUS.md 第十四节）:
```sql
-- 策略版本表
CREATE TABLE strategy_versions (
    version_id TEXT PRIMARY KEY,
    strategy_type TEXT NOT NULL,
    config_json TEXT NOT NULL,
    backtest_score REAL,
    simulation_result TEXT,
    created_at TEXT NOT NULL,
    parent_version TEXT,
    change_log TEXT,
    created_by TEXT DEFAULT 'system'
);

-- 策略评分记录表
CREATE TABLE strategy_score_records (
    record_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    annualized_return REAL,
    calmar_ratio REAL,
    profit_loss_ratio REAL,
    win_rate REAL,
    turnover_rate REAL,
    total_score REAL,
    score_details TEXT,
    evaluated_at TEXT NOT NULL,
    FOREIGN KEY (version_id) REFERENCES strategy_versions(version_id)
);

-- 策略迭代日志表
CREATE TABLE strategy_iteration_log (
    log_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    before_config TEXT,
    after_config TEXT,
    result TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (version_id) REFERENCES strategy_versions(version_id)
);
```

### 2. 策略评分器（TASK_V5_002）

**文件**: `api/strategy-scorer.js`

**功能**:
- 计算 7 个核心指标得分
- 加权计算综合评分
- 处理边界情况（全胜场景盈亏比）
- 返回评分详情和警告

**评分配置**: 参考 `docs/design/STRATEGY_SCORE_CONFIG.md`

### 3. 自迭代管理页面（TASK_V5_003）

**文件**: `iteration-manager.html`

**功能**:
- 展示各策略的迭代情况列表
- 显示策略评分（表格 + 可视化）
- 支持策略版本对比
- 支持导出回测报告

**入口**: 回测界面点击"一键自迭代"按钮后跳转

### 4. 策略评分可视化面板（TASK_V5_004）

**组件**:
- 雷达图：7 个指标评分对比
- 柱状图：各版本指标对比
- 趋势图：迭代过程中评分变化

**库**: Chart.js 或 D3.js

### 5. 策略版本对比功能（TASK_V5_005）

**对比维度**:
- 指标变化（夏普比率、最大回撤等）
- 参数变化（四维度权重、七因子阈值等）
- 收益曲线对比

### 6. 策略回测报告模板（TASK_V5_006）

**报告结构**:
- 策略配置摘要
- 回测指标（7 个核心指标）
- 收益曲线图
- 风险评估
- 优化建议

**导出格式**: PDF / HTML / Markdown

### 7. Optuna 参数优化集成（TASK_V5_007）

**方案 A**: Python Optuna（通过子进程调用）
**方案 B**: JavaScript 优化库（如 `optuna-js` 或自定义贝叶斯优化）

**推荐**: 方案 B（纯 Node.js，无需 Python 环境）

### 8. 二次迭代决策逻辑（TASK_V5_008）

**决策树**（参考 DESIGN_CONSENSUS.md 第十节）:
```
模拟失败
    │
    ├── 回撤过大 → 调整评分标准（收紧回撤阈值）
    ├── 胜率过低 → 切换策略库
    └── 交易过少 → 放宽入场条件
```

### 9. 策略库 4 类策略详细设计（TASK_V5_009）

**策略类型**:
- `industry_7factor`: 行业 +7 因子（主策略）
- `trend_following`: 趋势跟踪
- `mean_reversion`: 均值回归
- `multi_factor`: 多因子

### 10. 模拟账户验证周期标准（TASK_V5_010）

**验证周期**:
- 固定周期：≥ 2 周
- 或按交易次数：≥ 30 次交易

### 11. 实盘前检查清单标准化（TASK_V5_011）

**检查项**:
- [ ] 策略评分 ≥ 0.75
- [ ] 模拟周期 ≥ 2 周
- [ ] 模拟收益偏差 < 20%
- [ ] 风控参数已配置
- [ ] 飞书推送已测试

---

## 📁 需要创建的文件

### 数据库迁移
- `db/migrations/v5.0_create_strategy_versions.sql`
- `db/migrations/v5.0_create_strategy_score_records.sql`
- `db/migrations/v5.0_create_strategy_iteration_log.sql`

### 后端 API
- `api/strategy-scorer.js`
- `api/strategy-optimizer.js`
- `api/strategy-version-manager.js`
- `api/iteration-manager.js`

### 前端页面
- `iteration-manager.html`
- `components/strategy-score-chart.js`
- `components/strategy-version-compare.js`

### 文档
- `docs/V5_DEVELOPMENT_PLAN.md`
- `docs/tasks/TASK_V5_001.md` ~ `TASK_V5_011.md`

---

## 🔗 关联文档

- `docs/DESIGN_CONSENSUS.md` - 第十节：策略迭代自动化流程
- `docs/design/STRATEGY_SCORE_CONFIG.md` - 策略评分标准配置
- `docs/DESIGN_CONSENSUS.md` - 第十三节：待讨论事项
- `docs/DESIGN_CONSENSUS.md` - 第十四节：核心数据库表设计

---

## 📝 备注

**设计共识来源**: 主人澄清 (2026-03-25 21:08)

**关键点**:
1. V5 包含所有 P2 低优先级事项
2. V5 包含之前梳理的应做未做内容
3. V5 在 V4 修复完成后启动
4. 自迭代管理页面是新页面，点击"一键自迭代"后跳转

---

## 📊 进度跟踪

| 日期 | 进度 | 备注 |
|------|------|------|
| 2026-03-25 | 任务规划完成 | 创建 TASK_V5_000 |
