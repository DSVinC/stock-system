# TASK_V3_008: 分钟线回测策略

> **创建时间**: 2026-03-24  
> **优先级**: P1 (medium)  
> **预计工时**: 2-3 小时  
> **状态**: ⏳ 待启动

---

## 🎯 任务目标

实现基于 5 分钟线数据的短线回测策略，支持：
- 短线波段策略回测
- 技术指标策略验证
- 分钟线级别调仓

---

## 📋 具体功能

### 1. 分钟线回测引擎 (`api/backtest-minute.js`)

**核心功能**:
- 读取 `stock_minute` 表数据
- 支持 5 分钟线级别的回测
- 支持日内交易（T+0 模拟）
- 计算分钟线级别的技术指标

**选股逻辑**:
- 基于 TASK_V3_006 获取的分钟线数据
- 支持 RSI、MACD、均线等分钟线指标
- 支持成交量突变检测

### 2. 分钟线策略库 (`api/strategies/minute/`)

**策略示例**:
- **RSI 超买超卖**: RSI>70 卖出，RSI<30 买入
- **均线金叉死叉**: 5 分钟均线交叉信号
- **成交量突变**: 量比>2 时跟进
- **突破策略**: 突破 N 分钟高点

### 3. 回测 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/backtest/minute/run` | 执行分钟线回测 |
| GET | `/api/backtest/minute/history` | 回测历史 |
| GET | `/api/backtest/minute/:id` | 回测详情 |
| POST | `/api/backtest/minute/scan` | 参数扫描 |

### 4. 命令行工具 (`scripts/run_minute_backtest.mjs`)

```bash
node scripts/run_minute_backtest.mjs \
  --strategy rsi_oversold \
  --stocks 000001.SZ,600519.SH \
  --days 30
```

---

## 📦 交付物

1. `api/backtest-minute.js` - 分钟线回测引擎
2. `api/strategies/minute/*.js` - 分钟线策略库（至少 3 个策略）
3. `scripts/run_minute_backtest.mjs` - 命令行工具
4. `api/server.js` - 路由集成
5. 数据库表（如需要）: `backtest_minute_history`

---

## ✅ 验收标准

- [ ] 分钟线回测引擎正常工作
- [ ] 至少 3 个分钟线策略可用
- [ ] API 接口完整（执行/历史/详情/参数扫描）
- [ ] 与 `stock_minute` 表联动
- [ ] 性能：1 个月分钟线回测 < 10 秒
- [ ] 输出完整回测报告（7 个绩效指标）

---

## 🔗 依赖关系

| 依赖任务 | 状态 |
|----------|------|
| TASK_V3_006 (分钟线获取) | ✅ 完成 |
| TASK_SNAPSHOT_005 (数据回填) | ✅ 完成 |

---

## 📝 技术规范

- 使用 `stock_minute` 表作为数据源
- 支持 5 分钟线粒度
- 考虑手续费（万 2.5，最低 5 元）
- 参数化查询防 SQL 注入
- 批量查询优化性能
