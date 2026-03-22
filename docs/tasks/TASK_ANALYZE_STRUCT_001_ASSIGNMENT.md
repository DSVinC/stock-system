# TASK_ANALYZE_STRUCT_001 - 结构化 strategies schema 设计

**优先级**: P0 (最优先)  
**负责人**: Claude Code  
**验收人**: Codex  
**创建时间**: 2026-03-22 11:10  
**截止时间**: 2026-03-22 18:00  

---

## 📋 任务描述

设计 stock_analyzer.py 输出结构化 strategies 数据的 schema，确保：
1. 机器可读（条件单界面可导入）
2. 人类可读（HTML 报告可展示）
3. 方向股列表可复用（评分和操作建议一致）

---

## 🎯 验收标准

### 1. Schema 文档完整
- [ ] 定义 `strategies.aggressive/balanced/conservative` 结构
- [ ] 定义 `operations.short_term/mid_term/long_term` 结构
- [ ] 定义 `target_prices` 数组结构
- [ ] 所有字段有类型说明和示例

### 2. 向后兼容
- [ ] 保留原有 `summary_text` 字段用于 HTML 报告
- [ ] 新增 `structured` 字段用于机器读取
- [ ] 提供 v1→v2 迁移指南

### 3. 可复用性
- [ ] 方向股列表可直接使用 schema 显示操作建议
- [ ] 条件单界面可直接导入为配置
- [ ] 评分计算逻辑不变

---

## 📐 Schema 设计草案

### strategies 结构

```typescript
interface Strategy {
  risk_level: 'aggressive' | 'balanced' | 'conservative';
  actions: Action[];
  summary_text: string;  // 人类可读的文本描述
}

interface Action {
  sequence: number;           // 执行顺序 (1, 2, 3...)
  action_type: 'buy' | 'sell' | 'hold';
  trigger_conditions: TriggerCondition[];
  position_percent: number;   // 仓位百分比 (0-100)
  stop_loss?: number;         // 止损价（可选）
  take_profit?: number;       // 止盈价（可选）
  note: string;               // 备注说明
}

interface TriggerCondition {
  type: 'price' | 'indicator' | 'fundamental';
  field: string;              // 字段名 (price, volume_ratio, etc.)
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number | string;     // 比较值
  unit?: string;              // 单位 (元，%, 倍)
}
```

### operations 结构

```typescript
interface Operations {
  short_term: OperationPeriod;
  mid_term: OperationPeriod;
  long_term: OperationPeriod;
}

interface OperationPeriod {
  buy_zone: number[];         // 买入区间 [上限，下限]
  stop_loss: number;          // 止损价
  target_price?: number;      // 目标价（可选）
  summary: string;            // 文本描述
  conditions?: TriggerCondition[];  // 结构化条件（可选）
}
```

### target_prices 结构

```typescript
interface TargetPrice {
  period: 'short' | 'mid' | 'long';
  price: number;
  logic: string;              // 逻辑说明
  expected_return: number;    // 预期涨幅 (%)
  probability?: number;       // 达成概率 (0-1, 可选)
}
```

### 完整输出示例

```json
{
  "stock_code": "300750.SZ",
  "stock_name": "宁德时代",
  "report_score": 4.5,
  "decision": "买入",
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
    "balanced": { ... },
    "conservative": { ... }
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
    "mid_term": { ... },
    "long_term": { ... }
  },
  "target_prices": [
    {
      "period": "short",
      "price": 454.30,
      "logic": "前高压力位",
      "expected_return": 10.5
    }
  ]
}
```

---

## 🔧 实施步骤

### 1. 编写 schema 文档
- 文件：`stock-system/docs/schema/analyzer-output-v2.md`
- 内容：完整的 TypeScript 类型定义 + JSON 示例

### 2. 更新 stock_analyzer.py
- 文件：`skills/a 股个股分析/scripts/stock_analyzer.py`
- 修改：策略生成逻辑，输出结构化数据
- 备份：`stock_analyzer.py.v1` (保留旧版本)

### 3. 更新 analysis.js
- 文件：`stock-system/api/analysis.js`
- 修改：适配新的数据结构
- 兼容：保留 v1 接口，新增 v2 接口

### 4. 测试验证
- 单元测试：验证 schema 合规性
- 集成测试：验证方向股列表显示
- 验收测试：Codex 执行验收脚本

---

## 📝 版本控制要求

### Git 分支
```bash
# 创建功能分支
git checkout -b feat/analyzer-struct-v2

# 提交规范
git commit -m "feat(analyzer): v2 结构化 strategies schema 设计"
git commit -m "feat(analyzer): stock_analyzer.py 输出结构化数据"
git commit -m "feat(api): analysis.js 适配 v2 结构"
```

### 数据库迁移
```bash
# 迁移脚本
database/migrations/001_conditional_orders_v2.up.sql
database/migrations/001_conditional_orders_v2.down.sql
```

### API 版本
```javascript
// v1 接口（保留，向后兼容）
GET /api/analyze/report

// v2 接口（新增，结构化数据）
GET /api/v2/analyze/report
GET /api/v2/analyze/strategy/:ts_code/:riskType
```

---

## ✅ 验收检查清单

- [ ] Schema 文档完整，字段定义清晰
- [ ] stock_analyzer.py 输出符合 schema
- [ ] HTML 报告格式不变（使用 summary_text）
- [ ] 方向股列表可正确显示操作建议
- [ ] Git 提交记录清晰，可回滚
- [ ] 有 v1 备份，支持降级
- [ ] Codex 验收通过

---

## 🔗 相关文档

- Schema 文档：`docs/schema/analyzer-output-v2.md`
- 原脚本备份：`scripts/stock_analyzer.py.v1`
- 迁移指南：`docs/migration/v1-to-v2.md`
- 验收脚本：`test/analyze-struct-v2.test.js`

---

_🐾 灵爪记录于 2026-03-22 11:10_
