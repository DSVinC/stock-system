# 测试套件文档

## 概述

本测试套件为 V4 决策引擎提供全面的测试覆盖，包括单元测试、集成测试、性能测试和验收测试。

## 测试结构

```
tests/
├── run-all-tests.js          # 测试运行器
├── test-decision-engine.js   # TASK_TEST_001: 决策引擎单元测试
├── test-backtest-integration.js  # TASK_TEST_002: 回测引擎集成测试
├── test-full-flow.js         # TASK_TEST_003: 完整流程集成测试
├── test-performance.js       # TASK_TEST_004: 性能测试
└── test-acceptance.js        # TASK_TEST_005: 验收对比测试
```

## 运行测试

### 运行所有测试

```bash
npm test
# 或
node tests/run-all-tests.js
```

### 运行特定测试套件

```bash
# 仅单元测试
npm run test:unit
node tests/run-all-tests.js --unit

# 仅集成测试
npm run test:integration
node tests/run-all-tests.js --integration

# 仅性能测试
npm run test:perf
node tests/run-all-tests.js --perf

# 仅验收测试
npm run test:acceptance
node tests/run-all-tests.js --acceptance
```

### 运行单个测试文件

```bash
npm run test:decision      # 决策引擎单元测试
npm run test:backtest      # 回测引擎集成测试
npm run test:flow          # 完整流程测试
npm run test:performance   # 性能测试
npm run test:accept        # 验收测试
```

## 测试内容详解

### TASK_TEST_001: 决策引擎单元测试

**文件**: `tests/test-decision-engine.js`

**测试内容**:
1. `preloadPrices()` 数据加载
2. `calculateMA()` MA 计算正确性
3. `calculateBollinger()` 布林带计算正确性
4. `generateDecision()` 决策单结构
5. 缓存命中率
6. 数据不足错误处理
7. 策略类型切换

**验证点**:
- 价格缓存正确加载
- MA 值在合理范围内
- 布林带上轨 > 中轨 > 下轨
- 决策单包含所有必需字段
- 缓存命中率 >= 80%

### TASK_TEST_002: 回测引擎集成测试

**文件**: `tests/test-backtest-integration.js`

**测试内容**:
1. `executeDailyRebalance()` 集成
2. 止损触发逻辑
3. 止盈触发逻辑
4. 三层错误处理策略
5. 手续费计算
6. 仓位计算
7. 权益曲线计算
8. 策略配置切换

**验证点**:
- 买入/卖出交易正确生成
- 止损价格准确触发
- 止盈价格准确触发
- Level 1 错误正确跳过
- 手续费和印花税计算正确

### TASK_TEST_003: 完整流程集成测试

**文件**: `tests/test-full-flow.js`

**测试内容**:
1. 选股→决策→回测→结果完整流程
2. 数据流正确性
3. 输出格式验证
4. 选股时点功能
5. 多策略类型
6. 极端情况处理

**验证点**:
- 完整流程无错误执行
- 权益曲线单调性
- 输出包含七项核心指标
- 未来函数防护启用
- 空选股、资金不足等极端情况处理

### TASK_TEST_004: 性能测试

**文件**: `tests/test-performance.js`

**测试内容**:
1. 1000 次决策缓存命中率
2. 批量预加载性能
3. 连续决策性能
4. 缓存有效性
5. 内存使用
6. 并发性能

**目标**:
- 缓存命中率 >= 80%
- 预加载 100 只股票 < 5 秒
- 单次决策 < 10ms
- 内存增长 < 10MB

### TASK_TEST_005: 验收对比测试

**文件**: `tests/test-acceptance.js`

**测试内容**:
1. 与原回测引擎对比
2. 决策单价格 vs 收盘价差异
3. 止损效果验证
4. 止盈效果验证
5. 交易成本计算
6. 风险控制验证

**验收标准**:
- 价格偏差 <= 5%
- 止损偏差 <= 3%
- 手续费计算正确
- 仓位控制符合规范

## 验收标准

### 必须满足

- [x] 所有测试通过
- [x] 代码覆盖率 > 80%
- [x] 性能达标（缓存命中率 >= 80%）
- [x] 文档完整

### 性能指标

| 指标 | 目标 | 实际 |
|------|------|------|
| 缓存命中率 | >= 80% | 测试验证 |
| 预加载时间 | < 5s/100只股票 | 测试验证 |
| 单次决策时间 | < 10ms | 测试验证 |
| 内存增长 | < 10MB | 测试验证 |

## 测试输出示例

```
======================================================================
V4 决策引擎测试套件
时间: 2026-03-26T15:05:00.000Z
======================================================================

======================================================================
运行测试套件: TASK_TEST_001: 决策引擎单元测试
======================================================================

▶ 测试: TEST_001_01: preloadPrices() 数据加载
  预加载了 3 只股票的价格数据
  ✓ 通过

▶ 测试: TEST_001_02: calculateMA() 计算正确性
  MA10 = 10.25
  缓存命中验证通过
  ✓ 通过

...

======================================================================
测试报告汇总
======================================================================

【测试套件结果】
  ✓ TASK_TEST_001: 决策引擎单元测试: 7 通过, 0 失败
  ✓ TASK_TEST_002: 回测引擎集成测试: 8 通过, 0 失败
  ✓ TASK_TEST_003: 完整流程集成测试: 6 通过, 0 失败
  ✓ TASK_TEST_004: 性能测试: 6 通过, 0 失败
  ✓ TASK_TEST_005: 验收对比测试: 6 通过, 0 失败

【总体结果】
  总测试数: 33
  通过: 33
  失败: 0
  通过率: 100.0%

【验收标准检查】
  ✓ 所有测试通过
  ✓ 代码覆盖率>80%
  ✓ 性能达标
  ✓ 文档完整

======================================================================
```

## 添加新测试

1. 在 `tests/` 目录创建新的测试文件
2. 继承测试基类结构
3. 在 `run-all-tests.js` 中添加测试套件

### 测试模板

```javascript
const assert = require('assert');

class MyTests {
  constructor() {
    this.results = { passed: 0, failed: 0, tests: [] };
  }

  async runTest(name, testFn) {
    console.log(`\n▶ 测试: ${name}`);
    try {
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
      console.log(`  ✓ 通过`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message });
      console.log(`  ✗ 失败: ${error.message}`);
    }
  }

  async testSomething() {
    assert.ok(true, '测试断言');
  }

  async runAll() {
    await this.runTest('测试名称', () => this.testSomething());
    return this.results;
  }
}

if (require.main === module) {
  new MyTests().runAll().then(r => process.exit(r.failed > 0 ? 1 : 0));
}

module.exports = { MyTests };
```

## 持续集成

测试套件可在 CI/CD 流程中运行：

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
```

## 相关文档

- [决策引擎设计](../docs/design/2026-03-26-v4-decision-engine-solution.md)
- [回测引擎架构](../api/backtest-engine.js)
- [API 文档](./API_CONTRACT_FLOW.md)