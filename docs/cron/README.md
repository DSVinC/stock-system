# Cron 定时任务配置

**项目**: stock-system
**创建时间**: 2026-03-23
**配置文件**: `/Users/vvc/.openclaw/openclaw.json`

---

## 定时任务列表

| 任务名称 | 描述 | Cron 表达式 | 执行时间 |
|---------|------|-------------|---------|
| stock-position-monitor-daily | 盘后日报 | `0 20 * * *` | 每天 20:00 |
| stock-position-monitor-intraday | 盘中监控 | `7,37 9-11,13-15 * * 1-5` | 交易日每 30 分钟 |
| stock-position-morning-brief | 盘前关注 | `30 8 * * 1-5` | 交易日 08:30 |
| stock-conditional-monitor | 条件单监控 | `7,37 9-11,13-15 * * 1-5` | 交易日每 30 分钟 |
| stock-learning-daily | 学习日报 | `10 2 * * *` | 每天 02:10 |

---

## Cron 表达式说明

```
┌───────────── 分钟 (0-59)
│ ┌───────────── 小时 (0-23)
│ │ ┌───────────── 日 (1-31)
│ │ │ ┌───────────── 月 (1-12)
│ │ │ │ ┌───────────── 星期 (0-7, 0和7都是周日)
│ │ │ │ │
* * * * *
```

### 常用表达式

| 表达式 | 含义 |
|--------|------|
| `0 20 * * *` | 每天 20:00 |
| `30 8 * * 1-5` | 周一至周五 08:30 |
| `7,37 9-11,13-15 * * 1-5` | 交易日 09:07, 09:37, ..., 15:07 |
| `10 2 * * *` | 每天 02:10 |

### 避开整点原则

盘中监控使用 `7,37` 而非 `0,30`，原因：
- 避免整点时刻的系统压力
- 避免与其他整点任务冲突
- 给数据源留出更新时间

---

## 配置格式

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
    "message": "运行持仓监控脚本（盘后日报）：node scripts/monitor-positions.mjs --mode=daily",
    "workspace": "/Users/vvc/.openclaw/workspace/stock-system"
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 任务唯一标识 |
| description | string | 任务描述 |
| schedule.kind | string | 固定值 "cron" |
| schedule.expr | string | Cron 表达式 |
| payload.kind | string | 固定值 "agentTurn" |
| payload.message | string | 执行指令 |
| payload.workspace | string | 工作目录 |
| sessionTarget | string | "isolated" 独立会话 |
| enabled | boolean | 是否启用 |

---

## 执行流程

```
08:30  盘前关注 (morning-brief)
       ↓
09:00  开盘
       ↓
09:07  盘中监控 + 条件单检查 - 每 30 分钟
09:37  盘中监控 + 条件单检查
...
15:07  盘中监控 + 条件单检查 (收盘前)
       ↓
15:00  收盘
       ↓
02:10  学习日报 (次日)
       ↓
20:00  盘后日报 (当日)
```

---

## 运维操作

### 启用/禁用任务

编辑 `~/.openclaw/openclaw.json`，修改 `enabled` 字段：

```json
{
  "name": "stock-position-monitor-daily",
  "enabled": false  // 禁用
}
```

### 重启 Gateway

```bash
# 重启 OpenClaw Gateway 使配置生效
pkill -f "openclaw-gateway" || true
# 或通过系统重启
```

### 查看执行日志

```bash
# 查看 cron 执行日志
tail -f ~/.openclaw/logs/cron.log

# 查看任务输出
cat ~/.openclaw/cron/*.log
```

---

## 注意事项

1. **时区**: 所有时间均为北京时间 (Asia/Shanghai)
2. **交易日**: `1-5` 表示周一到周五，节假日需手动禁用
3. **isolated 模式**: 每个任务在独立会话中执行，避免冲突
4. **节假日**: 中国股市节假日需手动禁用相关任务
5. **重复执行**: 使用 `sessionTarget: "isolated"` 防止重复

---

## 故障排查

### 任务未执行

1. 检查 Gateway 是否运行
2. 检查 cron.enabled 是否为 true
3. 检查任务 enabled 是否为 true
4. 检查 cron 表达式是否正确

### 飞书推送失败

1. 检查 FEISHU_WEBHOOK 环境变量
2. 检查网络连接
3. 查看脚本输出日志

### 脚本执行失败

1. 检查工作目录是否正确
2. 检查 Node.js 依赖是否安装
3. 检查数据库路径是否正确

---

**最后更新**: 2026-03-23