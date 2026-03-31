# TASK_SELECT_IMPORT_002: 四维度权重映射到选股 API

**优先级**: 🔴重要紧急  
**预估工时**: 2h  
**开发者**: Claude Code  
**验收员**: Gemini CLI  

---

## 任务描述

将策略库中的四维度权重参数应用到选股 API 调用中，使导入不同策略后选股结果能反映权重差异。

## 需求背景

- 当前 `applyStrategyToUI()` 只应用了 `seven_factor_min_score` 一个参数
- 策略库中有四维度权重字段（policy_weight, commercialization_weight, sentiment_weight）
- 后端 `select.js` 已支持接收 `dimensionWeights` 参数并用于行业评分计算
- 前端 `loadSelectionData()` 未发送该参数到后端

## 设计参考

- 设计文档：`docs/design/2026-03-29-seven-factor-optimization-engineering-plan.md` 附录 C.1
- 策略库表：`strategy_configs` (policy_weight, commercialization_weight, sentiment_weight)
- 后端 API: `GET /api/select` (已支持 `dimensionWeights` 参数)

## 交付物

- [ ] `select.html` - 修改 `applyStrategyToUI()` 应用四维度权重
- [ ] `select.html` - 修改 `loadSelectionData()` 发送 `dimensionWeights` 到后端
- [ ] 自测报告

## 验收标准

1. 导入不同四维度权重的策略后，Top3 行业排序有变化
2. `config.dimensionWeights` 正确保存到 localStorage
3. API 请求中包含 `dimensionWeights` 参数
4. 后端日志显示接收到权重参数

## 相关文件

- 前端：`select.html`
- 后端：`api/select.js` (已支持，无需修改)
- 设计：`docs/design/2026-03-29-seven-factor-optimization-engineering-plan.md`

---

**创建时间**: 2026-03-31 16:30  
**状态**: pending
