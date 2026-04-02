# TASK_MOCK_003 实时状态

**任务名称**: 绩效计算脚本  
**优先级**: P0  
**状态**: completed  
**创建时间**: 2026-04-01  

---

## 进度

- [x] 脚本开发
- [x] 指标计算落地
- [x] 偏差分析落地
- [x] 定时任务配置
- [x] 本地验收通过

## 变更日志

| 时间 | 事件 | 详情 |
|------|------|------|
| 2026-04-01 22:25 | 脚本落地 | 新增 `scripts/calculate_mock_performance.mjs` |
| 2026-04-01 22:26 | 运行入口 | `package.json` 新增 `mock:performance` |
| 2026-04-01 22:26 | 定时配置 | 新增 `cron/mock-performance-daily.json`（20:00） |
| 2026-04-01 22:27 | 本地验收 | 构造 mock 账户+交易后执行脚本，`mock_performance` 写入成功 |
| 2026-04-01 22:27 | 清理完成 | 测试账号及关联 `mock_*` 数据全部清理 |

## 验收记录

- 语法检查：`node --check scripts/calculate_mock_performance.mjs` ✅
- 手工执行：
  - `node scripts/calculate_mock_performance.mjs --account-id=<test_account>` ✅
  - 输出 `inserted_count=1`，并可查询到 `mock_performance` 新记录 ✅
- 关键字段：
  - `total_return / annualized_return / max_drawdown / volatility`
  - `sharpe_ratio / sortino_ratio / calmar_ratio`
  - `backtest_deviation / drawdown_deviation / win_rate_deviation`
  - `is_deviation_exceeded / is_sample_valid`

## 相关文档

- 分配单：`docs/tasks/TASK_MOCK_003_ASSIGNMENT.md`
- 进度总览：`docs/PROJECT_PROGRESS.md`
- 设计文档：`docs/design/2026-04-01-mock-account-design.md`
