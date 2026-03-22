/**
 * 异步流水线模块测试
 */

const { runPipeline, createBatchProcessor, getPipelineProgress } = require('./async-pipeline');

// 测试用例
async function runTests() {
  console.log('=== 异步流水线模块测试 ===\n');
  
  let passed = 0;
  let failed = 0;

  // 测试 1: 基本功能测试
  console.log('测试 1: 基本功能测试');
  try {
    const items = [1, 2, 3, 4, 5];
    const processor = async (item) => item * 2;
    
    const result = await runPipeline(items, processor, { concurrency: 2 });
    
    if (result.success && result.completed === 5 && result.failed === 0) {
      console.log('✅ 通过\n');
      passed++;
    } else {
      console.log(`❌ 失败：${JSON.stringify(result)}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 测试 2: 并发控制测试
  console.log('测试 2: 并发控制测试');
  try {
    const items = Array.from({ length: 10 }, (_, i) => i);
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    
    const processor = async (item) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise(resolve => setTimeout(resolve, 100));
      currentConcurrent--;
      return item;
    };
    
    const result = await runPipeline(items, processor, { concurrency: 3 });
    
    if (maxConcurrent <= 3 && result.completed === 10) {
      console.log(`✅ 通过（最大并发：${maxConcurrent}）\n`);
      passed++;
    } else {
      console.log(`❌ 失败：最大并发${maxConcurrent}超过限制\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 测试 3: 错误处理测试
  console.log('测试 3: 错误处理测试');
  try {
    const items = [1, 2, 3, 4, 5];
    const processor = async (item) => {
      if (item === 3) throw new Error('模拟错误');
      return item;
    };
    
    const result = await runPipeline(items, processor, { concurrency: 2, maxRetries: 1 });
    
    if (result.completed === 4 && result.failed === 1) {
      console.log('✅ 通过（单条失败不影响整体）\n');
      passed++;
    } else {
      console.log(`❌ 失败：${JSON.stringify(result)}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 测试 4: 批量处理器测试
  console.log('测试 4: 批量处理器测试');
  try {
    const batchProcessor = createBatchProcessor({ concurrency: 3 });
    const items = [1, 2, 3, 4, 5];
    const processor = async (item) => item * 2;
    
    const result = await batchProcessor(items, processor);
    
    if (result.success && result.completed === 5) {
      console.log('✅ 通过\n');
      passed++;
    } else {
      console.log(`❌ 失败：${JSON.stringify(result)}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ 异常：${error.message}\n`);
    failed++;
  }

  // 统计测试
  console.log('=== 测试统计 ===');
  console.log(`通过：${passed}/${passed + failed}`);
  console.log(`失败：${failed}/${passed + failed}`);
  
  return failed === 0;
}

// 导出测试函数
module.exports = { runTests };

// 如果直接运行
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
