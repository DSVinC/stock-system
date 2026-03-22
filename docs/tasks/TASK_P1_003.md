# TASK_P1_003 - 时间衰减函数优化

**优先级**: P1  
**类型**: 算法优化  
**状态**: `pending`  
**创建时间**: 2026-03-22 19:45  

---

## 📋 任务描述

优化时间衰减函数，使情感因子更准确反映信息时效性。

**现状问题**:
- 当前使用简单指数衰减
- 新闻和公告使用相同衰减曲线
- 未考虑信息类型差异

**目标**:
- 实现差异化衰减策略
- 新闻：12 小时半衰期
- 公告：5 天半衰期
- 重大事件：自定义衰减

---

## 🎯 验收标准

### 1. 功能要求
- [ ] 创建 `api/time-decay.js` 模块
- [ ] 导出函数：
  - `calculateDecayFactor(timestamp, itemType)`
  - `getHalfLife(itemType)`
  - `createDecayCurve(config)`
- [ ] 支持配置不同衰减曲线

### 2. 衰减策略
- [ ] 新闻快讯：半衰期 12 小时
- [ ] 公司公告：半衰期 5 天
- [ ] 财报数据：半衰期 30 天
- [ ] 重大事件：可配置

### 3. 衰减公式
- [ ] 支持指数衰减：`factor = e^(-λt)`
- [ ] 支持线性衰减（可选）
- [ ] 支持分段衰减（可选）

### 4. 测试要求
- [ ] 衰减曲线验证测试
- [ ] 边界条件测试
- [ ] 性能测试

---

## 📁 交付物

- [ ] `api/time-decay.js` (新模块)
- [ ] `api/time-decay.test.js` (测试)
- [ ] `docs/tasks/TASK_P1_003.md` (任务文档)
- [ ] `docs/handover/TASK_P1_003_HANDOVER.md` (交接文档)
- [ ] `docs/runtime/TASK_P1_003_STATUS.md` (运行时状态)
- [ ] `docs/acceptance/TASK_P1_003_ACCEPTANCE.md` (验收报告)

---

## 🔗 依赖关系

- 依赖：TASK_P1_002 (异步流水线)
- 被依赖：无

---

## 📝 实现提示

### 衰减公式
```javascript
function calculateDecayFactor(timestamp, itemType = 'news') {
  const halfLife = getHalfLife(itemType); // 小时
  const elapsed = (Date.now() - timestamp) / (1000 * 60 * 60); // 小时
  const lambda = Math.log(2) / halfLife;
  return Math.exp(-lambda * elapsed);
}

function getHalfLife(itemType) {
  const config = {
    'news': 12,      // 12 小时
    'announcement': 120,  // 5 天
    'earnings': 720,  // 30 天
    'major_event': 48  // 2 天
  };
  return config[itemType] || 12;
}
```

---

## ⏱️ 预估工时

- 开发：1 小时
- 测试：30 分钟
- 验收：30 分钟
