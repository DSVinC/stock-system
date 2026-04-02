# 任务分配单：TASK_MOCK_003

**任务名称**: 绩效计算脚本  
**优先级**: P0  
**预计工时**: 3h  
**状态**: completed  

---

## 任务描述

实现每日绩效计算脚本，聚合 mock_trade 数据并计算绩效指标。

## 核心功能

1. **绩效指标计算**
   - 总收益率、年化收益率
   - 最大回撤、波动率
   - 夏普比率、索提诺比率、卡玛比率
   - 胜率、盈亏比、平均持仓周期

2. **偏差分析**
   - 对比回测总收益
   - 计算 backtest_deviation
   - 检测是否超过 20% 阈值

3. **每日自动执行**
   - 定时任务：每日 20:00（盘后）
   - 为每个 active 账户计算绩效

## 脚本文件

`scripts/calculate_mock_performance.mjs`

## 验收标准

- [x] 绩效指标计算正确
- [x] 偏差分析正确
- [x] mock_performance 记录正确写入
- [x] 定时任务配置正确
- [x] 手动执行测试通过

## 相关文件

- `scripts/calculate_mock_performance.mjs` - 绩效计算脚本
- `docs/design/2026-04-01-mock-account-design.md` - 完整设计

## 完成说明（2026-04-01）

- 新增 `scripts/calculate_mock_performance.mjs`：
  - 聚合 `mock_trade/mock_position/mock_account`
  - 计算总收益、年化、回撤、波动、夏普、索提诺、卡玛、胜率、盈亏比、换手率、交易成本等
  - 对比 `strategy_versions` 的回测指标并输出偏差字段
  - 写入 `mock_performance`
- 新增定时配置：`cron/mock-performance-daily.json`（每日 20:00）
- 新增执行脚本：`npm run mock:performance`
- 已完成手工验收：构造测试账户与交易后运行脚本，`mock_performance` 成功落库并完成测试数据清理。

---

**创建时间**: 2026-04-01  
**创建者**: 灵爪
