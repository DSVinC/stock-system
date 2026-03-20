# 条件单监控使用指南

## 快速开始

### 1. 启动监控服务（推荐）

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
./scripts/start-monitor.sh
```

服务会在后台运行，每5分钟检查一次条件单（仅在工作日 9:30-15:00）。

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

1. **定时检查**：每5分钟扫描所有 `pending` 状态的条件单
2. **条件判断**：获取实时行情，检查是否满足触发条件
3. **自动交易**：条件满足时自动执行模拟买卖
4. **飞书通知**：触发后推送交易详情到飞书

## 支持的触发条件

| 条件类型 | 说明 | 示例 |
|---------|------|------|
| price | 价格条件 | 价格 ≤ 100元 |
| pct_change | 涨跌幅条件 | 涨幅 ≥ 5% |
| volume_ratio | 量比条件 | 量比 ≥ 2 |
| rsi | RSI指标 | RSI ≤ 30 |
| macd_cross | MACD金叉/死叉 | MACD金叉 |
| pe_percentile | PE分位 | PE分位 ≤ 20% |
| main_force_net | 主力资金净流入 | 主力净流入 > 1000万 |

## 复合条件

支持 AND/OR 逻辑组合多个条件：

```json
{
  "conditions": [
    {"type": "price", "operator": "<=", "value": 100},
    {"type": "rsi", "operator": "<=", "value": 30}
  ],
  "condition_logic": "AND"
}
```

## 常见问题

**Q: 为什么条件单没有触发？**
- 检查条件单状态是否为 `pending`
- 检查当前价格是否满足条件
- 查看日志确认监控服务正常运行

**Q: 如何测试条件单？**
- 创建一个容易触发的条件（如价格 ≤ 1000元）
- 运行 `node scripts/conditional-order-monitor.mjs` 手动检查

**Q: 飞书通知没收到？**
- 检查飞书配置是否正确
- 查看日志中的推送状态
