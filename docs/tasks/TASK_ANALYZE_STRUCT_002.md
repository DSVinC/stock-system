# TASK_ANALYZE_STRUCT_002 - stock_analyzer.py 结构化改造

**优先级**: P0 (最优先)  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 11:16  
**预计完成**: 2026-03-22 15:00  

---

## 📋 任务描述

改造 `stock_analyzer.py` 脚本，使其输出结构化的 strategies 数据（v2 schema），同时保留向后兼容性。

---

## 🎯 验收标准

### 1. 输出格式符合 v2 schema
- [ ] `strategies.aggressive/balanced/conservative` 为对象（非文本）
- [ ] 每个 strategy 包含 `actions` 数组
- [ ] 每个 action 包含 `sequence`, `action_type`, `trigger_conditions`, `position_percent`
- [ ] 保留 `summary_text` 字段用于 HTML 报告

### 2. 向后兼容
- [ ] v1 格式检测逻辑正常
- [ ] HTML 报告继续显示文本描述
- [ ] 现有 API 调用不报错

### 3. 数据一致性
- [ ] 方向股列表可正确解析操作建议
- [ ] 条件单界面可导入为配置
- [ ] 评分计算逻辑不变

---

## 🔧 实施步骤

### Step 1: 备份 v1 版本
```bash
cd /Users/vvc/.openclaw/workspace/skills/a 股个股分析/scripts
cp stock_analyzer.py stock_analyzer.py.v1
```

### Step 2: 修改策略生成逻辑

**原逻辑（v1）**:
```python
strategies = {
    'aggressive': f"第一笔买入价：{buy_price_1}元（仓位{position_1}%）...",
    'balanced': f"第一笔：{buy_price_2}元（仓位{position_2}%）...",
    'conservative': f"观望。等待股价站稳{buy_price_2}元..."
}
```

**新逻辑（v2）**:
```python
strategies = {
    'aggressive': {
        'risk_level': 'aggressive',
        'actions': [
            {
                'sequence': 1,
                'action_type': 'buy',
                'trigger_conditions': [
                    {
                        'type': 'price',
                        'field': 'price',
                        'operator': '<=',
                        'value': buy_price_1,
                        'unit': '元'
                    }
                ],
                'position_percent': position_1,
                'stop_loss': stop_loss,
                'note': '第一笔建仓'
            },
            # ... 更多 actions
        ],
        'summary_text': f"第一笔买入价：{buy_price_1}元（仓位{position_1}%）..."
    },
    'balanced': { ... },
    'conservative': { ... }
}
```

### Step 3: 修改 operations 生成逻辑

**原逻辑（v1）**:
```python
operations = {
    'short_term': f"短线关注{buy_price_1}-{buy_price_2}元区间...",
    'mid_term': "中线重点看业绩、资金和价格是否共振...",
    'long_term': "长线继续跟踪行业景气..."
}
```

**新逻辑（v2）**:
```python
operations = {
    'short_term': {
        'buy_zone': [buy_price_1, buy_price_2],
        'stop_loss': stop_loss,
        'summary': f"短线关注{buy_price_1}-{buy_price_2}元区间...",
        'conditions': [
            {
                'type': 'price',
                'field': 'price',
                'operator': '>=',
                'value': buy_price_2
            }
        ]
    },
    'mid_term': {
        'buy_zone': [buy_price_2, buy_price_3],
        'target_price': target_price_mid,
        'summary': "中线重点看业绩、资金和价格是否共振...",
        'conditions': []
    },
    'long_term': {
        'target_price': target_price_long,
        'summary': "长线继续跟踪行业景气...",
        'conditions': []
    }
}
```

### Step 4: 修改 target_prices 生成逻辑

**原逻辑（v1）**:
```python
target_prices = []  # 空数组
```

**新逻辑（v2）**:
```python
target_prices = [
    {
        'period': 'short',
        'price': target_price_short,
        'logic': '前高压力位',
        'expected_return': expected_return_short
    },
    {
        'period': 'mid',
        'price': target_price_mid,
        'logic': '估值修复目标',
        'expected_return': expected_return_mid
    },
    {
        'period': 'long',
        'price': target_price_long,
        'logic': '行业景气度提升',
        'expected_return': expected_return_long
    }
]
```

### Step 5: 测试验证

```bash
# 测试 JSON 输出
python3 stock_analyzer.py --json 300750.SZ | python3 -m json.tool

# 验证 schema 合规性
python3 test_schema_v2.py 300750.SZ

# 测试 HTML 报告（应继续显示文本）
python3 stock_analyzer.py --html 300750.SZ
```

---

## 📝 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `stock_analyzer.py.v1` | 创建 | v1 版本备份 |
| `stock_analyzer.py` | 修改 | 策略生成逻辑改造 |
| `test_schema_v2.py` | 创建 | schema 合规性测试脚本 |

---

## ✅ 验收检查清单

- [ ] 备份 v1 版本完成
- [ ] strategies 输出符合 v2 schema
- [ ] operations 输出符合 v2 schema
- [ ] target_prices 输出符合 v2 schema
- [ ] summary_text 字段存在且内容正确
- [ ] JSON 输出可通过 schema 验证
- [ ] HTML 报告格式不变
- [ ] Git 提交规范（feat(analyzer): v2 结构化输出）
- [ ] Codex 验收通过

---

## 🔗 相关文档

- Schema 文档：`/Users/vvc/.openclaw/workspace/stock-system/docs/schema/analyzer-output-v2.md`
- 任务分配：`/Users/vvc/.openclaw/workspace/stock-system/docs/tasks/TASK_ANALYZE_STRUCT_001_ASSIGNMENT.md`
- 备份位置：`/Users/vvc/.openclaw/workspace/skills/a 股个股分析/scripts/stock_analyzer.py.v1`

---

_🐾 灵爪监督于 2026-03-22 11:16_
