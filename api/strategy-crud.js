/**
 * 策略配置 CRUD API
 * TASK_V4_014 - 策略增删改查 API
 *
 * 路由：
 * - GET /api/strategy/list - 获取所有策略配置
 * - GET /api/strategy/:id - 获取单个策略配置
 * - POST /api/strategy/create - 创建新策略配置
 * - PUT /api/strategy/:id - 更新策略配置
 * - DELETE /api/strategy/:id - 删除策略配置
 */

'use strict';

const { getDatabase } = require('./db');

/**
 * 获取所有策略配置
 * GET /api/strategy/list
 */
async function listStrategies(req, res) {
  try {
    const db = getDatabase();
    const { activeOnly } = req.query;

    let sql = 'SELECT * FROM strategy_configs';
    const params = [];

    if (activeOnly === 'true') {
      sql += ' WHERE is_active = 1';
    }

    sql += ' ORDER BY is_default DESC, created_at DESC';

    const rows = await db.allPromise(sql, params);

    res.json({
      success: true,
      data: rows,
      meta: {
        total: rows.length
      }
    });
  } catch (error) {
    console.error('[strategy-crud] listStrategies 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取单个策略配置
 * GET /api/strategy/:id
 */
async function getStrategy(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少策略 ID'
      });
    }

    const db = getDatabase();
    const row = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }

    res.json({
      success: true,
      data: row
    });
  } catch (error) {
    console.error('[strategy-crud] getStrategy 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 创建新策略配置
 * POST /api/strategy/create
 */
async function createStrategy(req, res) {
  try {
    const config = req.body;

    // 必填字段验证
    if (!config.name) {
      return res.status(400).json({
        success: false,
        error: '策略名称不能为空'
      });
    }

    // 验证四维度权重总和
    const weightSum = (config.policy_weight ?? 0.25) +
                      (config.commercialization_weight ?? 0.30) +
                      (config.sentiment_weight ?? 0.25) +
                      (config.capital_weight ?? 0.20);

    if (Math.abs(weightSum - 1) > 0.01) {
      return res.status(400).json({
        success: false,
        error: `四维度权重总和必须为 100%，当前为 ${(weightSum * 100).toFixed(1)}%`
      });
    }

    // 验证核心-卫星比例
    const coreRatio = config.core_ratio ?? 0.75;
    const satelliteRatio = config.satellite_ratio ?? 0.25;

    if (Math.abs(coreRatio + satelliteRatio - 1) > 0.01) {
      return res.status(400).json({
        success: false,
        error: '核心仓和卫星仓比例总和必须为 100%'
      });
    }

    const db = getDatabase();

    // 如果设置为默认，先取消其他默认配置
    if (config.is_default) {
      await db.runPromise('UPDATE strategy_configs SET is_default = 0, updated_at = datetime("now")');
    }

    const sql = `
      INSERT INTO strategy_configs (
        name, version, description,
        policy_weight, commercialization_weight, sentiment_weight, capital_weight,
        revenue_growth_min, gross_margin_min, sentiment_top_percentile,
        seven_factor_min_score, pe_max, peg_max,
        core_ratio, satellite_ratio, satellite_count,
        grid_step, grid_price_range, grid_single_amount, grid_trend_filter,
        max_drawdown, min_annual_return, min_win_rate,
        is_active, is_default, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      config.name,
      config.version || '1.0.0',
      config.description || '',
      config.policy_weight ?? 0.25,
      config.commercialization_weight ?? 0.30,
      config.sentiment_weight ?? 0.25,
      config.capital_weight ?? 0.20,
      config.revenue_growth_min ?? 0.20,
      config.gross_margin_min ?? 0.25,
      config.sentiment_top_percentile ?? 0.20,
      config.seven_factor_min_score ?? 0.75,
      config.pe_max ?? 60.0,
      config.peg_max ?? 2.0,
      config.core_ratio ?? 0.75,
      config.satellite_ratio ?? 0.25,
      config.satellite_count ?? 3,
      config.grid_step ?? 0.012,
      config.grid_price_range ?? '3_months',
      config.grid_single_amount ?? 30000,
      config.grid_trend_filter !== false ? 1 : 0,
      config.max_drawdown ?? -0.20,
      config.min_annual_return ?? 0.15,
      config.min_win_rate ?? 0.55,
      config.is_active !== false ? 1 : 0,
      config.is_default ? 1 : 0,
      config.created_by || 'user'
    ];

    const result = await db.runPromise(sql, params);

    const newRow = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [result.lastID]);

    res.status(201).json({
      success: true,
      message: '策略配置创建成功',
      data: newRow
    });
  } catch (error) {
    console.error('[strategy-crud] createStrategy 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 更新策略配置
 * PUT /api/strategy/:id
 */
async function updateStrategy(req, res) {
  try {
    const { id } = req.params;
    const config = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少策略 ID'
      });
    }

    const db = getDatabase();

    // 检查策略是否存在
    const existing = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }

    // 验证四维度权重总和（如果提供了权重）
    const policyWeight = config.policy_weight ?? existing.policy_weight;
    const commercialWeight = config.commercialization_weight ?? existing.commercialization_weight;
    const sentimentWeight = config.sentiment_weight ?? existing.sentiment_weight;
    const capitalWeight = config.capital_weight ?? existing.capital_weight;

    const weightSum = policyWeight + commercialWeight + sentimentWeight + capitalWeight;
    if (Math.abs(weightSum - 1) > 0.01) {
      return res.status(400).json({
        success: false,
        error: `四维度权重总和必须为 100%，当前为 ${(weightSum * 100).toFixed(1)}%`
      });
    }

    // 验证核心-卫星比例（如果提供了比例）
    const coreRatio = config.core_ratio ?? existing.core_ratio;
    const satelliteRatio = config.satellite_ratio ?? existing.satellite_ratio;

    if (Math.abs(coreRatio + satelliteRatio - 1) > 0.01) {
      return res.status(400).json({
        success: false,
        error: '核心仓和卫星仓比例总和必须为 100%'
      });
    }

    // 如果设置为默认，先取消其他默认配置
    if (config.is_default) {
      await db.runPromise('UPDATE strategy_configs SET is_default = 0, updated_at = datetime("now") WHERE id != ?', [id]);
    }

    const sql = `
      UPDATE strategy_configs SET
        name = COALESCE(?, name),
        version = COALESCE(?, version),
        description = COALESCE(?, description),
        policy_weight = ?,
        commercialization_weight = ?,
        sentiment_weight = ?,
        capital_weight = ?,
        revenue_growth_min = COALESCE(?, revenue_growth_min),
        gross_margin_min = COALESCE(?, gross_margin_min),
        sentiment_top_percentile = COALESCE(?, sentiment_top_percentile),
        seven_factor_min_score = COALESCE(?, seven_factor_min_score),
        pe_max = COALESCE(?, pe_max),
        peg_max = COALESCE(?, peg_max),
        core_ratio = ?,
        satellite_ratio = ?,
        satellite_count = COALESCE(?, satellite_count),
        grid_step = COALESCE(?, grid_step),
        grid_price_range = COALESCE(?, grid_price_range),
        grid_single_amount = COALESCE(?, grid_single_amount),
        grid_trend_filter = COALESCE(?, grid_trend_filter),
        max_drawdown = COALESCE(?, max_drawdown),
        min_annual_return = COALESCE(?, min_annual_return),
        min_win_rate = COALESCE(?, min_win_rate),
        is_active = COALESCE(?, is_active),
        is_default = COALESCE(?, is_default),
        updated_at = datetime('now')
      WHERE id = ?
    `;

    const params = [
      config.name,
      config.version,
      config.description,
      policyWeight,
      commercialWeight,
      sentimentWeight,
      capitalWeight,
      config.revenue_growth_min,
      config.gross_margin_min,
      config.sentiment_top_percentile,
      config.seven_factor_min_score,
      config.pe_max,
      config.peg_max,
      coreRatio,
      satelliteRatio,
      config.satellite_count,
      config.grid_step,
      config.grid_price_range,
      config.grid_single_amount,
      config.grid_trend_filter !== undefined ? (config.grid_trend_filter ? 1 : 0) : null,
      config.max_drawdown,
      config.min_annual_return,
      config.min_win_rate,
      config.is_active !== undefined ? (config.is_active ? 1 : 0) : null,
      config.is_default !== undefined ? (config.is_default ? 1 : 0) : null,
      id
    ];

    await db.runPromise(sql, params);

    const updatedRow = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '策略配置更新成功',
      data: updatedRow
    });
  } catch (error) {
    console.error('[strategy-crud] updateStrategy 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 删除策略配置
 * DELETE /api/strategy/:id
 */
async function deleteStrategy(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少策略 ID'
      });
    }

    const db = getDatabase();

    // 检查策略是否存在
    const existing = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }

    // 防止删除默认配置
    if (existing.is_default) {
      return res.status(400).json({
        success: false,
        error: '不能删除默认策略配置'
      });
    }

    await db.runPromise('DELETE FROM strategy_configs WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '策略配置删除成功'
    });
  } catch (error) {
    console.error('[strategy-crud] deleteStrategy 失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 创建路由
 */
function createRouter(express) {
  const router = express.Router();

  router.get('/list', listStrategies);
  router.get('/:id', getStrategy);
  router.post('/create', createStrategy);
  router.put('/:id', updateStrategy);
  router.delete('/:id', deleteStrategy);

  return router;
}

module.exports = {
  listStrategies,
  getStrategy,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  createRouter
};