# TASK_V3_401 任务分配

**任务名称**: 回测→条件单导入  
**优先级**: P1  
**预计工期**: 2-3 小时  
**分配日期**: 2026-03-24  

---

## 📋 任务描述

实现将回测优化结果导入条件单的功能，让用户可以直接使用优化后的参数创建条件单。

---

## 🎯 验收标准

- [ ] 读取回测优化结果（`cache/joint_optimization.json`）
- [ ] 自动创建条件单（买入/卖出条件）
- [ ] 支持批量导入（核心仓 + 卫星仓）
- [ ] 条件单参数正确（价格、涨跌幅等）

---

## 📁 交付文件

- `api/backtest-to-conditional.js` - 回测转条件单 API
- `scripts/import_conditional_from_backtest.mjs` - 导入脚本
- `test/backtest-to-conditional.test.js` - 单元测试

---

**分配人**: 灵爪  
**状态**: ✅ 已完成
