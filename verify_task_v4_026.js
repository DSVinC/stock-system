
const FactorSnapshotBacktest = require('./api/backtest-engine');
const { getDatabase } = require('./api/db');

async function verify() {
  const db = getDatabase();
  console.log('--- 验证 TASK_V4_026 ---');

  const backtest = new FactorSnapshotBacktest({
    initialCapital: 1000000,
    selectionDate: '2026-03-20'
  });

  const params = {
    startDate: '2026-03-20', // Should be overridden by selectionDate logic
    endDate: '2026-03-24',
    selectionDate: '2026-03-20',
    strategyConfig: {
      positionLimit: 5
    }
  };

  try {
    const result = await backtest.run(params);

    console.log('\n--- 验收检查 ---');
    
    // 1. selectionDate 参数支持
    const hasSelectionDateParam = result.backtestInfo && result.backtestInfo.selectionDate === '2026-03-20';
    console.log(`1. selectionDate 参数支持: ${hasSelectionDateParam ? '✅' : '❌'}`);

    // 2. 使用快照数据选股
    const hasSnapshotCount = result.backtestInfo && result.backtestInfo.selectionSnapshotCount > 0;
    console.log(`2. 使用快照数据选股 (快照数: ${result.backtestInfo.selectionSnapshotCount}): ${hasSnapshotCount ? '✅' : '❌'}`);

    // 3. 回测区间正确 (selectionDate 之后)
    const startDateCorrect = result.backtestInfo && result.backtestInfo.backtestStartDate === '2026-03-23';
    console.log(`3. 回测开始日期正确 (预计 2026-03-23, 实际 ${result.backtestInfo.backtestStartDate}): ${startDateCorrect ? '✅' : '❌'}`);

    // 4. 回测报告记录选股时点
    const hasBacktestInfo = !!result.backtestInfo;
    console.log(`4. 回测报告包含 backtestInfo: ${hasBacktestInfo ? '✅' : '❌'}`);

    // 5. 未来函数防护验证
    const hasFutureProtection = result.backtestInfo && result.backtestInfo.futureFunctionProtection === true;
    console.log(`5. 未来函数防护标志启用: ${hasFutureProtection ? '✅' : '❌'}`);

    // 检查是否有选股结果
    const hasSelectedStocks = result.details && result.details.selectedStocks && result.details.selectedStocks.length > 0;
    console.log(`6. 包含选股结果 (结果数: ${result.details.selectedStocks ? result.details.selectedStocks.length : 0}): ${hasSelectedStocks ? '✅' : '❌'}`);

    if (hasSelectionDateParam && hasSnapshotCount && startDateCorrect && hasBacktestInfo && hasFutureProtection && hasSelectedStocks) {
      console.log('\nTASK_V4_026 验收通过！');
    } else {
      console.log('\nTASK_V4_026 验收失败，请检查逻辑。');
    }

  } catch (error) {
    console.error('运行回测出错:', error);
  } finally {
    process.exit(0);
  }
}

verify();
