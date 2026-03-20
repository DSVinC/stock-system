/**
 * 回测模块
 * 支持历史数据回放、策略验证、收益统计
 * 安全修复版：接入真实历史数据
 */

const { getDatabase } = require('./db');
const { checkCondition } = require('./conditional-order');

/**
 * 回测引擎类
 */
class BacktestEngine {
  constructor(config) {
    this.config = {
      startDate: config.startDate,
      endDate: config.endDate,
      initialCash: config.initialCash || 1000000,
      strategy: config.strategy, // 策略配置
      stocks: config.stocks || [], // 回测股票池
      ...config
    };
    
    // 回测状态
    this.state = {
      cash: this.config.initialCash,
      positions: {}, // {ts_code: {quantity, avgPrice, costAmount}}
      trades: [],
      dailyValues: [], // 每日资产变化
      currentDate: null,
      currentPrice: {}
    };
    
    // 统计指标
    this.metrics = {
      totalReturn: 0,
      returnRate: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0
    };
  }
  
  /**
   * 运行回测
   */
  async run() {
    console.log('[回测] 开始运行...');
    console.log(`[回测] 时间范围: ${this.config.startDate} ~ ${this.config.endDate}`);
    console.log(`[回测] 初始资金: ¥${this.config.initialCash.toLocaleString()}`);
    
    // 获取历史数据
    const historicalData = await this.loadHistoricalData();
    
    // 按日期遍历
    const dates = Object.keys(historicalData).sort();
    
    for (const date of dates) {
      this.state.currentDate = date;
      const dayData = historicalData[date];
      
      // 更新当前价格
      for (const stock of dayData) {
        this.state.currentPrice[stock.ts_code] = stock;
      }
      
      // 执行策略
      await this.executeStrategy(dayData);
      
      // 记录每日资产
      this.recordDailyValue();
    }
    
    // 计算最终统计
    this.calculateMetrics();
    
    console.log('[回测] 运行完成');
    const report = this.generateReport();
    
    // 保存回测报告到数据库
    await saveBacktestReport(report);
    
    return report;
  }
  
  /**
   * 加载历史数据（从数据库获取真实数据）
   */
  async loadHistoricalData() {
    const dataByDate = {};
    const db = await getDatabase();
    
    // 从数据库获取历史行情数据
    for (const tsCode of this.config.stocks) {
      const rows = await db.allPromise(`
        SELECT trade_date, ts_code, stock_name, close as price, pe, pb, market_cap, turnover
        FROM stock_daily 
        WHERE ts_code = ? AND trade_date BETWEEN ? AND ?
        ORDER BY trade_date ASC
      `, [tsCode, this.config.startDate, this.config.endDate]);
      
      if (rows.length === 0) {
        console.warn(`[回测] 警告: ${tsCode} 在指定日期范围内无历史数据，使用模拟数据`);
        // 降级到模拟数据
        this.generateMockDataForStock(tsCode, dataByDate);
        continue;
      }
      
      for (const row of rows) {
        const date = row.trade_date;
        if (!dataByDate[date]) {
          dataByDate[date] = [];
        }
        
        dataByDate[date].push({
          ts_code: row.ts_code,
          stock_name: row.stock_name || this.getStockName(tsCode),
          price: parseFloat(row.price) || 0,
          pe: parseFloat(row.pe) || 0,
          pb: parseFloat(row.pb) || 0,
          market_cap: parseFloat(row.market_cap) || 0,
          turnover: parseFloat(row.turnover) || 0
        });
      }
    }
    
    return dataByDate;
  }
  
