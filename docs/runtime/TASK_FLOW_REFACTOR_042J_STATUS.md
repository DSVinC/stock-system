# TASK_FLOW_REFACTOR_042J 状态记录

## 任务
清理开发期遗留脏数据，保证交付环境中的监控池和条件单列表不混入测试假数据与重复旧单。

## 完成时间
2026-03-28 19:10

## 清理范围

### 已删除的假数据
- 监控池：
  - `111111.SZ / 测试反馈股`
  - `222222.SZ / 分析链路测试股`
  - `333333.SZ / 完整流程测试股`
- 条件单：
  - `111111.SZ / 测试反馈股`
  - `333333.SZ / 完整流程测试股`

### 已删除的重复旧条件单
- `300308.SZ / 中际旭创`
  - 删除历史重复旧单 `id=2,3,4,5,6,13,14,15`
  - 保留当前有效记录 `id=16`

## 保留的数据
- `strategy_configs.id = 6` 已发布七因子版本
- `conditional_order.id = 23` 中国联通导入生成的真实条件单
- `conditional_order.id = 22` 中国电信执行反馈样本对应条件单
- `execution_feedback.version_id = ITER_1774694107289_wnfrdb` 发布闭环所需执行反馈样本

## 备份
- 已创建数据库备份：
  - `temp/db-backups/stock_system_before_dirty_cleanup_20260328_1908.db`

## 验收结果

### 数据库校验
- `monitor_pool` 中假股票数量：`0`
- `conditional_order` 中假股票数量：`0`
- `conditional_order` 中 `300308.SZ` 记录数：`1`

### 浏览器校验
- `monitor-pool.html`
  - 当前仅展示 7 条真实记录
  - 不再出现测试假股票
- `conditional-order.html`
  - 当前仅展示 4 条记录
  - 不再出现测试假股票和中际旭创重复旧单

## 结论
开发期脏数据已清理完成，当前列表口径已收敛到可交付状态。
