# 独立模拟账户设计方案（v1.1）

**日期**: 2026-04-01  
**版本**: v1.1（按 2026-04-01 评审结论修订）  
**优先级**: P1  
**预计工时**: 22h  
**适用范围**: `iteration-manager → mock-account → mock-performance → 二次迭代`

---

## 1. 核心目标

创建独立的模拟账户系统，与实盘完全隔离，用于：
1. 验证策略实际表现（回测 vs 模拟）
2. 计算绩效偏差
3. 人工触发二次迭代（系统只告警，不自动创建任务）

### 1.1 关键口径（强约束）

1. 实盘验证统一使用**实时数据日**（Tushare 最近有效交易日），不使用快照日作为绩效周期口径。
2. 偏差判定采用多指标门控，不再仅看总收益率。
3. 二次迭代触发改为**手动执行**（审批后触发）。

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     策略版本发布                                 │
│                  (iteration-manager)                             │
│                  - 发布策略版本                                  │
│                  - 创建模拟账户                                  │
│                  - 关联 strategy_version_id                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     监控池条件单触发                             │
│                  (monitor-pool + conditional-order)              │
│                  - 条件单触发                                    │
│                  - 同时执行：                                  │
│                    a) 实盘条件单（原有逻辑）                     │
│                    b) 模拟交易（新逻辑）                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     模拟交易引擎                                 │
│                  (api/mock-trade.js)                             │
│                  - 获取实时行情                                  │
│                  - 应用滑点假设 (0.1%)                           │
│                  - 计算 simulated_price                          │
│                  - 写入 mock_trade + 更新 mock_position          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     绩效计算（每日）                             │
│                  (scripts/calculate_mock_performance.mjs)        │
│                  - 聚合 mock_trade 数据                          │
│                  - 计算总收益、年化、回撤、夏普等               │
│                  - 对比回测绩效，计算偏差                        │
│                  - 写入 mock_performance                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     偏差检测 + 人工二次迭代                      │
│                  (api/iteration-manager.js)                      │
│                  - 多指标偏差检查（收益/回撤/胜率/样本）         │
│                  - 生成告警与待办（不自动创建任务）               │
│                  - 人工确认后触发二次迭代                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据库设计

### 3.1 mock_account - 模拟账户表

```sql
CREATE TABLE mock_account (
    account_id TEXT PRIMARY KEY,           -- 账户 ID (UUID)
    strategy_version_id TEXT NOT NULL,     -- 关联策略版本
    strategy_type TEXT,                    -- 策略类型 (seven_factor/double_ma/...)
    account_name TEXT,                     -- 账户名称 (用户自定义)
    initial_capital REAL NOT NULL,         -- 初始资金
    current_capital REAL NOT NULL,         -- 当前资金
    available_capital REAL NOT NULL,       -- 可用资金
    status TEXT DEFAULT 'active',          -- active/stopped/closed
    created_at TEXT NOT NULL,
    started_at TEXT,                       -- 开始模拟时间
    stopped_at TEXT,                       -- 停止模拟时间
    FOREIGN KEY (strategy_version_id) REFERENCES strategy_versions(version_id)
);

CREATE INDEX idx_mock_account_strategy ON mock_account(strategy_version_id);
CREATE INDEX idx_mock_account_status ON mock_account(status);
```

### 3.2 mock_position - 模拟持仓表

```sql
CREATE TABLE mock_position (
    position_id TEXT PRIMARY KEY,          -- 持仓 ID (UUID)
    account_id TEXT NOT NULL,
    ts_code TEXT NOT NULL,                 -- 股票代码
    quantity INTEGER NOT NULL,             -- 持仓数量
    avg_cost REAL NOT NULL,                -- 平均成本
    current_price REAL,                    -- 当前价格（每日更新）
    market_value REAL,                     -- 市值
    unrealized_pnl REAL,                   -- 浮动盈亏
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (account_id) REFERENCES mock_account(account_id)
);

CREATE INDEX idx_mock_position_account ON mock_position(account_id);
CREATE INDEX idx_mock_position_ts_code ON mock_position(ts_code);
```

### 3.3 mock_trade - 模拟交易表

