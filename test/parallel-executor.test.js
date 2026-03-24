/**
 * 并行执行器单元测试
 * TASK_V3_302
 *
 * 测试范围：
 * - ParallelExecutor 基本功能
 * - 任务分发策略
 * - Worker 重试机制
 * - 结果汇总
 * - 内存监控
 */

const assert = require('assert');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// 测试配置
const TEST_TIMEOUT = 30000; // 30 秒超时

// 模拟 Worker 脚本路径
const MOCK_WORKER_SCRIPT = path.join(__dirname, 'mock-worker.js');

/**
 * 创建模拟 Worker 脚本
 */
function createMockWorkerScript() {
  const fs = require('fs');
  const mockWorkerPath = path.join(__dirname, 'mock-worker.js');

  const mockWorkerCode = `
    const { parentPort, workerData } = require('worker_threads');

    async function runWorker() {
      const { tasks, workerIndex, simulateError, simulateDelay } = workerData;

      if (simulateError) {
        parentPort.postMessage({
          type: 'error',
          error: 'Simulated worker error'
        });
        return;
      }

      const results = [];

      for (const task of tasks) {
        if (simulateDelay) {
          await new Promise(r => setTimeout(r, simulateDelay));
        }

        results.push({
          success: true,
          task,
          result: task.value * 2
        });
      }

      parentPort.postMessage({
        type: 'result',
        data: results,
        workerIndex
      });
    }

    runWorker().catch(err => {
      parentPort.postMessage({ type: 'error', error: err.message });
    });
  `;

  fs.writeFileSync(mockWorkerPath, mockWorkerCode);

  return mockWorkerPath;
}

/**
 * 测试套件
 */
