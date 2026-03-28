# TASK_V3_006 - 选股→分钟线获取触发

**版本**: V3.0  
**优先级**: P0  
**状态**: pending  
**创建日期**: 2026-03-24  
**预计工期**: 1 天  

---

## 📋 任务描述

实现选股完成后自动触发分钟线数据获取流程（按设计共识 11.9 数据策略）。

---

## 🎯 目标

1. 选股完成后自动触发分钟线获取
2. 仅对 Top10 核心股票池获取分钟线
3. 数据写入 stock_minute 表
4. 验证数据完整性

---

## 📐 技术规范

### 触发流程
```
【触发条件】选股完成 → Top10 核心股票池确定

【获取步骤】
  1. 从 Top10 列表读取股票代码
  2. 调用 BaoStock API 获取分钟线数据
     └─ 数据范围：近 1 年（250 交易日）
     └─ 数据粒度：5 分钟线
  3. 写入 stock_minute 表
  4. 验证数据完整性
  5. 通知回测系统数据就绪
```

### API 设计
```javascript
// 触发分钟线获取
POST /api/minute/fetch
Body: {
  "stocks": ["000001.SZ", "000002.SZ", ...],  // Top10 列表
  "range": "1y",  // 数据范围
  "granularity": "5m"  // 数据粒度
}

// 查询分钟线获取状态
GET /api/minute/status

// 查询分钟线数据
GET /api/minute/data?ts_code=000001.SZ&range=1m
```

### 数据库表
```sql
CREATE TABLE stock_minute (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_time TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    ts_code TEXT NOT NULL,
    stock_name TEXT,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    amount REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trade_time, ts_code)
);
```

---

## ✅ 验收标准

- [ ] 选股完成后自动触发分钟线获取
- [ ] 仅获取 Top10 股票的分钟线
- [ ] 数据正确写入 stock_minute 表
- [ ] 数据完整性验证通过
- [ ] 错误处理完善（网络异常、数据缺失）

---

## 📁 交付物

1. `api/minute-fetch.js` - 分钟线获取 API
2. `scripts/fetch_minute_data.mjs` - BaoStock 获取脚本
3. `db/migrations/003_stock_minute.sql` - 数据库表创建
4. `api/server.js` - 新增路由
5. `docs/tasks/TASK_V3_006.md` - 任务文档（本文件）

---

## 🔗 依赖关系

- 前置任务：TASK_V3_004（个股 Top10 自动筛选）
- 后续任务：TASK_V3_201（BaoStock 分钟线获取脚本）、TASK_V3_203（分钟线回测引擎适配）

---

## 📝 备注

- 根据设计共识 11.9，分钟线数据采用"分层数据 + 按需获取"策略
- 仅对核心股票池（10 只）获取分钟线，存储成本约 120MB
- 每周增量更新（周末执行）
