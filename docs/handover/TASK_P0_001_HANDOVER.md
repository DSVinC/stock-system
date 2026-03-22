# TASK_P0_001 交接文档

**任务名称**: 黑天鹅检测模块  
**开发者**: 灵爪  
**交接时间**: 2026-03-22 19:32  
**验收员**: 待分配（使用外部工具）

---

## 📋 开发概述

实现黑天鹅事件检测模块，检测到重大风险事件时触发一票否决（卖出信号）。

---

## 📁 交付文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `api/black-swan-check.js` | 377 | 黑天鹅检测模块 |

---

## 🧪 自测结果

### 测试 1: 函数导出
```bash
node -e "const blackSwan = require('./api/black-swan-check.js'); console.log(Object.keys(blackSwan));"
```
**结果**: ✅ 通过 - 导出 checkBlackSwan, checkBlackSwanBatch, getKeywordStats

### 测试 2: 关键词库
```bash
node -e "const blackSwan = require('./api/black-swan-check.js'); console.log(blackSwan.getKeywordStats());"
```
**结果**: ✅ 通过 - 39 个关键词，5 类风险

### 测试 3: 返回格式
```bash
node -e "const blackSwan = require('./api/black-swan-check.js'); blackSwan.checkBlackSwan('300308.SZ').then(console.log);"
```
**结果**: ✅ 通过 - 返回 isBlackSwan, reason, severity, action, category, detectedAt, details

---

## 📐 设计说明

### 关键词分类
1. **regulatory (critical)**: 8 个 - 立案调查、行政处罚等
2. **financial (critical)**: 8 个 - 财务造假、虚增利润等
3. **delisting (critical)**: 8 个 - 退市风险警示、*ST 等
4. **operational (high)**: 8 个 - 破产重整、主要账户冻结等
5. **majorRisk (high)**: 7 个 - 重大违法、欺诈发行等

### 检测逻辑
- 查询新闻库（最近 N 天）
- 查询公告事件表（最近 N 天）
- 检查公司 ST 状态
- 关键词匹配
- 检测到 critical 立即返回（优化性能）

---

## ⚠️ 注意事项

1. **数据库依赖**:
   - `/Volumes/SSD500/data/news_system/news.db` (news_raw 表)
   - `data/stock_system.db` (company_events, stocks 表)

2. **当前状态**: 代码逻辑正确，但部分数据库表尚未创建

---

## ✅ 验收检查清单

请验收员逐项检查：

- [ ] 函数导出完整（checkBlackSwan, checkBlackSwanBatch, getKeywordStats）
- [ ] 关键词库≥30 个，分类≥5 类
- [ ] 返回格式符合规范（isBlackSwan, reason, severity, action, details）
- [ ] 数据源覆盖（新闻库 + 公告表 + 公司信息表）
- [ ] 严重程度分类正确（critical/high/none）
- [ ] 代码无语法错误
- [ ] 代码风格符合项目规范

---

## 🔗 相关文档

- 任务文档：`docs/tasks/TASK_P0_001.md`
- 实时状态：`docs/runtime/TASK_P0_001_STATUS.md`
