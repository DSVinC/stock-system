# TASK_BACKTEST_003 - 回测报告生成

**创建时间**: 2026-03-23 09:15  
**优先级**: P0  
**负责人**: Claude Code  
**验收员**: Gemini CLI  
**状态**: in_progress  

---

## 📋 任务描述

实现回测报告生成功能，支持 HTML 可视化报告和 Markdown 文本报告。

---

## 🎯 验收标准

- [ ] 回测完成后可查看报告
- [ ] 报告包含收益率、夏普比率、最大回撤等关键指标
- [ ] 报告包含可视化图表（收益率曲线、回撤曲线）

---

## 📝 实现要求

### 1. HTML 报告

- 收益率曲线图
- 回撤曲线图
- 持仓分布图
- 关键指标表格

### 2. Markdown 报告

- 回测概要
- 收益统计
- 交易记录
- 结论建议

### 3. 保存路径

报告保存到 `report/backtest/{backtest_id}/` 目录

---

## 📁 交付物

1. `api/backtest.js` - 报告生成接口
2. `report/backtest/` - 报告目录
3. `docs/handover/TASK_BACKTEST_003_HANDOVER.md`
4. `docs/acceptance/TASK_BACKTEST_003_ACCEPTANCE.md`

---

## 🔗 相关文件

- 父任务：`docs/tasks/TASK_BACKTEST_SYSTEM_001.md`
- 状态文件：`docs/runtime/TASK_BACKTEST_003_STATUS.md`