```sql
CREATE TABLE mock_trade (
    trade_id TEXT PRIMARY KEY,             -- 交易 ID (UUID)
    account_id TEXT NOT NULL,
    ts_code TEXT NOT NULL,
    action TEXT NOT NULL,                  -- BUY/SELL
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,                   -- 实际成交价（行情价）
    simulated_price REAL NOT NULL,         -- 考虑滑点后的价格
    slippage_rate REAL DEFAULT 0.001,      -- 滑点比例 (默认 0.1%)
    commission REAL DEFAULT 0.0,           -- 佣金
    stamp_duty REAL DEFAULT 0.0,           -- 印花税
    pnl REAL,                              -- 盈亏 (SELL 时计算)
    trade_type TEXT DEFAULT 'simulation',  -- simulation/real
    trigger_source TEXT,                   -- conditional_order/rebalance/manual
    strategy_version_id TEXT,              -- 关联策略版本
    data_date TEXT NOT NULL,               -- 实时数据日（YYYYMMDD）
    execution_status TEXT NOT NULL DEFAULT 'FILLED', -- FILLED/REJECTED/SKIPPED
    reject_reason TEXT,                    -- 拒单原因（涨跌停/停牌/流动性不足）
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES mock_account(account_id),
    FOREIGN KEY (strategy_version_id) REFERENCES strategy_versions(version_id)
);

CREATE INDEX idx_mock_trade_account ON mock_trade(account_id);
CREATE INDEX idx_mock_trade_ts_code ON mock_trade(ts_code);
CREATE INDEX idx_mock_trade_occurred_at ON mock_trade(occurred_at);
CREATE INDEX idx_mock_trade_data_date ON mock_trade(data_date);
```

### 3.4 mock_performance - 模拟绩效表

```sql
CREATE TABLE mock_performance (
    performance_id TEXT PRIMARY KEY,       -- 绩效 ID (UUID)
    account_id TEXT NOT NULL,
    strategy_version_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    
    -- 收益指标
    total_return REAL,                     -- 总收益率
    annualized_return REAL,                -- 年化收益率
    excess_return REAL,                    -- 超额收益 (vs 基准)
    
    -- 风险指标
    max_drawdown REAL,                     -- 最大回撤
    volatility REAL,                       -- 波动率
    var_95 REAL,                           -- VaR 95%
    
    -- 风险调整收益
    sharpe_ratio REAL,                     -- 夏普比率
    sortino_ratio REAL,                    -- 索提诺比率
    calmar_ratio REAL,                     -- 卡玛比率
    
    -- 交易统计
    trade_count INTEGER,                   -- 交易次数
    win_count INTEGER,                     -- 盈利次数
    loss_count INTEGER,                    -- 亏损次数
    win_rate REAL,                         -- 胜率
    avg_win REAL,                          -- 平均盈利
    avg_loss REAL,                         -- 平均亏损
    profit_loss_ratio REAL,                -- 盈亏比
    avg_holding_period REAL,               -- 平均持仓周期 (天)
    turnover_rate REAL,                    -- 换手率
    
    -- 滑点与成本
    avg_slippage REAL,                     -- 平均滑点
    total_commission REAL,                 -- 总佣金
    total_stamp_duty REAL,                 -- 总印花税
    
    -- 偏差分析（多指标）
    backtest_total_return REAL,            -- 回测总收益 (同期)
    backtest_deviation REAL,               -- 与回测的偏差 (%)
    backtest_max_drawdown REAL,            -- 回测最大回撤（同期）
    drawdown_deviation REAL,               -- 回撤偏差
    backtest_win_rate REAL,                -- 回测胜率（同期）
    win_rate_deviation REAL,               -- 胜率偏差
    deviation_threshold REAL DEFAULT 0.20, -- 偏差阈值 (默认 20%)
    is_deviation_exceeded INTEGER DEFAULT 0, -- 是否超阈值 (0/1)
    sample_trade_threshold INTEGER DEFAULT 20, -- 最小样本交易数
    is_sample_valid INTEGER DEFAULT 0,     -- 样本是否有效（0/1）
    
    -- 元数据
    created_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES mock_account(account_id),
    FOREIGN KEY (strategy_version_id) REFERENCES strategy_versions(version_id)
);

CREATE INDEX idx_mock_performance_account ON mock_performance(account_id);
CREATE INDEX idx_mock_performance_period ON mock_performance(period_start, period_end);
CREATE INDEX idx_mock_performance_deviation ON mock_performance(is_deviation_exceeded);
```

