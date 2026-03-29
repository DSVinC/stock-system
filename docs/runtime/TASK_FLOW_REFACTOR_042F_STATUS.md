# TASK_FLOW_REFACTOR_042F 状态记录

## 时间
- 2026-03-28 17:20

## 目标
- 修正策略自迭代管理器中“无效结果仍显示 50 分”和“历史 0 交易旧版本仍像正常版本一样可发布”的展示口径问题。

## 本次变更
- `/api/iteration/versions/:strategyType` 为历史旧版本补充衍生字段：
  - `invalid_legacy_result`
  - `invalid_message`
  - `display_score`
  - `can_publish`
- 识别规则：
  - `execution_feedback_status = no_data`
  - `execution_summary` 三个关键计数均为 `0`
  - `backtest_score = 50`
- `iteration-manager.html` 调整展示：
  - 当前最佳配置在无效结果下不再显示 `50.0`，改为 `无效 / --`
  - 历史旧版本显示 `无效历史结果`
  - 历史旧版本发布按钮改为 `🚫 不可发布`

## 验收证据
- API 验证：
  - `GET /api/iteration/versions/seven_factor`
  - 返回的旧版本已标记 `invalid_legacy_result: true`
  - `display_score: null`
  - `can_publish: false`
- 浏览器验证：
  - 版本历史首条记录展示为 `无效`
  - 附带 `无效历史结果` 标签
  - 发布按钮为禁用态 `🚫 不可发布`
- 页面渲染函数验证：
  - 直接调用 `updateBestConfig(50, ..., invalidResult=true)` 后
  - 右侧“当前最佳配置”显示 `无有效结果`
  - badge 显示 `无效`
  - “最佳得分”位置显示 `--`

## 结论
- 该问题已补测并修复。
- 这次问题的根因是前一轮只验证了“任务状态判 invalid”，没有继续覆盖“历史结果展示口径”和“当前最佳配置渲染口径”。
