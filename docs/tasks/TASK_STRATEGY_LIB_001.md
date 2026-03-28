# TASK_STRATEGY_LIB_001 - 策略模板库设计与实现

**创建时间**: 2026-03-23 00:55  
**优先级**: P0  
**负责人**: Claude Code  
**验收员**: Gemini CLI / Codex  
**状态**: ✅ 已完成（修复后验收通过）  

---

## 📋 任务描述

基于 Gemini Deep Research 的专业建议，设计并实现 A 股量化回测系统的策略模板库。

---

## 📚 参考资料

- `docs/research/backtest_strategy_library.md` - 策略模板库设计建议书
- `docs/research/strategy_implementation_guide.md` - 工程实现指南

---

## 🎯 子任务分解

### TASK_STRATEGY_LIB_001_01 - 策略基类实现
**优先级**: P0  
**工时**: 2h  

**验收标准**:
- [ ] 创建 `strategies/base.py`
- [ ] 定义 StrategyBase 抽象基类
- [ ] 实现核心方法：initialize, on_bar, generate_signals, calculate_position
- [ ] 编写单元测试

---

### TASK_STRATEGY_LIB_001_02 - 双均线策略实现
**优先级**: P0  
**工时**: 3h  

**验收标准**:
- [ ] 创建 `strategies/trend_following/dual_ma.py`
- [ ] 实现 DualMAStrategy 类，继承 StrategyBase
- [ ] 参数配置：fast_period, slow_period
- [ ] 信号生成逻辑：金叉买入、死叉卖出
- [ ] A 股特性：T+1 检查、涨跌停过滤
- [ ] 编写回测测试

---

### TASK_STRATEGY_LIB_001_03 - 多因子策略框架实现
**优先级**: P0  
**工时**: 4h  

**验收标准**:
- [ ] 创建 `strategies/multi_factor/` 目录
- [ ] 实现 `factors.py` - 因子计算模块
  - [ ] 价值因子 (PE 倒数)
  - [ ] 动量因子 (20 日收益)
  - [ ] 质量因子 (ROE)
- [ ] 实现 `scoring.py` - 因子打分模块
  - [ ] 去极值（缩尾处理）
  - [ ] 标准化（Z-Score）
  - [ ] 等权合成
- [ ] 实现 `strategy.py` - 多因子策略类
- [ ] 实现再平衡逻辑
- [ ] 编写回测测试

---

### TASK_STRATEGY_LIB_001_04 - 策略执行脚本
**优先级**: P1  
**工时**: 2h  

**验收标准**:
- [ ] 创建 `scripts/run_strategy.py`
- [ ] 支持命令行参数（策略名、参数配置）
- [ ] 读取股票数据
- [ ] 执行策略计算
- [ ] 导出信号到数据库

---

### TASK_STRATEGY_LIB_001_05 - 策略配置文件
**优先级**: P1  
**工时**: 1h  

**验收标准**:
- [ ] 创建 `config/strategies.json`
- [ ] 定义双均线策略默认参数
- [ ] 定义多因子策略默认参数
- [ ] 支持 JSON 导入导出

---

## 📁 文件结构

```
stock-system/
├── strategies/
│   ├── __init__.py
│   ├── base.py              # TASK_STRATEGY_LIB_001_01
│   ├── trend_following/
│   │   ├── __init__.py
│   │   └── dual_ma.py       # TASK_STRATEGY_LIB_001_02
│   └── multi_factor/
│       ├── __init__.py
│       ├── factors.py       # TASK_STRATEGY_LIB_001_03
│       ├── scoring.py       # TASK_STRATEGY_LIB_001_03
│       └── strategy.py      # TASK_STRATEGY_LIB_001_03
├── scripts/
│   └── run_strategy.py      # TASK_STRATEGY_LIB_001_04
└── config/
    └── strategies.json      # TASK_STRATEGY_LIB_001_05
```

---

## 🧪 测试计划

1. **单元测试**: 每个策略类编写独立测试
2. **回测测试**: 使用历史数据验证策略逻辑
3. **集成测试**: 验证信号导出到数据库的流程

---

## 📊 进度追踪

| 子任务 | 状态 | 开始时间 | 完成时间 |
|--------|------|---------|---------|
| 001_01 - 策略基类 | ⏳ pending | - | - |
| 001_02 - 双均线策略 | ⏳ pending | - | - |
| 001_03 - 多因子框架 | ⏳ pending | - | - |
| 001_04 - 执行脚本 | ⏳ pending | - | - |
| 001_05 - 配置文件 | ⏳ pending | - | - |

---

## 🎯 最终交付物

1. **代码**:
   - `strategies/base.py`
   - `strategies/trend_following/dual_ma.py`
   - `strategies/multi_factor/` (完整框架)
   - `scripts/run_strategy.py`
   - `config/strategies.json`

2. **文档**:
   - 策略使用说明
   - 参数配置指南
   - 回测结果示例

3. **测试**:
   - 单元测试通过
   - 回测验证通过

---

*创建时间：2026-03-23 00:55*
