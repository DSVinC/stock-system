/**
 * 回测转条件单 API
 * TASK_V3_401
 *
 * 功能：
 * - 读取回测优化结果（cache/joint_optimization.json）
 * - 自动创建条件单（买入/卖出条件）
 * - 支持批量导入（核心仓 + 卫星仓）
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('./db');

// 缓存文件路径
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const JOINT_OPTIMIZATION_FILE = path.join(CACHE_DIR, 'joint_optimization.json');
const GRID_EXCESS_FILE = path.join(CACHE_DIR, 'grid_excess_return.json');

/**
 * 读取联合优化结果
 * @returns {Object|null} 优化结果
 */
function readJointOptimization() {
  try {
    if (!fs.existsSync(JOINT_OPTIMIZATION_FILE)) {
      return null;
    }
    const content = fs.readFileSync(JOINT_OPTIMIZATION_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[backtest-to-conditional] 读取联合优化结果失败:', error.message);
    return null;
  }
}

/**
 * 读取网格超额收益配置
 * @returns {Object|null} 网格配置
 */
function readGridExcessConfig() {
  try {
    if (!fs.existsSync(GRID_EXCESS_FILE)) {
      return null;
    }
    const content = fs.readFileSync(GRID_EXCESS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[backtest-to-conditional] 读取网格配置失败:', error.message);
    return null;
  }
}

/**
 * 根据回测结果生成条件单配置
 * @param {Object} optimizationResult - 联合优化结果
 * @param {Object} gridConfig - 网格配置
 * @param {Object} options - 额外选项（股票代码、账户ID等）
 * @returns {Object} 条件单配置
 */
function generateConditionalOrdersFromBacktest(optimizationResult, gridConfig, options = {}) {
  const { ts_code, stock_name, account_id = 1 } = options;

  if (!optimizationResult || optimizationResult.status !== 'completed') {
    throw new Error('回测优化结果无效或未完成');
  }

  const { bestAllocation, bestMetrics } = optimizationResult;
  const orders = [];

  // 1. 核心仓买入条件单（趋势跟踪）
  if (bestAllocation.coreWeight > 0) {
    orders.push({
      account_id,
      ts_code,
      stock_name,
      order_type: 'core_entry',
      action: 'buy',
      position_pct: Math.round(bestAllocation.coreWeight * 100),
      conditions: [{
        trigger_type: 'ma_golden_cross',
        params: { ma_short: 5, ma_long: 20 }
      }],
      condition_logic: 'AND',
      status: 'enabled',
      source: 'backtest_optimization',
      reason: `核心仓配置 - 夏普比率: ${bestMetrics.sharpeRatio.toFixed(2)}`
    });
  }

  // 2. 卫星仓买入条件单（网格交易）
  if (bestAllocation.satelliteWeight > 0 && gridConfig) {
    const gridParams = gridConfig.grid_config || {};
    orders.push({
      account_id,
      ts_code,
      stock_name,
      order_type: 'satellite_entry',
      action: 'buy',
      position_pct: Math.round(bestAllocation.satelliteWeight * 100),
      conditions: [{
        trigger_type: 'daily_loss',
        params: { percent: (gridConfig.grid_step || 0.012) * 100 }
      }],
      condition_logic: 'AND',
      status: 'enabled',
      source: 'backtest_optimization',
      reason: `卫星仓配置 - 网格步长: ${((gridParams.grid_step || 0.012) * 100).toFixed(1)}%`
    });
  }

  // 3. 止损条件单
  orders.push({
    account_id,
    ts_code,
    stock_name,
    order_type: 'stop_loss',
    action: 'sell',
    position_pct: 100,
    conditions: [{
      trigger_type: 'daily_loss',
      params: { percent: Math.max(8, Math.round(bestMetrics.maxDrawdown * 100 * 1.5)) }
    }],
    condition_logic: 'AND',
    status: 'enabled',
    source: 'backtest_optimization',
    reason: `风险控制 - 基于最大回撤 ${((bestMetrics.maxDrawdown || 0.1) * 100).toFixed(2)}%`
  });

  // 4. 止盈条件单
  const targetReturn = bestMetrics.totalReturn * 0.8; // 目标收益为历史收益的80%
  if (targetReturn > 0.1) {
    orders.push({
      account_id,
      ts_code,
      stock_name,
      order_type: 'take_profit',
      action: 'sell',
      position_pct: 50,
      conditions: [{
        trigger_type: 'daily_gain',
        params: { percent: Math.round(targetReturn * 100) }
      }],
      condition_logic: 'AND',
      status: 'enabled',
      source: 'backtest_optimization',
      reason: `止盈目标 - 基于历史收益 ${((bestMetrics.totalReturn || 0) * 100).toFixed(2)}%`
    });
  }

  return {
    bestAllocation,
    bestMetrics,
    orders,
    generatedAt: new Date().toISOString()
  };
}

/**
 * 创建条件单到数据库
 * @param {Object} orderData - 条件单数据
 * @returns {Promise<Object>} 创建结果
 */
async function createConditionalOrderInDB(orderData) {
  const db = await getDatabase();

  const now = new Date().toISOString();
  const startDate = now.split('T')[0];
  const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = await db.runPromise(`
    INSERT INTO conditional_order (
      account_id, ts_code, stock_name, order_type, action,
      position_pct, conditions, condition_logic, status,
      start_date, end_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    orderData.account_id,
    orderData.ts_code,
    orderData.stock_name,
    orderData.order_type,
    orderData.action,
    orderData.position_pct,
    JSON.stringify(orderData.conditions),
    orderData.condition_logic || 'AND',
    orderData.status || 'enabled',
    startDate,
    endDate,
    now,
    now
  ]);

  if (orderData.source || orderData.reason) {
    await db.runPromise(`
      INSERT INTO conditional_order_context (
        conditional_order_id,
        strategy_source,
        strategy_config_name,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `, [
      result.lastID,
      orderData.source || null,
      orderData.reason || null
    ]);
  }

  return {
    id: result.lastID,
    ...orderData
  };
}

// ==================== API 处理函数 ====================

/**
 * 获取回测优化结果摘要
 * GET /api/backtest-to-conditional/summary
 */
async function getBacktestSummary(req, res) {
  try {
    const optimization = readJointOptimization();
    const gridConfig = readGridExcessConfig();

    if (!optimization) {
      return res.json({
        success: false,
        error: '未找到回测优化结果，请先运行联合优化器'
      });
    }

    res.json({
      success: true,
      data: {
        optimization: {
          status: optimization.status,
          bestAllocation: optimization.bestAllocation,
          bestMetrics: optimization.bestMetrics,
          totalCombinations: optimization.totalCombinations,
          validCombinations: optimization.validCombinations,
          timestamp: optimization.timestamp
        },
        gridConfig: gridConfig ? {
          gridStep: gridConfig.grid_config?.grid_step,
          singleAmount: gridConfig.grid_config?.single_amount,
          trendFilter: gridConfig.grid_config?.trend_filter
        } : null
      }
    });
  } catch (error) {
    console.error('[backtest-to-conditional] 获取摘要失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 预览条件单配置（不实际创建）
 * POST /api/backtest-to-conditional/preview
 */
async function previewConditionalOrders(req, res) {
  try {
    const { ts_code, stock_name, account_id } = req.body;

    if (!ts_code) {
      return res.status(400).json({
        success: false,
        error: '缺少股票代码参数'
      });
    }

    const optimization = readJointOptimization();
    const gridConfig = readGridExcessConfig();

    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: '未找到回测优化结果'
      });
    }

    const result = generateConditionalOrdersFromBacktest(
      optimization,
      gridConfig,
      { ts_code, stock_name, account_id }
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[backtest-to-conditional] 预览失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 导入条件单（创建到数据库）
 * POST /api/backtest-to-conditional/import
 */
async function importConditionalOrders(req, res) {
  try {
    const { ts_code, stock_name, account_id, order_types } = req.body;

    if (!ts_code) {
      return res.status(400).json({
        success: false,
        error: '缺少股票代码参数'
      });
    }

    const optimization = readJointOptimization();
    const gridConfig = readGridExcessConfig();

    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: '未找到回测优化结果'
      });
    }

    const result = generateConditionalOrdersFromBacktest(
      optimization,
      gridConfig,
      { ts_code, stock_name, account_id }
    );

    // 筛选要创建的条件单类型
    let ordersToCreate = result.orders;
    if (order_types && Array.isArray(order_types) && order_types.length > 0) {
      ordersToCreate = result.orders.filter(o => order_types.includes(o.order_type));
    }

    // 创建条件单
    const createdOrders = [];
    for (const order of ordersToCreate) {
      try {
        const created = await createConditionalOrderInDB(order);
        createdOrders.push(created);
      } catch (createError) {
        console.error(`[backtest-to-conditional] 创建条件单失败:`, createError);
        createdOrders.push({
          ...order,
          error: createError.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        total: createdOrders.length,
        success: createdOrders.filter(o => !o.error).length,
        failed: createdOrders.filter(o => o.error).length,
        orders: createdOrders
      }
    });
  } catch (error) {
    console.error('[backtest-to-conditional] 导入失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 批量导入条件单（多只股票）
 * POST /api/backtest-to-conditional/batch-import
 */
async function batchImportConditionalOrders(req, res) {
  try {
    const { stocks, account_id, order_types } = req.body;

    if (!Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少股票列表参数'
      });
    }

    const optimization = readJointOptimization();
    const gridConfig = readGridExcessConfig();

    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: '未找到回测优化结果'
      });
    }

    const results = {
      total: 0,
      success: 0,
      failed: 0,
      details: []
    };

    for (const stock of stocks) {
      const { ts_code, stock_name } = stock;

      try {
        const result = generateConditionalOrdersFromBacktest(
          optimization,
          gridConfig,
          { ts_code, stock_name, account_id }
        );

        let ordersToCreate = result.orders;
        if (order_types && Array.isArray(order_types) && order_types.length > 0) {
          ordersToCreate = result.orders.filter(o => order_types.includes(o.order_type));
        }

        for (const order of ordersToCreate) {
          try {
            await createConditionalOrderInDB(order);
            results.success++;
          } catch (e) {
            results.failed++;
          }
          results.total++;
        }

        results.details.push({
          ts_code,
          stock_name,
          ordersCreated: ordersToCreate.length,
          status: 'success'
        });
      } catch (error) {
        results.failed += result.orders?.length || 0;
        results.details.push({
          ts_code,
          stock_name,
          error: error.message,
          status: 'failed'
        });
      }
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('[backtest-to-conditional] 批量导入失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 创建 Express Router
 */
function createRouter(express) {
  const router = express.Router();

  router.get('/summary', getBacktestSummary);
  router.post('/preview', previewConditionalOrders);
  router.post('/import', importConditionalOrders);
  router.post('/batch-import', batchImportConditionalOrders);

  return router;
}

module.exports = {
  // 核心函数
  readJointOptimization,
  readGridExcessConfig,
  generateConditionalOrdersFromBacktest,
  createConditionalOrderInDB,

  // API 处理函数
  getBacktestSummary,
  previewConditionalOrders,
  importConditionalOrders,
  batchImportConditionalOrders,

  // Router
  createRouter
};
