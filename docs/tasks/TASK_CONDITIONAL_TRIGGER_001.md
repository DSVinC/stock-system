# TASK_CONDITIONAL_TRIGGER_001 - 触发条件配置器开发

**优先级**: P1  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 13:20  
**预计完成**: 2026-03-22 18:00  
**依赖**: TASK_ANALYZE_STRUCT_002 完成（结构化数据输出）

---

## 📋 任务描述

实现触发条件配置器，支持多种触发条件类型（价格、技术指标、基本面）的配置和映射。

---

## 🎯 验收标准

### 1. 触发条件类型
- [ ] 价格触发：股价上穿/下穿指定价格
- [ ] 技术指标触发：MA 金叉/死叉、RSI 超买/超卖
- [ ] 基本面触发：PE 低于/高于指定值
- [ ] 涨跌幅触发：日涨跌幅超过指定百分比

### 2. 配置界面
- [ ] 条件类型选择器（下拉菜单）
- [ ] 动态参数输入（根据类型显示不同输入框）
- [ ] 条件预览（自然语言描述，如"股价上穿 200 元"）
- [ ] 支持多条件组合（AND/OR）

### 3. 导入映射
- [ ] 支持从 analysis report 导入触发建议
- [ ] 自动映射报告中的触发条件到配置器
- [ ] 用户可修改导入的条件

### 4. 数据验证
- [ ] 价格必须为正数
- [ ] 百分比范围 0-100
- [ ] 技术指标参数合法

---

## 🔧 实施步骤

### Step 1: 条件类型定义

```javascript
const TRIGGER_TYPES = {
  price_above: { label: '股价上穿', params: ['price'] },
  price_below: { label: '股价下穿', params: ['price'] },
  ma_golden_cross: { label: 'MA 金叉', params: ['ma_short', 'ma_long'] },
  ma_death_cross: { label: 'MA 死叉', params: ['ma_short', 'ma_long'] },
  rsi_overbought: { label: 'RSI 超买', params: ['threshold'] },
  rsi_oversold: { label: 'RSI 超卖', params: ['threshold'] },
  pe_low: { label: 'PE 低于', params: ['pe'] },
  pe_high: { label: 'PE 高于', params: ['pe'] },
  daily_gain: { label: '日涨幅超过', params: ['percent'] },
  daily_loss: { label: '日跌幅超过', params: ['percent'] },
};
```

### Step 2: 导入映射逻辑

```javascript
function mapReportToTrigger(report) {
  const triggers = [];
  
  // 从报告的建议中提取触发条件
  if (report.strategies?.balanced?.actions) {
    for (const action of report.strategies.balanced.actions) {
      if (action.trigger_condition) {
        triggers.push(parseTriggerCondition(action.trigger_condition));
      }
    }
  }
  
  return triggers;
}
```

### Step 3: UI 组件

```html
<select id="trigger-type" onchange="renderTriggerParams()">
  <option value="price_above">股价上穿</option>
  <option value="price_below">股价下穿</option>
  <option value="ma_golden_cross">MA 金叉</option>
  <!-- ... -->
</select>

<div id="trigger-params">
  <!-- 动态渲染参数输入框 -->
</div>

<div id="trigger-preview">
  条件预览：股价上穿 200 元
</div>
```

---

## 📁 相关文件

- 目标文件：`conditional-order.html` 或 `trigger-config.html`
- 工具文件：`js/trigger-config.js`（新建）

---

## ✅ 验收检查清单

- [ ] 所有触发类型支持
- [ ] 动态参数输入正确
- [ ] 条件预览正常
- [ ] 导入映射功能正常
- [ ] 数据验证正确
- [ ] Git 提交规范（feat(trigger): 触发条件配置器）
- [ ] Codex 验收通过

---

## 🔗 相关任务

- TASK_CONDITIONAL_IMPORT_001: 导入功能
- TASK_CONDITIONAL_UI_001: 条件单主界面
- TASK_CONDITIONAL_ACTION_001: 执行动作配置
