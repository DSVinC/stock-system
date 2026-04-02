# Bug 调查记录 - 策略库导入参数后选股结果不变

**创建时间**: 2026-04-01 09:53
**问题发现时间**: 2026-03-31 23:08
**优先级**: P0
**状态**: 🟢 fixed
**修复时间**: 2026-04-01 13:30

---

## 问题描述

### 症状
从策略库导入参数后，切换不同版本，刷新选股结果始终相同。

### 预期行为
选股结果应随四维度权重、PE/PEG 上限等参数变化而变化。

### 实际行为
- 行业分布不变
- 行业评分不变
- Top3 行业始终为：绿色电力 (90)、特高压 (85)、固废处理 (75)

---

## 根因分析

### 前端问题（主要）
`applyStrategyToUI()` 函数在保存配置后**没有调用 `loadSelectionData()`** 刷新选股结果。

**位置**: `select.html` 第 2351-2357 行

**修复**: 在 `saveConfig()` 后添加 `loadSelectionData()` 调用

### 数据问题（次要）
- `social_score` 所有股票都是 5.0（常量）
- `public_score` 所有股票都是 5.0（常量）
- 这意味着修改 social/public 权重不会影响排序
- 但 policy/business 有差异，修改这两个权重应该有效

---

## 修复内容

### 1. 前端修复 (select.html)
```javascript
// 在 applyStrategyToUI() 末尾添加
loadSelectionData();  // 刷新选股数据
```

### 2. 后端清理 (api/select.js)
- 移除 DEBUG 版本标记
- 移除 DEBUG 权重日志
- 移除 DEBUG 测试代码（硬编码修改绿色电力分数）

---

## 验证结果

### API 测试
```bash
# 默认权重
curl "http://127.0.0.1:3000/api/select?date=2026-03-24&strategy=seven_factor"
Top3: 电信运营(778), 半导体(733), 日用化工(720)

# business=0.9 权重
curl "http://127.0.0.1:3000/api/select?...&dimensionWeights={...business:0.9}"
Top3: 电信运营(528), 日用化工(503), 半导体(501)
```
排序确实发生变化（日用化工和半导体交换位置）。

### 单元测试
```
总测试数: 52
通过: 52
失败: 0
通过率: 100.0%
```

---

## 相关文件

| 文件 | 修改内容 |
|------|---------|
| `select.html` | 添加 `loadSelectionData()` 调用 |
| `api/select.js` | 移除 DEBUG 代码 |

---

**调查员**: 灵爪
**最后更新**: 2026-04-01 13:30
