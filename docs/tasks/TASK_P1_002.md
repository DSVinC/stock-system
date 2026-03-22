# TASK_P1_002 - 异步流水线模块

**优先级**: P1  
**类型**: 性能优化  
**状态**: `pending`  
**创建时间**: 2026-03-22 19:45  

---

## 📋 任务描述

实现异步并发流水线，提升批量情感分析性能。

**现状问题**:
- 当前批量分析是串行处理
- 100 条新闻需要 100+ 秒
- 无法利用 LLM 并发能力

**目标**:
- 实现并发流水线
- 100 条新闻 ≤30 秒完成
- 支持进度追踪
- 支持中断恢复

---

## 🎯 验收标准

### 1. 功能要求
- [ ] 创建 `api/async-pipeline.js` 模块
- [ ] 导出函数：
  - `runPipeline(items, processor, options)`
  - `createBatchProcessor(config)`
  - `getPipelineProgress(pipelineId)`
- [ ] 支持并发度配置（默认 5）
- [ ] 支持进度回调

### 2. 性能要求
- [ ] 100 条新闻分析 ≤30 秒
- [ ] 并发度可配置（1-20）
- [ ] 内存占用 ≤100MB

### 3. 错误处理
- [ ] 单条失败不影响整体
- [ ] 失败重试机制（最多 3 次）
- [ ] 错误日志记录

### 4. 进度追踪
- [ ] 实时进度查询
- [ ] 已完成/失败/待处理计数
- [ ] 预计剩余时间

### 5. 测试要求
- [ ] 压力测试（1000 条数据）
- [ ] 并发测试（并发度 10）
- [ ] 错误注入测试

---

## 📁 交付物

- [ ] `api/async-pipeline.js` (新模块)
- [ ] `api/async-pipeline.test.js` (测试)
- [ ] `docs/tasks/TASK_P1_002.md` (任务文档)
- [ ] `docs/handover/TASK_P1_002_HANDOVER.md` (交接文档)
- [ ] `docs/runtime/TASK_P1_002_STATUS.md` (运行时状态)
- [ ] `docs/acceptance/TASK_P1_002_ACCEPTANCE.md` (验收报告)

---

## 🔗 依赖关系

- 依赖：TASK_P1_001 (LLM 情感分析)
- 被依赖：TASK_P1_003 (时间衰减优化)

---

## 📝 实现提示

### 并发控制
```javascript
async function runPipeline(items, processor, options = {}) {
  const concurrency = options.concurrency || 5;
  const results = [];
  const errors = [];
  
  // 使用信号量控制并发
  const semaphore = new Semaphore(concurrency);
  
  const tasks = items.map((item, index) => 
    semaphore.wrap(async () => {
      try {
        const result = await processor(item);
        results[index] = { success: true, data: result };
      } catch (e) {
        errors.push({ index, error: e.message });
        results[index] = { success: false, error: e.message };
      }
    })
  );
  
  await Promise.all(tasks);
  return { results, errors };
}
```

---

## ⏱️ 预估工时

- 开发：1.5 小时
- 测试：1 小时
- 验收：30 分钟
