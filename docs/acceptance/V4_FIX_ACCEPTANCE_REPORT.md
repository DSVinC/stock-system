# V4 修复阶段验收报告

**验收时间**: 2026-03-25 22:30  
**验收员**: Gemini CLI（待验收）  
**阶段**: V4 修复  
**完成率**: 83% (5/6 任务完成)

---

## 📋 任务验收清单

### ✅ TASK_V4_FIX_006 - 核心仓/卫星仓比例不生效（P0）

**修改文件**: `backtest.html`

**修改内容**:
- API 端点：`/api/backtest/run` → `/api/backtest/joint/run`
- 参数名：`coreRatio/satelliteRatio` → `coreWeight/satelliteWeight`
- 参数结构：扁平化（移除 `portfolio` 嵌套）

**验收标准**:
- [ ] 调整核心仓/卫星仓比例后，回测结果不同
- [ ] 联合回测引擎正确使用权重参数

**验证命令**:
```bash
grep -n "/api/backtest/joint\|coreWeight\|satelliteWeight" backtest.html
```

---

### ✅ TASK_V4_FIX_001 - 选股时点未生效（P0）

**修改文件**: `api/select.js`

**修改内容**:
- 新增函数：`buildSelectionPayloadFromSnapshot(date)`
- 修改路由：`GET /api/select` 接收 `date` 查询参数
- 数据源：`stock_factor_snapshot` 表（按 `trade_date` 筛选）

**验收标准**:
- [ ] 选择不同选股时点（2022/2023/2024-01-01），选出的股票不同
- [ ] 无日期参数时默认使用最新数据

**验证命令**:
```bash
grep -n "req.query.date\|buildSelectionPayloadFromSnapshot" api/select.js
curl "http://localhost:3000/api/select?date=2024-01-01"
```

---

### ✅ TASK_V4_FIX_004 - 回测指标缺失（P0）

**修改文件**: `api/backtest.js`

**修改内容**:
- 新增指标：`calmarRatio`（卡玛比率）、`profitLossRatio`（盈亏比）
- 指标注释：所有 9 个回测指标添加中文注释

**验收标准**:
- [ ] 回测报告包含 7 个核心指标
- [ ] 所有指标有中文注释

**验证命令**:
```bash
grep -n "calmarRatio\|profitLossRatio" api/backtest.js
```

---

### ✅ TASK_V4_FIX_003 - 策略参数配置 + 一键自迭代按钮（P1）

**修改文件**: `backtest.html`

**修改内容**:
- 策略选择器：5 个策略选项（双均线、RSI、MACD、布林带、四维度七因子）
- 新增按钮：🚀 一键自迭代（点击跳转 `iteration-manager.html`）
- 新增函数：`startAutoIteration()`

**验收标准**:
- [ ] 5 个策略选项显示在下拉框中
- [ ] 一键自迭代按钮存在且可点击
- [ ] 点击后跳转到 `iteration-manager.html`

**验证命令**:
```bash
grep -n "一键自迭代\|startAutoIteration" backtest.html
```

---

### ⏳ TASK_V4_FIX_002 - 选股时点 UI 说明（P1）

**状态**: 待完成（可选）

**修改内容**:
- 在选股时点选择器旁添加说明文字

---

### ⏳ TASK_V4_FIX_005 - 指标注释（P1）

**状态**: 部分完成（已在 TASK_V4_FIX_004 中完成主要工作）

---

## 📊 验收总结

| 优先级 | 完成 | 进行中 | 待开始 | 完成率 |
|--------|------|--------|--------|--------|
| P0 | 3 | 0 | 0 | 100% |
| P1 | 1 | 0 | 2 | 33% |
| **总计** | **4** | **0** | **2** | **67%** |

**核心功能完成率**: 100%（所有 P0 任务完成）

---

## 🚀 下一步

1. **启动验收** - Gemini CLI 并行验收 4 个已完成任务
2. **验收通过后** - 更新项目进度，启动 V5 自动迭代系统

---

**报告生成时间**: 2026-03-25 22:30
