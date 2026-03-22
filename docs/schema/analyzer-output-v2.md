# Analyzer Output Schema v2

**版本**: 2.0.0  
**创建时间**: 2026-03-22  
**最后更新**: 2026-03-22  
**状态**: Draft → In Development  

---

## 📋 概述

本文档定义 `stock_analyzer.py` 输出的结构化数据 schema，用于：
1. **条件单界面**：导入分析报告的策略配置
2. **方向股列表**：显示操作建议和评分
3. **HTML 报告**：保持现有格式（使用 summary_text）

---

## 🎯 设计原则

1. **机器可读**：结构化数据便于程序解析和导入
2. **人类可读**：保留 summary_text 用于报告展示
3. **向后兼容**：v1 接口保留，v2 使用新前缀
4. **可复用**：同一份数据支持多个界面复用

---

## 📐 完整 Schema

### Root Object

```typescript
interface AnalyzerOutput {
  // 股票基本信息
  stock_code: string;         // 股票代码 (e.g., "300750.SZ")
  stock_name: string;         // 股票名称 (e.g., "宁德时代")
  industry?: string;          // 所属行业 (e.g., "电池")
  
  // 评分与决策
  report_score: number;       // 报告评分 (0-5)
  decision: '买入' | '卖出' | '观望' | '持有';
  
  // 策略配置（核心）
  strategies: Strategies;
  
  // 操作建议
  operations: Operations;
  
  // 目标价格
  target_prices: TargetPrice[];
  
  // 技术指标（现有字段保持不变）
  technical: TechnicalData;
  
  // 估值数据（现有字段保持不变）
  valuation: ValuationData;
  
  // 资金流数据（现有字段保持不变）
  capital: CapitalData;
  
  // 基本面数据（现有字段保持不变）
  fundamental: FundamentalData;
  
  // 多空观点（现有字段保持不变）
  bull_points: string[];
  bear_points: string[];
  
  // 生成时间
  generated_at: string;       // ISO 8601 格式
}
```

### Strategies

```typescript
interface Strategies {
  aggressive: Strategy;   // 激进型策略
  balanced: Strategy;     // 稳健型策略
  conservative: Strategy; // 保守型策略
}

interface Strategy {
  risk_level: 'aggressive' | 'balanced' | 'conservative';
  actions: Action[];
  summary_text: string;   // 人类可读的文本描述（用于 HTML 报告）
}

interface Action {
  sequence: number;                      // 执行顺序 (1, 2, 3...)
  action_type: 'buy' | 'sell' | 'hold';  // 交易动作
  trigger_conditions: TriggerCondition[]; // 触发条件列表
  position_percent: number;              // 仓位百分比 (0-100)
  stop_loss?: number;                    // 止损价（可选）
  take_profit?: number;                  // 止盈价（可选）
  note: string;                          // 备注说明
}

interface TriggerCondition {
  type: 'price' | 'indicator' | 'fundamental';
  field: string;                         // 字段名 (price, volume_ratio, etc.)
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number | string;                // 比较值
  unit?: string;                         // 单位 (元，%, 倍)
}
```

### Operations

```typescript
interface Operations {
  short_term: OperationPeriod;  // 短线操作
  mid_term: OperationPeriod;    // 中线操作
  long_term: OperationPeriod;   // 长线操作
}

interface OperationPeriod {
  buy_zone: number[];           // 买入区间 [上限，下限]
  stop_loss: number;            // 止损价
  target_price?: number;        // 目标价（可选）
  summary: string;              // 文本描述
  conditions?: TriggerCondition[];  // 结构化条件（可选）
}
```

### Target Prices

```typescript
interface TargetPrice {
  period: 'short' | 'mid' | 'long';
  price: number;
  logic: string;              // 逻辑说明
  expected_return: number;    // 预期涨幅 (%)
  probability?: number;       // 达成概率 (0-1, 可选)
}
```

---

## 📝 JSON 示例

