# TASK_SELECT_IMPORT_001: 策略库列表加载功能

**优先级**: 🔴重要紧急  
**预估工时**: 1h  
**开发者**: Claude Code  
**验收员**: Gemini CLI  

---

## 任务描述

实现"从策略库导入参数"功能的策略库列表加载逻辑。

## 需求

1. 调用 `/api/iteration/versions/:strategyType` 获取已保存的策略版本列表
2. 在导入模态框中展示策略列表（策略名、保存时间、评分）
3. 支持点击选择策略

## 交付物

- [ ] `select.html` - 添加 `loadImportableStrategies()` 函数
- [ ] 导入模态框显示策略列表
- [ ] 自测通过

## 验收标准

1. 点击"从策略库导入参数"按钮能加载策略列表
2. 列表显示策略名、保存时间、评分
3. 点击策略项能选中

## 相关文件

- 策略库 API: `api/iteration-manager.js`
- 选股页面：`select.html`
- 策略库页面：`iteration-manager.html`（参考实现）

---

**创建时间**: 2026-03-31 12:52  
**状态**: pending
