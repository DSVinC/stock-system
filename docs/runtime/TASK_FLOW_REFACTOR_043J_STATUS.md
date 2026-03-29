# TASK_FLOW_REFACTOR_043J 状态记录

- 记录时间: 2026-03-29 10:07 (Asia/Shanghai)
- 执行人: Codex
- 目标: 打通“任务失败原因 -> 版本历史展示”一致性，避免无效迭代被误读为普通版本

## 本轮完成

1. Optuna 样本数写回与空值拦截
- 修改 `api/iteration-manager.js`：
  - 将 Optuna 返回的 `trade_count` 回填到 `history.metrics.tradeCount/totalTrades`。
  - 当 `trade_count` 缺失（`null`）时，直接按 `invalid_optuna_result` 失败，不再放行。

2. 版本历史同步任务快照状态
- 修改 `api/iteration-manager.js`：
  - 新增 `enrichVersionsWithTaskSnapshot`。
  - 从 `iteration_task_runs` 读取 `result_summary_json`，将 `invalid_reason/invalid_message` 同步到版本列表。
  - 失败/无效快照统一强制 `can_publish=false`，`publish_blocked_reason` 对齐为失败原因文案。

3. 迭代管理页无效标签泛化
- 修改 `iteration-manager.html`：
  - 版本卡片从“仅识别 invalid_legacy_result”改为“识别任意 `invalid_reason`”。
  - 标签统一显示“无效结果”，并展示后端同步的失败原因说明。

## 验收证据

1. 规则验证
- 启动任务：`ITER_1774749913941_uhqcc9`（`double_ma`, 阈值 `60`）
- 最终结果：
  - `status=failed`
  - `bestScore=70`
  - `invalidReason=insufficient_trade_samples`
  - `tradeCount=2`
  - `nextAction=expand_sample_and_fix_constraints`

2. 版本历史接口校验
- `GET /api/iteration/versions/double_ma` 对该任务返回：
  - `invalid_reason=insufficient_trade_samples`
  - `can_publish=false`
  - `publish_blocked_reason` 为“有效交易样本不足（当前 2 笔，至少需要 5 笔）…”

3. 浏览器验收
- 打开 `iteration-manager.html`，版本卡片已出现“无效结果”标签
- 截图：`temp/screenshots/validation-fix/iteration-invalid-result-badge-20260329.png`

4. 回归测试
- `node --check api/iteration-manager.js` 通过
- `node test/iteration-manager-next-action-rules.test.js` 通过
- `node test/iteration-manager-next-action-readiness.test.js` 通过

## 产出文件

- `api/iteration-manager.js`
- `iteration-manager.html`
- `docs/runtime/TASK_FLOW_REFACTOR_043J_STATUS.md`
