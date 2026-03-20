# 股票投资系统 - 工作日志登记制度

> **版本**: v1.0  
> **创建**: 2026-03-19  
> **适用范围**: 所有项目成员

---

## 🎯 制度目标

1. **可追溯**：任何工作都有记录，便于后续跟进
2. **可对齐**：多角色协作时信息同步
3. **可复盘**：项目结束后能总结经验

---

## 📋 日志类型与要求

### 类型1：任务分配日志

**触发时机**：项目经理分配任务时

**记录内容**：
```json
{
  "timestamp": "2026-03-19T10:00:00+08:00",
  "event_type": "task_assignment",
  "author": "项目经理",
  "task_id": "TASK_16",
  "assignee": "Codex",
  "summary": "分配盘后监控任务给Codex",
  "details": {
    "requirements": "实现盘后基本面变化监控",
    "deadline": "2026-03-20T18:00:00+08:00",
    "acceptance_criteria": ["单元测试通过", "飞书推送正常"]
  },
  "related_files": ["docs/tasks/TASK_16_ASSIGNMENT.md"]
}
```

**存储位置**：`memory/project/stock_system/{timestamp}.json`

---

### 类型2：开发进度日志

**触发时机**：程序员完成阶段性工作时

**记录内容**：
```json
{
  "timestamp": "2026-03-19T14:00:00+08:00",
  "event_type": "development_progress",
  "author": "Codex",
  "task_id": "TASK_16",
  "summary": "完成盘后监控数据获取模块",
  "details": {
    "progress": "60%",
    "completed": ["公告数据获取", "财报数据获取", "新闻数据获取"],
    "pending": ["数据聚合", "飞书推送", "定时任务"],
    "blockers": []
  },
  "related_files": ["api/monitor-daily.js"]
}
```

**存储位置**：`memory/project/stock_system/{timestamp}.json`

---

### 类型3：开发完成日志

**触发时机**：程序员自测通过，准备提交验收

**记录内容**：
```json
{
  "timestamp": "2026-03-19T16:00:00+08:00",
  "event_type": "development_complete",
  "author": "Codex",
  "task_id": "TASK_16",
  "summary": "盘后监控功能开发完成",
  "details": {
    "test_results": "5/5 单元测试通过",
    "code_stats": {
      "lines": 450,
      "files": 2,
      "coverage": "85%"
    },
    "handover_doc": "docs/handover/TASK_16_HANDOVER.md"
  },
  "related_files": [
    "api/monitor-daily.js",
    "api/test_monitor-daily.js",
    "docs/handover/TASK_16_HANDOVER.md"
  ]
}
```

**存储位置**：`memory/project/stock_system/{timestamp}.json`

---

### 类型4：验收日志

**触发时机**：验收员完成验收时

**记录内容**：
```json
{
  "timestamp": "2026-03-19T18:00:00+08:00",
  "event_type": "acceptance",
  "author": "Gemini CLI",
  "task_id": "TASK_16",
  "summary": "盘后监控功能验收通过",
  "details": {
    "result": "passed",
    "test_results": "5/5 通过",
    "issues": [],
    "code_score": "8.5/10",
    "acceptance_report": "docs/acceptance/TASK_16_ACCEPTANCE.md"
  },
  "related_files": ["docs/acceptance/TASK_16_ACCEPTANCE.md"]
}
```

**存储位置**：`memory/project/stock_system/{timestamp}.json`

---

### 类型5：修复日志

**触发时机**：修复完成并重新提交时

**记录内容**：
```json
{
  "timestamp": "2026-03-19T20:00:00+08:00",
  "event_type": "bug_fix",
  "author": "Codex",
  "task_id": "TASK_16",
  "summary": "修复盘后监控飞书推送问题",
  "details": {
    "fixes": [
      {"issue": "飞书消息格式错误", "solution": "使用标准消息模板"}
    ],
    "test_results": "5/5 通过",
    "fix_doc": "docs/fixes/TASK_16_FIX_1.md"
  },
  "related_files": [
    "api/monitor-daily.js",
    "docs/fixes/TASK_16_FIX_1.md"
  ]
}
```

**存储位置**：`memory/project/stock_system/{timestamp}.json`

---

### 类型6：进度同步日志

**触发时机**：项目经理进行进度同步时

**记录内容**：
```json
{
  "timestamp": "2026-03-19T22:00:00+08:00",
  "event_type": "progress_sync",
  "author": "项目经理",
  "summary": "今日项目进度同步",
  "details": {
    "completed": ["TASK_16"],
    "failed": [],
    "pending_review": [],
    "blockers": {}
  },
  "related_files": ["memory/2026-03-19.md"]
}
```

**存储位置**：`memory/project/stock_system/{timestamp}.json`

---

## 🔄 日志登记流程

### 每次迭代必须登记

```
┌─────────────────────────────────────────────────────────────┐
│  任务启动 → 任务分配日志                                      │
│  开发中   → 开发进度日志（每2小时或关键节点）                  │
│  开发完成 → 开发完成日志                                      │
│  验收     → 验收日志                                          │
│  修复     → 修复日志                                          │
│  每日结束 → 进度同步日志                                      │
└─────────────────────────────────────────────────────────────┘
```

### 登记检查清单

- [ ] JSON格式正确
- [ ] timestamp使用ISO 8601格式
- [ ] event_type符合规范
- [ ] author明确（项目经理/Codex/Gemini CLI）
- [ ] task_id正确
- [ ] summary简洁明了
- [ ] details包含关键信息
- [ ] related_files路径正确

---

## 📊 日志查询规范

### 查看最新进展

```bash
# 列出最近5条日志
ls -lt memory/project/stock_system/*.json | head -5

# 查看特定任务的所有日志
grep -l "TASK_16" memory/project/stock_system/*.json

# 查看今天的所有日志
ls memory/project/stock_system/2026-03-19*.json
```

### 统计任务状态

```bash
# 统计各类型日志数量
grep -c "event_type.*acceptance" memory/project/stock_system/*.json
grep -c "event_type.*development_complete" memory/project/stock_system/*.json
```

---

## ⚠️ 违规处理

| 违规行为 | 处理方式 |
|----------|----------|
| 工作完成不登记日志 | 项目经理提醒补登 |
| 日志信息不完整 | 要求补充后重新提交 |
| 日志格式错误 | 退回修正 |
| 遗漏关键信息 | 追加补充日志 |

---

## 📝 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-03-19 | 初始版本，6种日志类型规范 |