```json
{
  "stock_code": "300750.SZ",
  "stock_name": "宁德时代",
  "industry": "电池",
  "report_score": 4.5,
  "decision": "买入",
  "generated_at": "2026-03-22T11:00:00+08:00",
  
  "strategies": {
    "aggressive": {
      "risk_level": "aggressive",
      "actions": [
        {
          "sequence": 1,
          "action_type": "buy",
          "trigger_conditions": [
            {
              "type": "price",
              "field": "price",
              "operator": "<=",
              "value": 395.20,
              "unit": "元"
            }
          ],
          "position_percent": 10,
          "stop_loss": 365.56,
          "note": "第一笔建仓"
        },
        {
          "sequence": 2,
          "action_type": "buy",
          "trigger_conditions": [
            {
              "type": "price",
              "field": "price",
              "operator": "<=",
              "value": 372.89,
              "unit": "元"
            }
          ],
          "position_percent": 10,
          "note": "加仓"
        },
        {
          "sequence": 3,
          "action_type": "sell",
          "trigger_conditions": [
            {
              "type": "price",
              "field": "price",
              "operator": "<=",
              "value": 365.56,
              "unit": "元"
            }
          ],
          "position_percent": 100,
          "note": "止损"
        }
      ],
      "summary_text": "第一笔买入价：395.20 元（仓位 10%），加仓价：372.89 元（再 10%），止损：365.56 元。"
    },
    "balanced": {
      "risk_level": "balanced",
      "actions": [
        {
          "sequence": 1,
          "action_type": "buy",
          "trigger_conditions": [
            {
              "type": "price",
              "field": "price",
              "operator": "<=",
              "value": 372.89,
              "unit": "元"
            },
            {
              "type": "indicator",
              "field": "volume_ratio",
              "operator": ">",
              "value": 1.2,
              "unit": "倍"
            }
          ],
          "position_percent": 8,
          "note": "第一笔建仓"
        },
        {
          "sequence": 2,
          "action_type": "buy",
          "trigger_conditions": [
            {
              "type": "price",
              "field": "price",
              "operator": "<=",
              "value": 365.43,
              "unit": "元"
            }
          ],
          "position_percent": 8,
          "note": "第二笔加仓"
        }
      ],
      "summary_text": "第一笔：372.89 元（仓位 8%），第二笔：365.43 元（再 8%），需成交量>1.2 倍均量确认。"
    },
    "conservative": {
      "risk_level": "conservative",
      "actions": [
        {
          "sequence": 1,
          "action_type": "hold",
          "trigger_conditions": [
            {
              "type": "price",
              "field": "price",
              "operator": ">=",
              "value": 372.89,
              "unit": "元"
            },
            {
              "type": "indicator",
              "field": "volume_ratio",
              "operator": ">=",
              "value": 1.5,
              "unit": "倍"
            }
          ],
          "position_percent": 0,
          "note": "观望，等待确认信号"
        }
      ],
      "summary_text": "观望。等待股价站稳 372.89 元且成交量持续放大 3 日以上。"
    }
  },
  
  "operations": {
    "short_term": {
      "buy_zone": [395.20, 372.89],
      "stop_loss": 365.56,
      "summary": "短线关注 395.20-372.89 元区间承接，失守则止损。",
      "conditions": [
        {
          "type": "price",
          "field": "price",
          "operator": ">=",
          "value": 372.89
        }
      ]
    },
    "mid_term": {
      "buy_zone": [372.89, 365.43],
      "target_price": 454.30,
      "summary": "中线重点看业绩、资金和价格是否共振，只有三者同步转强才考虑加仓。",
      "conditions": []
    },
    "long_term": {
      "target_price": 500.00,
      "summary": "长线继续跟踪行业景气、产品兑现与估值中枢变化。",
      "conditions": []
    }
  },
  
  "target_prices": [
    {
      "period": "short",
      "price": 454.30,
      "logic": "前高压力位",
      "expected_return": 10.5
    },
    {
      "period": "mid",
      "price": 480.00,
      "logic": "估值修复目标",
      "expected_return": 16.8
    },
    {
      "period": "long",
      "price": 550.00,
      "logic": "行业景气度提升",
      "expected_return": 33.2
    }
  ]
}
```

---

## 🔄 与 v1 的兼容

### v1 输出（旧格式）
```json
{
  "strategies": {
    "aggressive": "第一笔买入价：395.20 元（仓位 10%）...",
    "balanced": "第一笔：372.89 元（仓位 8%）...",
    "conservative": "观望。等待股价站稳..."
  }
}
```

### v2 输出（新格式）
```json
{
  "strategies": {
    "aggressive": {
      "risk_level": "aggressive",
      "actions": [...],
      "summary_text": "第一笔买入价：395.20 元（仓位 10%）..."
    }
  }
}
```

### 兼容性处理

```javascript
// 前端检测数据格式
function isV2Format(data) {
  return data.strategies && 
         typeof data.strategies.aggressive === 'object' &&
         Array.isArray(data.strategies.aggressive.actions);
}

// 降级处理
function normalizeStrategies(data) {
  if (isV2Format(data)) {
    return data.strategies;
  } else {
    // v1 格式，返回文本
    return {
      aggressive: { summary_text: data.strategies.aggressive },
      balanced: { summary_text: data.strategies.balanced },
      conservative: { summary_text: data.strategies.conservative }
    };
  }
}
```

---

## 🚀 实施计划

| 阶段 | 任务 | 负责人 | 状态 |
|------|------|--------|------|
| 1 | Schema 设计文档 | 灵爪 | ✅ 完成 |
| 2 | stock_analyzer.py 改造 | Claude Code | ⏳ 待开始 |
| 3 | analysis.js 适配 | Claude Code | ⏳ 待开始 |
| 4 | 方向股列表适配 | Claude Code | ⏳ 待开始 |
| 5 | 条件单界面导入 | Claude Code | ⏳ 待开始 |
| 6 | 验收测试 | Codex | ⏳ 待开始 |

---

## 📝 版本历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| 2.0.0 | 2026-03-22 | 初始版本，结构化 schema 设计 | 灵爪 |

---

_🐾 灵爪记录于 2026-03-22 11:10_
