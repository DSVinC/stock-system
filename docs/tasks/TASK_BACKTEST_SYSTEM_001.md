# TASK_BACKTEST_SYSTEM_001 - 回测系统完整功能实现

**创建时间**: 2026-03-23 09:05  
**优先级**: P0  
**负责人**: Claude Code  
**验收员**: Gemini CLI / Codex  
**状态**: in_progress  
**截止时间**: 2026-03-23 12:00  

---

## 📋 任务背景

根据 2026-03-23 的策略优化决策（`docs/research/strategy_optimization_decision.md`），回测系统是策略验证的终极武器，必须优先完成。

---

## 🎯 任务目标

完成回测系统的完整功能，支持：
1. 策略模板回测（双均线、多因子）
2. 历史数据回放
3. 收益统计分析
4. 信号生成与验证
5. 回测报告生成

---

## 📦 子任务清单

### TASK_BACKTEST_001 - 策略执行脚本完善

**状态**: pending（原 TASK_STRATEGY_LIB_001_FIX_001 合并至此）

**内容**:
1. 在 `scripts/run_strategy.py` 中添加数据库导出功能
2. 添加命令行参数：`--db-export`、`--db-path`、`--strategy-id`
3. 创建 `strategy_signals` 表（如不存在）
4. 支持 CSV 和数据库双导出

**验收标准**:
- [ ] 运行 `python scripts/run_strategy.py --strategy dual_ma --db-export --db-path ./stock_system.db --strategy-id test_001` 成功
- [ ] 数据库中 `strategy_signals` 表有记录
- [ ] 信号数量与 CSV 导出一致

---

### TASK_BACKTEST_002 - 回测引擎核心功能

**状态**: pending

**内容**:
1. 完善 `api/backtest.js` 的回测执行接口
2. 实现历史数据加载（从 `stock_daily` 表）
3. 实现策略信号回放
4. 实现交易记录生成
5. 实现收益统计（收益率、夏普比率、最大回撤等）

**验收标准**:
- [ ] POST `/api/backtest/run` 接口可执行回测
- [ ] 回测结果包含完整的收益统计
- [ ] 支持自定义回测时间范围

---

### TASK_BACKTEST_003 - 回测报告生成

**状态**: pending

**内容**:
1. 实现回测报告生成接口 `GET /api/backtest/report/:id`
2. 生成 HTML 可视化报告（收益率曲线、回撤曲线、持仓分布）
3. 生成 Markdown 文本报告
4. 保存到 `report/backtest/` 目录

**验收标准**:
- [ ] 回测完成后可查看报告
- [ ] 报告包含收益率、夏普比率、最大回撤等关键指标
- [ ] 报告包含可视化图表

---

### TASK_BACKTEST_004 - 策略参数回测验证

**状态**: pending

**内容**:
1. 实现参数扫描功能（网格搜索最优参数）
2. 支持多策略对比回测
3. 生成参数优化报告
4. 为风险偏好参数提供数据支撑

**验收标准**:
- [ ] 可对双均线策略进行参数扫描（如 fast=5/10/20, slow=20/30/60）
- [ ] 输出最优参数组合
- [ ] 输出不同参数下的收益/风险对比

---

### TASK_BACKTEST_005 - 行情阶段识别框架

**状态**: pending

**内容**:
1. 在 `api/score-factors.js` 中添加 `identifyMarketPhase()` 函数
2. 定义行情阶段识别规则：
   - 底部反弹：MA60>MA20，股价突破所有均线
   - 趋势确立：MA5>MA10>MA20>MA60，多头排列
   - 高位震荡：股价在 MA20 附近反复穿越
   - 趋势反转：跌破 MA60，均线空头排列
3. 在七因子分析输出中加入 `market_phase` 字段

**验收标准**:
- [ ] 七因子分析 API 输出包含 `market_phase` 字段
- [ ] 能正确识别当前中际旭创的行情阶段（应为"底部反弹"）
- [ ] 识别规则可配置（JSON 配置）

---

## 📁 相关文件

| 文件 | 状态 |
|------|------|
| `api/backtest.js` | ✅ 已存在，需完善 |
| `scripts/run_strategy.py` | ⚠️ 需添加数据库导出 |
| `strategies/` | ✅ 已存在（双均线、多因子） |
| `config/strategies.json` | ✅ 已存在 |
| `docs/research/strategy_optimization_decision.md` | ✅ 已创建 |

---

## 🗄️ 数据库表结构

需要创建/确认的表：

```sql
-- 策略信号表（TASK_BACKTEST_001）
CREATE TABLE IF NOT EXISTS strategy_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    date TEXT NOT NULL,
    code TEXT NOT NULL,
    signal TEXT NOT NULL,
    qty INTEGER DEFAULT 0,
    price REAL NOT NULL,
    score REAL,
    created_at TEXT NOT NULL
);

-- 回测报告表（已存在）
-- backtest_report, backtest_trade, backtest_daily
```

---

## 📊 验收流程

1. **功能验收**（Gemini CLI）:
   - 运行策略执行脚本，验证数据库导出
   - 调用回测 API，验证回测执行
   - 查看回测报告，验证报告生成

2. **数据验收**（Codex）:
   - 检查回测结果的准确性
   - 验证收益统计计算正确
   - 确认策略信号与历史数据一致

3. **集成验收**（灵爪）:
   - 验证回测系统与七因子分析的集成
   - 验证回测系统与条件单系统的集成
   - 更新项目进度文档

---

## 📝 交付物

1. `scripts/run_strategy.py` - 支持数据库导出
2. `api/backtest.js` - 完整的回测引擎
3. `api/score-factors.js` - 行情阶段识别
4. `report/backtest/` - 回测报告目录
5. `docs/acceptance/TASK_BACKTEST_SYSTEM_001_ACCEPTANCE.md` - 验收报告

---

## ⏱️ 时间估算

| 子任务 | 预计时间 |
|--------|----------|
| TASK_BACKTEST_001 | 30 分钟 |
| TASK_BACKTEST_002 | 60 分钟 |
| TASK_BACKTEST_003 | 45 分钟 |
| TASK_BACKTEST_004 | 45 分钟 |
| TASK_BACKTEST_005 | 30 分钟 |
| **总计** | **约 3.5 小时** |

---

## 🚀 执行说明

请使用以下命令启动执行：

```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# 1. 先修复策略执行脚本
python scripts/run_strategy.py --strategy dual_ma --test

# 2. 测试回测 API
curl -X POST http://localhost:3000/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{"strategy": "dual_ma", "start_date": "2025-01-01", "end_date": "2025-12-31"}'

# 3. 查看回测报告
curl http://localhost:3000/api/backtest/report/1
```

---

**备注**: 本任务优先级最高，完成后才能进行策略参数优化和风险偏好配置。
