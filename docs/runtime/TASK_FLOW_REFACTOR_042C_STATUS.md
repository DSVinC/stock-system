# TASK_FLOW_REFACTOR_042C 状态记录

## 任务
回测研究页与策略自迭代管理器收口“静默兜底 / 伪装成功”问题：

- 回测页开始/结束日期启用交易日禁用
- 选股时点统一为开始日期，移除独立录入
- 开始选股必须先选择策略
- 所有手动数值输入启用显式范围/精度校验
- 自迭代任务在无交易样本、无有效样本、未达阈值时改为无效结果/失败，不再伪装成完成

## 本次改动

### 前端
- `/Users/vvc/.openclaw/workspace/stock-system/backtest.html`
  - “开始选股”按钮移动到策略选择之后
  - `selectionDate` 改为只读说明，统一使用 `startDate`
  - `startDate/endDate` 使用 Flatpickr 交易日禁用
  - 增加统一 number 输入校验与错误提示
  - 未选策略时阻断选股
- `/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html`
  - “优化后端”增加说明文案
  - `maxIterations / scoreThreshold / parallelTasks` 增加前端数值校验
  - 无效结果展示为“无效结果”，不再显示成完成

### 后端
- `/Users/vvc/.openclaw/workspace/stock-system/api/iteration-manager.js`
  - heuristic / optuna 新增无效结果判定
  - 无交易样本 / 无有效样本 / 未达阈值时任务记为 `failed`
  - 无效任务不再保存为策略版本
  - `resultSummary` 增加 `invalidResult / invalidReason / invalidMessage / thresholdMet / tradeCount`

## 验收证据

### 语法
- `node --check api/iteration-manager.js` 通过
- `backtest.html` 内联脚本语法检查通过
- `iteration-manager.html` 内联脚本语法检查通过

### 浏览器 / API 验收
- `/Users/vvc/.openclaw/workspace/stock-system/temp/backtest-validation-report.json`
  - `flatpickrVisible: true`
  - `selectionDateDisabled: true`
  - `runSelectionButtonAfterStrategy: true`
  - `strategyRequiredError: 请先选择策略，再开始选股`
  - `pegValidationMessage: PEG 最大值 ⓘ最多保留 1 位小数`
- `/Users/vvc/.openclaw/workspace/stock-system/temp/iteration-validation-report.json`
  - 非整数 `maxIterations=1.5` 被前端阻断
  - `statusBadge: 无效结果`
  - `bestConfig` 显示“无有效结果”与“无有效交易样本”原因
- API 直接验收
  - heuristic 单轮测试任务 `ITER_1774685340554_2t3lpz`
  - 最终 `status: failed`
  - `invalidReason: no_trade_samples`
  - 不再出现旧的 `completed + 50.0` 假成功

### 截图
- `/Users/vvc/.openclaw/workspace/stock-system/temp/screenshots/validation-fix/backtest-validation.png`
- `/Users/vvc/.openclaw/workspace/stock-system/temp/screenshots/validation-fix/iteration-validation.png`

## 结论
- 回测页：本轮问题已修复
- 自迭代页：本轮问题已修复
- 残留观察：
  - 回测页浏览器脚本这次未稳定抓到 `selectionResultInfo` 文本，但同参数直调 `/api/select` 已返回 `10` 个方向且首个方向 `3` 只股票，说明本轮修复不阻断正常选股
