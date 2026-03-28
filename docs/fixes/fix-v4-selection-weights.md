# Fix: V4 选股功能权重配置不生效

**日期**: 2026-03-26  
**优先级**: P0  
**状态**: 🔄 进行中  

---

## 问题描述

V4 阶段交付的四维度七因子策略参数面板，主人调整权重后选股结果无变化。

**症状**：
- 前端权重配置 UI 正常
- API 传递参数正常（后端日志显示接收权重）
- 选股结果返回正常
- **但权重配置不影响选股结果**

**根因**：
1. `stock_factor_snapshot` 表只有预计算的 `seven_factor_score`，没有七个因子原始数据
2. 后端评分逻辑使用固定权重，忽略传入的参数

---

## 修复步骤

### Step 1: 数据库迁移 ✅

**文件**: `scripts/migrate_add_factor_columns.js`

**执行**:
```bash
node scripts/migrate_add_factor_columns.js
```

**结果**:
- 新增 11 列：7 个因子 + 4 个维度
- 总列数：18 → 29
- 创建 3 个索引优化查询性能

**新增列**:
| 列名 | 类型 | 说明 |
|------|------|------|
| trend_score | REAL | 趋势因子 (RSI/MACD) |
| momentum_score | REAL | 动量因子 (涨跌幅) |
| valuation_score | REAL | 估值因子 (PE/PB) |
| earnings_score | REAL | 业绩因子 (ROE/增长) |
| capital_score_raw | REAL | 资金因子 (主力流入) |
| volatility_score | REAL | 波动率因子 |
| sentiment_score_raw | REAL | 舆情因子 |
| social_score | REAL | 社会价值维度 |
| policy_score_raw | REAL | 政策方向维度 |
| public_score | REAL | 舆论热度维度 |
| business_score | REAL | 商业变现维度 |

---

### Step 2: 数据回填 🔄

**文件**: `scripts/backfill_seven_factors.js`

**执行**:
```bash
# 测试单日
node scripts/backfill_seven_factors.js

# 全量回填
node scripts/backfill_seven_factors.js --auto
```

**计算逻辑**:
- 趋势因子：RSI + MACD 信号
- 动量因子：行业总分代理
- 估值因子：PE + PB
- 业绩因子：ROE + 营收增长 + 净利润增长
- 资金因子：主力流入金额
- 波动率因子：RSI 偏离度
- 舆情因子：情感评分

**进度**:
- 单日测试：✅ 5491 只股票成功
- 全量回填：🔄 后台运行中（约 826 万条记录）

---

### Step 3: API 修改 🔄

**文件**: `api/select.js`

**修改内容**:

1. **查询原始因子数据**:
```javascript
const factorSnapshot = db.prepare(`
  SELECT ts_code, industry, 
         trend_score, momentum_score, valuation_score, earnings_score,
         capital_score_raw, volatility_score, sentiment_score_raw,
         seven_factor_score, pe_ttm, pb, trade_date
  FROM stock_factor_snapshot
  WHERE trade_date = ?
  ORDER BY seven_factor_score DESC
`).all(finalDateStamp);
```

2. **动态权重计算**:
```javascript
let dynamicScore = row.seven_factor_score; // 默认使用预计算值
if (filters.factorWeights) {
  const w = filters.factorWeights;
  dynamicScore = (
    (row.trend_score || 5) * (w.trend || 0.14) +
    (row.momentum_score || 5) * (w.momentum || 0.14) +
    (row.valuation_score || 5) * (w.valuation || 0.14) +
    (row.earnings_score || 5) * (w.earnings || 0.14) +
    (row.capital_score_raw || 5) * (w.capital || 0.14) +
    (row.volatility_score || 5) * (w.volatility || 0.15) +
    (row.sentiment_score_raw || 5) * (w.sentiment || 0.15)
  );
}
```

3. **返回结果包含权重信息**:
```javascript
return { 
  tradeDate: adjustedDate, 
  directions, 
  weights: {
    dimension: filters.dimensionWeights || null,
    factor: filters.factorWeights || null
  }
};
```

---

### Step 4: 前端修改 ✅

