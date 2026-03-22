# 条件单核心流程优化需求

## 📋 流程总览

```
选股页面 → 个股分析 → 监控池 → 条件单
   ↓           ↓          ↓         ↓
行业选择   结构化的    股票池    自动触发
          strategies  管理      交易执行
```

## ✅ 已完成功能

### 1. 选股 → 个股分析
- ✅ 选股页面支持行业/概念选择
- ✅ 跳转到个股分析页面
- ✅ 个股分析输出结构化 `strategies` 数据

### 2. 个股分析 → 监控池
- ✅ 分析报告页面有"加入监控池"按钮
- ⚠️ **待优化**：批量导入分析过的股票

### 3. 监控池管理
- ✅ 监控池页面存在 (`monitor-pool.html`)
- ✅ 后端 API (`monitor.js`) 支持添加/删除股票
- ⚠️ **待确认**：与条件单的联动

### 4. 条件单基础功能
- ✅ 条件单 CRUD 完整
- ✅ 支持多种触发条件（价格、技术指标、资金、基本面）
- ✅ 监控脚本每 5 分钟执行
- ✅ 已有"导入分析报告映射"功能框架

## ❌ 待优化功能

### 优化 1：条件单股票选择器限制为监控池
**需求**：创建条件单时，股票选择器默认只显示监控池中的股票

**当前状态**：
- 条件单创建表单使用手动输入股票代码
- 没有从监控池选择的 UI

**需要开发**：
1. 股票选择器改为下拉选择（数据源：监控池）
2. 保留手动输入作为备选
3. 添加"从监控池选择"按钮

**文件**：`conditional-order.html`

---

### 优化 2：分析报告 → 条件单条件映射
**需求**：从个股分析报告的 `strategies` 自动映射为触发条件

**当前状态**：
- ✅ 已有 `importTriggersFromTextarea()` 函数
- ✅ 支持粘贴 JSON 导入
- ⚠️ **需要增强**：映射逻辑需要适配 `stock_analyzer.py` 输出的结构化数据

**需要开发**：
1. 在个股分析页面添加"导入到条件单"按钮
2. 点击后自动填充条件单创建表单
3. 将 `strategies.balanced.actions` 映射为触发条件

**映射规则示例**：
```javascript
// 分析报告输出
{
  "strategies": {
    "balanced": {
      "actions": [
        {"type": "buy", "trigger": "price_below", "value": 600},
        {"type": "buy", "trigger": "pe_low", "value": 25}
      ]
    }
  }
}

// 映射为条件单
{
  "conditions": [
    {"trigger_type": "price_below", "params": {"price": 600}},
    {"trigger_type": "pe_low", "params": {"pe": 25}}
  ]
}
```

**文件**：
- `analysis.html`（添加按钮）
- `conditional-order.html`（增强映射逻辑）

---

### 优化 3：监控池 → 条件单批量创建
**需求**：从监控池批量选择股票，为每个股票创建相同条件的条件单

**当前状态**：
- ❌ 无此功能

**需要开发**：
1. 监控池页面添加"批量创建条件单"按钮
2. 勾选多个股票后，统一配置条件
3. 批量调用条件单创建 API

**文件**：
- `monitor-pool.html`（添加批量操作）
- `conditional-order.html`（支持批量创建 API）

---

## 📐 数据结构

### 个股分析报告输出 (v2)
```json
{
  "stock_code": "300308.SZ",
  "stock_name": "中际旭创",
  "strategies": {
    "aggressive": {
      "actions": [
        {
          "type": "buy",
          "trigger_conditions": [
            {"trigger_type": "price_below", "params": {"price": 580}},
            {"trigger_type": "rsi_oversold", "params": {"threshold": 30}}
          ],
          "position_percent": 30,
          "stop_loss": 520
        }
      ],
      "summary_text": "激进策略：RSI 超卖时建仓 30%"
    },
    "balanced": {
      "actions": [...],
      "summary_text": "稳健策略：..."
    },
    "conservative": {
      "actions": [...],
      "summary_text": "保守策略：..."
    }
  }
}
```

### 条件单 API 输入
```json
{
  "account_id": 1,
  "ts_code": "300308.SZ",
  "stock_name": "中际旭创",
  "action": "buy",
  "order_type": "position_pct",
  "position_pct": 30,
  "conditions": [
    {"trigger_type": "price_below", "params": {"price": 580}},
    {"trigger_type": "rsi_oversold", "params": {"threshold": 30}}
  ],
  "condition_logic": "AND",
  "stop_loss_price": 520,
  "start_date": "2026-03-22",
  "end_date": "2026-06-22",
  "max_trigger_count": 1
}
```

---

## 🎯 开发优先级

### P0 - 核心流程打通
1. **优化 1**：条件单股票选择器支持监控池
2. **优化 2**：分析报告→条件单映射完善

### P1 - 效率提升
3. **优化 3**：监控池批量创建条件单

### P2 - 体验优化
4. 条件单模板保存与复用
5. 条件单回测验证

---

## 📝 相关任务文档

- `docs/tasks/TASK_CONDITIONAL_FLOW_001.md` - 监控池选择器
- `docs/tasks/TASK_CONDITIONAL_FLOW_002.md` - 分析报告映射增强
- `docs/tasks/TASK_CONDITIONAL_FLOW_003.md` - 批量创建功能

---

## 📚 参考文件

- 条件单页面：`conditional-order.html`
- 监控池 API：`api/monitor.js`
- 条件单监控：`api/monitor-conditional.js`
- 个股分析：`analysis.html`
- 分析 API：`api/analysis.js`
- 分析脚本：`scripts/stock_analyzer.py`
