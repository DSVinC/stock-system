# TASK_ANALYZE_STRUCT_003 任务分配

**分配时间**: 2026-03-25 10:48  
**分配人**: 灵爪（项目经理）  
**负责人**: Claude Code  
**验收人**: Codex  
**优先级**: P0  
**依赖**: TASK_ANALYZE_STRUCT_002（并行开发，但需等 002 完成后联调）

---

## 📋 任务描述

改造 `stock-system/api/analysis.js`，适配 stock_analyzer.py 输出的 v2 结构化数据，同时保持向后兼容。

**文件位置**: `/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js`

---

## 🎯 验收标准

### 1. API 接口改造
- [ ] 保留原 `/api/analyze/report` 接口（v1 兼容）
- [ ] 新增 `/api/v2/analyze/report` 接口（v2 结构化）
- [ ] 新增 `/api/v2/analyze/strategy/:ts_code/:riskType` 接口（条件单导入用）

### 2. 数据格式检测
- [ ] 自动检测 stock_analyzer.py 输出格式（v1/v2）
- [ ] v1 格式自动降级处理
- [ ] v2 格式直接返回

### 3. 缓存兼容
- [ ] 缓存支持版本隔离（v1/v2）
- [ ] 缓存 key 格式：`${version}:${stockCode}`

---

## 📁 交付物

- [ ] `api/analysis.js` - 修改后的 API 模块
- [ ] API 测试通过日志
- [ ] 交接文档 `docs/handover/TASK_ANALYZE_STRUCT_003_HANDOVER.md`

---

## 🔧 实施步骤

1. **读取 TASK_ANALYZE_STRUCT_002 的输出格式** - 了解 v2 schema
2. **新增 v2 接口** - `/api/v2/analyze/report`
3. **添加格式检测逻辑** - 自动判断 v1/v2
4. **实现缓存版本隔离** - 修改 getCachedReport/setCachedReport
5. **自测** - 使用测试股票验证 API
6. **生成交接文档**

---

## ⏱️ 预计工时

2-3 小时（需与 002 任务联调）

---

## 📝 注意事项

- 与 TASK_ANALYZE_STRUCT_002 并行开发，但需等 002 完成后联调
- 保持向后兼容
- 完成后通知灵爪安排 Codex 验收

---

*任务分配完成，等待 Claude Code 确认接收*
