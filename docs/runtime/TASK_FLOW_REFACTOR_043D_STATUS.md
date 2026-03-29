# TASK_FLOW_REFACTOR_043D 状态记录

- 时间：2026-03-29
- 范围：`scripts/optuna_optimizer.py`、`iteration-manager.html`

## 背景

在 `043C` 后，七因子自动迭代已能搜索完整参数结构，但浏览器验收中出现两类工程性问题：

1. 个别任务会长时间停留 `running 0/20`，观感像卡死  
2. 页面参数摘要虽然已有改进，但需要实测确认“自动产出的嵌套权重”在 UI 可见

## 本轮修复

### 1. 增加 real_score_cli trial 超时保护

- 文件：`scripts/optuna_optimizer.py`
- 新增：`REAL_SCORE_TIMEOUT_SECONDS = 45`
- `subprocess.run(..., timeout=45)`，单 trial 超时后返回 `-1`，不再拖挂整条任务

效果：

- 迭代任务不再因单轮评分异常阻塞在 `running`
- 最终可稳定落 `completed/failed` 终态

### 2. 浏览器实测：七因子 2-trial 快速闭环

入口参数：

- 策略：`seven_factor`
- 股票池：`600354.SH,002041.SZ,600617.SH,605368.SH,600681.SH,000407.SZ,001299.SZ,002040.SZ,600018.SH,601298.SH`
- 区间：`2020-01-09 ~ 2024-12-31`
- backend：`optuna`
- `maxIterations=2`

任务：

- `ITER_1774724164656_73owxo`
- 终态：`failed`（阈值 70 下最佳分 43.0）
- 进度：`2 / 2`

关键验证点：

- 任务已从 `running` 正常收敛到终态
- 页面“当前最佳配置”已展示完整嵌套参数 JSON：
  - `dimensionWeights`
  - `factorWeights`
  - `pe_max / peg_max / max_price`
  - `min_seven_factor_score`
- 版本历史 `V10` 参数摘要已显示扁平化后的权重字段（例如 `dimensionWeights.social`、`factorWeights.trend`）

## 数据库验收结果

最新任务列表（按创建时间倒序）：

- `ITER_1774724164656_73owxo | failed | 2/2 | 43.0`
- `ITER_1774723888317_0e6lo5 | failed | 20/20 | 67.0`
- `ITER_1774718703327_eup92a | completed | 20/20 | 93.0`

说明：

- 七因子链路当前已可稳定“启动 -> 收敛 -> 入库”
- 结果是否达标由阈值与样本决定，不再出现无终态挂起

## 证据

- 浏览器快照：`.playwright-cli/page-2026-03-28T18-56-57-253Z.yml`
- 任务创建日志：`[02:56:04] ✅ 任务已创建: ITER_1774724164656_73owxo`
- 终态日志：`[02:56:26] ❌ 无有效结果: 最佳得分 43.0 未达到阈值 70.0`

## 下一步

1. 进入样本外验证最小闭环（IS/OOS 字段先落地）
2. 在版本历史中补“样本内分数 vs 样本外分数”的并列展示
3. 将发布门槛从“仅 bestScore”升级为“bestScore + OOS 约束”
