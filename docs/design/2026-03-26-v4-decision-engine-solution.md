# V4 回测系统个股分析集成 - 完整解决方案

**创建时间**: 2026-03-26 10:30  
**作者**: 灵爪  
**版本**: v1.0  
**状态**: 待实施

---

## 📋 目录

1. [问题清单](#1-问题清单)
2. [解决方案详解](#2-解决方案详解)
3. [代码实现细节](#3-代码实现细节)
4. [数据库设计](#4-数据库设计)
5. [API 设计](#5-api-设计)
6. [任务清单](#6-任务清单)

---

## 1. 问题清单

### 1.1 核心问题

回测系统需要个股分析功能，使用历史数据进行分析，但当前架构存在以下问题：

| 问题 | 现状 | 影响 |
|------|------|------|
| 选股和个股分析割裂 | 选股输出股票列表，个股分析独立存在 | 回测只有评分，没有建仓/止损/止盈价 |
| 未来函数风险 | 回测使用当前数据而非历史快照 | 回测结果不准确 |
| 技术指标数据缺失 | stock_factor_snapshot 无 MA/布林带 | 无法计算决策价格 |
| 计算性能瓶颈 | 每只股票每日计算需读取 60 天数据 | 15 万次数据库查询 |

### 1.2 详细问题清单

#### 问题 1：技术指标数据缺失（MA/布林带）

**现状**：
```sql
-- stock_factor_snapshot 表字段
rsi REAL,              -- ✅ 有
macd_signal TEXT,      -- ✅ 有
ma5, ma10, ma20, ma60, -- ❌ 缺失
bb_upper, bb_middle,   -- ❌ 缺失
bb_lower               -- ❌ 缺失
```

**影响**：
- 建仓价 = min(MA10, close×0.98) → 无法计算
- 止损价 = MA60 → 无法计算
- 止盈价 = max(close×1.10, MA20, 布林上轨) → 无法计算

#### 问题 2：计算性能瓶颈

**现状**：
- 10 只股票 × 250 交易日 = 2500 次决策
- 每次决策读取 60 条价格记录 = 15 万次数据库查询

**影响**：
- 回测耗时过长
- 数据库压力大

#### 问题 3：回测引擎重构范围

**现状**：
```javascript
// 当前逻辑
async executeDailyRebalance(date, selectedStocks) {
  // 卖出：不在目标持仓
  // 买入：新选中的股票（使用收盘价）
}
```

**需要修改**：
- 新增决策单生成逻辑
- 修改调仓逻辑使用决策单价格
- 新增止损/止盈触发逻辑

#### 问题 4：错误处理策略

**问题**：数据缺失时如何处理？

**场景**：
- 数据不足（MA60 需要 60 天数据，但只有 30 天）
- 股票停牌（stock_daily 无当日数据）
- 数据库错误/系统异常

---

## 2. 解决方案详解

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    V4 回测系统架构                           │
└─────────────────────────────────────────────────────────────┘

【数据层】已有历史快照
├─ stock_factor_snapshot (七因子评分、四维度评分)
├─ stock_daily (close 价格，用于计算技术指标)
├─ stock_valuation_snapshot (PE、PB、PEG)
└─ stock_moneyflow_snapshot (资金流)

【决策层】新增历史决策引擎
│
├─ 输入：T 日快照数据 + T 日前 60 日价格数据
│   ↓
├─ 规则引擎（复用 Python 脚本逻辑）
│   ├─ 实时计算 MA5/10/20/60
│   ├─ 实时计算布林带
│   ├─ 建仓价 = min(MA10, close×0.98)
│   ├─ 止损价 = MA60
│   ├─ 止盈价 = max(close×1.10, MA20, 布林上轨)
│   └─ 仓位 = f(评分，风险等级)
│   ↓
└─ 输出：T 日决策单（可执行价格）

【执行层】回测引擎改造
│
├─ 读取 T 日决策单
├─ 检查决策单有效期
├─ 检查止损/止盈触发
├─ 模拟 T+1 日实际成交
└─ 记录交易流水

【缓存层】三层缓存策略
├─ L1 缓存（内存）：当前回测的价格数据
├─ L2 缓存（内存）：已计算的技术指标
└─ L3 缓存（文件）：决策单结果（跨回测复用）
```

### 2.2 技术指标实时计算方案

#### MA 计算（滑动窗口优化）

```javascript
// 批量预加载价格数据
async preloadPrices(ts_codes, startDate, endDate) {
  const query = `
    SELECT ts_code, trade_date, close FROM stock_daily
    WHERE ts_code IN (${ts_codes.map(() => '?').join(',')})
    AND trade_date BETWEEN ? AND ?
    ORDER BY ts_code, trade_date ASC
  `;
  
  const params = [...ts_codes, startDate, endDate];
  const rows = await this.db.allPromise(query, params);
  
  // 组织为 Map<ts_code, Map<tradeDate, close>>
  const priceMap = new Map();
  for (const row of rows) {
    if (!priceMap.has(row.ts_code)) {
      priceMap.set(row.ts_code, new Map());
    }
    priceMap.get(row.ts_code).set(row.trade_date, row.close);
  }
  
  return priceMap;
}

// 滑动窗口计算 MA
function calculateMA(closes, period) {
  if (closes.length < period) {
    return null; // 数据不足
  }
  
  // 使用滑动窗口，避免重复计算
  let sum = closes.slice(0, period).reduce((a, b) => a + b, 0);
  const ma = [sum / period];
  
  for (let i = period; i < closes.length; i++) {
    sum = sum - closes[i - period] + closes[i];
    ma.push(sum / period);
  }
  
  return ma;
}
```

#### 布林带计算

```javascript
async calculateBollinger(ts_code, tradeDate, period = 20) {
  const prices = await this.getHistoricalPrices(ts_code, tradeDate, period);
  
  if (prices.length < period) {
    throw new Error(`数据不足：${period}天`);
  }
  
  const middle = prices.reduce((a, b) => a + b, 0) / period;
  const variance = prices.reduce((acc, p) => acc + Math.pow(p - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + 2 * std;
  const lower = middle - 2 * std;
  
  return { upper, middle, lower };
}
```

### 2.3 三层缓存策略

```javascript
class DecisionCache {
  constructor() {
    // L1: 价格缓存 Map<ts_code, Map<tradeDate, close>>
    this.priceCache = new Map();
    
    // L2: 指标缓存 Map<ts_code+tradeDate, {ma10, ma20, ma60, bollinger}>
    this.indicatorCache = new Map();
    
    // L3: 决策缓存 Map<decisionKey, decision>
    this.decisionCache = new Map();
  }
  
  // 缓存 Key 生成
  generateDecisionKey(ts_code, tradeDate, strategyType, paramsHash) {
    return `decision:${ts_code}:${tradeDate}:${strategyType}:${paramsHash}`;
  }
  
  // 缓存失效
  invalidate() {
    this.priceCache.clear();
    this.indicatorCache.clear();
    // L3 缓存可选择保留（跨回测复用）
  }
}
```

### 2.4 三级错误处理策略

```javascript
// 错误类型定义
class DataInsufficientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataInsufficientError';
    this.level = 1; // Level 1: 跳过
  }
}

class StockSuspendedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StockSuspendedError';
    this.level = 1; // Level 1: 跳过
  }
}

class CriticalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CriticalError';
    this.level = 3; // Level 3: 终止
  }
}

// 错误处理逻辑
async generateDecision(ts_code, tradeDate, snapshot) {
  try {
    // 检查数据完整性
    const priceCount = await this.getPriceCount(ts_code, tradeDate);
    if (priceCount < 60) {
      throw new DataInsufficientError(
        `${ts_code} 在 ${tradeDate} 前只有 ${priceCount} 天数据，需要 60 天`
      );
    }
    
    // 检查是否停牌
    const dayData = await this.getDayData(ts_code, tradeDate);
    if (!dayData || dayData.close === 0) {
      throw new StockSuspendedError(`${ts_code} 在 ${tradeDate} 停牌`);
    }
    
    // 生成决策单...
    const decision = await this.buildDecision(ts_code, tradeDate, snapshot);
    return decision;
    
  } catch (error) {
    if (error.level === 1) {
      // Level 1：记录警告，返回 null（跳过）
      console.warn(`[决策引擎] ${error.message}`);
      return null;
    } else if (error.level === 2) {
      // Level 2：记录警告，返回 null（跳过）
      console.warn(`[决策引擎] ${error.message}`);
      return null;
    } else {
      // Level 3：抛出错误，终止回测
      throw error;
    }
  }
}
```

### 2.5 决策单与策略参数融合

```javascript
// 策略类型与有效期映射
const STRATEGY_CONFIG = {
  short_term: {
    holding_period: 'short',
    target_price_key: 'target_short',
    valid_days: 1,
    rebalance_frequency: 'daily'
  },
  mid_term: {
    holding_period: 'mid',
    target_price_key: 'target_mid',
    valid_days: 5,
    rebalance_frequency: 'weekly'
  },
  long_term: {
    holding_period: 'long',
    target_price_key: 'target_long',
    valid_days: 20,
    rebalance_frequency: 'monthly'
  }
};

// 有效期计算
calculateValidUntil(tradeDate, strategyType) {
  const config = STRATEGY_CONFIG[strategyType];
  const date = new Date(tradeDate);
  date.setDate(date.getDate() + config.valid_days);
  return date.toISOString().split('T')[0];
}
```

### 2.6 选股流程与个股分析融合

```javascript
// /api/select.js 增强
async function selectStocks(params) {
  // 1. 原有选股逻辑
  const selectedStocks = await runSelection(params);
  
  // 2. 为每只股票生成决策单摘要
  const decisionEngine = new HistoricalDecisionEngine();
  for (const stock of selectedStocks) {
    const snapshot = await getSnapshot(stock.ts_code, params.selection_date);
    const decision = await decisionEngine.generateDecision(
      stock.ts_code,
      params.selection_date,
      snapshot
    );
    
    if (decision) {
      // 3. 附加决策单摘要
      stock.entry_zone = decision.entry_zone;
      stock.stop_loss = decision.stop_loss;
      stock.target_price = decision.target_prices[params.holding_period];
      stock.position_suggest = decision.position_suggest;
      stock.valid_until = decision.valid_until;
    }
  }
  
  return selectedStocks;
}
```

---

## 3. 代码实现细节

### 3.1 决策引擎核心类

```javascript
// api/backtest-decision.js
const { getDatabase } = require('./db');

class HistoricalDecisionEngine {
  constructor(config = {}) {
    this.db = getDatabase();
    this.config = {
      strategyType: config.strategyType || 'short_term',
      ...config
    };
    
    // 三层缓存
    this.priceCache = new Map();
    this.indicatorCache = new Map();
    this.decisionCache = new Map();
  }
  
  /**
   * 批量预加载价格数据
   */
  async preloadPrices(ts_codes, startDate, endDate) {
    const query = `
      SELECT ts_code, trade_date, close FROM stock_daily
      WHERE ts_code IN (${ts_codes.map(() => '?').join(',')})
      AND trade_date BETWEEN ? AND ?
      ORDER BY ts_code, trade_date ASC
    `;
    
    const params = [...ts_codes, startDate, endDate];
    const rows = await this.db.allPromise(query, params);
    
    // 组织为 Map<ts_code, Map<tradeDate, close>>
    for (const row of rows) {
      if (!this.priceCache.has(row.ts_code)) {
        this.priceCache.set(row.ts_code, new Map());
      }
      this.priceCache.get(row.ts_code).set(row.trade_date, row.close);
    }
    
    console.log(`[决策引擎] 预加载 ${ts_codes.length} 只股票的价格数据`);
  }
  
  /**
   * 获取历史价格（用于计算技术指标）
   */
  async getHistoricalPrices(ts_code, tradeDate, days) {
    const cacheKey = `prices:${ts_code}:${tradeDate}:${days}`;
    if (this.priceCache.has(cacheKey)) {
      return this.priceCache.get(cacheKey);
    }
    
    const query = `
      SELECT close FROM stock_daily
      WHERE ts_code = ? AND trade_date <= ?
      ORDER BY trade_date DESC
      LIMIT ?
    `;
    
    const rows = await this.db.allPromise(query, [ts_code, tradeDate, days]);
    const prices = rows.map(r => r.close).reverse(); // 正序排列
    
    this.priceCache.set(cacheKey, prices);
    return prices;
  }
  
  /**
   * 计算 MA
   */
  async calculateMA(ts_code, tradeDate, days) {
    const cacheKey = `ma:${ts_code}:${tradeDate}:${days}`;
    if (this.indicatorCache.has(cacheKey)) {
      return this.indicatorCache.get(cacheKey);
    }
    
    const prices = await this.getHistoricalPrices(ts_code, tradeDate, days);
    if (prices.length < days) {
      throw new DataInsufficientError(
        `${ts_code} 在 ${tradeDate} 前只有 ${prices.length} 天数据，需要${days}天`
      );
    }
    
    const sum = prices.reduce((acc, p) => acc + p, 0);
    const ma = sum / days;
    
    this.indicatorCache.set(cacheKey, ma);
    return ma;
  }
  
  /**
   * 计算布林带
   */
  async calculateBollinger(ts_code, tradeDate, period = 20) {
    const cacheKey = `bollinger:${ts_code}:${tradeDate}:${period}`;
    if (this.indicatorCache.has(cacheKey)) {
      return this.indicatorCache.get(cacheKey);
    }
    
    const prices = await this.getHistoricalPrices(ts_code, tradeDate, period);
    if (prices.length < period) {
      throw new DataInsufficientError(`数据不足：${period}天`);
    }
    
    const middle = prices.reduce((a, b) => a + b, 0) / period;
    const variance = prices.reduce((acc, p) => acc + Math.pow(p - middle, 2), 0) / period;
    const std = Math.sqrt(variance);
    const upper = middle + 2 * std;
    const lower = middle - 2 * std;
    
    const result = { upper, middle, lower };
    this.indicatorCache.set(cacheKey, result);
    return result;
  }
  
  /**
   * 生成决策单
   */
  async generateDecision(ts_code, tradeDate, snapshot) {
    const cacheKey = this.generateDecisionKey(ts_code, tradeDate);
    if (this.decisionCache.has(cacheKey)) {
      return this.decisionCache.get(cacheKey);
    }
    
    try {
      // 1. 检查数据完整性
      const priceCount = await this.getPriceCount(ts_code, tradeDate);
      if (priceCount < 60) {
        throw new DataInsufficientError(
          `${ts_code} 在 ${tradeDate} 前只有 ${priceCount} 天数据，需要 60 天`
        );
      }
      
      // 2. 检查是否停牌
      const dayData = await this.getDayData(ts_code, tradeDate);
      if (!dayData || dayData.close === 0) {
        throw new StockSuspendedError(`${ts_code} 在 ${tradeDate} 停牌`);
      }
      
      // 3. 实时计算技术指标
      const ma10 = await this.calculateMA(ts_code, tradeDate, 10);
      const ma20 = await this.calculateMA(ts_code, tradeDate, 20);
      const ma60 = await this.calculateMA(ts_code, tradeDate, 60);
      const bollinger = await this.calculateBollinger(ts_code, tradeDate, 20);
      
      const close = dayData.close;
      
      // 4. 计算决策价格
      const entryPrice1 = Math.min(ma10, close * 0.98);
      const entryPrice2 = Math.min(ma20, close * 0.95);
      const stopLoss = ma60;
      const targetShort = Math.max(close * 1.05, ma10);
      const targetMid = Math.max(close * 1.10, ma20);
      const targetLong = Math.max(close * 1.18, bollinger.upper);
      
      // 5. 计算建议仓位
      const positionSuggest = this.calculatePosition(snapshot.seven_factor_score);
      
      // 6. 生成决策单
      const decision = {
        ts_code,
        tradeDate,
        decision: snapshot.seven_factor_score >= 0.75 ? 'buy' : 'hold',
        entry_zone: [entryPrice1, entryPrice2],
        stop_loss: stopLoss,
        target_prices: {
          short: targetShort,
          mid: targetMid,
          long: targetLong
        },
        position_suggest: positionSuggest,
        valid_until: this.calculateValidUntil(tradeDate),
        seven_factor_score: snapshot.seven_factor_score,
        technical_snapshot: {
          ma10,
          ma20,
          ma60,
          bollinger
        },
        valuation_snapshot: {
          pe: snapshot.pe_ttm,
          pb: snapshot.pb,
          peg: snapshot.peg
        }
      };
      
      this.decisionCache.set(cacheKey, decision);
      return decision;
      
    } catch (error) {
      if (error instanceof DataInsufficientError || error instanceof StockSuspendedError) {
        console.warn(`[决策引擎] ${error.message}`);
        return null; // 跳过
      } else {
        throw error; // 终止回测
      }
    }
  }
  
  /**
   * 计算建议仓位
   */
  calculatePosition(sevenFactorScore) {
    if (sevenFactorScore >= 0.85) return 0.40; // 40%
    if (sevenFactorScore >= 0.75) return 0.30; // 30%
    if (sevenFactorScore >= 0.65) return 0.20; // 20%
    return 0.10; // 10%
  }
  
  /**
   * 计算有效期
   */
  calculateValidUntil(tradeDate) {
    const config = STRATEGY_CONFIG[this.config.strategyType];
    const date = new Date(tradeDate);
    date.setDate(date.getDate() + config.valid_days);
    return date.toISOString().split('T')[0];
  }
  
  /**
   * 生成缓存 Key
   */
  generateDecisionKey(ts_code, tradeDate) {
    return `decision:${ts_code}:${tradeDate}:${this.config.strategyType}`;
  }
  
  /**
   * 清空缓存
   */
  clearCache() {
    this.priceCache.clear();
    this.indicatorCache.clear();
    this.decisionCache.clear();
  }
}

// 错误类型
class DataInsufficientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataInsufficientError';
    this.level = 1;
  }
}

class StockSuspendedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StockSuspendedError';
    this.level = 1;
  }
}

module.exports = { HistoricalDecisionEngine, DataInsufficientError, StockSuspendedError };
```

---

## 4. 数据库设计

### 4.1 新增表：回测决策单

```sql
CREATE TABLE IF NOT EXISTS backtest_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_date TEXT NOT NULL,           -- 分析日期
  ts_code TEXT NOT NULL,              -- 股票代码
  strategy_type TEXT NOT NULL,        -- 策略类型：short_term|mid_term|long_term
  decision TEXT NOT NULL,             -- buy/sell/hold
  entry_price_1 REAL,                 -- 第一建仓价
  entry_price_2 REAL,                 -- 第二建仓价
  stop_loss REAL,                     -- 止损价
  target_short REAL,                  -- 短线止盈
  target_mid REAL,                    -- 中线止盈
  target_long REAL,                   -- 长线止盈
  position_suggest REAL,              -- 建议仓位 (0.0-1.0)
  valid_until TEXT,                   -- 有效期
  seven_factor_score REAL,            -- 七因子评分
  technical_snapshot TEXT,            -- 技术面快照 (JSON)
  valuation_snapshot TEXT,            -- 估值快照 (JSON)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trade_date, ts_code, strategy_type)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_backtest_decisions_date ON backtest_decisions(trade_date);
