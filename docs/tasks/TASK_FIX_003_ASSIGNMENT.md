# TASK_FIX_003 任务分配单

**任务 ID**: TASK_FIX_003  
**任务名称**: TASK_FIX_002 验收问题修复（导航栏统一 + 条件单 API）  
**创建时间**: 2026-03-20 22:28  
**优先级**: 🔴 高  
**负责人**: 灵爪（项目经理）/ Claude Code（开发）  

---

## 任务分配

| 子任务 | 内容 | 负责人 | 状态 |
|--------|------|--------|------|
| 3A | 导航栏样式统一（select.html、monitor-pool.html、index.html） | Claude Code | ⏳ 待开发 |
| 3B | 条件单 API 接口（GET /list 和 GET /:id） | Claude Code | ⏳ 待开发 |

---

## 验收标准

### 3A: 导航栏样式统一
- [ ] 7 个页面导航栏样式完全统一
- [ ] 激活态高亮正确
- [ ] 导航文案一致（"回测系统"而非"回测"）

### 3B: 条件单 API
- [ ] 新增 `GET /api/conditional-order/list` 接口
- [ ] 新增 `GET /api/conditional-order/:id` 接口
- [ ] 前端调用正常，无 404 错误

---

## 并行开发命令

```bash
# 会话 1: 导航栏统一
cd /Users/vvc/.openclaw/workspace/stock-system && \
claude -p "你是程序员，请统一 3 个页面的导航栏样式：select.html、monitor-pool.html、index.html。参考 analysis.html 的.top-nav 样式。" &

# 会话 2: 条件单 API
cd /Users/vvc/.openclaw/workspace/stock-system && \
claude -p "你是程序员，请在 api/conditional-order.js 中新增两个接口：1) GET /list 获取条件单列表 2) GET /:id 获取单个条件单详情。然后在 api/server.js 中注册路由。" &
```

---

*创建者：灵爪 🐾*
