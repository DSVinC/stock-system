# TASK_V3_301 任务分配

**任务名称**: 联合优化器（数学组合）  
**优先级**: P2  
**预计工期**: 1 天  
**分配日期**: 2026-03-24 16:20  
**分配给**: Claude Code  

---

## 📋 任务描述

实现三目标协同优化的数学组合逻辑，将选股参数优化和网格步长优化的结果进行联合权重分配。

---

## 🎯 验收标准

### 核心功能
- [ ] 读取阶段 1 输出（`cache/base_equity.json`）
- [ ] 读取阶段 2 输出（`cache/grid_excess_return.json`）
- [ ] 实现 20 种仓位比例组合计算
- [ ] 向量加权计算联合净值曲线
- [ ] 输出最优仓位配比

### 输入输出
- **输入**: 
  - `cache/base_equity.json` - 选股基础净值曲线
  - `cache/grid_excess_return.json` - 网格超额收益曲线
- **输出**: 
  - `cache/joint_optimization.json` - 联合优化结果
  - `report/joint_optimizer/result_{timestamp}.md` - 优化报告

### 性能要求
- [ ] 计算耗时 < 1 秒（纯数学计算，无需回测）
- [ ] 支持自定义仓位比例粒度

---

## 📁 交付文件

- `api/joint-optimizer.js` - 联合优化器核心逻辑
- `scripts/run_joint_optimizer.mjs` - 命令行工具
- `test/joint-optimizer.test.js` - 单元测试

---

## 📖 参考文档

- `docs/DESIGN_CONSENSUS.md` 第 11.10 节（三目标协同优化方案）
- `docs/V3_DEVELOPMENT_PLAN.md` 阶段 3

---

## 🔧 技术要点

### 仓位比例组合
```javascript
// 核心仓比例：50% ~ 95%，步长 5%
// 卫星仓比例：5% ~ 50%，步长 5%
// 共 20 种组合
```

### 联合净值计算
```javascript
// 联合净值 = 核心仓比例 × 基础净值 + 卫星仓比例 × (基础净值 + 网格超额)
```

### 最优配比选择
```javascript
// 目标：最大化夏普比率
// 约束：最大回撤 ≤ 20%
```

---

## ⚠️ 注意事项

1. 确保阶段 1 和阶段 2 的数据格式一致
2. 处理边界情况（空数据、无效数据）
3. 添加详细的计算日志

---

**分配人**: 灵爪  
**状态**: `assigned`
