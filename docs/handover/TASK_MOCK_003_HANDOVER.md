# TASK_MOCK_003 - 模拟绩效计算脚本 - 交接文档

**创建时间**: 2026-04-02 08:40  
**开发者**: Codex  
**状态**: 已完成

---

## 任务目标
实现模拟账户绩效每日计算，产出偏差指标，作为二次迭代触发依据。

## 实施结果
新增脚本：
- `scripts/calculate_mock_performance.mjs`

新增调度配置：
- `cron/mock-performance-daily.json`（`0 20 * * *`, `Asia/Shanghai`）
- `package.json` 增加对应脚本入口

指标落库：
- 收益、回撤、夏普、Sortino、Calmar、胜率、盈亏比、换手率等
- 偏差字段：`backtest_deviation / drawdown_deviation / win_rate_deviation / is_deviation_exceeded / is_sample_valid`

## 验证结果
- `node --check scripts/calculate_mock_performance.mjs` 通过
- 手动执行并写入 `mock_performance` 通过
- 测试数据已清理

## 交接说明
- 脚本默认按“实时数据日”计算，不依赖快照日。
- 后续如果切换数据源，需优先保持偏差字段口径稳定，避免触发器误判。

## 相关文件
- `scripts/calculate_mock_performance.mjs`
- `cron/mock-performance-daily.json`
- `package.json`
- `docs/tasks/TASK_MOCK_003_ASSIGNMENT.md`
- `docs/runtime/TASK_MOCK_003_STATUS.md`
- `memory/project/stock_system/2026-04-01T22-27-00-task-mock-003.json`
