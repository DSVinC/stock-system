# TASK_STRATEGY_LIB_001 交接文档

**任务 ID**: TASK_STRATEGY_LIB_001  
**交出方**: 灵爪（项目经理）  
**接手方**: Claude Code（程序员）  
**交接时间**: 2026-03-23 07:20  

---

## 📋 任务概述

设计并实现 A 股量化回测系统的策略模板库，包含 5 个子任务并行开发。

---

## 📚 参考资料

### 必读文档
1. `docs/research/backtest_strategy_library.md` - 策略模板库设计建议书
2. `docs/research/strategy_implementation_guide.md` - 工程实现指南
3. `docs/tasks/TASK_STRATEGY_LIB_001.md` - 任务分解文档

### 参考实现
- Gemini Deep Research 生成的代码示例（见实现指南）

---

## 🎯 子任务清单

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

## 📁 目标文件结构

```
stock-system/
├── strategies/
│   ├── __init__.py
│   ├── base.py              # 001_01
│   ├── trend_following/
│   │   ├── __init__.py
│   │   └── dual_ma.py       # 001_02
│   └── multi_factor/
│       ├── __init__.py
│       ├── factors.py       # 001_03
│       ├── scoring.py       # 001_03
│       └── strategy.py      # 001_03
├── scripts/
│   └── run_strategy.py      # 001_04
└── config/
    └── strategies.json      # 001_05
```

---

## ⚠️ 注意事项

1. **A 股特性**：必须处理 T+1、涨跌停、停牌
2. **代码质量**：每个模块需要单元测试
3. **文档完整**：每个策略类需要 docstring
4. **参数可配置**：所有策略参数从配置文件读取

---

## 🧪 验收流程

1. **自测**：程序员完成开发后本地测试
2. **提交验收**：更新 runtime 状态文件，通知项目经理
3. **验收员审查**：Gemini CLI / Codex 进行代码审查
4. **验收通过**：生成验收报告，更新 todo.db
5. **验收不通过**：生成修复文档，进入修复流程

---

## 📞 联系方式

- 项目经理：灵爪
- 验收员：Gemini CLI / Codex

---

*交接时间：2026-03-23 07:20*
