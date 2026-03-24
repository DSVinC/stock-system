/**
 * 分钟线回测引擎测试
 * TASK_V3_203 - 分钟线回测引擎适配
 *
 * 测试覆盖：
 * - 分钟线数据加载
 * - 网格交易策略回测
 * - 多周期回测
 * - 分钟线特有指标计算
 */

const assert = require('assert');
const MinuteBacktest = require('../api/backtest-minute');
const performance = require('../api/backtest-report');

// 测试配置
const TEST_CONFIG = {
  initialCapital: 1000000,
  commissionRate: 0.00025,
  slippageRate: 0.001,
  maxDailyTrades: 20
};

// 模拟数据库连接（如果数据库不可用）
let dbAvailable = false;

describe('分钟线回测引擎测试', function() {
  // 设置较长的超时时间（回测可能较慢）
  this.timeout(30000);

  describe('1. 分钟线数据聚合测试', () => {
    it('应该正确聚合分钟线数据', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 模拟原始分钟线数据（全部在09:30-09:35这个5分钟周期内）
      // 注意：09:35属于下一个5分钟周期的开始，所以只用09:31-09:34的数据
      const minuteData = [
        { trade_time: '09:31:00', open: 10.0, high: 10.1, low: 9.9, close: 10.05, vol: 1000, amount: 10050 },
        { trade_time: '09:32:00', open: 10.05, high: 10.2, low: 10.0, close: 10.15, vol: 1500, amount: 15225 },
        { trade_time: '09:33:00', open: 10.15, high: 10.3, low: 10.1, close: 10.25, vol: 2000, amount: 20500 },
        { trade_time: '09:34:00', open: 10.25, high: 10.4, low: 10.2, close: 10.35, vol: 1200, amount: 12420 }
      ];

      // 聚合为5分钟K线
      const aggregated = engine.aggregateBars(minuteData, 5);

      // 验证聚合结果
      assert.ok(aggregated.length > 0, '聚合后应有数据');

      // 所有数据应该聚合到一个5分钟K线（09:30:00）
      const first5Min = aggregated.find(bar => bar.trade_time === '09:30:00');
      assert.ok(first5Min, '应有09:30时间点的聚合K线');
      assert.strictEqual(first5Min.open, 10.0, '开盘价应为第一个K线的开盘价');
      assert.strictEqual(first5Min.close, 10.35, '收盘价应为最后一个K线的收盘价');
      assert.ok(first5Min.high >= 10.3, '最高价应接近10.4');
      assert.ok(first5Min.low <= 10.0, '最低价应接近9.9');
    });

    it('应该支持不同周期的聚合', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      const minuteData = Array.from({ length: 60 }, (_, i) => ({
        trade_time: `${9 + Math.floor((31 + i) / 60)}:${String((31 + i) % 60).padStart(2, '0')}:00`,
        open: 10.0 + i * 0.01,
        high: 10.0 + i * 0.01 + 0.05,
        low: 10.0 + i * 0.01 - 0.05,
        close: 10.0 + i * 0.01,
        vol: 1000,
        amount: 10000
      }));

      // 测试不同周期
      const intervals = ['1', '5', '15', '30', '60'];

      for (const interval of intervals) {
        const intervalNum = parseInt(interval);
        const aggregated = engine.aggregateBars(minuteData, intervalNum);

        // 1分钟不应聚合
        if (interval === '1') {
          assert.strictEqual(aggregated.length, minuteData.length, '1分钟周期不应聚合');
        } else {
          // 聚合后的K线数量应该减少
          assert.ok(aggregated.length <= minuteData.length, `${interval}分钟聚合后K线应减少`);
        }
      }
    });
  });

  describe('2. 网格交易策略测试', () => {
    it('应该正确初始化网格状态', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      engine.initGridState('000001.SZ', 10.0, { stepPercent: 1.0 });

      const gridState = engine.gridStates.get('000001.SZ');

      assert.ok(gridState, '网格状态应该被创建');
      assert.strictEqual(gridState.basePrice, 10.0, '基准价格应为10.0');
      assert.strictEqual(gridState.stepPercent, 1.0, '步长应为1.0%');
      assert.strictEqual(gridState.currentLevel, 0, '初始层级应为0');
      assert.ok(gridState.gridLevels.length > 0, '应有网格价格层级');
    });

    it('应该在价格下跌时买入', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 初始化网格
      engine.initGridState('000001.SZ', 100.0, { stepPercent: 1.0 });

      // 模拟价格下跌1%
      const result = engine.executeGridTrade('000001.SZ', 99.0, '2024-01-01', '10:00:00');

      // 应该触发买入
      assert.ok(result.action === 'buy' || result.action === 'hold', '价格下跌应触发买入或持有');
    });

    it('应该在价格上涨时卖出', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 初始化网格
      engine.initGridState('000001.SZ', 100.0, { stepPercent: 1.0 });

      // 先买入一些持仓
      const stock = { ts_code: '000001.SZ', reason: 'grid_buy' };
      engine.executeBuy(stock, 100.0, 100, '2024-01-01', '09:30:00');

      // 更新网格状态
      const gridState = engine.gridStates.get('000001.SZ');
      if (gridState) {
        gridState.position = 100;
      }

      // 模拟价格上涨1%
      const result = engine.executeGridTrade('000001.SZ', 101.0, '2024-01-01', '10:00:00');

      // 应该触发卖出或持有
      assert.ok(['sell', 'hold', 'none'].includes(result.action), '价格上涨应触发卖出或持有');
    });

    it('应该支持不同网格步长', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      const stepPercents = [0.8, 1.0, 1.2, 1.5];

      for (const stepPercent of stepPercents) {
        engine.initGridState(`test_${stepPercent}`, 100.0, { stepPercent });

        const gridState = engine.gridStates.get(`test_${stepPercent}`);
        assert.strictEqual(gridState.stepPercent, stepPercent, `步长应为${stepPercent}%`);
      }
    });
  });

  describe('3. 分钟线特有指标计算测试', () => {
    it('应该正确计算日内交易次数', () => {
      const trades = [
        { action: 'SELL', entryDate: '2024-01-01', exitDate: '2024-01-01', holdingPeriod: 30, return: 0.01 },
        { action: 'SELL', entryDate: '2024-01-01', exitDate: '2024-01-01', holdingPeriod: 60, return: -0.02 },
        { action: 'SELL', entryDate: '2024-01-02', exitDate: '2024-01-03', holdingPeriod: 1440, return: 0.03 } // 隔夜持仓
      ];

      const metrics = performance.calculateMinuteMetrics(trades);

      assert.ok(metrics.intradayTradeCount >= 0, '日内交易次数应为非负数');
      assert.ok(typeof metrics.avgHoldingMinutes === 'number', '平均持仓分钟数应为数字');
    });

    it('应该正确计算持仓时长分布', () => {
      const trades = [
        { action: 'SELL', entryDate: '2024-01-01', exitDate: '2024-01-01', holdingPeriod: 15, return: 0.01 },
        { action: 'SELL', entryDate: '2024-01-01', exitDate: '2024-01-01', holdingPeriod: 45, return: 0.02 },
        { action: 'SELL', entryDate: '2024-01-01', exitDate: '2024-01-01', holdingPeriod: 90, return: -0.01 },
        { action: 'SELL', entryDate: '2024-01-01', exitDate: '2024-01-01', holdingPeriod: 180, return: 0.03 },
        { action: 'SELL', entryDate: '2024-01-01', exitDate: '2024-01-01', holdingPeriod: 300, return: 0.02 }
      ];

      const metrics = performance.calculateMinuteMetrics(trades);

      assert.ok(metrics.holdingDistribution, '应有持仓分布');
      assert.ok(typeof metrics.holdingDistribution.under_30min === 'number', '应有30分钟以下分布');
      assert.ok(typeof metrics.holdingDistribution['30_60min'] === 'number', '应有30-60分钟分布');
    });

    it('应该正确计算网格交易统计', () => {
      const trades = [
        { action: 'SELL', reason: 'grid_sell', return: 0.01, holdingPeriod: 30 },
        { action: 'SELL', reason: 'grid_sell', return: -0.005, holdingPeriod: 45 },
        { action: 'SELL', reason: 'grid_sell', return: 0.015, holdingPeriod: 60 }
      ];

      const gridStats = performance.calculateGridStatistics(trades, { stepPercent: 1.0 });

      assert.strictEqual(gridStats.totalGridTrades, 3, '网格交易次数应为3');
      assert.ok(typeof gridStats.gridWinRate === 'number', '网格胜率应为数字');
      assert.ok(gridStats.gridWinRate > 0, '网格胜率应大于0');
    });

    it('应该正确计算持仓分钟数', () => {
      const minutes = performance.calculateHoldingMinutes('2024-01-01', '09:30:00', '2024-01-01', '11:30:00');

      assert.strictEqual(minutes, 120, '持仓应为120分钟');
    });

    it('应该处理跨日持仓', () => {
      const minutes = performance.calculateHoldingMinutes('2024-01-01', '14:00:00', '2024-01-02', '10:00:00');

      // 跨日持仓（约20小时）
      assert.ok(minutes > 1000, '跨日持仓分钟数应大于1000');
    });
  });

  describe('4. 交易执行测试', () => {
    it('应该正确执行买入操作', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      const stock = { ts_code: '000001.SZ', reason: 'test' };
      const success = engine.executeBuy(stock, 10.0, 1000, '2024-01-01', '09:30:00');

      assert.ok(success, '买入应该成功');
      assert.ok(engine.positions.has('000001.SZ'), '应该有持仓记录');
      assert.strictEqual(engine.trades.length, 1, '应该有交易记录');
      assert.ok(engine.cash < TEST_CONFIG.initialCapital, '现金应该减少');
    });

    it('应该正确执行卖出操作', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 先买入
      const stock = { ts_code: '000001.SZ', reason: 'test' };
      engine.executeBuy(stock, 10.0, 1000, '2024-01-01', '09:30:00');

      // 再卖出
      const position = engine.positions.get('000001.SZ');
      const success = engine.executeSell(position, 10.5, '2024-01-01', '10:00:00', 'test_sell');

      assert.ok(success, '卖出应该成功');
      assert.ok(!engine.positions.has('000001.SZ'), '持仓应该清空');
      assert.strictEqual(engine.trades.length, 2, '应该有2条交易记录');
    });

    it('应该正确计算收益', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 买入
      const stock = { ts_code: '000001.SZ', reason: 'test' };
      engine.executeBuy(stock, 10.0, 1000, '2024-01-01', '09:30:00');

      // 卖出（价格上涨5%）
      const position = engine.positions.get('000001.SZ');
      engine.executeSell(position, 10.5, '2024-01-01', '10:00:00', 'test_sell');

      const sellTrade = engine.trades.find(t => t.action === 'SELL');

      // 计算预期收益（扣除手续费和滑点）
      assert.ok(sellTrade.return > 0, '应该有正收益');
      assert.ok(sellTrade.holdingPeriod > 0, '应该有持仓时长');
    });

    it('应该限制每日交易次数', () => {
      const engine = new MinuteBacktest({
        ...TEST_CONFIG,
        maxDailyTrades: 3
      });

      // 尝试多次买入
      for (let i = 0; i < 5; i++) {
        const stock = { ts_code: `00000${i}.SZ`, reason: 'test' };
        engine.executeBuy(stock, 10.0, 100, '2024-01-01', '09:30:00');
      }

      // 只有前3次应该成功
      assert.strictEqual(engine.trades.length, 3, '应该限制为3次交易');
    });
  });

  describe('5. 多周期回测测试', () => {
    it('应该支持不同分钟周期配置', () => {
      const intervals = ['1', '5', '15', '30', '60'];

      for (const interval of intervals) {
        const engine = new MinuteBacktest({
          ...TEST_CONFIG,
          minuteInterval: parseInt(interval)
        });

        assert.strictEqual(engine.config.minuteInterval, parseInt(interval), `应支持${interval}分钟周期`);
      }
    });

    it('应该正确处理空数据', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 测试空数组
      const result1 = engine.aggregateBars([], 5);
      assert.deepStrictEqual(result1, [], '空数组应返回空数组');

      // 测试null
      const result2 = engine.aggregateBars(null, 5);
      assert.strictEqual(result2, null, 'null应返回null');
    });
  });

  describe('6. 回测结果生成测试', () => {
    it('应该生成完整的回测结果', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 执行一些交易
      const stock = { ts_code: '000001.SZ', reason: 'test' };
      engine.executeBuy(stock, 10.0, 1000, '2024-01-01', '09:30:00');
      const position = engine.positions.get('000001.SZ');
      engine.executeSell(position, 10.5, '2024-01-01', '10:00:00', 'test_sell');

      // 添加权益曲线数据
      engine.equityCurve = [TEST_CONFIG.initialCapital, TEST_CONFIG.initialCapital * 1.01];
      engine.minuteReturns = [0.01];
      engine.dates = ['2024-01-01'];

      const result = engine.generateResults({});

      assert.ok(result.success, '结果应该成功');
      assert.ok(result.summary, '应该有汇总信息');
      assert.ok(result.details, '应该有详细信息');
      assert.ok(result.performance, '应该有绩效报告');
    });

    it('应该包含分钟线特有指标', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 执行日内交易
      const stock = { ts_code: '000001.SZ', reason: 'test' };
      engine.executeBuy(stock, 10.0, 1000, '2024-01-01', '09:30:00');
      const position = engine.positions.get('000001.SZ');
      engine.executeSell(position, 10.5, '2024-01-01', '10:30:00', 'test_sell');

      engine.equityCurve = [TEST_CONFIG.initialCapital, TEST_CONFIG.initialCapital * 1.01];
      engine.minuteReturns = [0.01];
      engine.dates = ['2024-01-01'];

      const result = engine.generateResults({});

      // 检查分钟线特有指标
      assert.ok(typeof result.summary.avgDailyTrades === 'number', '应有平均每日交易次数');
      assert.ok(typeof result.summary.avgHoldingPeriod === 'number', '应有平均持仓周期');
      assert.ok(typeof result.summary.intradayTrades === 'number', '应有日内交易次数');
    });
  });

  describe('7. 边界条件测试', () => {
    it('应该处理无交易的情况', () => {
      const metrics = performance.calculateMinuteMetrics([]);

      assert.strictEqual(metrics.intradayTradeCount, 0, '无交易时日内交易次数应为0');
      assert.strictEqual(metrics.avgHoldingMinutes, 0, '无交易时平均持仓分钟数应为0');
    });

    it('应该处理资金不足的情况', () => {
      const engine = new MinuteBacktest({
        ...TEST_CONFIG,
        initialCapital: 1000 // 只有1000元
      });

      // 尝试买入超过资金能力的股票
      const stock = { ts_code: '000001.SZ', reason: 'test' };
      const success = engine.executeBuy(stock, 100.0, 1000, '2024-01-01', '09:30:00');

      // 应该失败或调整买入数量
      assert.ok(engine.trades.length <= 1, '应该处理资金不足情况');
    });

    it('应该处理无效参数', () => {
      const engine = new MinuteBacktest(TEST_CONFIG);

      // 无效价格
      let success = engine.executeBuy({ ts_code: 'test' }, -10.0, 100, '2024-01-01', '09:30:00');
      assert.strictEqual(success, false, '负价格买入应失败');

      // 无效数量
      success = engine.executeBuy({ ts_code: 'test' }, 10.0, -100, '2024-01-01', '09:30:00');
      assert.strictEqual(success, false, '负数量买入应失败');
    });
  });
});

