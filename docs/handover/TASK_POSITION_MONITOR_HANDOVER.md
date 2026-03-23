# TASK_POSITION_MONITOR - 交接文档

**任务 ID**: TASK_POSITION_MONITOR  
**创建时间**: 2026-03-23 00:16  
**类型**: P0 持仓监控功能  

---

## 📋 任务概述

为股票系统添加持仓监控功能，监控已持仓股票的基本面、舆情、价格变化，出现异常时飞书推送告警。

**持仓数据**（已录入）:
| 股票 | 代码 | 股数 | 成本 |
|------|------|------|------|
| 中际旭创 | 300308.SZ | 500 | 565.72 |
| 蓝色光标 | 300058.SZ | 500 | 18.78 |
| 德赛西威 | 002920.SZ | 1500 | 125.02 |

---

## 🎯 子任务清单

### TASK_POSITION_MONITOR_001 - 数据库表创建
**文件**: `database/migrations/004_position_signals.sql`  
**验收标准**: position_signals 表创建成功，索引正确

### TASK_POSITION_MONITOR_002 - 信号生成模块
**文件**: `api/position-signals.js`  
**功能**:
- generateSignals(holding, currentFactors, historicalFactors, news)
- 阈值：7 因子↓30% 告警，↓15% 预警；负面新闻≥3 条告警
- saveSignal(signal) 保存到数据库

### TASK_POSITION_MONITOR_003 - 持仓监控脚本
**文件**: `scripts/monitor-positions.mjs`  
**功能**:
- 获取所有持仓股票（quantity > 0）
- 对每只股票调用 position-signals.js 生成信号
- 有信号时飞书推送，无信号时不推送

### TASK_POSITION_MONITOR_004 - UI 标签页
**文件**: `portfolio.html`  
**功能**:
- 新增"持仓监控"标签页
- 展示当前持仓监控状态
- 历史信号列表（支持筛选）

### TASK_POSITION_MONITOR_005 - 定时任务配置
**文件**: `HEARTBEAT.md`  
**功能**:
- stock-position-monitor-daily: 20:00 盘后日报
- stock-position-monitor-intraday: 每 30 分钟盘中监控
- stock-position-morning-brief: 08:30 盘前关注

---

## 📊 开发流程

1. **Claude Code 开发**: 并行创建所有文件
2. **PR 评论 @codex**: 提交验收评论
3. **3 分钟检查**: 检查 PR 结果
4. **修复**: 根据 Codex 评论修复
5. **Gemini 验收**: 提交 Gemini CLI 验收
6. **浏览器验收**: 灵爪用浏览器功能验收

---

## 🔗 相关文档

- [设计文档](../design/POSITION_MONITOR_DESIGN.md)
- [项目操作规范](../../skills/项目操作规范/SKILL.md)

---

**最后更新**: 2026-03-23 00:16
