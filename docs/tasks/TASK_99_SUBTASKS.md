# TASK_99 子任务拆解

## 子任务 1: 因子选择器 UI (15 分钟)
**文件**: `public/js/factor-panel.js`
**目标**: 实现因子列表复选框，支持多选
**验收**: `node --check public/js/factor-panel.js`

## 子任务 2: 权重滑块 UI (15 分钟)
**文件**: `public/js/factor-panel.js`
**目标**: 每个选中因子显示权重滑块 (0-100%)
**验收**: 手动打开页面检查

## 子任务 3: 综合评分计算 (20 分钟)
**文件**: `public/js/factor-panel.js`
**目标**: 实时计算并显示预估综合评分
**验收**: 调整滑块时评分实时更新

## 子任务 4: 配置保存 (15 分钟)
**文件**: `conditional-order.html`
**目标**: 因子权重配置保存到条件单表单
**验收**: 提交表单包含 factor_weights 字段
