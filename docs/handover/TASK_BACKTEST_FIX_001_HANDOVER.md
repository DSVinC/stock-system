# TASK_BACKTEST_FIX_001 交接文档

**创建时间**: 2026-03-23 12:26  
**任务类型**: Bug 修复  
**优先级**: P1  

---

## 🎯 任务目标

修复回测系统无法生成交易信号的问题，使回测系统能够正常工作。

---

## 🔍 问题背景

### 当前状态
- 回测系统代码已完成（PR #4 已合并）
- API 端点可用
- 历史数据库有 1600 万条数据
- **但回测结果始终为 0**

### 已诊断的问题
1. **股票代码格式不一致**
   - API 输入：`300308.SZ`
   - 数据库：`sz.300308`
   - 导致数据查询失败

2. **代码 Bug**
   - 文件：`api/backtest.js`
   - 错误：`orderConfig is not defined`
   - 位置：`executeStrategy` 方法

3. **数据库锁竞争**
   - 错误：`SQLITE_BUSY: database is locked`
   - 影响：回测报告保存失败

---

## 📦 修复计划

### P0 任务（必须完成）
1. **TASK_BACKTEST_FIX_001_01** - 股票代码格式转换
2. **TASK_BACKTEST_FIX_001_02** - orderConfig bug 修复

### P1 任务（重要）
3. **TASK_BACKTEST_FIX_001_03** - 数据库连接优化
4. **TASK_BACKTEST_FIX_001_04** - 端到端测试

---

## 🔧 技术细节

### 股票代码格式转换
需要实现的函数：
```javascript
function normalizeStockCode(code) {
  // 输入：300308.SZ → 输出：sz.300308
  // 输入：600601.SH → 输出：sh.600601
}
```

### orderConfig 修复
在 `executeStrategy` 方法中，需要确保 `orderConfig` 变量在所有分支中都有定义。

### 数据库优化
- 使用单例模式管理数据库连接
- 避免并发写入冲突

---

## ✅ 验收标准

1. 回测 API 能够正确查询历史数据
2. 双均线策略能够生成买卖信号
3. 回测结果包含非零的交易次数和收益率
4. 回测报告能够正常保存到数据库

---

## 📚 相关文件

- `api/backtest.js` - 回测引擎
- `api/market-data.js` - 市场数据
- 数据库：`/Volumes/SSD500/openclaw/stock-system/stock_system.db`
