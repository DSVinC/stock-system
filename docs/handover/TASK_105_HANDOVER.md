# TASK_105 交接文档

**任务**: 方向股列表界面适配 v2
**创建时间**: 2026-03-23 16:20
**完成时间**: 2026-03-23 16:45
**状态**: ✅ 已完成

---

## 📋 任务背景

TASK_103 和 TASK_104 已完成 v2 结构化改造，现在方向股列表界面需要升级以显示这些结构化数据。

---

## 🎯 目标

- ✅ 方向股卡片显示决策建议（买入/卖出/观望）
- ✅ 显示综合推荐分数（0-10 分）
- ✅ 显示三种策略的核心建议摘要
- ✅ 添加"导入到条件单"按钮

---

## 📁 相关文件

| 文件 | 变更说明 |
|------|---------|
| `select.html` | 添加 picks 渲染、v2 数据获取、导入条件单功能 |
| `docs/acceptance/TASK_105_ACCEPTANCE.md` | 验收报告 |
| `docs/runtime/TASK_105_STATUS.md` | 运行状态 |

**参考文件**:
- `docs/acceptance/TASK_104_ACCEPTANCE.md` - v2 API 响应格式
- `analysis.html` - UI 风格参考

---

## 🔧 技术实现

### 数据流

```
/api/select
    ↓ 获取方向列表（含 picks）
renderDirections()
    ↓ 渲染方向卡片
renderPicksList()
    ↓ 渲染 picks 列表
fetchV2DataForPick()
    ↓ 异步获取 v2 数据
/api/v2/analysis/:stockCode
    ↓ 返回结构化数据
renderV2DataForPick()
    ↓ 渲染决策建议、分数、摘要
importToConditionalOrder()
    ↓ 导入条件单
/api/v2/strategy/:tsCode/:riskType
    ↓ 获取策略数据
conditional-order.html
```

### 关键函数

```javascript
// 渲染 picks 列表
function renderPicksList(picks, directionTsCode) { ... }

// 获取单只股票 v2 数据
async function fetchV2DataForPick(stockCode, directionTsCode) { ... }

// 渲染 v2 数据到界面
function renderV2DataForPick(stockCode, v2Data) { ... }

// 导入到条件单
async function importToConditionalOrder(stockCode, stockName, riskType) { ... }
```

### 样式类

```css
.pick-v2-data { /* v2 数据容器 */ }
.v2-header { /* 决策和分数头部 */ }
.decision-badge { /* 决策徽章 */ }
.decision-buy { color: var(--good); }
.decision-sell { color: var(--bad); }
.decision-hold { color: var(--accent); }
.strategy-summary { /* 策略摘要 */ }
.key-prices { /* 关键价格网格 */ }
.btn-import { /* 导入按钮 */ }
```

---

## ✅ 验收标准

1. ✅ 卡片显示决策建议和推荐分数
2. ✅ 显示三种策略摘要
3. ✅ "导入到条件单"按钮正常工作
4. ✅ 界面风格与 analysis.html 保持一致

---

## 🧪 测试验证

```bash
# 1. 启动服务器
node api/server.js

# 2. 测试 v2 API
curl "http://127.0.0.1:3000/api/v2/analysis/600519.SH" | jq '.success'

# 3. 访问界面
open http://127.0.0.1:3000/select.html
```

**预期结果**:
1. 点击"开始选股"显示方向列表
2. 点击方向卡片展开详情
3. 方向股（picks）显示加载状态
4. v2 数据加载后显示决策建议、分数、摘要
5. 点击"导入条件单"跳转到条件单页面

---

## 📝 注意事项

1. **异步加载**: v2 数据采用异步加载，先显示 loading 状态
2. **缓存机制**: 使用 `stockV2Data` Map 缓存数据，避免重复请求
3. **分数转换**: `report_score` (1-5) 转换为 0-10 分制
4. **错误处理**: API 失败时显示"数据加载失败"