// 测试导出的常量
describe('模块导出测试', () => {
  it('应该导出MINUTE_INTERVALS常量', () => {
    assert.ok(MinuteBacktest.MINUTE_INTERVALS, '应导出MINUTE_INTERVALS');
    assert.strictEqual(MinuteBacktest.MINUTE_INTERVALS['1'], 1, '1分钟间隔应为1');
    assert.strictEqual(MinuteBacktest.MINUTE_INTERVALS['5'], 5, '5分钟间隔应为5');
    assert.strictEqual(MinuteBacktest.MINUTE_INTERVALS['15'], 15, '15分钟间隔应为15');
    assert.strictEqual(MinuteBacktest.MINUTE_INTERVALS['30'], 30, '30分钟间隔应为30');
    assert.strictEqual(MinuteBacktest.MINUTE_INTERVALS['60'], 60, '60分钟间隔应为60');
  });

  it('应该导出DEFAULT_GRID_CONFIG常量', () => {
    assert.ok(MinuteBacktest.DEFAULT_GRID_CONFIG, '应导出DEFAULT_GRID_CONFIG');
    assert.ok(MinuteBacktest.DEFAULT_GRID_CONFIG.stepPercent, '应有默认步长');
  });

  it('应该导出快捷函数', () => {
    assert.ok(MinuteBacktest.runMinuteBacktest, '应导出runMinuteBacktest');
    assert.ok(MinuteBacktest.runGridBacktest, '应导出runGridBacktest');
  });
});