### 3.5 mock_trade_cost_config - 交易成本参数表

```sql
CREATE TABLE mock_trade_cost_config (
    config_id TEXT PRIMARY KEY,
    market TEXT NOT NULL,                  -- A_SHARE
    commission_rate REAL NOT NULL,         -- 佣金费率
    min_commission REAL NOT NULL,          -- 最低佣金
    stamp_duty_rate REAL NOT NULL,         -- 印花税（仅卖出）
    slippage_rate_default REAL NOT NULL,   -- 默认滑点
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

---

## 4. API 设计

### 4.1 模拟账户管理

**POST /api/mock/account/create**
```javascript
// 请求
{
  "strategy_version_id": "v_xxx",
  "account_name": "七因子策略 v1.2 模拟",
  "initial_capital": 1000000
}

// 响应
{
  "success": true,
  "account_id": "mock_xxx",
  "message": "模拟账户创建成功"
}
```

**GET /api/mock/account/list**
```javascript
// 请求
{
  "status": "active"  // 可选：active/stopped/closed
}

// 响应
{
  "success": true,
  "accounts": [
    {
      "account_id": "mock_xxx",
      "strategy_version_id": "v_xxx",
      "strategy_type": "seven_factor",
      "account_name": "七因子策略 v1.2 模拟",
      "initial_capital": 1000000,
      "current_capital": 1163123,
      "total_return": 0.1631,
      "status": "active",
      "created_at": "2026-04-01",
      "days_running": 15
    }
  ]
}
```

**POST /api/mock/account/stop**
```javascript
// 请求
{
  "account_id": "mock_xxx",
  "reason": "偏差超标"  // 可选
}
```

### 4.2 模拟交易

**POST /api/mock/trade/execute**
```javascript
// 请求
{
  "account_id": "mock_xxx",
  "ts_code": "003002.SZ",
  "action": "BUY",
  "quantity": 1000,
  "price": 52.30,           // 实时行情价
  "slippage_rate": 0.001,   // 滑点 0.1%
  "trigger_source": "conditional_order",
  "strategy_version_id": "v_xxx"
}

// 响应
{
  "success": true,
  "trade_id": "trade_xxx",
  "simulated_price": 52.35,  // 52.30 × 1.001
  "commission": 5.23,
  "stamp_duty": 0.0,
  "message": "模拟买入成功"
}
```

**GET /api/mock/trade/list**
```javascript
// 请求
{
  "account_id": "mock_xxx",
  "ts_code": "003002.SZ",  // 可选
  "start_date": "2026-04-01",
  "end_date": "2026-04-15"
}
```

### 4.3 模拟绩效

**GET /api/mock/performance/current**
```javascript
// 请求
{
  "account_id": "mock_xxx"
}

// 响应
{
  "success": true,
  "performance": {
    "period_start": "2026-04-01",
    "period_end": "2026-04-15",
    "total_return": 0.1631,
    "annualized_return": 0.4235,
    "max_drawdown": -0.0756,
    "sharpe_ratio": 2.26,
    "trade_count": 23,
    "win_rate": 0.65,
    "backtest_total_return": 0.1842,
    "backtest_deviation": -0.0211,  // -2.11%
    "is_deviation_exceeded": 0
  }
}
```

**GET /api/mock/performance/deviation**
```javascript
// 请求
{
  "threshold": 0.20  // 查询偏差>20% 的账户
}

// 响应
{
  "success": true,
  "exceeded_accounts": [
    {
      "account_id": "mock_xxx",
      "strategy_version_id": "v_xxx",
      "backtest_deviation": 0.253,  // 25.3%
      "period_end": "2026-04-15"
    }
  ]
}
```

### 4.4 二次迭代触发

**POST /api/iteration/trigger-by-deviation**
```javascript
// 请求
{
  "account_id": "mock_xxx",
  "reason": "backtest_deviation_exceeded_manual",
  "deviation": 0.253
}

