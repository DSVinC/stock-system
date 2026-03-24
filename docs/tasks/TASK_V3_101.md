# TASK_V3_101 - 日线回测引擎

**版本**: V3.0  
**优先级**: P0  
**状态**: pending  
**创建日期**: 2026-03-24  
**预计工期**: 2-3 天  

---

## 📋 任务描述

实现基于日线数据的回测引擎，支持选股策略的历史回测。

---

## 🎯 目标

1. 实现日线回测引擎核心
2. 支持选股策略回测（行业权重 +7 因子阈值）
3. 使用 stock_factor_snapshot 表作为数据源
4. 输出回测报告（夏普比率、最大回撤等）

---

## 📐 技术规范

### 输入
- 选股策略配置（行业权重、7 因子阈值）
- 回测时间范围
- 初始资金

### 处理逻辑
```python
def run_backtest(strategy_config, start_date, end_date, initial_capital):
    """
    执行回测
    
    Returns:
        dict: 回测报告（夏普比率、最大回撤、年化收益等）
    """
    # 1. 从 stock_factor_snapshot 获取历史数据
    # 2. 按策略配置选股
    # 3. 模拟交易
    # 4. 计算绩效指标
```

### 输出（7 个绩效指标）
```json
{
  "sharpe_ratio": 2.1,
  "max_drawdown": -0.15,
  "annualized_return": 0.28,
  "total_return": 0.45,
  "win_rate": 0.62,
  "trade_count": 156,
  "volatility": 0.18
}
```

### 数据库表
```sql
-- 回测历史表
CREATE TABLE backtest_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_config TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    initial_capital REAL NOT NULL,
    total_return REAL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 回测明细表
CREATE TABLE backtest_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backtest_id INTEGER NOT NULL,
    trade_date TEXT NOT NULL,
    ts_code TEXT NOT NULL,
    action TEXT NOT NULL,
    quantity INTEGER,
    price REAL,
    FOREIGN KEY (backtest_id) REFERENCES backtest_history(id)
);

-- 参数扫描表
CREATE TABLE backtest_parameter_scan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_backtest_id INTEGER NOT NULL,
    parameter_name TEXT NOT NULL,
    parameter_value REAL NOT NULL,
    total_return REAL,
    sharpe_ratio REAL,
    FOREIGN KEY (base_backtest_id) REFERENCES backtest_history(id)
);
```

---

## ✅ 验收标准

- [ ] 回测引擎正常工作
- [ ] 支持选股策略回测
- [ ] 输出完整回测报告（7 个绩效指标）
- [ ] 与 stock_factor_snapshot 数据联动
- [ ] 性能：1 年回测 < 30 秒
- [ ] 数据库表创建完整

---

## 📁 交付物

1. `api/backtest-engine.js` - 基于因子快照的回测引擎
2. `api/backtest.js` - 回测 API（执行/历史/详情/参数扫描）
3. `api/backtest-report.js` - 7 个绩效指标计算
4. `scripts/run_backtest.mjs` - 命令行回测工具
5. `db/migrations/006_create_backtest_tables.sql` - 数据库表创建
6. `api/server.js` - 路由集成

---

## 🔌 API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| POST /api/backtest/factor-snapshot/run | 执行回测 | 运行日线回测 |
| GET /api/backtest/factor-snapshot/history | 回测历史 | 获取历史回测记录 |
| GET /api/backtest/factor-snapshot/:id | 回测详情 | 获取回测详情和交易明细 |
| POST /api/backtest/factor-snapshot/scan | 参数扫描 | 参数优化扫描 |

---

## 🔗 依赖关系

- 前置任务：TASK_V3_001~006（选股自动化）✅
- 后续任务：TASK_V3_102（选股参数优化）

---

## 📝 备注

- 使用 stock_factor_snapshot 表作为数据源
- 考虑手续费（万 2.5，最低 5 元）
- 参数化查询防 SQL 注入
- 批量查询优化性能
