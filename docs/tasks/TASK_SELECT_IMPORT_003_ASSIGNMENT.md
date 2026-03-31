# TASK_SELECT_IMPORT_003: PE/PEG 上限映射到选股 API

**优先级**: 🔴重要紧急  
**预估工时**: 1.5h  
**开发者**: Claude Code  
**验收员**: Gemini CLI  

---

## 任务描述

将策略库中的 PE/PEG 上限参数应用到选股 API 调用中，使导入策略后能按估值筛选个股。

## 需求背景

- 策略库中有 `pe_max` 和 `peg_max` 字段
- 后端 `select.js` 已支持接收 `peMax` 和 `pegMax` 参数
- 前端未映射和应用这些参数

## 设计参考

- 设计文档：`docs/design/2026-03-29-seven-factor-optimization-engineering-plan.md` 附录 C.2
- 策略库表：`strategy_configs` (pe_max, peg_max)
- 后端 API: `GET /api/select` (已支持 `peMax`, `pegMax` 参数)

## 交付物

- [ ] `select.html` - 修改 `applyStrategyToUI()` 应用 PE/PEG 上限
- [ ] `select.html` - 修改 `loadSelectionData()` 发送 `peMax`, `pegMax` 到后端
- [ ] 自测报告

## 验收标准

1. 导入不同 PE/PEG 上限的策略后，选股结果有变化
2. `config.peMax` 和 `config.pegMax` 正确保存到 localStorage
3. API 请求中包含 `peMax` 和 `pegMax` 参数
4. 后端日志显示接收到参数

## 相关文件

- 前端：`select.html`
- 后端：`api/select.js` (已支持，无需修改)
- 设计：`docs/design/2026-03-29-seven-factor-optimization-engineering-plan.md`

---

**创建时间**: 2026-03-31 16:30  
**状态**: pending
