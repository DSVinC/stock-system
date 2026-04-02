# 新浪财经免费 API 公告接口扩展

## 📋 实现概述

已扩展 `stock-system/lib/sina-free-api.js` 增加公告查询功能，作为新浪财经 MCP 的免费替代方案。

## ✅ 新增功能

### 1. getAnnouncements(symbol, page, limit)
获取单只股票的公告列表

```javascript
const { getAnnouncements } = require('./lib/sina-free-api');

const announcements = await getAnnouncements('sh600519', 1, 20);
// 返回：[{symbol, title, ann_date, url, event_type}, ...]
```

### 2. getAnnouncementDetail(url)
获取公告详情（全文）

```javascript
const { getAnnouncementDetail } = require('./lib/sina-free-api');

const detail = await getAnnouncementDetail('https://...');
// 返回：{title, pub_date, content}
```

### 3. getAnnouncementsBatch(symbols, limit)
批量获取多只股票的公告

```javascript
const { getAnnouncementsBatch } = require('./lib/sina-free-api');

const announcements = await getAnnouncementsBatch(['sh600519', 'sh601318'], 10);
// 返回：按日期排序的合并公告列表
```

### 4. classifyAnnouncementType(title)
公告标题风险分类

```javascript
const { classifyAnnouncementType } = require('./lib/sina-free-api');

const { eventType, riskTag } = classifyAnnouncementType('关于公司被立案调查的公告');
// 返回：{eventType: 'regulatory_risk', riskTag: 'high'}
```

## 🎯 风险分类规则

| 风险等级 | 关键词 | 事件类型 |
|----------|--------|----------|
| 🔴 high | 立案调查、行政处罚、退市、财务造假 | regulatory_risk, delisting_risk |
| 🟡 medium | 业绩预亏、减持 | earnings_warning, shareholder_reduction |
| 🟢 low | 中标、重大合同、回购、分红 | positive, corporate_governance, dividend |

## 📊 与 MCP 对比

| 功能 | 新浪财经 MCP | 免费 API 扩展 |
|------|-------------|--------------|
| 数据来源 | 新浪财经 | 新浪财经 |
| 调用方式 | MCP 工具 | 直接 HTTP |
| 成本 | 收费 | 免费 |
| 配置复杂度 | 需要 MCP 配置 | 无需配置 |
| 数据格式 | 结构化 JSON | HTML 解析 |
| 可靠性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

## ⚠️ 注意事项

1. **编码问题**: 新浪页面使用 GBK 编码，已自动处理
2. **反爬虫**: 建议添加请求间隔，避免频繁调用
3. **HTML 结构变化**: 如新浪页面结构变化，需更新解析正则

## 🔄 集成到 position-signals.js

修改 `api/position-signals.js` 中的公告同步逻辑：

```javascript
// 原代码（使用 MCP）
const events = await fetchSinaMajorEvents(sinaSymbol, 100);

// 新代码（使用免费 API）
const { getAnnouncements } = require('../lib/sina-free-api');
const announcements = await getAnnouncements(sinaSymbol, 1, 100);
```

## 🧪 测试脚本

运行测试：
```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node scripts/test-sina-announcements.js
```

## 📝 下一步

1. **验证 HTML 解析**: 确认公告列表页面的正确 URL 和结构
2. **集成测试**: 在 position-signals.js 中替换 MCP 调用
3. **监控日志**: 观察实际运行效果

## 📚 相关文件

- 实现文件：`stock-system/lib/sina-free-api.js`
- 测试脚本：`stock-system/scripts/test-sina-announcements.js`
- 回退方案：`stock-system/test/position-signals-announcement-fallback.test.js` (Tushare)

---

**创建时间**: 2026-04-02  
**状态**: ✅ 代码已实现，⏳ 待验证
