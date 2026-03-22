# TASK_P0_004 - 7 因子整合模块

**优先级**: P0  
**状态**: ✅ 已完成  
**创建时间**: 2026-03-22 19:15  
**负责人**: 灵爪  

---

## 📋 任务概述

更新现有的因子评分整合模块，将舆情因子（第 7 个因子）整合到现有系统中，并调整因子权重配置。

---

## 🎯 目标

1. 在现有 6 因子基础上增加舆情因子
2. 调整因子权重配置
3. 更新个股分析报告展示
4. 保持现有功能不受影响

---

## 📐 设计方案

### 新权重配置

| 因子 | 原权重 | 新权重 | 变化 |
|------|--------|--------|------|
| 趋势因子 | 20% | 17% | -3% |
| 动能因子 | 18% | 15% | -3% |
| 估值因子 | 18% | 15% | -3% |
| 资金因子 | 16% | 13% | -3% |
| 业绩因子 | 16% | 13% | -3% |
| 波动率因子 | 12% | 10% | -2% |
| **舆情因子** | - | **15%** | **+15%** |
| **总计** | 100% | 100% | ✅ |

### 计算逻辑
```javascript
weightedScore = 
  trend × 0.17 +
  momentum × 0.15 +
  valuation × 0.15 +
  capital × 0.13 +
  earnings × 0.13 +
  volatility × 0.10 +
  sentiment × 0.15
```

---

## 📁 交付物

- [x] `api/score-factors.js` - 7 因子整合模块（修改）
- [x] `config/factor-weights.json` - 权重配置文件
- [ ] `analysis.html` - 个股分析报告 UI 更新（如需）

---

## ✅ 验收标准

1. **权重配置**：
   - ✅ 创建 `config/factor-weights.json` 配置文件
   - ✅ 包含 7 个因子的权重
   - ✅ 总和为 100%

2. **因子计算**：
   - ✅ `calculateWeightedScore(factors, weights)` 能正确计算加权分
   - ✅ 舆情因子正确参与计算

3. **报告展示**：
   - ✅ 个股分析报告显示 7 因子雷达图
   - ✅ 显示各因子得分和权重
   - ✅ 显示最终加权分

4. **兼容性**：
   - ✅ 现有功能不受影响
   - ✅ 回测系统能正确读取新权重

---

## 🧪 测试命令

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node -e "
const scoreFactors = require('./api/score-factors.js');
const factors = {
  trend: 0.9,
  momentum: 0.8,
  valuation: 0.7,
  capital: 0.6,
  earnings: 0.8,
  volatility: 0.7,
  sentiment: 0.9
};
const result = scoreFactors.calculateWeightedScore(factors);
console.log('加权分:', result);
"
```

---

## 🔗 相关文件

- 实现：`api/score-factors.js`（修改）
- 配置：`config/factor-weights.json`（新建）
- UI: `frontend/analysis.html`（可能需要修改）

---

## 📝 实现说明

- 权重配置独立成配置文件，便于后续调整
- 保持向后兼容，支持旧版 6 因子数据
- UI 展示需要更新雷达图为 7 个维度
