# 持仓监控功能设计文档

**版本**: v1.0.0  
**创建时间**: 2026-03-22  
**状态**: 设计中 → 开发中  
**最后更新**: 2026-03-22 23:58

---

## 📋 功能概述

### 功能定位
持仓监控是股票系统的**核心风控功能**，监控已持仓股票的基本面、舆情、价格变化，出现异常时飞书推送告警。

**不是独立系统**，而是现有股票系统的功能增强，复用现有组件：
- 持仓数据（portfolio_position）
- 条件单（conditional_order）
- 7 因子评分（score-factors.js）
- 舆情分析（sentiment-factor.js）
- 黑天鹅检测（black-swan-check.js）
- 飞书推送（message 工具）

---

## 🎯 监控目标

### 监控什么？
| 监控对象 | 频率 | 触发条件 | 推送级别 |
|---------|------|---------|---------|
| **价格触发** | 实时（5 分钟轮询） | 条件单触发 | 🔴 立即 |
| **黑天鹅事件** | 高频（30 分钟） | 财务造假/监管处罚/重大诉讼 | 🔴 立即 |
| **负面新闻** | 高频（30 分钟） | ≥3 条负面新闻 | 🔴 立即 |
| **7 因子恶化** | 中频（每天 2 次） | 综合评分↓30%+ | 🔴 告警 |
| **7 因子预警** | 中频（每天 2 次） | 综合评分↓15-30% | 🟡 预警 |
| **基本面变化** | 低频（每天 1 次） | 估值/盈利因子变化 | ⚪ 日报 |

### 推送策略
| 推送类型 | 时间 | 规则 |
|---------|------|------|
| **实时告警** | 立即 | 黑天鹅/条件单触发/负面新闻≥3 条 |
| **盘中监控** | 每 30 分钟（9:30-15:00） | 有异常才推送，无异常不推 |
| **盘前日报** | 08:30 | 每日推送（持仓概览 + 今日关注） |
| **盘后日报** | 20:00 | 每日推送（持仓概览 + 信号汇总） |

---

## 📊 系统架构

### 数据流
```
持仓股票 (portfolio_position)
    ↓
监控任务 (定时触发)
    ↓
┌─────────────────────────────────────┐
│  1. 获取当前价格 (sinafinance MCP)   │
│  2. 获取 7 因子评分 (score-factors)   │
│  3. 检查黑天鹅 (black-swan-check)   │
│  4. 检查负面新闻 (sentiment-factor) │
│  5. 对比历史评分 (factor_snapshots) │
└─────────────────────────────────────┘
    ↓
信号生成 (position-signals.js)
    ↓
┌─────────────────────────────────────┐
│  阈值判断：                          │
│  - 7 因子↓30% → SELL/HIGH           │
│  - 7 因子↓15% → WARNING/MEDIUM      │
│  - 负面新闻≥3 条 → SELL/HIGH        │
│  - 黑天鹅事件 → SELL/HIGH           │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  保存信号 (position_signals 表)      │
│  飞书推送 (message 工具)             │
└─────────────────────────────────────┘
```

### 组件关系
```
stock-system/
├── api/
│   ├── position-signals.js         ← 新增：信号生成逻辑
│   ├── score-factors.js            ← 复用：7 因子评分
│   ├── sentiment-factor.js         ← 复用：舆情分析
│   ├── black-swan-check.js         ← 复用：黑天鹅检测
│   ├── portfolio.js                ← 复用：持仓数据
│   └── conditional-executor.js     ← 复用：条件单执行
│
├── scripts/
│   ├── monitor-positions.mjs       ← 新增：持仓监控脚本
│   └── monitor-sentiment.mjs       ← 新增：舆情监控脚本（P1）
│
├── docs/
│   ├── tasks/
│   │   └── TASK_POSITION_MONITOR.md    ← 新增：任务文档
│   └── design/
│       └── POSITION_MONITOR_DESIGN.md  ← 新增：设计文档
│
└── portfolio.html                  ← 修改：增加"持仓监控"标签页
```

---

## 🗄️ 数据库设计

### 新增表：position_signals
```sql
CREATE TABLE IF NOT EXISTS position_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT NOT NULL,
  stock_name TEXT,
  signal_type TEXT NOT NULL,      -- BUY/SELL/WARNING/CONDITIONAL
  signal_level TEXT NOT NULL,     -- HIGH/MEDIUM/LOW
  reason TEXT NOT NULL,           -- 信号原因摘要
  details TEXT,                   -- JSON 详情（因子变化、新闻列表等）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_signals_stock ON position_signals(stock_code);
CREATE INDEX idx_signals_type ON position_signals(signal_type);
CREATE INDEX idx_signals_created ON position_signals(created_at);
```

### 复用表
| 表名 | 用途 |
|------|------|
| portfolio_position | 获取持仓股票列表 |
| conditional_order | 获取条件单（止损/止盈） |
| factor_snapshots | 对比历史 7 因子评分 |
| analysis_reports | 获取个股分析报告 |

---

## 📱 推送模板

### 1. 🔴 实时告警 - 黑天鹅事件
```
🔴 持仓风险告警 - 黑天鹅事件

股票：宁德时代 (300750.SZ)
持仓：100 股 | 成本：340.00 元 | 当前：350.00 元

⚠️ 风险事件：财务质疑
来源：新浪财经
时间：2026-03-22 14:30
摘要：某机构发布研报质疑公司应收账款真实性

影响评估：
  - 舆情因子：0.7 → 0.3（↓57%）
  - 7 因子综合：4.2 → 3.1（↓26%）

建议操作：
  □ 立即减仓
  □ 设置止损单
  □ 继续观察

[查看个股分析] [设置条件单]
```

