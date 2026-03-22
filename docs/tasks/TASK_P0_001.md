# TASK_P0_001 - 黑天鹅检测模块

**优先级**: P0  
**状态**: ✅ 已完成  
**创建时间**: 2026-03-22 19:10  
**完成时间**: 2026-03-22 19:12  
**负责人**: 灵爪  

---

## 📋 任务概述

实现黑天鹅事件检测模块，检测到重大风险事件时触发一票否决（卖出信号）。

---

## 🎯 目标

检测以下类别的黑天鹅事件：
1. **监管处罚**：立案调查、行政处罚、证监会调查
2. **财务问题**：财务造假、虚增利润、无法表示意见
3. **退市风险**：退市风险警示、暂停上市、*ST
4. **经营异常**：破产重整、主要账户冻结
5. **重大风险**：重大违法、欺诈发行、内幕交易

---

## 📁 交付物

- [x] `api/black-swan-check.js` - 黑天鹅检测模块

---

## ✅ 验收标准

1. **单只股票检测**：`checkBlackSwan(stockCode, days)` 能正确检测指定股票的黑天鹅事件
2. **批量检测**：`checkBlackSwanBatch(stockCodes, days)` 能批量检测多只股票
3. **数据源覆盖**：
   - ✅ 检查新浪财经新闻数据库（最近 30 天）
   - ✅ 检查公告事件表（最近 30 天）
   - ✅ 检查公司基础信息表（ST 状态）
4. **返回格式**：
   ```javascript
   {
     isBlackSwan: boolean,
     reason: string | null,
     severity: 'none' | 'high' | 'critical',
     action: null | 'sell',
     category: string | null,
     details: Array
   }
   ```
5. **关键词库**：包含所有 5 类黑天鹅关键词（共约 40 个）

---

## 🧪 测试命令

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node -e "
const blackSwan = require('./api/black-swan-check.js');
blackSwan.checkBlackSwan('300308.SZ').then(console.log);
"
```

---

## 🔗 相关文件

- 实现：`api/black-swan-check.js`
- 数据源：`/Volumes/SSD500/data/news_system/news.db`
- 数据源：`data/stock_system.db`

---

## 📝 实现说明

- 使用 SQLite 查询新闻和公告数据
- 关键词匹配检测
- 支持严重程度分类（critical/high/none）
- 检测到 critical 事件立即返回（优化性能）