**文件**: `backtest.html`

**修改内容**:

1. **添加权重获取函数**:
```javascript
function getDimensionWeights() {
  const weights = {};
  const sliders = document.querySelectorAll('#dimension_sliders input[type="range"]');
  sliders.forEach(slider => {
    weights[slider.dataset.key] = parseFloat(slider.value);
  });
  return Object.keys(weights).length > 0 ? weights : null;
}

function getFactorWeights() {
  const weights = {};
  const sliders = document.querySelectorAll('#factor_sliders input[type="range"]');
  sliders.forEach(slider => {
    weights[slider.dataset.key] = parseFloat(slider.value);
  });
  return Object.keys(weights).length > 0 ? weights : null;
}
```

2. **发送权重参数**:
```javascript
if (strategy === 'seven_factor') {
  // ...筛选参数...
  
  // 发送四维度权重配置
  const dimensionWeights = getDimensionWeights();
  if (dimensionWeights) {
    params.set('dimensionWeights', JSON.stringify(dimensionWeights));
  }
  
  // 发送七因子权重配置
  const factorWeights = getFactorWeights();
  if (factorWeights) {
    params.set('factorWeights', JSON.stringify(factorWeights));
  }
}
```

---

### Step 5: 测试验证 ⏳

**测试用例**:

1. **默认权重测试**:
   ```bash
   curl "http://localhost:3000/api/select?date=2026/03/24&strategy=seven_factor"
   ```
   - 预期：返回选股结果，weights 字段为 null

2. **动态权重测试**:
   ```bash
   curl "http://localhost:3000/api/select?date=2026/03/24&strategy=seven_factor&dimensionWeights={\"social\":0.1,\"policy\":0.5,\"public\":0.1,\"business\":0.3}"
   ```
   - 预期：返回选股结果，weights 字段包含传入的权重

3. **浏览器功能测试**:
   - 打开 backtest.html
   - 选择"四维度七因子策略"
   - 调整权重滑块（如 policy 调至 0.4）
   - 点击"开始选股"
   - 验证选股结果变化

**验收标准**:
- [ ] 调整权重后，选股结果股票列表有变化
- [ ] 高权重因子的股票排名上升
- [ ] 日志显示动态评分计算过程
- [ ] 返回结果包含权重配置

---

## 验证命令

```bash
# 检查表结构
sqlite3 stock_system.db "PRAGMA table_info(stock_factor_snapshot);"

# 检查数据回填进度
sqlite3 stock_system.db "SELECT COUNT(*) FROM stock_factor_snapshot WHERE trend_score > 0;"

# 测试 API
curl "http://localhost:3000/api/select?date=2026/03/24&strategy=seven_factor&factorWeights={\"trend\":0.3,\"momentum\":0.2,\"valuation\":0.1,\"earnings\":0.15,\"capital\":0.1,\"volatility\":0.05,\"sentiment\":0.1}"
```

---

## 影响评估

### 正面影响
- ✅ 权重配置真正影响选股结果
- ✅ 支持个性化策略配置
- ✅ 为策略优化和回测提供数据基础

### 潜在风险
- ⚠️ 数据回填期间数据库锁定
- ⚠️ 动态计算可能影响选股性能
- ⚠️ 因子计算逻辑需要与 score-factors.js 保持一致

### 缓解措施
- 后台运行回填脚本，不影响正常使用
- 添加索引优化查询性能
- 添加日志记录便于调试

---

## 经验教训

详见 `docs/PROJECT_LESSONS.md` - "2026-03-26: V4 选股功能权重配置交付问题"

**核心口诀**:
> 数据驱动，不是假设驱动！
> 端到端测试，不是表面测试！
> 透明沟通，不是隐瞒限制！

---

## 相关文件

- 数据库迁移：`scripts/migrate_add_factor_columns.js`
- 数据回填：`scripts/backfill_seven_factors.js`
- 选股 API: `api/select.js`
- 前端页面：`backtest.html`
- 教训总结：`docs/PROJECT_LESSONS.md`

---

**更新时间**: 2026-03-26 09:04  
**下一步**: 等待数据回填完成，重启服务器测试
