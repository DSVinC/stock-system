# API 契约：选股接口 (select)

**路径**: `GET /api/select`  
**创建日期**: 2026-03-26  
**最后更新**: 2026-03-26  
**相关任务**: `TASK_V4_FIX_001`, `TASK_V4_FIX_002`  
**负责人**: 开发 (Claude Code) + 验收 (Codex)

---

## 查询参数

| 字段 | 类型 | 必填 | 默认值 | 说明 | 前端来源 |
|------|------|------|--------|------|----------|
| limit | number | 否 | 15 | 返回股票数量 | `selectionLimit` input |
| minSevenFactorScore | number | 否 | - | 最低因子分 (0-1) | `selectionMinScore` / 100 |
| decision | string | 否 | - | 决策类型 (buy/sell/hold) | `decision` select |
| strategy | string | 否 | seven_factor | 策略类型 | `strategySelect` value |
| peMax | number | 否 | - | 最大 PE | `pe_max` input |
| pegMax | number | 否 | - | 最大 PEG | `peg_max` input |

## 返回结构

| 字段 | 类型 | 必填 | 说明 | 前端用途 |
|------|------|------|------|----------|
| success | boolean | 是 | 是否成功 | 判断是否继续 |
| directions | array | 是 | 行业方向列表 | 渲染行业卡片 |
| directions[].name | string | 是 | 行业名称 | 显示行业名 |
| directions[].score | number | 是 | 行业评分 | 显示评分 |
| directions[].picks | array | 是 | 成分股列表 | 渲染股票卡片 |
| picks[].ts_code | string | 是 | 股票代码 | 唯一标识 |
| picks[].stock_name | string | 是 | 股票名称 | 显示 |
| picks[].seven_factor_score | number | 是 | 七因子评分 | 显示 |
| picks[].industry_name | string | 是 | 所属行业 | 显示 |
| picks[].industry_score | number | 是 | 行业评分 | 显示 |
| picks[].decision | string | 否 | 决策建议 | 显示决策 |
| picks[].entry_zone | array | 否 | 建仓区间 [低，高] | 显示建仓价 |
| picks[].stop_loss | number | 否 | 止损价 | 显示止损 |
| picks[].target_prices | object | 否 | 止盈目标 {short/mid/long} | 显示止盈 |

## DOM 元素清单

| ID | 类型 | 用途 | 所在文件 |
|----|------|------|----------|
| strategySelect | select | 策略选择器 | `select.html` |
| selectionLimit | input | 数量限制 | `select.html` |
| selectionMinScore | input | 最低评分 | `select.html` |
| selectionDate | input | 选股日期 | `select.html` |
| pe_max | input | 最大 PE | `select.html` |
| peg_max | input | 最大 PEG | `select.html` |
| runSelectionBtn | button | 开始选股 | `select.html` |
| selectionLoading | div | 加载提示 | `select.html` |
| selectionResult | div | 结果容器 | `select.html` |

## 数据类型转换

| 前端格式 | 后端格式 | 转换逻辑 |
|----------|----------|----------|
| minScore (0-100) | minSevenFactorScore (0-1) | `/ 100` |
| date (YYYY-MM-DD) | trade_date (YYYYMMDD) | `replace(/-/g, '')` |

## 边界条件

| 场景 | 输入 | 预期输出 |
|------|------|----------|
| 空参数 | 无 | 返回默认 15 条，无筛选 |
| minScore=0 | 0 | 不应用分数筛选 |
| 非交易日 | date=2024-01-14 (周日) | 自动调整为最近交易日 |
| 无数据 | 日期无快照 | 返回空数组 + 警告 |

## 变更记录

| 日期 | 变更内容 | 变更人 | 对方确认 |
|------|----------|--------|----------|
| 2026-03-26 | 初始契约创建 | Claude Code | 待验收 |
| 2026-03-26 | 修复参数名 (minScore→minSevenFactorScore) | Claude Code | 待验收 |
| 2026-03-26 | 修复返回字段映射 (stop_loss/target_prices) | Claude Code | 待验收 |

---

## 验收签字

| 角色 | 姓名 | 日期 | 签字 |
|------|------|------|------|
| 开发 | Claude Code | 2026-03-26 | ✅ |
| 验收 | Codex | 待验收 | ⏳ |
