# TASK_FIX_003 问题清单

**来源**: TASK_FIX_002 验收报告 (docs/acceptance/TASK_FIX_002_CODEX_ACCEPTANCE.md)  
**创建时间**: 2026-03-20 22:28  
**优先级**: 🔴 高

---

## 问题清单

| ID | 问题 | 优先级 | 预计工时 |
|----|------|--------|----------|
| 1 | 导航栏样式未覆盖全部 7 个页面（select.html、monitor-pool.html、index.html 仍不统一） | 🔴 高 | 2h |
| 2 | 条件单导入 API 缺失（前端调用 /list 和/:id，后端未注册） | 🔴 高 | 1h |

---

## 问题 1: 导航栏样式统一性

**现状**:
- ✅ 已统一：analysis.html、portfolio.html、conditional-order.html、backtest.html
- ❌ 未统一：select.html、monitor-pool.html、index.html

**修复要求**:
1. select.html - 改用 `.top-nav` 样式，统一间距、边框、激活态
2. monitor-pool.html - 添加统一顶部导航栏
3. index.html - 添加统一顶部导航栏（或确认为入口页无需导航）

**统一标准**:
```html
<nav class="top-nav">
  <a href="index.html">首页</a>
  <a href="analysis.html">选股分析</a>
  <a href="monitor-pool.html">监控池</a>
  <a href="portfolio.html">账户管理</a>
  <a href="conditional-order.html">条件单</a>
  <a href="backtest.html">回测系统</a>
</nav>
```

---

## 问题 2: 条件单导入 API 缺失

**现状**:
- 前端调用：`GET /api/conditional-order/list` 和 `GET /api/conditional-order/:id`
- 后端已注册：`GET /api/conditional-order`、`POST /api/conditional-order`、`PUT /api/conditional-order/:id`、`DELETE /api/conditional-order/:id`、`POST /api/conditional-order/:id/cancel`

**修复方案**（二选一）:

**方案 A: 新增接口**
```javascript
// api/server.js
router.get('/conditional-order/list', conditionalOrder.getList);
router.get('/conditional-order/:id', conditionalOrder.getOrder);
```

**方案 B: 前端适配现有接口**
- 将 `/list` 调用改为 `/conditional-order`
- 适配返回结构 `{ success: true, data: [...] }`

**推荐**: 方案 A（更清晰，符合 RESTful 规范）

---

## 修复计划

1. 并行启动 2 个 Claude Code 会话
2. 会话 1: 修复导航栏样式（3 个页面）
3. 会话 2: 新增条件单 API 接口
4. 完成后提交 PR
5. Codex 验收

---

*创建者：灵爪 🐾*
