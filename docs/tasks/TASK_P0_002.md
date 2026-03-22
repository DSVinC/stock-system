# TASK_P0_002 - 舆情因子计算模块

**优先级**: P0  
**状态**: 🔄 进行中  
**创建时间**: 2026-03-22 19:15  
**负责人**: 灵爪  

---

## 📋 任务概述

实现舆情因子计算模块，整合新浪财经新闻和公告事件数据，计算舆情因子得分。

---

## 🎯 目标

1. 计算新闻情感分（基于关键词匹配 + 时间衰减）
2. 计算公告事件分（基于事件类型 + 时间衰减）
3. 综合舆情分 = 新闻分 × 50% + 事件分 × 50%
4. 支持风险调整（±2%）

---

## 📐 设计方案

### 数据来源
- **新浪财经新闻**：`/Volumes/SSD500/data/news_system/news.db` → `news_raw` 表
- **公告事件**：`stock_system.db` → `company_events` 表

### 时间衰减
- **新闻半衰期**：12 小时（A 股新闻时效极短）
- **公告半衰期**：5 天（重大事件长尾效应）

### 情感分析（基础版）
- 正面词库：利好、增长、盈利、突破等（约 20 个）
- 负面词库：利空、下跌、亏损、下滑等（约 20 个）
- 情感得分 = (正面词数 - 负面词数) / 总词数

### 事件影响映射
| 事件类型 | 影响分 |
|----------|--------|
| 业绩预告超预期 | 1.0 |
| 重大订单 | 0.9 |
| 战略合作 | 0.8 |
| 财报披露 | 0.5 |
| 股东减持 | 0.2 |
| 处罚 | 0.1 |

---

## 📁 交付物

- [ ] `api/sentiment-factor.js` - 舆情因子计算模块

---

## ✅ 验收标准

1. **单只股票计算**：`calculateSentimentFactor(stockCode)` 能正确计算舆情因子
2. **批量计算**：`calculateSentimentFactorBatch(stockCodes)` 能批量计算
3. **新闻情感分**：
   - ✅ 查询新浪财经新闻（最近 72 小时）
   - ✅ 应用时间衰减（12 小时半衰期）
   - ✅ 置信度加权
4. **公告事件分**：
   - ✅ 查询公告事件（最近 7 天）
   - ✅ 应用时间衰减（5 天半衰期）
   - ✅ 事件类型映射
5. **返回格式**：
   ```javascript
   {
     score: 0.6 ~ 1.2,
     details: {
       newsScore: number,
       eventScore: number,
       newsCount: number,
       eventCount: number,
       riskAdjustment: number
     },
     calculatedAt: string
   }
   ```

---

## 🧪 测试命令

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node -e "
const sentiment = require('./api/sentiment-factor.js');
sentiment.calculateSentimentFactor('300308.SZ').then(console.log);
"
```

---

## 🔗 相关文件

- 实现：`api/sentiment-factor.js`
- 数据源：`/Volumes/SSD500/data/news_system/news.db`
- 数据源：`data/stock_system.db`

---

## 📝 实现说明

- 基础版使用关键词匹配（后续升级为 LLM）
- 时间衰减使用指数衰减函数
- 最终得分限制在 0.6~1.2 范围