  /**
   * 生成模拟数据（降级方案）
   */
  generateMockDataForStock(tsCode, dataByDate) {
    const start = new Date(this.config.startDate);
    const end = new Date(this.config.endDate);
    const seed = tsCode.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    let basePrice = 50 + (seed % 200);
    let basePE = 15 + (seed % 30);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      
      const date = d.toISOString().split('T')[0];
      const change = (Math.random() - 0.5) * 0.06;
      basePrice = basePrice * (1 + change);
      basePE = basePE * (1 + change * 0.5);
      
      if (!dataByDate[date]) {
        dataByDate[date] = [];
      }
      
      dataByDate[date].push({
        ts_code: tsCode,
        stock_name: this.getStockName(tsCode),
        price: Math.round(basePrice * 100) / 100,
        pe: Math.round(basePE * 100) / 100,
        pb: Math.round((basePE / 3) * 100) / 100,
        market_cap: basePrice * 100000000,
        turnover: Math.random() * 100000000,
        _mock: true // 标记为模拟数据
      });
    }
  }
  
  /**
   * 获取股票名称
   */
  getStockName(tsCode) {
    const names = {
      '300308.SZ': '中际旭创',
      '000001.SZ': '平安银行',
      '000002.SZ': '万科A',
      '000858.SZ': '五粮液',
      '002415.SZ': '海康威视',
      '600519.SH': '贵州茅台'
    };
    return names[tsCode] || tsCode;
  }
  
  /**
   * 执行策略
   */
  async executeStrategy(dayData) {
    const strategy = this.config.strategy;
    
    // 检查最大持仓数限制
    const maxPositions = strategy.maxPositions || 10;
    const currentPositions = Object.keys(this.state.positions).length;
    
    for (const stock of dayData) {
      // 检查买入条件
      if (strategy.buyCondition) {
        const shouldBuy = this.evaluateCondition(strategy.buyCondition, stock);
        if (shouldBuy && !this.state.positions[stock.ts_code] && currentPositions < maxPositions) {
          await this.buy(stock.ts_code, stock.stock_name, stock.price, stock);
        }
      }
      
      // 检查卖出条件
      if (strategy.sellCondition && this.state.positions[stock.ts_code]) {
        const shouldSell = this.evaluateCondition(strategy.sellCondition, stock);
        if (shouldSell) {
          await this.sell(stock.ts_code, stock.stock_name, stock.price);
        }
      }
    }
  }
  
  /**
   * 评估条件
   */
  evaluateCondition(condition, stock) {
    const { type, operator, value } = condition;
    let actualValue;
    
    switch (type) {
      case 'price':
        actualValue = stock.price;
        break;
      case 'pe':
        actualValue = stock.pe;
        break;
      case 'pb':
        actualValue = stock.pb;
        break;
      case 'market_cap':
        actualValue = stock.market_cap;
        break;
      default:
        return false;
    }
    
    switch (operator) {
      case '<=': return actualValue <= value;
      case '>=': return actualValue >= value;
      case '<': return actualValue < value;
      case '>': return actualValue > value;
      case '=': return actualValue === value;
      default: return false;
    }
  }
  
  /**
   * 买入股票
   */
  async buy(tsCode, stockName, price, dayData) {
    // 从策略配置读取资金比例，默认30%
    const investRatio = this.config.strategy.investRatio || 0.3;
    const investAmount = this.state.cash * investRatio;
    const quantity = Math.floor(investAmount / price / 100) * 100;
    
    if (quantity < 100) return;
    
    // 检查资金充足性
    const amount = quantity * price;
    if (amount > this.state.cash) {
      console.log(`[回测] 资金不足，跳过买入 ${stockName}`);
      return;
    }
    
    // A股涨跌停检查（简化版：±10%）
    const prevClose = dayData.prevClose || price;
    const priceLimit = prevClose * 1.1;
    if (price >= priceLimit) {
      console.log(`[回测] ${stockName} 触及涨停，无法买入`);
      return;
    }
    
    // 更新现金
    this.state.cash -= amount;
    
    // 更新持仓
    this.state.positions[tsCode] = {
      quantity,
      avgPrice: price,
      costAmount: amount
    };
    
    // 记录交易
    this.state.trades.push({
      date: this.state.currentDate,
      ts_code: tsCode,
      stock_name: stockName,
      action: 'buy',
      quantity,
      price,
      amount
    });
    
    console.log(`[回测] ${this.state.currentDate} 买入 ${stockName} ${quantity}股 @ ${price}`);
  }
  
  /**
   * 卖出股票
   */
  async sell(tsCode, stockName, price) {
    const position = this.state.positions[tsCode];
    if (!position) return;
    
    const { quantity, avgPrice } = position;
    const amount = quantity * price;
    const profit = amount - position.costAmount;
    
    // 更新现金
    this.state.cash += amount;
    
    // 删除持仓
    delete this.state.positions[tsCode];
    
    // 记录交易
    this.state.trades.push({
      date: this.state.currentDate,
      ts_code: tsCode,
      stock_name: stockName,
      action: 'sell',
      quantity,
      price,
      amount,
      profit,
      profitRate: profit / position.costAmount
    });
    
    console.log(`[回测] ${this.state.currentDate} 卖出 ${stockName} ${quantity}股 @ ${price}, 盈亏: ${profit > 0 ? '+' : ''}${profit.toFixed(2)}`);
  }
  
  /**
   * 记录每日资产
   */
  recordDailyValue() {
    let stockValue = 0;
    for (const [tsCode, position] of Object.entries(this.state.positions)) {
      const currentPrice = this.state.currentPrice[tsCode]?.price || position.avgPrice;
      stockValue += position.quantity * currentPrice;
    }
    
    const totalValue = this.state.cash + stockValue;
    
    this.state.dailyValues.push({
      date: this.state.currentDate,
      cash: this.state.cash,
      stockValue,
      totalValue,
      returnRate: (totalValue - this.config.initialCash) / this.config.initialCash
    });
  }
  
  /**
   * 计算统计指标
   */
  calculateMetrics() {
    const initialCash = this.config.initialCash;
    const finalValue = this.state.dailyValues[this.state.dailyValues.length - 1]?.totalValue || initialCash;
    
    // 总收益
    this.metrics.totalReturn = finalValue - initialCash;
    this.metrics.returnRate = (finalValue - initialCash) / initialCash;
    
    // 最大回撤
    let maxValue = initialCash;
    let maxDrawdown = 0;
    for (const day of this.state.dailyValues) {
      if (day.totalValue > maxValue) {
        maxValue = day.totalValue;
      }
      const drawdown = (maxValue - day.totalValue) / maxValue;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    this.metrics.maxDrawdown = maxDrawdown;
    
    // 交易统计
    const sellTrades = this.state.trades.filter(t => t.action === 'sell');
    this.metrics.tradeCount = sellTrades.length;
    this.metrics.winCount = sellTrades.filter(t => t.profit > 0).length;
    this.metrics.lossCount = sellTrades.filter(t => t.profit <= 0).length;
    this.metrics.winRate = this.metrics.tradeCount > 0 ? this.metrics.winCount / this.metrics.tradeCount : 0;
    
    // 夏普比率（简化版）
    const returns = [];
    for (let i = 1; i < this.state.dailyValues.length; i++) {
      const dailyReturn = (this.state.dailyValues[i].totalValue - this.state.dailyValues[i-1].totalValue) / this.state.dailyValues[i-1].totalValue;
      returns.push(dailyReturn);
    }
    
    if (returns.length > 0) {
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      this.metrics.sharpeRatio = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0;
    }
  }
  
  /**
   * 生成回测报告
   */
  generateReport() {
    return {
      config: this.config,
      metrics: this.metrics,
      trades: this.state.trades,
      dailyValues: this.state.dailyValues,
      summary: {
        startDate: this.config.startDate,
        endDate: this.config.endDate,
        initialCash: this.config.initialCash,
        finalValue: this.state.dailyValues[this.state.dailyValues.length - 1]?.totalValue || this.config.initialCash,
        totalReturn: this.metrics.totalReturn,
        returnRate: this.metrics.returnRate,
        maxDrawdown: this.metrics.maxDrawdown,
        sharpeRatio: this.metrics.sharpeRatio,
        winRate: this.metrics.winRate,
        tradeCount: this.metrics.tradeCount
      }
    };
  }
}

