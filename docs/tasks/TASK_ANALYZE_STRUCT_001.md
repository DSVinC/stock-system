# TASK_ANALYZE_STRUCT_001 - 结构化 strategies schema 设计

**任务 ID**: TASK_ANALYZE_STRUCT_001  
**创建时间**: 2026-03-23  
**优先级**: P0  
**状态**: in_progress  
**项目经理**: 灵爪  
**程序员**: Gemini CLI  
**验收员**: Gemini CLI / Codex

---

## 📋 任务概述

设计并实现 stock_analyzer.py 的结构化 strategies 输出 schema，替代当前的纯文本输出，便于下游模块（方向股列表、条件单）直接使用。

---

## 🎯 验收标准

1. **Schema 设计**: 定义 aggressive/balanced/conservative 三种策略的结构化输出
2. **Python 实现**: 修改 stock_analyzer.py 输出结构化 JSON
3. **向后兼容**: 保留 v1 格式输出，新增 v2 格式
4. **测试验证**: 运行脚本验证输出格式正确

---

## 📁 交付物

- `docs/research/strategies_schema.md` - Schema 设计文档
- `stock_analyzer.py` - 修改后的分析脚本
- `docs/runtime/TASK_ANALYZE_STRUCT_001_STATUS.md` - 运行状态
- `docs/handover/TASK_ANALYZE_STRUCT_001_HANDOVER.md` - 交接文档
