# TASK_CODEX_FIX_003 - 修复 monitor.js DB 方法使用错误

**创建时间**: 2026-03-23 11:30  
**优先级**: P1  
**负责人**: Claude Code  
**验收员**: Codex  
**状态**: ✅ 已完成  
**来源**: PR #4 Codex 第二次审查

---

## 📋 问题描述

`api/monitor.js` 使用 callback 风格 DB 方法而非 promise。

**Codex 评论**:
> `getDatabase()` returns the sqlite handle from `api/db.js`, where only `allPromise/getPromise/runPromise` are awaitable. Awaiting `db.all(...)` here does not produce a row array, so `/api/monitor/overview` will either throw or return zeroed counters.

---

## 🎯 修复内容

### 问题分析
`monitor.js` 中使用了 `db.all()` callback 方法，但应该使用 `db.allPromise()` promise 方法。

### 修复方案
1. 查找所有 `db.all()`、`db.get()`、`db.run()` 调用
2. 替换为 `db.allPromise()`、`db.getPromise()`、`db.runPromise()`
3. 确保正确使用 await

---

## ✅ 验收标准

- [ ] 读取 `api/monitor.js` 找出所有 DB 调用
- [ ] 替换为 promise 版本方法
- [ ] 运行 `node --check api/monitor.js` 语法检查通过
- [ ] 测试 `/api/monitor/overview` 接口正常返回

---

## 📁 修改文件

- `api/monitor.js`

---

*创建时间：2026-03-23 11:30*