CREATE INDEX IF NOT EXISTS idx_backtest_decisions_stock ON backtest_decisions(ts_code);
CREATE INDEX IF NOT EXISTS idx_backtest_decisions_strategy ON backtest_decisions(strategy_type);
```

---

## 5. API 设计

### 5.1 生成决策单 API

```javascript
// POST /api/backtest/decision/generate
{
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "stock_list": ["SH603501", "SZ300750"],
  "strategy_type": "short_term",
  "strategy_params": {
    "holding_period": "short",
    "position_limit": 10,
    "rebalance_frequency": "daily"
  }
}

// 返回
{
  "status": "success",
  "decisions": [
    {
      "trade_date": "2024-01-15",
      "ts_code": "SH603501",
      "decision": "buy",
      "entry_zone": [120.05, 112.39],
      "stop_loss": 115.00,
      "target_prices": {
        "short": 128.50,
        "mid": 135.00,
        "long": 145.00
      },
      "position_suggest": 0.30,
      "valid_until": "2024-01-16"
    }
  ],
  "cache_stats": {
    "preload_count": 2,
    "cache_hit_rate": 0.85
  }
}
```

### 5.2 回测运行 API（增强版）

```javascript
// POST /api/backtest/run/v2
{
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "strategy_type": "short_term",
  "use_decision_engine": true,  // 新增：是否使用决策引擎
  "strategy_params": {...},
  "selection_params": {...}
}

