# TASK_P1_003 交接文档

**任务名称**: 时间衰减函数优化  
**创建时间**: 2026-03-22 19:45  

---

## 🎯 任务目标

优化时间衰减函数，使情感因子更准确反映信息时效性。

---

## 📋 核心需求

1. **差异化衰减**: 新闻 12h，公告 5 天，财报 30 天
2. **衰减公式**: 指数衰减 `factor = e^(-λt)`
3. **可配置**: 支持自定义衰减曲线

---

## 🔧 技术要点

### 衰减公式
```javascript
const lambda = Math.log(2) / halfLife;
const factor = Math.exp(-lambda * elapsed);
```

---

## 📁 相关文件

- 依赖：TASK_P1_002 (异步流水线)
- 输出：`api/time-decay.js`

---

## ✅ 验收标准

详见 `docs/tasks/TASK_P1_003.md`
