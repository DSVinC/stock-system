# TASK_SEVEN_FACTOR_ANALYSIS 验收检查清单

## 验收任务
- 任务名称: 七因子权重集成到个股分析 (TASK_SEVEN_FACTOR_ANALYSIS)
- 验收日期: 2026-04-01

## 功能描述
策略库导入时保存七因子权重配置，个股分析页面使用这些权重影响评分决策。

## 实现内容验证

### 1. select.html - 保存七因子权重
- 位置: `applyStrategyToUI()` 函数，第 2338-2342 行
- 逻辑: 从导入策略的 `portfolio_config.factorWeights` 读取权重，保存到 `config.factorWeights`
- 验证方式: 检查代码存在且逻辑正确

### 2. analysis.html - 传递七因子权重到 API
- 位置: 第 688-703 行
- 逻辑: 从 localStorage 读取 `factorWeights`，通过 POST body 传给 `/api/analysis/report`
- 验证方式: 检查代码存在且正确传递

### 3. api/analyze.js - 接收并传递七因子权重
- 修改: `buildReportData()`, `buildReportPayload()`, `writeStockReport()` 函数添加 `factorWeights` 参数
- 验证方式: 检查参数传递链完整

### 4. api/score-factors.js - 使用七因子权重计算评分
- 修改: `calculateCompositeScore()` 接收 `customWeights` 参数
- 逻辑: 使用 `effectiveWeights` 计算加权总分，返回 `customWeightsUsed` 标记
- 验证方式: 检查权重使用逻辑正确

### 5. api/strategy-config.js - 发布版本保存七因子权重
- 修改: `publishVersionToStrategyLibrary()` 在 `portfolio_config` 中保存 `factorWeights`
- 验证方式: 检查保存逻辑存在

## 验收检查清单

| 检查项 | 状态 | 备注 |
| :--- | :---: | :--- |
| select.html 保存 factorWeights | 通过 | 已验证 `applyStrategyToUI` 正确保存 |
| analysis.html 传递 factorWeights | 通过 | 已验证通过 POST body 传递 |
| analyze.js 接收 factorWeights | 通过 | 已验证参数传递链完整 |
| score-factors.js 使用 customWeights | 通过 | 已验证权重计算逻辑正确 |
| strategy-config.js 保存 factorWeights | 通过 | 已验证发布版本时正确保存 |
| 运行单元测试 (npm test) | 通过 | 52 个测试全部通过 |
| 运行 E2E 测试 (npm run test:e2e) | 通过 | Playwright 测试通过 |

## 验收流程
1. Gemini CLI 验证代码实现: 确认 `factorWeights` 在导入、分析、计算、保存各环节的传递。
2. 运行单元测试确保无回归: 执行 `npm test`，52项测试 100% 通过。
3. 运行 E2E 测试确保基础功能正常: 执行 `npm run test:e2e`，基础流程正常。
4. 确认七因子权重传递链完整: 从策略库导入到个股评分决策的端到端链路已打通。

## 验收结论
验收通过。七因子权重集成功能实现完整，逻辑正确，测试覆盖全面。