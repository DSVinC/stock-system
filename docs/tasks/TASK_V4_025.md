# TASK_V4_025 - 回测引擎支持多策略模板

**创建时间**: 2026-03-25
**优先级**: P1
**阶段**: 阶段 5 - 回测引擎适配
**状态**: completed

---

## 📋 任务描述

改造回测引擎，支持加载和使用不同的策略模板。

---

## 🎯 验收标准

- [x] 回测引擎支持加载 strategy_templates 中的模板
- [x] 支持根据 template_id 加载不同的策略参数
- [x] 支持自定义策略参数覆盖模板默认值
- [x] 回测报告记录使用的策略模板信息
- [x] 测试通过（至少测试 3 个模板）

---

## 📐 技术方案

**策略模板加载**:
```javascript
class BacktestEngine {
  async loadStrategyTemplate(templateId) {
    const response = await fetch(`/api/strategy-template/${templateId}`);
    const template = await response.json();
    this.strategyParams = template.params;
  }

  applyStrategyParams(customParams) {
    this.strategyParams = {
      ...this.strategyParams,
      ...customParams
    };
  }
}
```

**多策略并行回测架构**:
```javascript
// api/backtest-multi-strategy.js
class MultiStrategyBacktestEngine {
  constructor(config) {
    this.strategies = []; // 策略列表
  }

  addStrategy({ templateId, weight, customParams }) {
    // 添加策略配置
  }

  async run(params) {
    // 1. 按权重分配资金
    // 2. 并行运行各策略回测
    // 3. 合并结果
  }
}
```

---

## 📁 交付物

- [x] 新增 `api/backtest-multi-strategy.js` - 多策略回测引擎
- [x] 更新 `api/server.js` - 挂载 API 路由
- [x] 支持策略模板加载（使用现有 `utils/strategy-template-loader.js`）

---

## 🔗 依赖关系

- 依赖：TASK_V4_014（策略模板加载 API）
- 依赖：TASK_V4_024（核心仓 + 卫星仓联合回测）

---

## 📝 实现

### API 接口

**POST /api/backtest/multi-strategy/run** - 多策略回测
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "strategies": [
    { "templateId": "CORE_FACTOR_V1", "weight": 0.5 },
    { "templateId": "MONEYFLOW_V1", "weight": 0.3 },
    { "templateId": "ROTATION_V1", "weight": 0.2 }
  ],
  "config": {
    "initialCapital": 1000000
  }
}
```

**POST /api/backtest/multi-strategy/single** - 单策略回测（使用模板）
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "templateId": "CORE_FACTOR_V1",
  "customParams": {
    "selection": { "peMax": 80 }
  }
}
```

### 关键算法

1. **资金分配**: `strategyCapital = totalCapital * weight`
2. **结果合并**: 各策略权益曲线按时间点相加
3. **贡献度计算**: `contribution = (finalValue - allocatedCapital) / totalCapital`

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
