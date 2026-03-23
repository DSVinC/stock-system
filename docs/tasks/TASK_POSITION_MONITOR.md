# TASK_POSITION_MONITOR - 持仓监控功能

**任务 ID**: TASK_POSITION_MONITOR  
**创建时间**: 2026-03-22 23:58  
**优先级**: P0  
**状态**: 开发中  
**项目经理**: 灵爪  
**程序员**: Claude Code  
**验收员**: Gemini CLI / Codex

---

## 📋 任务概述

为股票系统添加持仓监控功能，监控已持仓股票的基本面、舆情、价格变化，出现异常时飞书推送告警。

**核心目标**：
1. 自动监控持仓股票（每天盘前 + 盘中 + 盘后）
2. 异常信号飞书推送（黑天鹅/负面新闻/7 因子恶化）
3. 保存历史信号到数据库（便于回溯）
4. UI 展示监控状态和信号历史

---

## 🎯 子任务分解

### TASK_POSITION_MONITOR_001 - 数据库表创建
**状态**: ⏳ 待开发  
**文件**: api/init-database.js 或 db/migrations/v0.6_add_position_signals.sql  
**验收标准**: position_signals 表创建成功，索引正确

### TASK_POSITION_MONITOR_002 - 信号生成模块
**状态**: ⏳ 待开发  
**文件**: api/position-signals.js  
**功能**:
- generateSignals(holding, currentFactors, historicalFactors, news)
- 阈值：7 因子↓30% 告警，↓15% 预警；负面新闻≥3 条告警
- saveSignal(signal) 保存到数据库
**验收标准**: 信号生成逻辑正确，阈值符合设计

### TASK_POSITION_MONITOR_003 - 持仓监控脚本
**状态**: ⏳ 待开发  
**文件**: scripts/monitor-positions.mjs  
**功能**:
- 获取所有持仓股票（quantity > 0）
- 对每只股票调用 position-signals.js 生成信号
- 有信号时飞书推送，无信号时不推送
**验收标准**: 脚本执行成功，推送正确

### TASK_POSITION_MONITOR_004 - UI 标签页
**状态**: ⏳ 待开发  
**文件**: portfolio.html  
**功能**:
- 新增"持仓监控"标签页
- 展示当前持仓监控状态
- 历史信号列表（支持筛选）
**验收标准**: UI 展示正确，数据加载正常

### TASK_POSITION_MONITOR_005 - 定时任务配置
**状态**: ⏳ 待开发  
**文件**: HEARTBEAT.md  
**功能**:
- stock-position-monitor-daily: 20:00 盘后日报
- stock-position-monitor-intraday: 每 30 分钟盘中监控
- stock-position-morning-brief: 08:30 盘前关注
**验收标准**: 定时任务配置正确，Gateway 重启后执行

---

## 📊 并行开发安排

```
项目经理（灵爪）
    ↓
分配任务给 Claude Code
    ↓
┌─────────────────────────────────────────┐
│ 并行开发：                              │
│  - TASK_POSITION_MONITOR_001（数据库）  │
│  - TASK_POSITION_MONITOR_002（信号生成）│
│  - TASK_POSITION_MONITOR_003（监控脚本）│
└─────────────────────────────────────────┘
    ↓
验收员（Gemini CLI）验收
    ↓
通过 → 合并 → 部署
不通过 → 修复 → 重新验收
```

---

## 📋 实施步骤

### Step 1: 数据库表创建
```bash
# 创建 migration 文件
cat > db/migrations/v0.6_add_position_signals.sql <<EOF
CREATE TABLE IF NOT EXISTS position_signals (...);
CREATE INDEX idx_signals_stock ON position_signals(stock_code);
...
EOF

# 执行 migration
node scripts/run-migration.js v0.6
```

### Step 2: 信号生成模块
```javascript
// api/position-signals.js
function generateSignals(holding, currentFactors, historicalFactors, news) {
  const signals = [];
  
  // 规则 1: 7 因子评分大幅下降
  const scoreDrop = (historicalFactors.total - currentFactors.total) / historicalFactors.total;
  if (scoreDrop > 0.3) {
    signals.push({ type: 'SELL', level: 'HIGH', reason: '7 因子评分下降...' });
  }
  if (scoreDrop > 0.15 && scoreDrop <= 0.3) {
    signals.push({ type: 'WARNING', level: 'MEDIUM', reason: '7 因子评分下降...' });
  }
  
  // 规则 2: 黑天鹅事件
  if (news.blackSwanEvents.length > 0) {
    signals.push({ type: 'SELL', level: 'HIGH', reason: '黑天鹅事件' });
  }
  
  // 规则 3: 负面新闻过多
  if (news.negativeCount >= 3) {
    signals.push({ type: 'SELL', level: 'HIGH', reason: '负面新闻' });
  }
  
  return signals;
}
```

### Step 3: 持仓监控脚本
```javascript
// scripts/monitor-positions.mjs
async function monitorPositions() {
  const holdings = await db.all(`
    SELECT DISTINCT stock_code, stock_name 
    FROM portfolio_position 
    WHERE quantity > 0
  `);
  
  for (const holding of holdings) {
    const signals = await monitorSingleHolding(holding);
    if (signals.length > 0) {
      await sendFeishuAlert(signals);
    }
  }
}
```

### Step 4: UI 标签页
```html
<!-- portfolio.html -->
<div class="tab-content" id="tab-monitor">
  <h2>持仓监控</h2>
  <div id="monitor-summary"></div>
  <div id="monitor-signals"></div>
</div>

<script>
async function loadMonitorSignals() {
  const result = await api('/api/monitor/signals?limit=50');
  // 渲染信号列表
}
</script>
```

### Step 5: 定时任务配置
```json
// HEARTBEAT.md
{
  "name": "持仓监控 - 盘后日报",
  "schedule": { "kind": "cron", "expr": "0 20 * * *" },
  "payload": { 
    "kind": "agentTurn",
    "message": "运行持仓监控脚本：node scripts/monitor-positions.mjs --mode=daily"
  },
  "sessionTarget": "isolated"
}
```

---

## ✅ 验收标准

### 功能验收
- [ ] position_signals 表创建成功
- [ ] 信号生成阈值正确（30%/15%/3 条）
- [ ] 监控脚本执行成功
- [ ] 飞书推送格式符合模板
- [ ] UI 标签页展示正常

### 性能验收
- [ ] 脚本执行时间 < 30 秒
- [ ] 推送延迟 < 1 分钟

### 数据验收
- [ ] 持仓数据正确读取
- [ ] 历史信号正确保存

---

## 📝 日志登记

### 任务分配日志
- **时间**: 2026-03-22 23:58
- **event_type**: task_assignment
- **内容**: 创建 TASK_POSITION_MONITOR，分配给 Claude Code

### 开发进度日志
- **时间**: 待更新
- **event_type**: development_progress
- **内容**: 待更新

### 开发完成日志
- **时间**: 待更新
- **event_type**: development_complete
- **内容**: 待更新

### 验收日志
- **时间**: 待更新
- **event_type**: acceptance
- **内容**: 待更新

---

## 🔗 相关文档

- [设计文档](design/POSITION_MONITOR_DESIGN.md)
- [项目操作规范](../../skills/项目操作规范/SKILL.md)
- [推送模板](design/POSITION_MONITOR_DESIGN.md#推送模板)

---

**最后更新**: 2026-03-22 23:58