// 响应
{
  "success": true,
  "task_id": "TASK_MANUAL_001",
  "message": "二次迭代任务已手动创建"
}
```

### 4.5 偏差告警（不自动触发迭代）

**GET /api/mock/performance/alerts**
```javascript
// 响应
{
  "success": true,
  "alerts": [
    {
      "account_id": "mock_xxx",
      "strategy_version_id": "v_xxx",
      "is_sample_valid": 1,
      "backtest_deviation": 0.253,
      "drawdown_deviation": 0.081,
      "win_rate_deviation": -0.12,
      "suggestion": "需要人工确认是否触发二次迭代"
    }
  ]
}
```

---

## 5. 核心算法

### 5.1 模拟成交价计算

```javascript
function calculateSimulatedPrice(action, marketPrice, slippageRate = 0.001) {
  if (action === 'BUY') {
    // 买入：价格上浮
    return marketPrice * (1 + slippageRate);
  } else {
    // 卖出：价格下浮
    return marketPrice * (1 - slippageRate);
  }
}
```

### 5.1.1 成交可行性检查（新增）

```javascript
function validateExecutable(order, marketState) {
  if (marketState.suspended) return { executable: false, reason: 'SUSPENDED' };
  if (order.action === 'BUY' && marketState.limitUp) return { executable: false, reason: 'LIMIT_UP' };
  if (order.action === 'SELL' && marketState.limitDown) return { executable: false, reason: 'LIMIT_DOWN' };
  if (marketState.liquidityScore < 0.2) return { executable: false, reason: 'LOW_LIQUIDITY' };
  return { executable: true, reason: null };
}
```

### 5.2 交易成本计算

```javascript
function calculateTransactionCost(action, quantity, price, costConfig) {
  const amount = quantity * price;

  const commission = Math.max(amount * costConfig.commission_rate, costConfig.min_commission);
  const stampDuty = (action === 'SELL') ? amount * costConfig.stamp_duty_rate : 0;
  
  return { commission, stampDuty, total: commission + stampDuty };
}
```

### 5.3 绩效指标计算

```javascript
function calculatePerformance(trades, dailyValues) {
  // 总收益率
  const totalReturn = (dailyValues[dailyValues.length - 1] - dailyValues[0]) / dailyValues[0];
  
  // 年化收益率 (假设 252 个交易日)
  const days = dailyValues.length;
  const annualizedReturn = Math.pow(1 + totalReturn, 252 / days) - 1;
  
  // 最大回撤
  let maxDrawdown = 0;
  let peak = dailyValues[0];
  for (const value of dailyValues) {
    if (value > peak) peak = value;
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // 夏普比率 (假设无风险利率 3%)
  const dailyReturns = dailyValues.slice(1).map((v, i) => (v - dailyValues[i]) / dailyValues[i]);
  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const stdReturn = Math.sqrt(dailyReturns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / dailyReturns.length);
  const sharpeRatio = (avgReturn * 252 - 0.03) / (stdReturn * Math.sqrt(252));
  
  // 胜率
  const wins = trades.filter(t => t.pnl > 0).length;
  const winRate = wins / trades.length;
  
  // 盈亏比
  const avgWin = trades.filter(t => t.pnl > 0).reduce((a, b) => a + b.pnl, 0) / wins;
  const losses = trades.filter(t => t.pnl <= 0).length;
  const avgLoss = Math.abs(trades.filter(t => t.pnl <= 0).reduce((a, b) => a + b.pnl, 0) / losses);
  const profitLossRatio = avgWin / avgLoss;
  
  return {
    totalReturn,
    annualizedReturn,
    maxDrawdown,
    sharpeRatio,
    winRate,
    profitLossRatio
  };
}
```

### 5.4 偏差计算与阈值检测

```javascript
function calculateDeviation(mockPerformance, backtestPerformance, thresholds) {
  const deviation = mockPerformance.total_return - backtestPerformance.total_return;
  const absDeviation = Math.abs(deviation);
  const drawdownDeviation = mockPerformance.max_drawdown - backtestPerformance.max_drawdown;
  const winRateDeviation = mockPerformance.win_rate - backtestPerformance.win_rate;
  const sampleValid = mockPerformance.trade_count >= thresholds.minTradeCount;
  const isExceeded = sampleValid && (
    absDeviation > thresholds.returnDeviation ||
    Math.abs(drawdownDeviation) > thresholds.drawdownDeviation ||
    Math.abs(winRateDeviation) > thresholds.winRateDeviation
  );
  
  return {
    deviation,
    absDeviation,
    isExceeded,
    backtest_return: backtestPerformance.total_return,
    mock_return: mockPerformance.total_return,
    drawdownDeviation,
    winRateDeviation,
    sampleValid
  };
}
```

---

## 6. 前端设计

### 6.1 模拟账户面板 (mock-account.html)

**页面结构**:
```
┌─────────────────────────────────────────────────────────────┐
│  模拟账户列表                                                │
│  ┌─────────┬──────────┬─────────┬─────────┬────────────┐   │
│  │ 账户名  │ 策略版本 │ 总收益  │ 偏差    │ 状态       │   │
│  ├─────────┼──────────┼─────────┼─────────┼────────────┤   │
│  │ 七因子  │ v1.2     │ +16.3%  │ -2.1%   │ ✅ 正常    │   │
│  │ 双均线  │ v0.8     │ +8.5%   │ +25.3%  │ ⚠️ 偏差超标│   │
│  └─────────┴──────────┴─────────┴─────────┴────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  账户详情 (点击展开)                                         │
│  - 资金曲线图                                                │
│  - 持仓列表                                                  │
│  - 交易记录                                                  │
│  - 绩效指标 vs 回测对比                                      │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 与 iteration-manager 集成

在版本历史页面增加"模拟验证"标签页：
```
版本历史 | 回测结果 | 模拟验证 | 执行反馈
────────────────────────────────────────
模拟账户：七因子 v1.2 模拟
运行天数：15 天
模拟收益：+16.3%
回测收益：+18.4%
偏    差：-2.1% ✅ 正常 (<20%)

[查看模拟账户详情] [停止模拟]
```

---

## 7. 任务分解

| 任务 ID | 任务名称 | 优先级 | 工时 | 交付物 |
|---------|----------|--------|------|--------|
| **TASK_MOCK_001** | 数据库迁移：4 张模拟表 | P0 | 2h | 016_create_mock_tables.sql |
| **TASK_MOCK_002** | 模拟交易引擎 API | P0 | 4h | api/mock-trade.js |
| **TASK_MOCK_003** | 绩效计算脚本（实时数据日口径） | P0 | 4h | scripts/calculate_mock_performance.ts |
| **TASK_MOCK_004** | 偏差检测 + 告警（人工触发） | P1 | 3h | api/iteration-manager.js 扩展 |
| **TASK_MOCK_005** | 模拟账户管理 API | P1 | 3h | api/mock-account.js |
| **TASK_MOCK_006** | 前端页面：mock-account.html | P1 | 4h | mock-account.html |
| **TASK_MOCK_007** | 成交可行性约束（拒单原因） | P0 | 3h | api/mock-trade.js |
| **TASK_MOCK_008** | 交易成本配置化 | P1 | 2h | mock_trade_cost_config + API |

**总计**: 22 小时

---

## 8. 实施计划

### Phase 1: 核心功能 (P0, 12h)
1. TASK_MOCK_001: 数据库迁移
2. TASK_MOCK_002: 模拟交易引擎
3. TASK_MOCK_003: 绩效计算（实时数据日口径）
4. TASK_MOCK_007: 成交可行性约束

### Phase 2: 闭环功能 (P1, 10h)
5. TASK_MOCK_004: 偏差检测 + 告警（人工触发）
6. TASK_MOCK_005: 账户管理 API
7. TASK_MOCK_006: 前端页面
8. TASK_MOCK_008: 交易成本配置化

---

## 9. 验收标准

- [ ] 创建模拟账户成功，关联策略版本
- [ ] 条件单触发时，模拟交易正确执行
- [ ] 模拟成交价考虑滑点 (0.1%)
- [ ] 交易不可执行场景能拒单并记录原因（涨跌停/停牌/流动性不足）
- [ ] 每日绩效计算正确（按实时数据日）
- [ ] 偏差检测满足多指标与样本门槛
- [ ] 偏差超阈值仅生成告警，二次迭代需人工触发
- [ ] 前端页面展示模拟账户列表和详情
- [ ] 版本历史页面展示模拟验证结果

---

**创建时间**: 2026-04-01  
**创建者**: 灵爪
