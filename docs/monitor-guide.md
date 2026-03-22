# 条件单监控使用指南

## 环境依赖

条件单监控依赖分为三类，缺一项就会影响对应能力：

| 依赖 | 用途 | 实际来源 |
|------|------|----------|
| `sina-ashare-mcp` 脚本 | 实时行情 | 本地脚本目录 `/Users/vvc/.openclaw/workspace/skills/sina-ashare-mcp/scripts` |
| `TUSHARE_TOKEN` | 历史行情、日频基础指标、主力资金、PE 分位缓存查询前置数据 | `.env` 或当前 shell 环境 |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_OPEN_ID` | 触发后的飞书私聊通知 | `.env` 或当前 shell 环境 |

说明：

- 实时行情不是走“新浪 token”，而是调用本地 `sina-ashare-mcp` 脚本。
- `pe_percentile` 条件依赖估值缓存库；监控时会读取 `getStockPePercentile()` 返回值并注入 `marketData.pePercentile`。
- 若估值缓存为空，先运行 `node scripts/update_valuation_data.mjs` 生成 `data/valuation_cache.db` 中的 PE 分位数据。

## 快速开始

### 1. 启动监控服务

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
./scripts/start-monitor.sh
```

服务会在后台运行，每 5 分钟检查一次条件单。

### 2. 查看日志

```bash
tail -f logs/monitor.log
```

### 3. 停止服务

```bash
./scripts/stop-monitor.sh
```

### 4. 单次手动检查

```bash
node scripts/conditional-order-monitor.mjs
```

## 监控逻辑

1. 扫描 `enabled` / `pending` 状态、且在生效日期范围内的条件单。
2. 按条件类型构造监控上下文：
   - `price` 走新浪实时行情
   - `volume_ratio` / `pe_percentile` 走 Tushare 日频基础指标，`pe_percentile` 额外读取估值缓存
   - `rsi` / `macd_cross` 走 Tushare 历史行情计算
   - `main_force_net` 走 Tushare 资金流
3. 条件满足后调用模拟交易执行器。
4. 交易成功或失败后尝试发送飞书通知。

## 支持的触发条件

| 条件类型 | 说明 | 运行时字段 | 示例 |
|---------|------|------------|------|
| `price` | 价格条件 | `marketData.price` | 价格 `<= 100` |
| `pct_change` | 涨跌幅 | `marketData.pctChange` | 涨幅 `>= 5` |
| `volume_ratio` | 量比 | `marketData.volumeRatio` | 量比 `>= 2` |
| `rsi` | RSI 指标 | `technicalData.rsi` | RSI `<= 30` |
| `macd_cross` | MACD 信号值 | `technicalData.macdSignalValue` | `>= 0` |
| `pe_percentile` | PE 分位 | `marketData.pePercentile` | PE 分位 `<= 0.2` |
| `main_force_net` | 主力资金净额 | `marketData.mainForceNet` | `> 10000000` |

## 真实环境验收

推荐先做不落库、可重复执行的真实链路验收：

```bash
node scripts/accept-real-monitor.mjs --ts-code 000001.SZ --operator ">=" --threshold 0
```

如果要顺带验证飞书通知：

```bash
node scripts/accept-real-monitor.mjs --ts-code 000001.SZ --operator ">=" --threshold 0 --notify
```

验收脚本会输出：

- 本地 `sina-ashare-mcp` 脚本是否可访问
- `TUSHARE_TOKEN` / 飞书环境变量是否存在
- `marketData.pePercentile` 是否成功注入
- `pe_percentile` 条件是否成功判定
- 可选的飞书通知发送结果

## 复合条件

支持 `AND` / `OR` 逻辑组合多个条件：

```json
{
  "conditions": [
    { "type": "price", "operator": "<=", "value": 100 },
    { "type": "pe_percentile", "operator": "<=", "value": 0.2 }
  ],
  "condition_logic": "AND"
}
```

## 常见问题

**Q: 为什么 `pe_percentile` 一直不触发？**

- 先运行 `node scripts/accept-real-monitor.mjs --ts-code 你的股票代码 --operator ">=" --threshold 0`
- 如果输出里 `marketData.pePercentile` 是 `null`，先检查 `data/valuation_cache.db` 是否已通过 `scripts/update_valuation_data.mjs` 写入
- 再确认 `TUSHARE_TOKEN` 可用

**Q: 为什么条件单没有进入监控？**

- 检查状态是否是 `enabled` 或 `pending`
- 检查 `start_date` / `end_date` 是否覆盖当前日期

**Q: 飞书通知没收到？**

- 确认 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_OPEN_ID` 已配置
- 先单独运行带 `--notify` 的验收脚本排查
