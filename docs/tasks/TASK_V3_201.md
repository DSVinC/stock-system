# TASK_V3_201: BaoStock 分钟线获取脚本

**优先级**: P1  
**工期**: 1 天  
**阶段**: Phase 2（网格交易回测）

---

## 📋 任务描述

实现分钟线数据获取脚本，使用 BaoStock（免费）替代 Tushare，支持获取 A 股分钟线数据。

---

## 🎯 验收标准

### 功能要求
- [ ] 支持获取 1 分钟、5 分钟、15 分钟、30 分钟、60 分钟 K 线
- [ ] 支持全市场或指定股票代码列表
- [ ] 支持日期范围查询（start_date 到 end_date）
- [ ] 数据保存到 `stock_minute` 表
- [ ] 自动去重（避免重复获取）
- [ ] 获取进度显示（每 100 只股票打印一次进度）

### 数据字段
```sql
ts_code, trade_time, open, high, low, close, volume, amount
```

### 性能要求
- [ ] 单只股票获取耗时 < 2 秒
- [ ] 支持批量获取（100 只股票/批次）
- [ ] 错误重试机制（失败后重试 3 次）

---

## 📁 交付物

- `scripts/fetch_minute_data.py` - BaoStock 分钟线获取脚本
- `db/migrations/008_create_stock_minute_table.sql` - 分钟线表迁移

---

## 🔧 技术要点

1. **BaoStock 登录**: `bs.login()`
2. **查询分钟线**: `bs.query_history_k_data_plus()`
3. **字段映射**: BaoStock 字段 → 数据库字段
4. **错误处理**: 网络错误、数据格式错误

---

## 📝 开发提示

参考已有脚本：
- `scripts/fetch_daily_data.py` - 日线获取脚本（参考结构）
- `api/backtest-engine.js` - 回测引擎（了解数据格式需求）
