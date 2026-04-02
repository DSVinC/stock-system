# BUG_SELECT_IMPORT_001 状态

**任务名称**: 策略库导入参数后选股结果不变
**优先级**: P0
**状态**: 🟢 done
**开发者**: Claude Code
**验收员**: 待验收
**完成时间**: 2026-04-01 13:30

---

## 问题描述

从策略库导入参数后，切换不同版本，选股结果始终相同。

## 根因

前端 `applyStrategyToUI()` 函数保存配置后没有调用 `loadSelectionData()` 刷新选股结果。

## 修复内容

### select.html
- 在 `applyStrategyToUI()` 末尾添加 `loadSelectionData()` 调用

### api/select.js
- 移除 DEBUG 版本标记
- 移除 DEBUG 权重日志
- 移除 DEBUG 测试代码

## 验证结果

### API 测试
- 默认权重: Top3 = 电信运营、半导体、日用化工
- business=0.9: Top3 = 电信运营、日用化工、半导体（排序变化）

### 单元测试
- 52/52 通过

## 验收命令

```bash
# 启动服务器
node api/server.js

# 测试 API
curl "http://127.0.0.1:3000/api/select?date=2026-03-24&strategy=seven_factor"
curl "http://127.0.0.1:3000/api/select?date=2026-03-24&strategy=seven_factor&dimensionWeights=%7B%22social%22%3A0.03%2C%22policy%22%3A0.03%2C%22public%22%3A0.04%2C%22business%22%3A0.9%7D"

# 运行测试
npm test
```