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
  - 公司公告（本地新闻数据库）
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
| 公司公告 | 本地新闻数据库 | `news_raw` 表 | ✅ |
| 财报发布 | Tushare Pro | `disclosure_date` | ✅ |
| 重要新闻 | 本地新闻数据库 | `news_system/news.db` | ✅ |
| 行业新闻 | 本地新闻数据库 | 申万行业分类 2021 版 | ✅ |
| 价格异动 | 新浪财经 | `cnStockMinute` | ⏳ 待实现 |

---

## 2. 运行方式

### 2.1 环境准备

**首次运行前**，创建 `.env` 文件（手动创建）：

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
cat > .env << 'EOF'
# 飞书开放平台凭证
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxx
EOF
```

**说明**：
- `FEISHU_APP_ID` / `FEISHU_APP_SECRET`: 飞书开放平台应用凭证（从 `.env` 文件读取）
- 接收者 `open_id` 已硬编码在 `scripts/feishu-push.mjs` 中（`ou_a21807011c59304bedfaf2f7440f5361`）

### 2.2 运行主流程

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node scripts/daily-monitor.mjs
```

**预期输出**：

```text
📊 每日监控任务启动
⏰ 2026/3/20 20:04:46

数据库已连接：/Volumes/SSD500/openclaw/stock-system/stock_system.db
📈 找到 5 个模拟账户

🔍 检查账户：联调测试账户 (ID: 5)
🔍 检查账户：测试账户 (ID: 1)
   📦 股票：中际旭创 (300308.SZ)

📊 开始收集盘后事件...
========== 盘后事件采集开始 ==========
[公司公告] 获取 10 条公告
✓ [公司公告] 获取 10 条事件
[财报发布] 获取 17 条财报
✓ [财报发布] 获取 17 条事件
✅ 收集到 67 条盘后事件

📨 开始发送飞书推送...
✅ 飞书推送发送成功

📄 报告已保存：data/monitor-reports/monitor_report_2026-03-20.json

✅ 监控完成

📊 统计信息:
   - 账户数：5
   - 持仓数：1
   - 失败股票：0
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
  "generated_at": "2026-03-20T12:04:46.206Z",
  "account_count": 5,
  "total_positions": 1,
  "accounts": [
    {
      "account_id": 1,
      "account_name": "测试账户",
      "total_value": 767768,
      "total_return": -232232,
      "return_rate": -0.232232,
      "cash": 709768,
      "position_count": 1,
      "positions": [
        {
          "ts_code": "300308.SZ",
          "stock_name": "中际旭创",
          "quantity": 500,
          "avg_price": 580,
          "cost_amount": 290000,
          "current_price": 580,
          "market_value": 290000,
          "unrealized_pnl": 0,
          "unrealized_pnl_rate": 0,
          "monitor_assessment": {
            "action": "buy",
            "risk_level": "low",
            "summary": "决策：买入; 报告评分：5/5; 收益率：0.00%",
            "follow_ups": ["观察点：催化验证：800G/1.6T 产品放量"],
            "watch_items": ["催化验证：800G/1.6T 产品放量"],
            "risk_alerts": ["硬止损：若出现 海外需求波动，应重新评估持仓假设"]
          },
          "report": {
            "file_name": "stock_report_中际旭创_20260314.html",
            "file_path": "/Users/vvc/.openclaw/workspace/stock-system/report/analysis/stock_report_中际旭创_20260314.html",
            "created_at": "2026-03-14T03:25:58.392Z",
            "size": 12737,
            "parsed_data": {
              "parse_status": "partial_success",
              "buyZone": null,
              "stopLoss": null,
              "targetPrice": null,
              "strategy": {
                "aggressive": "可考虑小仓位启动跟踪...",
                "balanced": "优先等待景气验证...",
                "conservative": "以风险控制优先..."
              },
              "decision": "买入",
              "report_score": 5,
              "key_watch_points": ["催化验证：800G/1.6T 产品放量"],
              "operation_suggestions": {
                "short_term": "短线优先观察放量...",
                "medium_term": "中线围绕订单兑现...",
                "long_term": "长线关注行业渗透率..."
              },
              "risk_controls": ["硬止损：若出现 海外需求波动..."],
              "footnote": "提示：当前模板尚未接入实时价格与估值数据..."
            }
          }
        }
      ],
      "summary": {
        "action_items": [],
        "high_risk_positions": [],
        "positive_positions": [],
        "negative_positions": [],
        "watch_items_count": 1,
        "risk_alerts_count": 3
      }
    }
  ],
  "failed_stocks": [],
  "report_version": "1.0.0",
  "metadata": {
    "market_date": "2026-03-20",
    "environment": "development",
    "source": "daily-monitor"
  },
  "overview": {
    "headline": "📊 存在 1 个持仓，整体需继续跟踪",
    "high_risk_positions": [],
    "positive_positions": [],
    "negative_positions": [],
    "accounts_requiring_attention": [],
    "watch_items_count": 3,
    "risk_alerts_count": 3
  },
  "after_hours_events": [
    {
      "id": "ANN-24506",
      "type": "company_announcement",
      "source": "监管公告",
      "title": "关于奥维通信股份有限公司股票终止上市的公告",
      "content": "<p>...</p>",
      "stockCode": null,
      "stockName": null,
      "eventTime": "2026-03-19T16:00:00.000Z",
      "publishTime": "2026-03-19T23:01:01.000Z",
      "priority": "high",
      "announcementType": "监管公告",
      "metadata": {
        "newsId": 24506,
        "originalLink": "http://www.szse.cn/disclosure/notice/company/t20260320_619516.html"
      }
    }
  ]
}
```