### 2. 📊 盘后日报 - 持仓汇总
```
📊 持仓监控日报 - 2026-03-22

━━━━━━━━━━━━━━━━━━

📈 今日持仓概览
持仓股票：5 只
总投入：500,000 元
当前市值：523,500 元
今日盈亏：+8,200 元（+1.59%）
累计盈亏：+23,500 元（+4.70%）

━━━━━━━━━━━━━━━━━━

🔴 今日信号汇总
卖出信号：1 只
  - 宁德时代：负面新闻 3 条

预警信号：2 只
  - 隆基绿能：7 因子↓18%
  - 阳光电源：估值过高

加仓信号：0 只

━━━━━━━━━━━━━━━━━━

📋 个股详情
[详细列表]

━━━━━━━━━━━━━━━━━━

📅 明日关注
  - 宁德时代：财报发布
  - 隆基绿能：行业数据

[查看持仓监控面板] [设置监控阈值]
```

---

## ⏰ 定时任务配置

### 任务清单
| 任务 ID | 任务名 | 触发时间 | 监控内容 | 推送方式 |
|--------|--------|---------|---------|---------|
| `stock-conditional-monitor` | 条件单监控 | 每 5 分钟（盘中） | 价格触发 | 立即 🔴 |
| `stock-position-monitor-intraday` | 盘中监控 | 每 30 分钟（9:30-15:00） | 舆情/黑天鹅 | 阈值触发 🔴 |
| `stock-position-monitor-daily` | 盘后日报 | 20:00 | 7 因子/持仓汇总 | 日报 ⚪ |
| `stock-position-morning-brief` | 盘前关注 | 08:30 | 隔夜市场/今日关注 | 日报 ⚪ |

### Cron 配置（HEARTBEAT.md）
```json
{
  "name": "持仓监控 - 盘中",
  "schedule": { "kind": "cron", "expr": "*/30 9-15 * * *" },
  "payload": { 
    "kind": "agentTurn",
    "message": "运行持仓监控脚本：node scripts/monitor-positions.mjs --mode=intraday"
  },
  "sessionTarget": "isolated"
}
```

---

## 🎨 UI 设计

### portfolio.html 新增标签页
```
账户管理 | 持仓监控 | 条件单 | 交易记录
────────────────────────────────────
持仓监控
────────────────────────────────────

┌─────────────────────────────────────┐
│ 筛选：[全部] [卖出信号] [预警] [买入] │
│                                      │
│ 📊 监控概览                          │
│ 持仓股票：5 只                        │
│ 今日信号：3 个（🔴1 🟡2 🟢0）         │
│                                      │
│ 📋 信号列表                          │
│ ┌─────────────────────────────────┐ │
│ │ 2026-03-22 14:30 🔴            │ │
│ │ 宁德时代 - 负面新闻 3 条          │ │
│ │ [查看详情] [设置条件单]         │ │
│ ├─────────────────────────────────┤ │
│ │ 2026-03-22 09:00 🟡            │ │
│ │ 隆基绿能 - 7 因子↓18%            │ │
│ │ [查看详情] [查看分析]           │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 📋 实施计划

### P0（2026-03-22 完成）
| 任务 | 文件 | 状态 |
|------|------|------|
| 数据库表创建 | api/init-database.js | ⏳ 待开发 |
| 信号生成模块 | api/position-signals.js | ⏳ 待开发 |
| 持仓监控脚本 | scripts/monitor-positions.mjs | ⏳ 待开发 |
| UI 标签页 | portfolio.html | ⏳ 待开发 |
| 定时任务配置 | HEARTBEAT.md | ⏳ 待开发 |

### P1（2026-03-23 完成）
| 任务 | 文件 | 状态 |
|------|------|------|
| 盘中 30 分钟监控 | scripts/monitor-sentiment.mjs | ⏳ 待规划 |
| 盘前日报生成 | scripts/monitor-morning.mjs | ⏳ 待规划 |
| 历史信号查询 UI | portfolio.html | ⏳ 待规划 |

---

## ✅ 验收标准

### 功能验收
- [ ] 数据库表 position_signals 创建成功
- [ ] 信号生成逻辑正确（阈值符合设计）
- [ ] 定时任务配置正确并执行
- [ ] UI 标签页可以查看历史信号
- [ ] 飞书推送格式符合模板设计

### 性能验收
- [ ] 监控脚本执行时间 < 30 秒
- [ ] 信号推送延迟 < 1 分钟
- [ ] 日报生成时间 < 10 秒

### 数据验收
- [ ] 持仓数据正确读取
- [ ] 7 因子评分正确对比
- [ ] 历史信号正确保存

---

## 📝 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0.0 | 2026-03-22 | 初始设计文档 | 灵爪 |

---

## 🔗 相关文档

- [项目操作规范](../../skills/项目操作规范/SKILL.md)
- [7 因子评分设计](analysis-factors-weights.md)
- [舆情分析设计](tasks/TASK_P0_SENTIMENT_001.md)
- [条件单设计](DESIGN_CONSENSUS.md)
