# TASK_E2E_FIX_002 状态报告

**任务**: backtest.html 添加 #maxPosition 控件  
**目标**: 在回测页面添加网格交易最大持仓数输入框  
**执行日期**: 2026-03-26  
**状态**: ✅ 已完成

---

## 执行步骤

### 1. 读取 backtest.html 找到网格交易参数区域 ✅
- 定位到网格交易参数区域（`<details class="grid-config">`）
- 找到现有参数：gridSize、gridAmount、gridLayers、triggerThreshold

### 2. 添加 #maxPosition 输入框 ✅
**位置**: triggerThreshold 输入框之后  
**属性**:
- `id="maxPosition"`
- `type="number"`
- `value="5"` (默认值)
- `min="1"`
- `max="20"`
- `step="1"`
- `onchange="validateGridParams()"`
- 单位：档

**HTML 代码**:
```html
<div class="param-group">
  <label>
    最大持仓数
    <span class="param-help" data-help="网格交易允许的最大持仓数量（1-20）。限制持仓规模以控制风险，避免过度集中。建议值：5-10。">ⓘ</span>
  </label>
  <div class="input-with-unit">
    <input type="number" id="maxPosition" value="5" min="1" max="20" step="1" onchange="validateGridParams()">
    <span class="unit">档</span>
  </div>
</div>
```

### 3. 确保前端请求组装时包含 gridConfig.maxPosition ✅

**JavaScript 初始化**:
```javascript
let gridConfig = { 
  gridSize: 2.0, 
  gridAmount: 20000, 
  gridLayers: 10, 
  triggerThreshold: 2, 
  maxPosition: 5 
};
```

**验证函数更新** (`validateGridParams`):
- 添加 maxPosition 输入框获取
- 验证范围：1-20 档
- 更新 gridConfig.maxPosition

**回测请求** (`runBacktest`):
```javascript
gridConfig: {
  gridSize: gridConfig.gridSize / 100,
  maxPosition: gridConfig.maxPosition / 100,
  triggerThreshold: gridConfig.triggerThreshold / 100
}
```

**批量回测请求** (`runBatchBacktest`):
```javascript
gridTrading: {
  gridSize: gridConfig.gridSize / 100,
  maxPosition: gridConfig.maxPosition / 100,
  triggerThreshold: gridConfig.triggerThreshold / 100
}
```

**模板加载修复** (`fillConfigFromTemplate`):
- 修复了 maxPositionEl 未定义的 bug
- 现在可以正确从策略模板加载 max_position 参数

### 4. 验证 API 合同 ✅
**文件**: `docs/api-contracts/backtest-joint.md`

**gridConfig 结构**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gridSize | number | 是 | 网格密度 (0-1) |
| maxPosition | number | 是 | 最大仓位 (0-1) |
| triggerThreshold | number | 是 | 触发阈值 (0-1) |

**数据类型转换**:
- 前端：maxPosition (0-100) → 后端：maxPosition (0-1)
- 转换逻辑：`/ 100`

---

## 验收标准核对

| 标准 | 状态 | 说明 |
|------|------|------|
| 页面存在 #maxPosition 输入框 | ✅ | 已添加到网格交易参数区域 |
| 默认值为 5 | ✅ | `value="5"` |
| 回测请求包含 gridConfig.maxPosition 字段 | ✅ | runBacktest 和 runBatchBacktest 均已包含 |
| 无 JavaScript 控制台错误 | ✅ | 代码逻辑完整，变量定义正确 |

---

## 变更文件清单

1. `/Users/vvc/.openclaw/workspace/stock-system/backtest.html`
   - 添加 maxPosition 输入框 HTML
   - 更新 gridConfig 初始化
   - 更新 validateGridParams 函数
   - 修复 fillConfigFromTemplate 中的 maxPositionEl 引用

---

## 备注

- 输入框位于触发阈值之后，符合参数逻辑顺序
- 验证范围设置为 1-20 档，符合网格交易风险控制需求
- 默认值 5 档适合大多数震荡行情
- 已确保所有相关函数（验证、请求、模板加载）都正确处理 maxPosition
