# TASK_ANALYZE_STRUCT_002 任务分配

**分配时间**: 2026-03-25 10:48  
**分配人**: 灵爪（项目经理）  
**负责人**: Claude Code  
**验收人**: Codex  
**优先级**: P0  

---

## 📋 任务描述

改造 `stock_analyzer.py` 脚本，使其输出结构化的 strategies 数据（v2 schema），同时保留向后兼容性。

**脚本位置**: `/Users/vvc/.openclaw/workspace/skills/a 股个股分析/scripts/stock_analyzer.py`

---

## 🎯 验收标准

### 1. 输出格式符合 v2 schema
- [ ] `strategies.aggressive/balanced/conservative` 为对象（非文本）
- [ ] 每个 strategy 包含 `actions` 数组
- [ ] 每个 action 包含 `sequence`, `action_type`, `trigger_conditions`, `position_percent`
- [ ] 保留 `summary_text` 字段用于 HTML 报告

### 2. 向后兼容
- [ ] v1 格式检测逻辑正常
- [ ] HTML 报告继续显示文本描述
- [ ] 现有 API 调用不报错

### 3. 数据一致性
- [ ] 方向股列表可正确解析操作建议
- [ ] 条件单界面可导入为配置
- [ ] 评分计算逻辑不变

---

## 📁 交付物

- [ ] `stock_analyzer.py` - 修改后的脚本（v2 输出）
- [ ] `stock_analyzer.py.v1` - v1 版本备份
- [ ] 自测通过截图/日志
- [ ] 交接文档 `docs/handover/TASK_ANALYZE_STRUCT_002_HANDOVER.md`

---

## 🔧 实施步骤

1. **备份 v1 版本**
2. **修改策略生成逻辑** - 从文本改为结构化对象
3. **添加 v1/v2 格式检测** - 自动判断输出格式
4. **自测** - 使用测试股票验证输出
5. **生成交接文档**

---

## ⏱️ 预计工时

2-3 小时

---

## 📝 注意事项

- 保持向后兼容，不要破坏现有 API
- 先备份 v1 版本
- 完成后通知灵爪安排 Codex 验收

---

*任务分配完成，等待 Claude Code 确认接收*
