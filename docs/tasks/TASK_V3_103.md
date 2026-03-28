# TASK_V3_103 - 回测结果缓存机制

**版本**: V3.0  
**优先级**: P0  
**状态**: ✅ 已完成  
**创建日期**: 2026-03-24  
**预计工期**: 1 天  

---

## 📋 任务描述

实现回测结果的缓存机制，避免重复回测计算，加速参数优化流程。

---

## 🎯 目标

1. 实现回测结果缓存
2. 支持缓存命中检查
3. 支持缓存过期策略
4. 与优化模块集成

---

## 📐 技术规范

### 缓存键设计
```javascript
function generateCacheKey(strategyConfig, startDate, endDate) {
  // 使用策略配置 + 时间范围的哈希作为缓存键
  const configHash = crypto.createHash('md5')
    .update(JSON.stringify(strategyConfig))
    .update(startDate)
    .update(endDate)
    .digest('hex');
  return `backtest:${configHash}`;
}
```

### 缓存表结构
```sql
CREATE TABLE backtest_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    strategy_config TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    result_json TEXT NOT NULL,
    hit_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT
);

-- 索引加速查询
CREATE INDEX idx_cache_key ON backtest_cache(cache_key);
CREATE INDEX idx_expires_at ON backtest_cache(expires_at);
```

### 缓存策略
- **命中检查**: 运行回测前先查缓存
- **过期策略**: 默认 7 天过期
- **清理策略**: 定期清理过期缓存

---

## ✅ 验收标准

- [ ] 缓存命中正常工作
- [ ] 缓存过期策略有效
- [ ] 与回测引擎集成
- [ ] 与优化模块集成

---

## 📁 交付物

1. `api/backtest-cache.js` - 缓存模块
2. `db/migrations/007_create_backtest_cache.sql` - 缓存表创建
3. `api/server.js` - 路由集成

---

## 🔌 API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| GET /api/backtest/cache/:key | 查询缓存 | 获取缓存的回测结果 |
| DELETE /api/backtest/cache/:key | 删除缓存 | 删除指定缓存 |
| POST /api/backtest/cache/cleanup | 清理缓存 | 清理过期缓存 |

---

## 🔗 依赖关系

- 前置任务：TASK_V3_102（选股参数优化）
- 后续任务：TASK_V3_104（7 指标计算）

---

## 📝 备注

- 缓存键使用 MD5 哈希
- 支持缓存命中率统计
- 定期清理过期缓存（cron 任务）
