# 选股页面跳转问题修复计划

**任务 ID**: TASK_SELECT_FIX  
**创建时间**: 2026-03-21 23:32 (Asia/Shanghai)  
**来源**: Codex 验收报告 `docs/acceptance/TASK_SELECT_UI_CODEX_ACCEPTANCE.md`

---

## 🔴 高优先级问题（并行修复）

| 子任务 | 问题 | 负责人 | 状态 |
|--------|------|--------|------|
| **FIX-01** | 跳转协议不一致（URL 参数名、值类型、存储介质） | 灵爪 | ⏳ 待修复 |
| **FIX-02** | analysis.html 初始化报错（view-report 元素不存在） | 灵爪 | ⏳ 待修复 |
| **FIX-03** | API 数据格式不匹配（对象数组 vs 字符串数组） | 灵爪 | ⏳ 待修复 |
| **FIX-04** | `/api/industry/:name/stocks` 接口缺失 | 灵爪 | ⏳ 待修复 |

---

## 📋 修复方案

### FIX-01: 统一跳转协议

**问题**:
- URL 参数名：`directions` vs `direction`
- URL 值类型：`ts_code` vs `name`
- 存储介质：`sessionStorage` vs `localStorage`

**修复方案**:
1. `select.html` 跳转时统一传 `?direction=行业名`（单个）或 `?directions=行业名 1，行业名 2`（多个）
2. 统一使用 `localStorage.selectedDirections`
3. `analysis.html` 读取 `direction` 或 `directions` 参数，兼容两种格式

**修改文件**:
- `select.html` - 跳转逻辑
- `analysis.html` - 参数接收逻辑

---

### FIX-02: 修复 view-report 报错

**问题**: `analysis.html` 第 479 行尝试绑定 `id="view-report"` 元素，但页面中不存在

**修复方案**:
- 删除这段 JS 代码（已有 `<a href="./report.html">` 链接直接使用即可）

**修改文件**:
- `analysis.html` - 删除冗余 JS

---

### FIX-03: 统一 API 入参格式

**问题**: 前端传 `{name, score, reason}` 对象数组，后端期望字符串数组

**修复方案**:
- 前端提交前转换：`directions.map(item => item.name)`

**修改文件**:
- `analysis.html` - API 调用逻辑

---

### FIX-04: 补充行业成分股接口

**问题**: `/api/industry/:name/stocks` 接口不存在

**修复方案**:
- 新增路由 `/api/industry/:name/stocks`
- 调用 Tushare `ths_member` 获取成分股列表

**修改文件**:
- `api/industry.js` (新建)
- `api/server.js` (注册路由)

---

## ✅ 验收标准

1. ✅ 从 select.html 选择行业后跳转 analysis.html 正常
2. ✅ analysis.html 正确加载选中行业的成分股
3. ✅ 控制台无 JS 报错
4. ✅ API 调用正常返回数据

---

*创建者：灵爪 🐾*