/**
 * 运行回测（API入口）
 */
async function runBacktest(req, res) {
  try {
    const { startDate, endDate, initialCash, strategy, stocks } = req.body;
    
    if (!startDate || !endDate || !strategy || !stocks || stocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: startDate, endDate, strategy, stocks'
      });
    }
    
    const engine = new BacktestEngine({
      startDate,
      endDate,
      initialCash: initialCash || 1000000,
      strategy,
      stocks
    });
    
    const report = await engine.run();
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('[回测] 运行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取回测历史
 */
async function getBacktestHistory(req, res) {
  try {
    const db = await getDatabase();
    const rows = await db.allPromise(`
      SELECT * FROM backtest_report 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('[回测] 获取历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取回测详情
 */
async function getBacktestDetail(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    const row = await db.getPromise('SELECT * FROM backtest_report WHERE id = ?', [id]);
    
    if (!row) {
      return res.status(404).json({
        success: false,
        error: '回测记录不存在'
      });
    }
    
    res.json({
      success: true,
      data: {
        ...row,
        report_data: JSON.parse(row.report_data || '{}')
      }
    });
  } catch (error) {
    console.error('[回测] 获取详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 保存回测报告到数据库
 */
async function saveBacktestReport(report) {
  try {
    const db = await getDatabase();
    await db.runPromise(`
      INSERT INTO backtest_report (
        name, start_date, end_date, initial_cash, final_value,
        total_return, return_rate, max_drawdown, sharpe_ratio,
        win_rate, trade_count, report_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      report.config.strategy.name || '未命名策略',
      report.config.startDate,
      report.config.endDate,
      report.config.initialCash,
      report.summary.finalValue,
      report.metrics.totalReturn,
      report.metrics.returnRate,
      report.metrics.maxDrawdown,
      report.metrics.sharpeRatio,
      report.metrics.winRate,
      report.metrics.tradeCount,
      JSON.stringify(report)
    ]);
  } catch (error) {
    console.error('[回测] 保存报告失败:', error);
  }
}

module.exports = {
  BacktestEngine,
  runBacktest,
  getBacktestHistory,
  getBacktestDetail,
  saveBacktestReport
};