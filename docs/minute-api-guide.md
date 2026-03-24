# 分钟线数据API使用指南

## 概述
分钟线数据API提供股票5分钟线数据的获取、查询和完整性检查功能。该系统使用BaoStock作为数据源，支持自动重试和限流控制。

## 系统架构

### 组件
1. **API接口** (`/api/minute/*`) - RESTful API端点
2. **数据获取脚本** (`scripts/fetch_minute_data.mjs`) - 核心数据获取逻辑
3. **数据库表** - 存储分钟线数据和任务状态
4. **监控日志** - 详细的执行日志

### 数据流程
```
用户请求 → API → 创建任务 → 异步执行脚本 → 获取数据 → 存储数据库 → 返回结果
```

## 数据库设计

### 主要表结构

#### 1. stock_minute (分钟线数据表)
| 字段 | 类型 | 说明 |
|------|------|------|
| ts_code | TEXT | 股票代码 (000001.SZ) |
| trade_date | TEXT | 交易日 (YYYYMMDD) |
| trade_time | TEXT | 交易时间 (HH:MM:SS) |
| open | REAL | 开盘价 |
| high | REAL | 最高价 |
| low | REAL | 最低价 |
| close | REAL | 收盘价 |
| vol | REAL | 成交量 (手) |
| amount | REAL | 成交额 (元) |

#### 2. minute_fetch_tasks (获取任务表)
| 字段 | 说明 |
|------|------|
| task_id | 任务唯一ID |
| ts_code | 股票代码 |
| status | 状态: pending/running/success/failed |
| processed_days | 已处理天数 |
| total_records | 总记录数 |

#### 3. stock_minute_stats (数据统计表)
| 字段 | 说明 |
|------|------|
| ts_code | 股票代码 |
| trade_date | 交易日 |
| total_records | 总记录数 |
| data_quality | 数据质量: complete/partial/missing |

## API接口

### 1. POST /api/minute/fetch - 触发数据获取

**请求体:**
```json
{
  "ts_code": "000001.SZ",
  "start_date": "2025-01-01",
  "end_date": "2025-01-10",
  "force_refresh": false
}
```

**参数说明:**
- `ts_code`: 必填，股票代码
- `start_date`: 可选，开始日期 (默认: 一年前)
- `end_date`: 可选，结束日期 (默认: 今天)
- `force_refresh`: 可选，强制重新获取 (默认: false)

**响应示例:**
```json
{
  "success": true,
  "message": "分钟线数据获取任务已开始",
  "task_id": "minute_1711245600000_abc123",
  "status": "running",
  "check_status_url": "/api/minute/status/minute_1711245600000_abc123/000001.SZ"
}
```

### 2. GET /api/minute/status/:taskId/:tsCode - 查询任务状态

**URL参数:**
- `taskId`: 任务ID
- `tsCode`: 股票代码

**响应示例:**
```json
{
  "success": true,
  "task": {
    "task_id": "minute_1711245600000_abc123",
    "status": "success",
    "progress": "100%",
    "processed_days": 10,
    "total_records": 480,
    "duration_seconds": 45
  },
  "stats": {
    "sample_dates": 10,
    "total_records": 480,
    "complete_dates": 10,
    "coverage": "100%"
  }
}
```

### 3. GET /api/minute/data - 查询分钟线数据

**查询参数:**
- `ts_code`: 必填，股票代码
- `trade_date`: 可选，交易日 (YYYYMMDD格式)
- `start_time`: 可选，开始时间 (HH:MM:SS)
- `end_time`: 可选，结束时间 (HH:MM:SS)
- `limit`: 可选，返回条数 (默认: 100)
- `page`: 可选，页码 (默认: 1)

**响应示例:**
```json
{
  "success": true,
  "data": [
    {
      "trade_date": "20250102",
      "trade_time": "09:35:00",
      "open": 10.52,
      "high": 10.65,
      "low": 10.50,
      "close": 10.60,
      "vol": 15234.0,
      "amount": 161480.4
    }
  ],
  "pagination": {
    "total": 480,
    "page": 1,
    "limit": 100,
    "pages": 5
  },
  "stats": {
    "ts_code": "000001.SZ",
    "earliest_date": "20250101",
    "latest_date": "20250110",
    "total_days": 10,
    "total_records": 480
  }
}
```

### 4. GET /api/minute/integrity/:tsCode - 检查数据完整性

**URL参数:**
- `tsCode`: 股票代码

**查询参数:**
- `start_date`: 可选，开始日期
- `end_date`: 可选，结束日期

**响应示例:**
```json
{
  "success": true,
  "summary": {
    "total_dates": 10,
    "complete_dates": 9,
    "partial_dates": 1,
    "missing_dates": 0,
    "completeness_rate": "90%",
    "data_quality": "good"
  },
  "recommendations": [
    {
      "priority": "low",
      "action": "verify_complete",
      "message": "数据完整性良好，但仍有少量缺失",
      "command": "可选择性补全缺失数据"
    }
  ]
}
```

### 5. GET /api/minute/tasks - 获取任务列表

**查询参数:**
- `status`: 可选，筛选状态
- `ts_code`: 可选，筛选股票代码
- `limit`: 可选，返回条数 (默认: 20)
- `page`: 可选，页码 (默认: 1)

**响应示例:**
```json
{
  "success": true,
  "tasks": [
    {
      "task_id": "minute_1711245600000_abc123",
      "ts_code": "000001.SZ",
      "status": "success",
      "created_at": "2026-03-24T10:00:00Z"
    }
  ],
  "stats": {
    "by_status": {
      "success": 5,
      "failed": 1,
      "running": 2
    },
    "total_tasks": 8
  }
}
```

