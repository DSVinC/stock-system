# HEARTBEAT - 定时任务配置

**项目**: stock-system
**创建时间**: 2026-03-23
**最后更新**: 2026-03-23

---

## 📋 定时任务列表

### 1. stock-position-monitor-daily - 盘后日报

**描述**: 每日盘后检查持仓股票，生成监控报告

**配置**:
```json
{
  "name": "stock-position-monitor-daily",
  "description": "持仓监控 - 盘后日报",
  "schedule": {
    "kind": "cron",
    "expr": "0 20 * * *"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "运行持仓监控脚本（盘后日报）：node scripts/monitor-positions.mjs --mode=daily"
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

**执行时间**: 每天 20:00 (北京时间)

**执行内容**:
- 检查所有持仓股票
- 计算 7 因子评分变化
- 检查黑天鹅事件
- 检查负面新闻
- 生成并发送飞书日报

---

### 2. stock-position-monitor-intraday - 盘中监控

**描述**: 交易时间每 30 分钟检查持仓股票舆情和黑天鹅

**配置**:
```json
{
  "name": "stock-position-monitor-intraday",
  "description": "持仓监控 - 盘中监控",
  "schedule": {
    "kind": "cron",
    "expr": "7,37 9-11,13-15 * * 1-5"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "运行持仓监控脚本（盘中监控）：node scripts/monitor-positions.mjs --mode=intraday"
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

**执行时间**: 交易日 09:07, 09:37, 10:07, ..., 15:07 (每 30 分钟)

**执行内容**:
- 使用更严格的阈值检查持仓
- 重点关注黑天鹅事件和负面新闻
- 有异常时立即推送飞书告警

---

### 3. stock-position-morning-brief - 盘前关注

**描述**: 每日盘前检查持仓股票隔夜消息

**配置**:
```json
{
  "name": "stock-position-morning-brief",
  "description": "持仓监控 - 盘前关注",
  "schedule": {
    "kind": "cron",
    "expr": "30 8 * * 1-5"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "运行持仓监控脚本（盘前关注）：node scripts/monitor-positions.mjs --mode=morning"
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

**执行时间**: 交易日 08:30 (北京时间)

**执行内容**:
- 检查隔夜重大新闻
- 生成今日关注列表
- 发送盘前飞书简报

---

### 4. stock-conditional-monitor - 条件单监控

**描述**: 交易时间每 5 分钟检查条件单触发

**配置**:
```json
{
  "name": "stock-conditional-monitor",
  "description": "条件单监控",
  "schedule": {
    "kind": "cron",
    "expr": "*/5 9-11,13-15 * * 1-5"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "运行条件单监控脚本：node scripts/conditional-order-monitor.mjs"
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

**执行时间**: 交易日 09:00-11:30, 13:00-15:00 每 5 分钟

---

### 5. stock-daily-monitor - 每日持仓汇总

**描述**: 每日生成持仓汇总报告

**配置**:
```json
{
  "name": "stock-daily-monitor",
  "description": "每日持仓汇总",
  "schedule": {
    "kind": "cron",
    "expr": "0 19 * * *"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "运行每日监控脚本：node scripts/daily-monitor.mjs"
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

**执行时间**: 每天 19:00 (北京时间)

---

## 📝 Cron 表达式说明

| 字段 | 含义 | 范围 |
|------|------|------|
| 分钟 | 0-59 | 指定执行的分钟 |
| 小时 | 0-23 | 指定执行的小时 |
| 日 | 1-31 | 指定月份中的日期 |
| 月 | 1-12 | 指定月份 |
| 星期 | 0-7 | 0 和 7 都表示周日 |

**常用表达式**:
- `0 20 * * *` - 每天 20:00
- `*/5 9-15 * * 1-5` - 周一到周五，9-15 点每 5 分钟
- `30 8 * * 1-5` - 周一到周五，08:30
- `7,37 9-11,13-15 * * 1-5` - 交易时段每 30 分钟（避开整点和半点）

---

## 🔄 任务执行顺序

```
08:30  盘前关注 (morning-brief)
       ↓
09:00  开盘
       ↓
09:07  盘中监控 (intraday) - 每 30 分钟
09:37  盘中监控
...
15:07  盘中监控 (收盘前)
       ↓
15:00  收盘
       ↓
19:00  每日汇总 (daily-monitor)
       ↓
20:00  盘后日报 (position-monitor-daily)
```

---

## ⚠️ 注意事项

1. **时区**: 所有时间均为北京时间 (Asia/Shanghai)
2. **交易日**: `1-5` 表示周一到周五，节假日需手动暂停
3. **避开整点**: 盘中监控使用 `7,37` 而非 `0,30`，避免整点压力
4. **isolated 模式**: 每个任务在独立会话中执行，避免冲突

---

## 📊 监控指标

| 任务 | 成功指标 | 失败处理 |
|------|---------|---------|
| 盘后日报 | 生成报告文件 | 重试 1 次 |
| 盘中监控 | 无异常或告警推送成功 | 记录错误日志 |
| 盘前关注 | 发送飞书简报 | 重试 1 次 |
| 条件单监控 | 正确触发条件单 | 记录错误并通知 |

---

**最后更新**: 2026-03-23