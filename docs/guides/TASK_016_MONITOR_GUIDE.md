# TASK_016 盘后监控使用文档

## 1. 功能概述

`TASK_016` 是完整的盘后监控系统，由 3 个脚本组成，已实现自动闭环：

- **`scripts/daily-monitor.mjs`** - 主流程
  - 读取模拟账户与持仓
  - 匹配个股分析报告
  - 解析报告字段（`decision`、`report_score`、`key_watch_points`、`risk_controls` 等）
  - 为持仓生成 `monitor_assessment`
  - 调用事件源采集盘后事件
  - 生成监控报告并飞书推送
  
- **`scripts/after-hours-events.mjs`** - 盘后事件采集
  - 公司公告（新浪财经 `globalStockMajorEvents` / 本地新闻数据库）
  - 财报发布（Tushare `disclosure_date`）
  - 重要新闻（本地新闻数据库 26,350+ 条）
  - 行业新闻（本地新闻数据库 + 申万行业分类 2021 版）
  - 价格异动（新浪财经实时行情，待代码实现）
  
- **`scripts/feishu-push.mjs`** - 飞书私聊推送
  - 使用飞书开放平台 API
  - 推送至主人飞书私聊
  - 支持重试机制（最多 3 次）

### 已打通能力

✅ `daily-monitor.mjs` → `after-hours-events.mjs` → `feishu-push.mjs` 自动闭环

### 数据源清单

| 事件类型 | 数据源 | 接口 | 状态 |
|---------|--------|------|------|
| 公司公告 | 新浪财经 + 本地新闻库 | `globalStockMajorEvents` | ✅ |
| 财报发布 | Tushare Pro | `disclosure_date` | ✅ |
| 重要新闻 | 本地新闻数据库 | `news_system/news.db` | ✅ |
| 行业新闻 | 本地新闻数据库 | 申万行业分类 2021 版 | ✅ |
| 价格异动 | 新浪财经 | `cnStockMinute` | ⏳ 待实现 |

---

## 2. 运行方式

### 2.1 环境准备

**首次运行前**，创建 `.env` 文件：

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
cp .env.example .env  # 或手动创建
```

**.env 文件内容**：

```env
# 飞书开放平台凭证
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxx

# 接收者 open_id（主人）
FEISHU_RECEIVE_ID=ou_a21807011c59304bedfaf2f7440f5361
```

**获取方式**：
- `FEISHU_APP_ID` / `FEISHU_APP_SECRET`: 飞书开放平台应用凭证
- `FEISHU_RECEIVE_ID`: 飞书用户 open_id

### 2.2 运行主流程

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node scripts/daily-monitor.mjs
```

**预期输出**：

```text
[每日监控] 开始执行...
[账户] 读取到 5 个模拟账户
[持仓] 读取到 1 个持仓
[分析报告] 成功匹配 1 份分析报告
[盘后事件] 采集到 67 条事件
[监控报告] 生成报告文件：data/monitor-reports/monitor_report_2026-03-20.json
✅ 飞书推送发送成功
```

**生成文件**：
- `data/monitor-reports/monitor_report_YYYY-MM-DD.json`

### 2.3 单独运行事件采集（调试用）

```bash
node scripts/after-hours-events.mjs
```

### 2.4 单独测试飞书推送（调试用）

```bash
node scripts/feishu-push.mjs "测试消息"
```

---

## 3. 输出数据结构

### 3.1 监控报告结构

```json
{
  "report_date": "2026-03-20",
  "generated_at": "2026-03-20T19:00:00.000Z",
  "accounts": [
    {
      "account_id": "acc_001",
      "positions": [
        {
          "stock_code": "sh600519",
          "monitor_assessment": {
            "decision": "买入",
            "report_score": 5,
            "key_watch_points": ["..."],
            "risk_controls": ["..."],
            "strategy": {...}
          }
        }
      ],
      "summary": {
        "total_value": 1000000,
        "watch_items_count": 1,
        "risk_alerts_count": 0
      }
    }
  ],
  "overview": {
    "headline": "存在 1 个持仓，整体需继续跟踪",
    "watch_items_count": 1,
    "risk_alerts_count": 0
  },
  "after_hours_events": [
    {
      "id": "ANN-sh600519-2026-03-20",
      "type": "company_announcement",
      "source": "新浪财经",
      "title": "贵州茅台重大事项公告",
      "stockCode": "sh600519",
      "priority": "high"
    }
  ]
}
```

### 3.2 关键字段说明

| 字段 | 说明 |
|------|------|
| `monitor_assessment.decision` | 投资决策（买入/卖出/持有/观望） |
| `monitor_assessment.report_score` | 报告评分（1-5） |
| `monitor_assessment.key_watch_points` | 关键关注点列表 |
| `monitor_assessment.risk_controls` | 风险控制措施列表 |
| `monitor_assessment.strategy` | 策略建议（含买点、止损、目标价） |
| `after_hours_events` | 盘后事件列表 |

---

## 4. 定时执行（推荐）

### 4.1 使用 cron

**每天 15:30 执行**（A 股收盘后 30 分钟）：

```bash
# 编辑 crontab
crontab -e

# 添加任务
30 15 * * 1-5 cd /Users/vvc/.openclaw/workspace/stock-system && node scripts/daily-monitor.mjs >> logs/daily-monitor.log 2>&1
```

### 4.2 使用 OpenClaw cron

```bash
openclaw cron add daily-monitor '{"schedule":{"kind":"cron","expr":"30 15 * * 1-5"},"payload":{"kind":"systemEvent","text":"执行每日监控"}}'
```

---

## 5. 故障排查

### 5.1 飞书推送失败

**错误**: `Missing FEISHU_APP_ID or FEISHU_APP_SECRET`

**解决**:
1. 检查 `.env` 文件是否存在
2. 确认 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 已填写
3. 重启终端或重新 `source .env`

### 5.2 事件采集失败

**错误**: `新闻数据库不存在`

**解决**:
1. 确认 `news_system/news.db` 文件存在
2. 如不存在，先运行新闻系统初始化

### 5.3 分析报告匹配失败

**现象**: 日志显示"未找到分析报告"

**解决**:
1. 确认 `data/stock-analysis/` 目录下有对应股票的分析报告
2. 报告文件名格式：`stock_analysis_<股票代码>.json`

---

## 6. 相关文件

| 文件 | 说明 |
|------|------|
| `scripts/daily-monitor.mjs` | 主流程脚本 |
| `scripts/after-hours-events.mjs` | 事件采集脚本 |
| `scripts/feishu-push.mjs` | 飞书推送脚本 |
| `docs/runtime/TASK_016_STATUS.md` | 任务状态跟踪 |
| `docs/DESIGN_CONSENSUS.md` | 设计文档（第十三节） |

---

## 7. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-03-20 | 初版，实现自动闭环 |
| v1.1 | 2026-03-20 | 接入本地新闻数据库 |
| v1.2 | 2026-03-20 | 接入 Tushare 财报接口 |
| v1.3 | 2026-03-20 | 修复导入副作用，添加 dotenv 支持 |

---

*最后更新：2026-03-20 19:40*
