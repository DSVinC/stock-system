# V4 浏览器验收问题修复状态

**修复日期**: 2026-03-26 12:30 GMT+8  
**修复依据**: Codex 验收报告 `report/browser-acceptance-stock-system-v4-2026-03-26.md`  
**修复状态**: ✅ 完成

---

## 修复清单

| # | 问题 | 文件 | 行号 | 状态 |
|---|------|------|------|------|
| 1 | 筛选参数未传到 API | `select.html` | ~970 | ✅ 已修复 |
| 2 | 决策数据缺失 stop_loss/target_prices | `select.html` | ~1010 | ✅ 已修复 |
| 3 | DOM ID 错误 (strategySelector) | `backtest.html` | ~2603 | ✅ 已修复 |
| 4 | 联合回测字段名不一致 (strategy→coreStrategy) | `backtest.html` | ~2771 | ✅ 已修复 |

---

## 修复详情

### 修复 1：select.html 请求参数下发

**改动位置**: `select.html` 第 970-982 行

**改动内容**:
```javascript
// 修改前
if (config.minScore > 0) stockParams.set('minScore', config.minScore);
const selectRes = await fetch('/api/select');

// 修改后
if (config.minScore > 0) {
  stockParams.set('minSevenFactorScore', (config.minScore / 100).toFixed(2));
}
const selectRes = await fetch('/api/select?' + stockParams.toString());
```

**说明**: 
- 前端 `minScore` 是百分制 (0-100)，后端 `minSevenFactorScore` 是小数 (0-1)，需要转换
- 参数需要实际拼接到 URL，不能只构建不发送

---

### 修复 2：select.html 决策数据完整映射

**改动位置**: `select.html` 第 1010-1017 行

**改动内容**:
```javascript
// 修改前
return {
  ...stock,
  decision: decision ? decision.decision : null,
  entry_zone: decision ? decision.entry_zone : null
};

// 修改后
return {
  ...stock,
  decision: decision ? decision.decision : null,
  entry_zone: decision ? decision.entry_zone : null,
  stop_loss: decision ? decision.stop_loss : null,
  target_prices: decision ? decision.target_prices : null
};
```

**说明**: 后端已生成完整决策字段，前端需要全部映射到股票对象

---

### 修复 3：backtest.html DOM ID 修正

**改动位置**: `backtest.html` 第 2603 行

**改动内容**:
```javascript
// 修改前
const strategy = document.getElementById('strategySelector').value;

// 修改后
const strategy = document.getElementById('strategySelect').value;
```

**说明**: 页面实际 ID 是 `strategySelect`，不是 `strategySelector`

---

### 修复 4：backtest.html 联合回测字段名修正

**改动位置**: `backtest.html` 第 2771 行

**改动内容**:
```javascript
// 修改前
strategy: strategyConfig,

// 修改后
coreStrategy: strategyConfig,
```

**说明**: 后端 `/api/backtest/joint/run` 解构的是 `coreStrategy`，不是 `strategy`

---

## 验证结果

- ✅ `api/select.js` 语法检查通过
- ✅ `api/backtest.js` 语法检查通过
- ✅ 文件修改已保存

---

## 下一步

1. 通知灵爪启动重新验收
2. 验收环境：需要在非沙箱环境运行真实浏览器测试
3. 验收重点：
   - 选股页面参数传递（日期、PE、最低分）
   - 决策数据完整显示（建仓区间、止损价、止盈目标）
   - 联合选股功能正常运行
   - 联合回测策略配置生效

---

**修复人**: Claude Code (灵爪小弟)  
**验收人**: Codex (待重新验收)
