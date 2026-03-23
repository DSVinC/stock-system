# TASK_CODEX_FIX_001 - 修复 analyze.js ReferenceError

**创建时间**: 2026-03-23 11:30  
**优先级**: P1  
**负责人**: Claude Code  
**验收员**: Codex  
**状态**: pending  
**来源**: PR #4 Codex 第二次审查

---

## 📋 问题描述

`api/analyze.js` 中 `calculateCompositeScore(basicInfo.ts_code)` 调用引入 ReferenceError。

**Codex 评论**:
> `buildReportData()` does not define any local `stockCode`, so this new second argument raises `ReferenceError: stockCode is not defined` as soon as `/api/analyze` tries to build a report.

---

## 🎯 修复内容

### 问题分析
`buildReportData()` 函数内部调用 `calculateCompositeScore()` 时传入了未定义的 `stockCode` 参数。

### 修复方案
1. 在 `buildReportData()` 函数中定义 `stockCode` 变量
2. 使用 `basicInfo.ts_code` 作为值
3. 或者直接从参数中获取

---

## ✅ 验收标准

- [ ] 读取 `api/analyze.js` 定位问题代码
- [ ] 修复 `stockCode` 未定义问题
- [ ] 运行 `node --check api/analyze.js` 语法检查通过
- [ ] 测试 `/api/analyze` 接口正常返回

---

## 📁 修改文件

- `api/analyze.js`

---

*创建时间：2026-03-23 11:30*
