# API 参考文档

## 基础信息

- 基础URL：`http://127.0.0.1:3000`
- 响应格式：JSON
- 成功响应：`{ success: true, data: ... }`
- 错误响应：`{ success: false, error: '错误信息' }`

---

## 账户管理 API

### 创建账户

```http
POST /api/portfolio/account
```

**请求参数：**
```json
{
  "account_name": "测试账户",
  "initial_cash": 1000000
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "account_name": "测试账户",
    "initial_cash": 1000000,
    "current_cash": 1000000,
    "total_value": 1000000,
    "total_return": 0,
    "return_rate": 0,
    "created_at": "2026-03-18 09:25:19",
    "updated_at": "2026-03-18 09:25:19"
  }
}
```

### 获取账户列表

```http
GET /api/portfolio/account
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "account_name": "测试账户",
      "initial_cash": 1000000,
      "current_cash": 1000000,
      "total_value": 1000000,
      "total_return": 0,
      "return_rate": 0,
      "created_at": "2026-03-18 09:25:19",
      "updated_at": "2026-03-18 09:25:19"
    }
  ]
}
```

### 获取账户持仓

```http
GET /api/portfolio/account/:id/positions
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "account_id": 1,
      "ts_code": "300308.SZ",
      "stock_name": "中际旭创",
      "quantity": 100,
      "avg_price": 580,
      "cost_amount": 58000,
      "current_price": 580,
      "market_value": 58000,
      "unrealized_pnl": 0,
      "unrealized_pnl_rate": 0
    }
  ]
}
```

### 获取交易记录

```http
GET /api/portfolio/account/:id/trades
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "account_id": 1,
      "ts_code": "300308.SZ",
      "stock_name": "中际旭创",
      "action": "buy",
      "quantity": 100,
      "price": 580,
      "amount": 58000,
      "trade_date": "2026-03-18 07:45:46",
      "order_type": "conditional",
      "conditional_order_id": 1,
      "remark": "条件单触发"
    }
  ]
}
```

---

## 条件单 API

### 创建条件单

```http
POST /api/conditional-order
```

**请求参数：**
```json
{
  "account_id": 1,
  "ts_code": "300308.SZ",
  "stock_name": "中际旭创",
  "action": "buy",
  "order_type": "price",
  "amount": 100000,
  "conditions": [
    { "type": "price", "operator": "<=", "value": 600 }
  ],
  "condition_logic": "AND",
  "start_date": "2026-03-18",
  "end_date": "2026-06-18",
  "max_trigger_count": 1
}
```

**条件类型说明：**

| 类型 | 参数 | 说明 |
|------|------|------|
| price | operator, value | 价格条件：>= 或 <= 目标价 |
| pct_change | operator, value | 涨跌幅条件 |
| volume_ratio | operator, value | 量比条件 |
| rsi | operator, value | RSI指标条件 |
| macd_cross | value | MACD金叉/死叉：golden/dead |
| pe_percentile | operator, value | PE分位数条件 |
| main_force_net | operator, value | 主力净流入条件 |

### 获取条件单列表

```http
GET /api/conditional-order?account_id=1&status=pending
```

**查询参数：**
- `account_id` - 账户ID
- `status` - 状态筛选：pending/active/triggered/expired/cancelled

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "account_id": 1,
      "ts_code": "300308.SZ",
      "stock_name": "中际旭创",
      "action": "buy",
      "order_type": "price",
      "conditions": [{ "type": "price", "operator": "<=", "value": 600 }],
      "condition_logic": "AND",
      "status": "pending",
      "trigger_count": 0,
      "max_trigger_count": 1,
      "created_at": "2026-03-18 09:25:19"
    }
  ]
}
```

### 取消条件单

```http
POST /api/conditional-order/:id/cancel
```

---

## 监控池 API

### 获取监控列表

```http
GET /api/monitor/list
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "ts_code": "300308.SZ",
      "stock_name": "中际旭创",
      "current_price": 580,
      "pct_change": 6.81,
      "monitor_reason": "技术分析",
      "added_at": "2026-03-18 09:25:19"
    }
  ]
}
```

---

## 回测 API

### 运行回测

```http
POST /api/backtest/run
```

**请求参数：**
```json
{
  "account_id": 1,
  "ts_code": "300308.SZ",
  "stock_name": "中际旭创",
  "start_date": "2025-01-01",
  "end_date": "2025-12-31",
  "initial_cash": 1000000,
  "strategy": {
    "buy_conditions": [
      { "type": "price", "operator": "<=", "value": 500 }
    ],
    "sell_conditions": [
      { "type": "price", "operator": ">=", "value": 600 }
    ]
  }
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "account_id": 1,
    "ts_code": "300308.SZ",
    "start_date": "2025-01-01",
    "end_date": "2025-12-31",
    "initial_cash": 1000000,
    "final_value": 1200000,
    "total_return": 200000,
    "return_rate": 0.20,
    "max_drawdown": 0.15,
    "sharpe_ratio": 1.5,
    "win_rate": 0.65,
    "trade_count": 10,
    "created_at": "2026-03-18 09:25:19"
  }
}
```

### 获取回测历史

```http
GET /api/backtest/history?account_id=1
```

---

## 选股分析 API

### 运行选股筛选

```http
POST /api/select
```

**请求参数：**
```json
{
  "filters": {
    "pe": { "min": 0, "max": 30 },
    "pb": { "min": 0, "max": 3 },
    "roe": { "min": 10 }
  },
  "sort_by": "pe",
  "limit": 20
}
```

---

## 个股分析 API (双实现)

> **说明**：系统提供两种个股分析实现，按需选用：
> - **Node.js 版** (`/api/analyze/report`): 返回 JSON，用于前端实时渲染（个股分析页面）
> - **Python 版** (`/api/analysis/report`): 生成 HTML 报告，用于深度分析报告下载

### 按行业方向筛选股票

```http
POST /api/analyze
```

**职责**：根据选中的行业方向，筛选出待分析的股票列表

**请求参数：**
```json
{
  "directions": ["储能", "人工智能"]
}
```

**响应：**
```json
{
  "success": true,
  "stocks": [
    {
      "code": "300750.SZ",
      "name": "宁德时代",
      "industry": "电气设备",
      "total_mv": 18848.78,
      "turnover_rate": 1.26,
      "volume_ratio": 1.63,
      "pe_ttm": 26.11
    }
  ]
}
```

### 生成个股分析报告 (Node.js 版)

```http
POST /api/analyze/report
```

**职责**：Node.js 原生分析，返回摘要信息，用于前端实时渲染

**请求参数：**
```json
{
  "stock_code": "300750.SZ",
  "stock_name": "宁德时代"
}
```

**响应：**
```json
{
  "success": true,
  "report_path": "report/analysis/300750.SZ_2026-03-22.json",
  "stock": {
    "code": "300750.SZ",
    "name": "宁德时代",
    "score": 75
  }
}
```

**说明**：此接口返回报告路径和股票摘要，前端通过报告路径加载完整 JSON 报告

### 生成个股分析报告 (Python 版)

```http
POST /api/analysis/report
```

**职责**：调用 Python 脚本生成深度 HTML 分析报告

**请求参数：**
```json
{
  "stock_code": "300750.SZ",
  "stock_name": "宁德时代"
}
```

**响应：**
```json
{
  "success": true,
  "html": "<html>...</html>",
  "report_path": "report/analysis/300750.SZ_2026-03-22.html"
}
```

**说明**：此接口返回 HTML 报告内容，用于下载或查看深度分析报告