// 返回（原有回测结果 + 决策单统计）
{
  "status": "success",
  "metrics": {...},  // 原有绩效指标
  "decision_stats": {  // 新增：决策单统计
    "total_decisions": 2500,
    "buy_decisions": 450,
    "stop_loss_triggered": 32,
    "target_reached": 128,
    "cache_hit_rate": 0.85
  }
}
```

### 5.3 选股 API（增强版）

```javascript
// POST /api/select
{
  "selection_date": "2024-01-15",
  "industry_weights": {...},
  "min_seven_factor_score": 0.7,
  "max_stocks": 10,
  "include_decision": true  // 新增：是否附加决策单摘要
}

// 返回（原有选股结果 + 决策单摘要）
{
  "directions": [
    {
      "ts_code": "SH603501",
      "name": "韦尔股份",
      "score": 8.5,
      "industry": "半导体",
      "reason": "政策支持度高 + 资金流入",
      // 新增决策单摘要
      "entry_zone": [120.05, 112.39],
      "stop_loss": 115.00,
      "target_price": 128.50,
      "position_suggest": 0.30,
      "valid_until": "2024-01-16"
    }
  ]
}
```

---

## 6. 任务清单

### 阶段 1：决策引擎核心（P0）- 11 小时

| 任务 ID | 内容 | 预估工时 | 依赖 |
|--------|------|---------|------|
| TASK_DECISION_001 | 创建 `api/backtest-decision.js` 决策引擎类 | 2h | - |
| TASK_DECISION_002 | 实现价格批量预加载方法 | 1h | TASK_DECISION_001 |
| TASK_DECISION_003 | 实现 MA 实时计算方法 | 1h | TASK_DECISION_002 |
| TASK_DECISION_004 | 实现布林带实时计算方法 | 1h | TASK_DECISION_002 |
| TASK_DECISION_005 | 实现决策单生成逻辑 | 2h | TASK_DECISION_003/004 |
| TASK_DECISION_006 | 实现有效期计算方法 | 0.5h | TASK_DECISION_005 |
| TASK_DECISION_007 | 实现三层缓存机制 | 2h | TASK_DECISION_005 |
| TASK_DECISION_008 | 实现错误处理（三级策略） | 1.5h | TASK_DECISION_005 |

### 阶段 2：回测引擎集成（P0）- 10 小时

| 任务 ID | 内容 | 预估工时 | 依赖 |
|--------|------|---------|------|
| TASK_INTEGRATE_001 | 修改 `backtest-engine.js` 初始化决策引擎 | 1h | TASK_DECISION_008 |
| TASK_INTEGRATE_002 | 实现 `executeWithDecisions()` 方法 | 3h | TASK_DECISION_008 |
| TASK_INTEGRATE_003 | 实现止损触发逻辑 | 1.5h | TASK_INTEGRATE_002 |
| TASK_INTEGRATE_004 | 实现止盈触发逻辑 | 1.5h | TASK_INTEGRATE_002 |
| TASK_INTEGRATE_005 | 修改 `runBacktest()` 调用决策引擎 | 2h | TASK_INTEGRATE_002 |
| TASK_INTEGRATE_006 | 实现决策单与策略参数映射 | 1h | TASK_INTEGRATE_002 |

### 阶段 3：API 与前端（P1）- 12 小时

| 任务 ID | 内容 | 预估工时 | 依赖 |
|--------|------|---------|------|
| TASK_API_001 | 修改 `/api/backtest/run` 支持决策引擎配置 | 1h | TASK_INTEGRATE_006 |
| TASK_API_002 | 新增 `/api/backtest/decision/generate` API | 2h | TASK_DECISION_008 |
| TASK_API_003 | 修改 `/api/select` 附加决策单摘要 | 2h | TASK_DECISION_008 |
| TASK_API_004 | 新增 `/api/backtest/validate` 验证 API | 2h | TASK_INTEGRATE_005 |
| TASK_FRONTEND_001 | 回测结果页面展示决策单信息 | 3h | TASK_API_001 |
| TASK_FRONTEND_002 | 选股结果页面展示决策单摘要 | 2h | TASK_API_003 |

### 阶段 4：测试与验收（P1）- 11 小时

| 任务 ID | 内容 | 预估工时 | 依赖 |
|--------|------|---------|------|
| TASK_TEST_001 | 单元测试：决策引擎 | 2h | TASK_DECISION_008 |
| TASK_TEST_002 | 单元测试：回测引擎集成 | 2h | TASK_INTEGRATE_006 |
| TASK_TEST_003 | 集成测试：完整回测流程 | 3h | TASK_API_001 |
| TASK_TEST_004 | 性能测试：缓存命中率验证 | 1h | TASK_TEST_003 |
| TASK_TEST_005 | 验收测试：与原有回测对比 | 2h | TASK_TEST_003 |
| TASK_TEST_006 | 文档更新 | 1h | TASK_TEST_005 |

**总计**: 44 小时

---

## 7. 风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|---------|
| 技术指标计算性能不足 | 中 | 高 | 批量预加载 + 三层缓存 |
| 回测引擎重构引入 bug | 中 | 高 | 单元测试 + 与原有回测对比 |
| 数据缺失导致大量跳过 | 低 | 中 | 提前检查数据完整性 |
| 前端展示复杂度高 | 低 | 低 | 分阶段实现，先核心后增强 |

---

## 8. 验收标准

### 8.1 功能验收

- [ ] 决策引擎能正确生成建仓价、止损价、止盈价
- [ ] 回测引擎能使用决策单价格执行交易
- [ ] 止损/止盈触发逻辑正确
- [ ] 缓存命中率 > 80%
- [ ] 错误处理正确（数据缺失跳过，系统错误终止）

### 8.2 性能验收

- [ ] 单次决策计算时间 < 10ms
- [ ] 10 只股票 × 250 交易日回测耗时 < 5 分钟
- [ ] 内存占用 < 500MB

### 8.3 兼容性验收

- [ ] 原有回测 API 保持兼容
- [ ] 选股 API 增强后向后兼容
- [ ] 前端页面正常加载

---

**文档结束**
