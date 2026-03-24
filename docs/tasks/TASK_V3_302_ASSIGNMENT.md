# TASK_V3_302 任务分配

**任务名称**: 8 核并行支持  
**优先级**: P2  
**预计工期**: 1 天  
**分配日期**: 2026-03-24 16:20  
**分配给**: Claude Code  

---

## 📋 任务描述

为联合优化器实现 8 核并行计算支持，将计算时间从 33 分钟降低到 4 分钟。

---

## 🎯 验收标准

### 核心功能
- [ ] 使用 Worker Threads 实现真正的多核并行
- [ ] 支持自定义 worker 数量（默认 8 核）
- [ ] 并行执行阶段 1（选股参数优化）的 10,000 次回测
- [ ] 并行执行阶段 2（网格步长优化）的 500 次回测
- [ ] 正确汇总各 worker 的计算结果

### 性能要求
- [ ] 8 核并行后，阶段 1 耗时 < 3 分钟（原 17 分钟）
- [ ] 8 核并行后，阶段 2 耗时 < 3 分钟（原 17 分钟）
- [ ] 总体计算时间 < 6 分钟（原 33 分钟）
- [ ] CPU 利用率 ≥ 80%

### 稳定性要求
- [ ] Worker 异常时自动重试（最多 3 次）
- [ ] 支持优雅关闭（SIGINT/SIGTERM）
- [ ] 内存泄漏检测（每个 worker < 500MB）

---

## 📁 交付文件

- `api/parallel-executor.js` - 并行执行器核心逻辑
- `scripts/run_parallel_optimizer.mjs` - 并行优化命令行工具
- `test/parallel-executor.test.js` - 单元测试

---

## 📖 参考文档

- `docs/DESIGN_CONSENSUS.md` 第 11.10 节（计算量对比）
- `api/grid-optimizer.js` - 参考 Worker 实现（TASK_V3_204）

---

## 🔧 技术要点

### Worker 线程池
```javascript
// 使用 worker_threads 模块
// 创建 8 个 worker 实例
// 任务队列分发
```

### 任务分发策略
```javascript
// 阶段 1: 10,000 次 / 8 workers = 1,250 次/worker
// 阶段 2: 500 次 / 8 workers = 63 次/worker
```

### 结果汇总
```javascript
// 各 worker 返回局部最优结果
// 主线程汇总，选择全局最优
```

---

## ⚠️ 注意事项

1. 参考 TASK_V3_204 的 Worker 实现，避免 Promise.all 并发陷阱
2. 正确处理 worker 通信协议（message.data 解包）
3. 添加详细的并行执行日志

---

**分配人**: 灵爪  
**状态**: `assigned`
