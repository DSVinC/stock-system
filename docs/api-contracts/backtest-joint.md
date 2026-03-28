# API 契约：联合回测接口 (backtest/joint/run)

**路径**: `POST /api/backtest/joint/run`  
**创建日期**: 2026-03-26  
**最后更新**: 2026-03-26  
**相关任务**: `TASK_V4_FIX_003`, `TASK_V4_FIX_004`  
**负责人**: 开发 (Claude Code) + 验收 (Codex)

---

## 请求体参数

| 字段 | 类型 | 必填 | 默认值 | 说明 | 前端来源 |
|------|------|------|--------|------|----------|
| startDate | string | 是 | - | 开始日期 (YYYY-MM-DD) | `startDate` input |
| endDate | string | 是 | - | 结束日期 (YYYY-MM-DD) | `endDate` input |
| initialCapital | number | 是 | 1000000 | 初始资金 | `initialCash` input |
| coreWeight | number | 是 | 0.7 | 核心仓权重 (0-1) | `portfolioConfig.core` / 100 |
| satelliteWeight | number | 是 | 0.3 | 卫星仓权重 (0-1) | `portfolioConfig.satellite` / 100 |
| satelliteStock | string | 否 | - | 卫星仓股票代码 | 选股结果选择 |
| coreStrategy | object | 是 | - | 核心策略配置 | `strategyConfig` |
| gridConfig | object | 否 | - | 网格交易配置 | `gridConfig` |

## coreStrategy 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 策略类型 (double_ma/rsi/macd/bollinger/seven_factor) |
| params | object | 否 | 策略参数（因类型而异） |
| factorWeights | object | 否 | 七因子权重 (seven_factor 策略专用) |
| filters | object | 否 | 筛选条件 (PE、最低分等) |

## gridConfig 结构

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gridSize | number | 是 | 网格密度 (0-1) |
| maxPosition | number | 是 | 最大仓位 (0-1) |
| triggerThreshold | number | 是 | 触发阈值 (0-1) |

## 返回结构

| 字段 | 类型 | 必填 | 说明 | 前端用途 |
|------|------|------|------|----------|
| success | boolean | 是 | 是否成功 | 判断是否继续 |
| data | object | 是 | 回测结果 | 渲染图表 |
| data.metrics | object | 是 | 绩效指标 | 显示统计 |
| data.metrics.totalReturn | number | 是 | 总收益率 | 显示 |
| data.metrics.annualizedReturn | number | 是 | 年化收益率 | 显示 |
| data.metrics.maxDrawdown | number | 是 | 最大回撤 | 显示 |
| data.metrics.sharpeRatio | number | 是 | 夏普比率 | 显示 |
| data.metrics.calmarRatio | number | 是 | 卡尔玛比率 | 显示 |
| data.metrics.profitFactor | number | 是 | 盈亏比 | 显示 |
| data.trades | array | 是 | 交易记录 | 显示明细 |
| data.equityCurve | array | 是 | 资金曲线 | 绘制图表 |

## DOM 元素清单

| ID | 类型 | 用途 | 所在文件 |
|----|------|------|----------|
| strategySelect | select | 策略选择器 | `backtest.html` |
| startDate | input | 开始日期 | `backtest.html` |
| endDate | input | 结束日期 | `backtest.html` |
| initialCash | input | 初始资金 | `backtest.html` |
| portfolioConfig | div | 仓位配置 | `backtest.html` |
| gridConfig | div | 网格配置 | `backtest.html` |
| runBacktestBtn | button | 开始回测 | `backtest.html` |
| loading | div | 加载提示 | `backtest.html` |
| results | div | 结果容器 | `backtest.html` |

## 数据类型转换

| 前端格式 | 后端格式 | 转换逻辑 |
|----------|----------|----------|
| portfolioConfig.core (0-100) | coreWeight (0-1) | `/ 100` |
| gridSize (0-100) | gridSize (0-1) | `/ 100` |
| maxPosition (0-100) | maxPosition (0-1) | `/ 100` |
| triggerThreshold (0-100) | triggerThreshold (0-1) | `/ 100` |

## 边界条件

| 场景 | 输入 | 预期输出 |
|------|------|----------|
| 权重和≠1 | coreWeight + satelliteWeight ≠ 1 | 自动归一化或报错 |
| 无卫星股 | satelliteStock 为空 | 仅核心仓回测 |
| 日期无效 | startDate > endDate | 报错提示 |

## 变更记录

| 日期 | 变更内容 | 变更人 | 对方确认 |
|------|----------|--------|----------|
| 2026-03-26 | 初始契约创建 | Claude Code | 待验收 |
| 2026-03-26 | 修复字段名 (strategy→coreStrategy) | Claude Code | 待验收 |

---

## 验收签字

| 角色 | 姓名 | 日期 | 签字 |
|------|------|------|------|
| 开发 | Claude Code | 2026-03-26 | ✅ |
| 验收 | Codex | 待验收 | ⏳ |
