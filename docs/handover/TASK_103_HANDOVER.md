# TASK_103 交接文档

**任务**: 条件单界面重构 Phase 0: stock_analyzer.py 结构化改造
**创建时间**: 2026-03-23 15:40
**完成时间**: 2026-03-23 15:47
**状态**: ✅ 已完成

---

## 📋 任务背景

条件单界面需要结构化的策略建议数据，但当前 stock_analyzer.py 输出的是纯文本格式，无法直接映射到条件单的触发条件和执行动作。

---

## 🎯 目标

修改 stock_analyzer.py 输出结构化 JSON，包含：
- 策略建议（买入/卖出/持有）
- 触发条件（价格、指标阈值）
- 交易参数（数量、金额、仓位比例）

---

## 📁 相关文件

- 输入：`docs/tasks/TASK_103.md`
- 输出：`stock_analyzer.py` (已修改)
- 参考：`docs/research/strategies_schema.md` (TASK_ANALYZE_STRUCT_001 产出)
- 状态：`docs/runtime/TASK_103_STATUS.md`
- 验收：`docs/acceptance/TASK_103_ACCEPTANCE.md`

---

## 🔧 实施内容

### 1. build_strategies() 函数 (lines 519-803)

核心结构化输出函数，根据决策（买入/观望/回避）生成三种风险等级的策略：

```python
def build_strategies(decision, price, technical, valuation, fundamental):
    # 返回 v2 结构化策略数据
    return {
        'strategies': {
            'aggressive': {...},
            'balanced': {...},
            'conservative': {...},
        },
        'structured_strategy': {...}
    }
```

### 2. 策略结构 (符合 strategies_schema.md)

```typescript
interface Strategy {
  risk_level: 'aggressive' | 'balanced' | 'conservative';
  actions: Action[];
  summary_text: string;  // v1 向后兼容
}

interface Action {
  sequence: number;
  action_type: 'buy' | 'sell' | 'hold';
  trigger_conditions: TriggerCondition[];
  position_percent: number;
  stop_loss?: number;
  note: string;
}

interface TriggerCondition {
  type: 'price' | 'indicator';
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number | string;
  unit?: string;
}
```

### 3. 向后兼容设计

- 每个 strategy 包含 `summary_text` 字段
- API 层可通过 `downgradeToV1()` 函数转换格式
- 保持现有 HTML 报告生成功能

---

## ✅ 验收结果

所有验收标准已通过：
1. ✅ stock_analyzer.py 输出包含 strategies 对象
2. ✅ 每个策略包含 trigger_conditions 和 action_type
3. ✅ 向后兼容 v1 格式（summary_text）
4. ✅ 运行脚本测试通过

---

## 🔗 后续任务

- TASK_104: analysis.js API 适配 v2
- TASK_105: 方向股列表界面适配 v2