### 3.2 关键字段说明

#### 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `generated_at` | string | ISO 8601 时间戳 |
| `account_count` | number | 账户总数 |
| `total_positions` | number | 持仓总数 |
| `accounts` | array | 账户列表 |
| `failed_stocks` | array | 匹配失败的股票列表 |
| `report_version` | string | 报告版本号 |
| `metadata` | object | 元数据（market_date/environment/source） |
| `overview` | object | 全局概览 |
| `after_hours_events` | array | 盘后事件列表 |

#### 账户层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `account_id` | number | 账户 ID（数字） |
| `account_name` | string | 账户名称 |
| `total_value` | number | 总资产 |
| `total_return` | number | 总盈亏（元） |
| `return_rate` | number | 收益率（小数） |
| `cash` | number | 现金 |
| `position_count` | number | 持仓数量 |
| `positions` | array | 持仓列表 |
| `summary` | object | 账户摘要 |

#### 持仓层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `ts_code` | string | 股票代码（格式：`300308.SZ`） |
| `stock_name` | string | 股票名称 |
| `quantity` | number | 持仓数量 |
| `avg_price` | number | 成本价 |
| `cost_amount` | number | 成本金额 |
| `current_price` | number | 当前价 |
| `market_value` | number | 市值 |
| `unrealized_pnl` | number | 浮动盈亏（元） |
| `unrealized_pnl_rate` | number | 浮动盈亏比例 |
| `monitor_assessment` | object | 监控评估 |
| `report` | object | 分析报告 |

#### monitor_assessment 字段

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `action` | string | 行动建议（英文枚举） | `buy` / `hold` / `sell` |
| `risk_level` | string | 风险等级 | `low` / `medium` / `high` |
| `summary` | string | 评估摘要 | "决策：买入; 报告评分：5/5" |
| `follow_ups` | array | 后续跟踪事项 | ["观察点：催化验证..."] |
| `watch_items` | array | 关注事项 | ["催化验证：800G/1.6T..."] |
| `risk_alerts` | array | 风险预警 | ["硬止损：若出现..."] |

#### report 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `file_name` | string | 报告文件名 |
| `file_path` | string | 报告文件完整路径 |
| `created_at` | string | 报告创建时间 |
| `size` | number | 报告文件大小（字节） |
| `parsed_data` | object | 解析后的报告数据 |

#### report.parsed_data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `parse_status` | string | 解析状态（success/partial_success/error） |
| `buyZone` | array|null | 建仓区间 `[低价，高价]` |
| `stopLoss` | number|null | 止损点价格 |
| `targetPrice` | number|null | 目标价 |
| `decision` | string | 投资决策（买入/卖出/持有/观望） |
| `report_score` | number | 报告评分（1-5） |
| `strategy` | object | 策略建议（aggressive/balanced/conservative） |
| `key_watch_points` | array | 关键关注点 |
| `operation_suggestions` | object | 操作建议（short_term/medium_term/long_term） |
| `risk_controls` | array | 风险控制措施 |
| `footnote` | string|null | 备注说明 |

#### overview 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `headline` | string | 概览标题 |
| `high_risk_positions` | array | 高风险持仓列表 |
| `positive_positions` | array | 正收益持仓列表 |
| `negative_positions` | array | 负收益持仓列表 |
| `accounts_requiring_attention` | array | 需要关注的账户列表 |
| `watch_items_count` | number | 关注事项总数 |
| `risk_alerts_count` | number | 风险预警总数 |

#### after_hours_events 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 事件 ID |
| `type` | string | 事件类型（company_announcement/financial_report/news） |
| `source` | string | 数据来源 |
| `title` | string | 事件标题 |
| `content` | string | 事件内容（HTML） |
| `stockCode` | string|null | 相关股票代码 |
| `stockName` | string|null | 相关股票名称 |
| `eventTime` | string | 事件时间 |
| `publishTime` | string | 发布时间 |
| `priority` | string | 优先级（high/medium/low） |
| `announcementType` | string | 公告类型（仅公告类事件） |
| `metadata` | object | 元数据 |

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
1. 确认 `report/analysis/` 目录下有对应股票的分析报告
2. 报告文件为 `.html` 格式
3. **匹配规则**：文件名包含 `stock_name`（股票名称）或 `ts_code`（股票代码）即可
4. 示例：
   - `stock_report_中际旭创_20260314.html` ✅
   - `stock_report_300308.SZ_20260314.html` ✅
   - `analysis_中际旭创.html` ✅

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
| v2.0 | 2026-03-20 | 全面修正文档与实现不一致（JSON 结构/日志格式/字段说明） |
| v2.1 | 2026-03-20 | 补齐缺失字段（failed_stocks/report_version/metadata/overview 完整结构/report.file_path 等） |

---

*最后更新：2026-03-20 20:13*