## 命令行工具

### 脚本位置
`scripts/fetch_minute_data.mjs`

### 基本用法

```bash
# 查看帮助
node scripts/fetch_minute_data.mjs help

# 获取单个股票数据
node scripts/fetch_minute_data.mjs fetch 000001.SZ

# 获取指定日期范围数据
node scripts/fetch_minute_data.mjs fetch 000001.SZ 2025-01-01 2025-01-10 --force

# 批量获取数据
node scripts/fetch_minute_data.mjs batch "000001.SZ,000002.SZ,000858.SZ"

# 检查数据完整性
node scripts/fetch_minute_data.mjs integrity 000001.SZ 2025-01-01 2025-01-10

# 查询任务状态
node scripts/fetch_minute_data.mjs status <task_id> <ts_code>
```

### 参数说明
- `--force`: 强制重新获取数据（忽略已存在的数据）
- 日期格式: `YYYY-MM-DD`

## 配置参数

### 环境变量 (.env)
```bash
# BaoStock配置
BAOSTOCK_HOST=baostock.com
BAOSTOCK_PORT=8000

# 数据范围
DATA_RANGE_DAYS=250
FREQUENCY=5  # 5分钟线

# 限流配置
RATE_LIMIT_REQUESTS_PER_MINUTE=30
RATE_LIMIT_DELAY_MS=2000

# 重试配置
MAX_RETRIES=3
RETRY_DELAY_MS=3000

# 日志配置
LOG_LEVEL=info  # debug/info/warn/error

# 数据库
DB_PATH=./stock_system.db
```

### 默认配置
| 参数 | 默认值 | 说明 |
|------|--------|------|
| 数据范围 | 250天 | 近1年交易日 |
| 数据粒度 | 5分钟 | 5分钟K线 |
| 限流 | 30次/分钟 | 避免API限制 |
| 重试 | 3次 | 网络错误时重试 |

## 错误处理

### 常见错误码

| 状态码 | 说明 | 处理建议 |
|--------|------|----------|
| 400 | 参数错误 | 检查请求参数格式 |
| 404 | 资源不存在 | 检查股票代码或任务ID |
| 429 | 请求过多 | 等待后重试 |
| 500 | 服务器错误 | 查看服务器日志 |

### 错误响应格式
```json
{
  "success": false,
  "error": "错误描述",
  "details": "详细错误信息（开发环境）"
}
```

## 数据完整性

### 质量标准
| 等级 | 完整度 | 说明 |
|------|--------|------|
| 优秀 | ≥90% | 数据基本完整 |
| 良好 | 70%-89% | 少量缺失 |
| 一般 | 50%-69% | 部分缺失 |
| 差 | <50% | 严重缺失 |

### 完整性检查
系统自动检查以下指标：
1. 日期连续性
2. 每日记录数（应为48条）
3. 数据缺失模式
4. 数据质量趋势

## 性能指标

### 预估存储成本
| 项目 | 数值 |
|------|------|
| 单条记录大小 | ~250字节 |
| 单日单股记录数 | 48条 |
| 250天单股总记录 | 12,000条 |
| 10只股票总记录 | 120,000条 |
| 总存储空间 | ~30MB |

### 处理时间预估
| 操作 | 时间 |
|------|------|
| 单日数据获取 | ~2秒 |
| 250天数据获取 | ~8分钟 |
| 10只股票批量获取 | ~80分钟 |

## 最佳实践

### 1. 数据获取
```bash
# 建议：分批获取，避免超时
node scripts/fetch_minute_data.mjs fetch 000001.SZ 2025-01-01 2025-03-01
node scripts/fetch_minute_data.mjs fetch 000001.SZ 2025-03-02 2025-06-01
```

### 2. 监控建议
1. 定期检查数据完整性
2. 监控任务失败率
3. 关注存储空间使用

### 3. 故障排除
```bash
# 查看日志
tail -f logs/minute_fetch_*.log

# 检查数据库
sqlite3 stock_system.db "SELECT COUNT(*) FROM stock_minute;"
sqlite3 stock_system.db "SELECT status, COUNT(*) FROM minute_fetch_tasks GROUP BY status;"
```

## 集成示例

### 1. 前端集成
```javascript
// 触发数据获取
async function fetchMinuteData(stockCode) {
  const response = await fetch('/api/minute/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ts_code: stockCode })
  });
  return await response.json();
}

// 查询数据
async function getMinuteData(stockCode, date) {
  const response = await fetch(
    `/api/minute/data?ts_code=${stockCode}&trade_date=${date}&limit=100`
  );
  return await response.json();
}
```

### 2. 定时任务集成
```bash
# 每天凌晨获取数据
0 2 * * * cd /path/to/stock-system && node scripts/fetch_minute_data.mjs batch "000001.SZ,000002.SZ"
```

## 限制与约束

### 1. 数据源限制
- BaoStock API可能有请求频率限制
- 历史数据可能不完整
- 需要网络连接

### 2. 系统限制
- 单次获取最大250天数据
- 并发任务数有限制
- 存储空间有限

### 3. 时间限制
- 数据获取可能较慢
- 建议非交易时间执行
- 注意API维护时间

## 更新日志

### v1.0.0 (2026-03-24)
- 初始版本发布
- 支持分钟线数据获取
- 提供完整API接口
- 包含数据完整性检查

## 支持与反馈

### 问题报告
1. 查看服务器日志
2. 检查数据库状态
3. 提供重现步骤

### 联系方式
- 系统管理员
- 技术支持
- 错误报告

---

**最后更新**: 2026-03-24  
**版本**: 1.0.0  
**作者**: A股投资系统开发团队