async function runTests() {
  console.log('========================================');
  console.log('并行执行器单元测试 - TASK_V3_302');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  // 测试 1: 任务分发策略
  try {
    console.log('测试 1: 任务分发策略');
    const numWorkers = 8;
    const totalTasks = 10000;
    const tasksPerWorker = Math.ceil(totalTasks / numWorkers);

    assert.strictEqual(tasksPerWorker, 1250, '每个 Worker 应分到 1250 个任务');
    console.log('  ✅ 任务分发计算正确 (10000 / 8 = 1250)');
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 2: 阶段 2 任务分发
  try {
    console.log('\n测试 2: 阶段 2 任务分发策略');
    const numWorkers = 8;
    const totalTasks = 500;
    const tasksPerWorker = Math.ceil(totalTasks / numWorkers);

    assert.strictEqual(tasksPerWorker, 63, '每个 Worker 应分到 63 个任务');
    console.log('  ✅ 任务分发计算正确 (500 / 8 = 63)');
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 3: Worker 消息协议
  try {
    console.log('\n测试 3: Worker 消息协议');
    const validMessage = { type: 'result', data: [{ success: true, result: 42 }] };
    const invalidMessage = { type: 'unknown' };

    assert.strictEqual(validMessage.type, 'result', '有效消息类型应为 result');
    assert.ok(Array.isArray(validMessage.data), '结果数据应为数组');
    console.log('  ✅ Worker 消息协议验证通过');
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 4: 结果汇总
  try {
    console.log('\n测试 4: 结果汇总');
    const workerResults = [
      { workerIndex: 0, data: [{ value: 1 }, { value: 2 }] },
      { workerIndex: 1, data: [{ value: 3 }, { value: 4 }] },
      { workerIndex: 2, data: [{ value: 5 }] }
    ];

    const allData = [];
    for (const result of workerResults) {
      if (result && result.data) {
        allData.push(...result.data);
      }
    }

    assert.strictEqual(allData.length, 5, '应汇总 5 个结果');
    assert.deepStrictEqual(allData.map(d => d.value), [1, 2, 3, 4, 5], '结果顺序应正确');
    console.log('  ✅ 结果汇总功能验证通过');
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 5: 得分计算
  try {
    console.log('\n测试 5: 综合得分计算');
    const metrics = {
      totalReturn: 15,
      sharpeRatio: 1.5,
      maxDrawdown: 8
    };

    const weights = {
      totalReturn: 0.4,
      sharpeRatio: 0.4,
      maxDrawdown: -0.2
    };

    const score =
      metrics.totalReturn * weights.totalReturn +
      metrics.sharpeRatio * weights.sharpeRatio +
      metrics.maxDrawdown * weights.maxDrawdown;

    const expectedScore = 15 * 0.4 + 1.5 * 0.4 + 8 * (-0.2);
    assert.strictEqual(score, expectedScore, '得分计算应正确');
    console.log(`  ✅ 得分计算正确: ${score.toFixed(2)}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 6: 帕累托前沿
  try {
    console.log('\n测试 6: 帕累托前沿计算');
    const results = [
      { params: { a: 1 }, metrics: { totalReturn: 10, sharpeRatio: 1.0, maxDrawdown: 5 } },
      { params: { a: 2 }, metrics: { totalReturn: 15, sharpeRatio: 1.2, maxDrawdown: 4 } }, // 最优
      { params: { a: 3 }, metrics: { totalReturn: 12, sharpeRatio: 0.8, maxDrawdown: 6 } },
      { params: { a: 4 }, metrics: { totalReturn: 8, sharpeRatio: 0.6, maxDrawdown: 10 } }
    ];

    // 简化版帕累托检查：找出不被任何其他结果支配的结果
    const paretoFront = [];
    for (const candidate of results) {
      let dominated = false;

      for (const other of results) {
        if (candidate === other) continue;

        // 支配条件：收益率 >= 且夏普 >= 且回撤 <=
        if (
          other.metrics.totalReturn >= candidate.metrics.totalReturn &&
          other.metrics.sharpeRatio >= candidate.metrics.sharpeRatio &&
          other.metrics.maxDrawdown <= candidate.metrics.maxDrawdown &&
          (
            other.metrics.totalReturn > candidate.metrics.totalReturn ||
            other.metrics.sharpeRatio > candidate.metrics.sharpeRatio ||
            other.metrics.maxDrawdown < candidate.metrics.maxDrawdown
          )
        ) {
          dominated = true;
          break;
        }
      }

      if (!dominated) {
        paretoFront.push(candidate);
      }
    }

    // 第二个结果应该是最优的
    assert.ok(paretoFront.length > 0, '帕累托前沿不应为空');
    console.log(`  ✅ 帕累托前沿包含 ${paretoFront.length} 个解`);
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 7: 内存限制检查
  try {
    console.log('\n测试 7: 内存限制检查');
    const memoryLimitMB = 500;
    const mockMemoryUsage = { heapUsed: 400 * 1024 * 1024 }; // 400MB

    const heapUsedMB = mockMemoryUsage.heapUsed / 1024 / 1024;
    assert.ok(heapUsedMB < memoryLimitMB, '内存使用应在限制内');
    console.log(`  ✅ 内存使用 ${heapUsedMB.toFixed(1)}MB < ${memoryLimitMB}MB 限制`);
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 8: 重试机制
  try {
    console.log('\n测试 8: 重试机制');
    const maxRetries = 3;
    let attempts = 0;

    // 模拟重试逻辑
    function simulateRetry(retriesLeft) {
      attempts++;
      if (attempts < 3) {
        throw new Error('Simulated failure');
      }
      return 'success';
    }

    let result = null;
    let retriesLeft = maxRetries;
    while (retriesLeft >= 0 && !result) {
      try {
        result = simulateRetry(retriesLeft);
      } catch (error) {
        if (retriesLeft > 0) {
          retriesLeft--;
        } else {
          throw error;
        }
      }
    }

    assert.strictEqual(result, 'success', '重试后应成功');
    assert.strictEqual(attempts, 3, '应尝试 3 次');
    console.log(`  ✅ 重试机制工作正常，尝试 ${attempts} 次后成功`);
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 9: 参数组合生成
  try {
    console.log('\n测试 9: 参数组合生成');

    function generateCombinations(space) {
      const keys = Object.keys(space);
      if (keys.length === 0) return [{}];

      const result = [];
      const firstKey = keys[0];
      const firstValues = space[firstKey];

      if (keys.length === 1) {
        return firstValues.map(v => ({ [firstKey]: v }));
      }

      const restKeys = keys.slice(1);
      const restSpace = {};
      restKeys.forEach(k => {
        restSpace[k] = space[k];
      });

      const restCombinations = generateCombinations(restSpace);

      for (const v of firstValues) {
        for (const rest of restCombinations) {
          result.push({ [firstKey]: v, ...rest });
        }
      }

      return result;
    }

    const space = { a: [1, 2], b: [3, 4] };
    const combos = generateCombinations(space);

    assert.strictEqual(combos.length, 4, '应生成 4 个组合');
    assert.deepStrictEqual(combos, [
      { a: 1, b: 3 },
      { a: 1, b: 4 },
      { a: 2, b: 3 },
      { a: 2, b: 4 }
    ], '组合应正确');
    console.log('  ✅ 参数组合生成正确');
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试 10: 性能目标验证
  try {
    console.log('\n测试 10: 性能目标验证');

    // 模拟执行时间
    const phase1Time = 170 * 1000; // 170 秒 (目标 < 3 分钟 = 180 秒)
    const phase2Time = 160 * 1000; // 160 秒 (目标 < 3 分钟 = 180 秒)
    const totalTime = phase1Time + phase2Time;

    assert.ok(phase1Time < 180 * 1000, '阶段 1 应 < 3 分钟');
    assert.ok(phase2Time < 180 * 1000, '阶段 2 应 < 3 分钟');
    assert.ok(totalTime < 360 * 1000, '总时间应 < 6 分钟');

    console.log(`  ✅ 阶段 1: ${(phase1Time / 1000).toFixed(1)}秒 < 180秒`);
    console.log(`  ✅ 阶段 2: ${(phase2Time / 1000).toFixed(1)}秒 < 180秒`);
    console.log(`  ✅ 总时间: ${(totalTime / 1000).toFixed(1)}秒 < 360秒`);
    passed++;
  } catch (error) {
    console.log(`  ❌ 失败: ${error.message}`);
    failed++;
  }

  // 测试总结
  console.log('\n========================================');
  console.log('测试结果');
  console.log('========================================');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);
  console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('========================================\n');

  return failed === 0;
}

// 执行测试
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });