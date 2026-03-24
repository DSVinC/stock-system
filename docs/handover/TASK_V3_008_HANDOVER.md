# TASK_V3_008 交接文档

> **任务名称**: 分钟线回测策略  
> **交接时间**: 2026-03-24 12:22  
> **交出方**: 灵爪（项目经理）  
> **接手方**: 验收员（Gemini CLI）

---

## 📋 任务概述

实现基于 5 分钟线数据的短线回测策略，支持 RSI、均线交叉、成交量突变三种策略。

---

## 📦 交付物清单

| # | 文件 | 说明 | 状态 |
|---|------|------|------|
| 1 | `api/backtest-minute.js` | 分钟线回测引擎（27KB） | ✅ 完成 |
| 2 | `api/strategies/minute/rsi_strategy.js` | RSI 超买超卖策略（16KB） | ✅ 完成 |
| 3 | `api/strategies/minute/ma_cross_strategy.js` | 均线金叉死叉策略（2.2KB） | ✅ 完成 |
| 4 | `api/strategies/minute/volume_spike_strategy.js` | 成交量突变策略（2.3KB） | ✅ 完成 |
| 5 | `db/migrations/005_create_analysis_reports_table.sql` | 数据库迁移 | ✅ 完成 |
| 6 | `scripts/run_minute_backtest.mjs` | 命令行工具（7.9KB） | ✅ 完成 |
| 7 | `api/server.js` | API 路由集成 | ✅ 完成 |

---

## 🔌 核心接口

### 1. 分钟线回测引擎

```javascript
const { runMinuteBacktest } = require('./backtest-minute');

const result = await runMinuteBacktest({
  strategy: {
    name: 'rsi_oversold',
    generateSignals: require('./strategies/minute/rsi_strategy').generateSignals,
  },
  stocks: ['000001.SZ', '600519.SH'],
  startDate: '2026-02-01',
  endDate: '2026-03-24',
});
```

### 2. 策略接口（统一）

```javascript
function generateSignals(minuteData, options) {
  // minuteData: [{open, high, low, close, volume, timestamp}, ...]
  // options: {rsiOverbought, rsiOversold, ...}
  // return: [{type: 'buy'|'sell', price, timestamp, reason}, ...]
}
```

### 3. 命令行工具

```bash
# 基本用法
node scripts/run_minute_backtest.mjs \
  --strategy rsi_oversold \
  --stocks 000001.SZ,600519.SH \
  --days 30

# 参数扫描
node scripts/run_minute_backtest.mjs \
  --scan \
  --strategy rsi_oversold \
  --stocks 000001.SZ
```

---

## ✅ 验收标准

- [ ] 分钟线回测引擎正常工作
- [ ] 至少 3 个分钟线策略可用
- [ ] API 接口完整（执行/历史/详情/参数扫描）
- [ ] 与 `stock_minute` 表联动
- [ ] 命令行工具可用
- [ ] 所有文件语法检查通过

---

## 🧪 测试建议

### 1. 单元测试
```bash
node --check api/backtest-minute.js
node --check api/strategies/minute/*.js
node --check scripts/run_minute_backtest.mjs
```

### 2. 集成测试
```bash
# 测试 RSI 策略回测
node scripts/run_minute_backtest.mjs \
  --strategy rsi_oversold \
  --stocks 000001.SZ \
  --days 7 \
  --verbose
```

### 3. API 测试
```bash
# 启动服务后测试
curl -X POST http://localhost:3000/api/backtest/minute/run \
  -H "Content-Type: application/json" \
  -d '{"strategy":"rsi_oversold","stocks":["000001.SZ"],"days":7}'
```

---

## ⚠️ 注意事项

1. **数据依赖**: 需要 `stock_minute` 表中有分钟线数据
2. **性能要求**: 1 个月分钟线回测应 < 10 秒
3. **策略接口**: 所有策略必须导出 `generateSignals` 函数

---

## 📝 已知问题

无

---

## 📚 相关文档

- 任务文档：`docs/tasks/TASK_V3_008.md`
- 状态文档：`docs/runtime/TASK_V3_008_STATUS.md`
- 项目经验：`docs/PROJECT_LESSONS.md`
