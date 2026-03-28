# TASK_V4_011 - 创建策略模板库

**创建时间**: 2026-03-25  
**优先级**: P0  
**阶段**: 阶段 0 - 策略模板库  
**状态**: pending

---

## 📋 任务描述

创建策略模板库（JSON 文件），定义系统支持的所有策略模板。

---

## 🎯 验收标准

- [ ] 创建 `strategy_templates/` 目录
- [ ] 创建至少 3 个策略模板 JSON 文件：
  - `core_factor_v1.json` - 四维度 + 七因子策略（默认）
  - `moneyflow_v1.json` - 资金流策略
  - `rotation_v1.json` - 行业轮动策略
- [ ] 每个模板包含：template_id, name, description, params, compatible_with
- [ ] 创建模板加载工具函数

---

## 📐 技术方案

**模板结构**:
```json
{
  "template_id": "CORE_FACTOR_V1",
  "name": "四维度 + 七因子策略",
  "description": "基于行业四维度评分 + 个股七因子评分",
  "params": {
    "industry_weights": {"social": 0.25, "policy": 0.25, "sentiment": 0.25, "commercial": 0.25},
    "factor_weights": {"value": 0.15, "growth": 0.20, "profitability": 0.15, "safety": 0.15, "technical": 0.15, "capital": 0.10, "sentiment": 0.10}
  },
  "compatible_with": ["selection", "backtest", "monitor"]
}
```

---

## 📁 交付物

- `stock-system/strategy_templates/` 目录
- 策略模板 JSON 文件（至少 3 个）
- 模板加载工具函数

---

## 🔗 依赖关系

- 无依赖

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
