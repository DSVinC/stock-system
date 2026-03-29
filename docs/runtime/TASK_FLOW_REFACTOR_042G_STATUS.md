# TASK_FLOW_REFACTOR_042G 状态记录

## 时间
- 2026-03-28 17:28

## 目标
- 将“无执行反馈样本的版本不可发布”规则正式落到前端与后端。

## 本次变更
- `/api/iteration/versions/:strategyType`
  - 新增 `has_execution_sample`
  - `can_publish` 改为仅当存在执行样本时才为 `true`
  - 无样本版本补充 `publish_blocked_reason`
- `iteration-manager.html`
  - 对“有回测分但无执行样本”的版本显示 `待验证样本`
  - 添加“发布限制”说明
  - 发布按钮统一禁用为 `🚫 不可发布`
  - `publishVersion()` 在前端再次拦截无样本版本
- `/api/strategy-config/publish-version`
  - 后端新增硬校验：`total_trades <= 0` 或 `status = no_data` 时返回 `409`

## 验收证据
- 单测：
  - `node test/strategy-config-publish-version.test.js`
  - 27/27 通过
- 真实接口：
  - 选取 `can_publish = false` 的版本直调 `POST /api/strategy-config/publish-version`
  - 返回 `409`
  - 错误信息：`该版本尚无执行反馈样本，暂不允许发布到策略库`
- 浏览器：
  - 版本历史前 5 条中，除旧 `50 分` 无效记录外，其余 `73.0 / 63.0 / 93.0 / 57.0` 等无样本版本均显示 `待验证样本`
  - 发布按钮均为禁用态 `🚫 不可发布`

## 结论
- 研究流版本现在只有在存在执行反馈样本时才允许发布到策略库。
- “缺样本”和“旧 50 分假结果”已拆分成两种不同语义：
  - `无效历史结果`
  - `待验证样本`
