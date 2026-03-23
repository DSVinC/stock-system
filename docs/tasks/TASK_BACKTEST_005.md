# TASK_BACKTEST_005 - 行情阶段识别框架

**创建时间**: 2026-03-23 09:15  
**优先级**: P1  
**负责人**: Claude Code  
**验收员**: Gemini CLI  
**状态**: in_progress  

---

## 📋 任务描述

在 `api/score-factors.js` 中添加行情阶段识别功能，为回测提供标签分类。

---

## 🎯 验收标准

- [ ] 七因子分析 API 输出包含 `market_phase` 字段
- [ ] 能正确识别当前中际旭创的行情阶段（应为"底部反弹"）
- [ ] 识别规则可配置（JSON 配置）

---

## 📝 实现要求

### 1. 行情阶段定义

| 阶段 | 识别条件 |
|------|---------|
| 底部反弹 | MA60>MA20，股价突破所有均线 |
| 趋势确立 | MA5>MA10>MA20>MA60，多头排列 |
| 高位震荡 | 股价在 MA20 附近反复穿越 |
| 趋势反转 | 跌破 MA60，均线空头排列 |

### 2. 函数实现

```javascript
function identifyMarketPhase(technical) {
    // 返回：'bottom_rebound' | 'trend_established' | 'high_consolidation' | 'trend_reversal'
}
```

### 3. 配置化

识别规则支持 JSON 配置

---

## 📁 交付物

1. `api/score-factors.js` - 行情阶段识别函数
2. `config/market-phase.json` - 识别规则配置
3. `docs/handover/TASK_BACKTEST_005_HANDOVER.md`
4. `docs/acceptance/TASK_BACKTEST_005_ACCEPTANCE.md`

---

## 🔗 相关文件

- 父任务：`docs/tasks/TASK_BACKTEST_SYSTEM_001.md`
- 状态文件：`docs/runtime/TASK_BACKTEST_005_STATUS.md`
- 源文件：`api/score-factors.js`
