# TASK_BACKTEST_FIX_001 交接文档

**创建时间**: 2026-03-23 14:15  
**任务类型**: Bug 修复  

## 问题概述

回测系统 API 可以调用，但返回结果始终为 0（无交易、无收益），无法正常生成交易信号。

## 根因分析

1. **股票代码格式不一致**: API 输入 `300308.SZ` vs 数据库 `sz.300308`
2. **orderConfig 未定义**: `executeStrategy` 方法中变量作用域问题
3. **数据库锁竞争**: `SQLITE_BUSY` 错误导致报告保存失败

## 修复方案

### FIX_001_01 - 股票代码格式转换
- 创建转换函数：`300308.SZ` ↔ `sz.300308`
- 在回测 API 入口处自动转换

### FIX_001_02 - orderConfig 修复
- 将 `orderConfig` 提升到正确的作用域
- 确保所有策略分支都能访问

### FIX_001_03 - 数据库连接优化
- 实现连接池或单例模式
- 避免 SQLITE_BUSY 错误

### FIX_001_04 - 端到端测试
- 使用真实数据验证修复效果
- 确保生成非零交易信号

## 相关文件

- `api/backtest.js` - 回测引擎
- `api/market-data.js` - 市场数据
- 数据库：`/Volumes/SSD500/openclaw/stock-system/stock_system.db`
