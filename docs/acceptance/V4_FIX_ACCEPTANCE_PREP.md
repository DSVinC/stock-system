# V4 修复阶段验收准备

**创建时间**: 2026-03-25 21:30  
**验收员**: Gemini CLI  
**验收模式**: 并行验收

---

## 📋 待验收任务清单

| 任务 ID | 任务名称 | 优先级 | 开发状态 | 验收状态 |
|---------|----------|--------|----------|----------|
| TASK_V4_FIX_006 | 核心仓/卫星仓比例不生效 | P0 | in_progress | pending |
| TASK_V4_FIX_001 | 选股时点未生效 | P0 | in_progress | pending |
| TASK_V4_FIX_004 | 回测指标缺失 | P0 | in_progress | pending |
| TASK_V4_FIX_003 | 策略参数配置 + 一键自迭代按钮 | P1 | in_progress | pending |

---

## 🔍 验收检查清单

### TASK_V4_FIX_006 - 核心仓/卫星仓比例

- [ ] 检查 `backtest.html` 中 `runBacktest()` 函数的 API 端点
- [ ] 确认端点为 `/api/backtest/joint/run`
- [ ] 确认参数名为 `coreWeight/satelliteWeight`
- [ ] 测试调整比例后回测结果是否不同
- [ ] 检查联合回测引擎是否正确使用权重参数

### TASK_V4_FIX_001 - 选股时点

- [ ] 检查 `api/select.js` 是否接收 `selectionDate` 参数
- [ ] 检查选股逻辑是否使用 `stock_factor_snapshot` 表
- [ ] 测试不同选股时点是否选出不同股票
- [ ] 检查前端是否传递 `selectionDate` 参数

### TASK_V4_FIX_004 - 回测指标

- [ ] 检查回测报告是否包含 7 个核心指标
- [ ] 确认包含卡玛比率（Calmar Ratio）
- [ ] 确认包含盈亏比（Profit/Loss Ratio）
- [ ] 检查所有指标是否有中文注释

### TASK_V4_FIX_003 - 策略参数配置

- [ ] 检查是否有 5 个策略的参数配置面板
- [ ] 确认策略包括：双均线、RSI、MACD、布林带、四维度七因子
- [ ] 检查 [💾 保存初始配置] 按钮是否存在且可用
- [ ] 检查 [🚀 一键自迭代] 按钮是否存在
- [ ] 确认一键自迭代按钮在"开始回测"按钮旁边
- [ ] 测试点击跳转是否指向 `iteration-manager.html`

---

## 🧪 验收命令

```bash
# 启动 API 服务器
cd /Users/vvc/.openclaw/workspace/stock-system
node server.js &

# 测试核心仓/卫星仓比例
curl -X POST http://localhost:3000/api/backtest/joint/run \
  -H "Content-Type: application/json" \
  -d '{"coreWeight": 0.7, "satelliteWeight": 0.3, ...}'

# 测试选股时点
curl -X POST http://localhost:3000/api/select \
  -H "Content-Type: application/json" \
  -d '{"selectionDate": "2024-01-01", ...}'

# 检查回测指标
curl -X POST http://localhost:3000/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{...}' | jq '.metrics'
```

---

## 📝 验收报告模板

每个任务验收完成后生成 `docs/acceptance/TASK_V4_FIX_XXX_ACCEPTANCE.md`：

```markdown
# TASK_V4_FIX_XXX 验收报告

**验收时间**: 2026-03-25  
**验收员**: Gemini CLI  
**验收结果**: 通过/不通过

## 检查项

| 检查项 | 结果 | 备注 |
|--------|------|------|
| ... | ✅/❌ | ... |

## 问题列表

- [ ] 问题 1
- [ ] 问题 2

## 结论

[通过/不通过/需修复]
```

---

**最后更新**: 2026-03-25 21:30
