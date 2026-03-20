# 测试重构报告

日期: 2026-03-20

## 背景

`scripts/test-daily-monitor-scenarios.mjs` 与 `scripts/test-error-handling.mjs` 内部复制了 `scripts/daily-monitor.mjs` 的核心实现，存在测试漂移风险。测试逻辑一旦与生产代码分叉，测试通过也无法证明真实行为正确。

## 本次改动

1. 在 `scripts/daily-monitor.mjs` 中导出以下生产函数，供测试直接复用：
   - `generatePositionAssessment`
   - `generateAccountSummary`
   - `generateReportOverview`
   - `parseAnalysisReport`
   - `findAnalysisReport`
2. 将数据库加载改为延迟执行，仅在 `main()` 中触发，避免测试导入模块时带入 CLI/数据库副作用。
3. 将 CLI 启动改为仅在直接执行 `scripts/daily-monitor.mjs` 时运行，保证模块可安全导入。
4. `scripts/test-daily-monitor-scenarios.mjs` 改为直接导入生产函数，删除复制实现。
5. `scripts/test-error-handling.mjs` 改为直接导入生产函数，删除复制实现。
6. `findAnalysisReport` 增加可选目录参数，默认行为不变，便于测试在隔离目录下验证查找逻辑。

## 发现并修正的测试漂移

在“单账户多持仓”场景中，原测试断言预期有 `2` 个高风险持仓，但按生产规则实际应为 `1` 个：

- `宁德时代`：收益率 `-15.0%`，命中高风险。
- `贵州茅台`：评分 `2.5`，仅命中中风险，不属于高风险。

此前由于测试复制实现且断言未被及时校正，造成了预期与真实规则不一致。现已将断言修正为与生产实现一致。

## 验证结果

执行命令：

```bash
node scripts/test-daily-monitor-scenarios.mjs
node scripts/test-error-handling.mjs
```

结果：

- `test-daily-monitor-scenarios.mjs` 通过
- `test-error-handling.mjs` 通过

## 影响评估

- 生产功能保持不变。
- 测试改为直接依赖生产实现，降低后续维护中的漂移风险。
- 模块导入与 CLI 执行职责分离，后续更适合继续抽取单元测试。
