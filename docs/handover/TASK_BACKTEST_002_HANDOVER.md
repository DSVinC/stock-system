# TASK_BACKTEST_002_HANDOVER - 交接文档

**任务**: 回测引擎核心功能  
**创建时间**: 2026-03-23 09:15  

---

## 📋 任务背景

回测系统是策略验证的核心，需要支持历史数据回放和收益统计。

---

## 🎯 任务目标

完善 `api/backtest.js` 的回测引擎功能

---

## ✅ 验收标准

1. POST `/api/backtest/run` 接口可执行回测
2. 回测结果包含收益率、夏普比率、最大回撤
3. 支持自定义时间范围

---

## 📁 相关文件

- `api/backtest.js`
- 数据库表：`backtest_report`, `backtest_trade`, `backtest_daily`, `stock_daily`

---

## 🧪 测试命令

```bash
curl -X POST http://localhost:3000/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{"strategy": "dual_ma", "start_date": "2025-01-01", "end_date": "2025-12-31"}'
```

---

## 📝 注意事项

- 使用真实历史数据（stock_daily 表）
- 收益统计公式需准确
- 支持多策略扩展