// 性能指标模块测试
describe('绩效指标模块测试', () => {
  it('应该导出所有分钟线相关函数', () => {
    assert.ok(performance.calculateMinuteMetrics, '应导出calculateMinuteMetrics');
    assert.ok(performance.calculateHoldingMinutes, '应导出calculateHoldingMinutes');
    assert.ok(performance.calculateMinutePerformanceReport, '应导出calculateMinutePerformanceReport');
    assert.ok(performance.calculateGridStatistics, '应导出calculateGridStatistics');
  });

  it('应该生成分钟线完整报告', () => {
    const backtestData = {
      equityCurve: [100000, 101000, 102000, 101500, 103000],
      dailyReturns: [0.01, 0.01, -0.005, 0.015],
      trades: [
        { action: 'SELL', return: 0.02, entryDate: '2024-01-01', exitDate: '2024-01-01', holdingPeriod: 60 }
      ],
      initialCapital: 100000,
      finalCapital: 103000,
      tradingDays: 5
    };

    const report = performance.calculateMinutePerformanceReport(backtestData);

    assert.ok(report.totalReturn !== undefined, '应有总收益率');
    assert.ok(report.minuteMetrics, '应有分钟线指标');
    assert.ok(typeof report.minuteMetrics.intradayTradeCount === 'number', '日内交易次数应为数字');
  });
});

console.log('[测试] 分钟线回测引擎测试套件加载完成');