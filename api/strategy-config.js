/**
 * 策略配置 API 模块
 * 支持策略配置的增删改查、激活/禁用、版本管理
 * 支持从研究版本（strategy_versions）发布到策略库（strategy_configs）
 */

const { getDatabase } = require('./db');

// ============================================================
// 初始化函数：确保 side table 存在
// ============================================================

async function ensureSideTablesExist() {
  const db = await getDatabase();

  // 创建 strategy_config_feedback 表（执行反馈摘要）
  await db.runPromise(`
    CREATE TABLE IF NOT EXISTS strategy_config_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_config_id INTEGER NOT NULL,
      source_version_id TEXT NOT NULL,

      -- 执行反馈状态聚合
      execution_feedback_status TEXT,           -- no_data | positive | mixed | caution
      execution_feedback_confidence TEXT,       -- none | low | medium | high
      execution_summary_json TEXT,              -- JSON: 聚合反馈摘要
      backtest_score REAL,                       -- 从 version 继承的回测分数

      -- 统计信息
      total_trades INTEGER DEFAULT 0,
      successful_trades INTEGER DEFAULT 0,
      failed_trades INTEGER DEFAULT 0,
      total_pnl REAL DEFAULT 0,

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),

      CONSTRAINT fk_strategy_config_feedback_config
        FOREIGN KEY (strategy_config_id) REFERENCES strategy_configs(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

      CONSTRAINT fk_strategy_config_feedback_version
        FOREIGN KEY (source_version_id) REFERENCES strategy_versions(version_id)
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  // 创建索引
  await db.runPromise(`
    CREATE INDEX IF NOT EXISTS idx_strategy_config_feedback_config_id
    ON strategy_config_feedback(strategy_config_id)
  `);

  await db.runPromise(`
    CREATE INDEX IF NOT EXISTS idx_strategy_config_feedback_version_id
    ON strategy_config_feedback(source_version_id)
  `);

  // 确保 is_public 列存在
  try {
    await db.runPromise(`ALTER TABLE strategy_configs ADD COLUMN is_public INTEGER DEFAULT 0`);
  } catch (e) {
    // 列已存在，忽略错误
    if (!e.message.includes('duplicate column')) {
      console.log('[策略配置] is_public 列已存在');
    }
  }
}

// 模块加载时初始化
let initPromise = null;
function getInitPromise() {
  if (!initPromise) {
    initPromise = ensureSideTablesExist().catch(err => {
      console.error('[策略配置] 初始化 side tables 失败:', err);
    });
  }
  return initPromise;
}

// ============================================================
// TASK_V4_027: 反馈快照 helper（不依赖 HTTP 请求）
// ============================================================

/**
 * Upsert 反馈快照到 strategy_config_feedback 表
 * @param {Object} params - 快照参数
 * @param {number} params.strategy_config_id - 策略配置 ID
 * @param {string} params.source_version_id - 来源版本 ID
 * @param {string} params.execution_feedback_status - 执行反馈状态 (no_data | positive | mixed | caution)
 * @param {string} params.execution_feedback_confidence - 置信度 (none | low | medium | high)
 * @param {Object} params.execution_summary_json - 执行反馈摘要对象
 * @param {number} params.backtest_score - 回测分数
 * @returns {Promise<Object>} - 返回插入/更新的记录
 */
async function upsertFeedbackSnapshot(params) {
  const {
    strategy_config_id,
    source_version_id,
    execution_feedback_status,
    execution_feedback_confidence,
    execution_summary_json,
    backtest_score
  } = params;

  // 参数验证
  if (!strategy_config_id) {
    throw new Error('strategy_config_id is required');
  }
  if (!source_version_id) {
    throw new Error('source_version_id is required');
  }

  // 确保 side table 存在
  await ensureSideTablesExist();

  const db = await getDatabase();

  // 序列化 execution_summary_json
  const summaryJson = typeof execution_summary_json === 'object'
    ? JSON.stringify(execution_summary_json)
    : execution_summary_json || null;

  // 检查是否已存在该 strategy_config_id 的记录
  const existing = await db.getPromise(
    'SELECT id FROM strategy_config_feedback WHERE strategy_config_id = ?',
    [strategy_config_id]
  );

  let result;
  if (existing) {
    // 更新现有记录
    await db.runPromise(`
      UPDATE strategy_config_feedback SET
        source_version_id = ?,
        execution_feedback_status = ?,
        execution_feedback_confidence = ?,
        execution_summary_json = ?,
        backtest_score = ?,
        updated_at = datetime('now')
      WHERE strategy_config_id = ?
    `, [
      source_version_id,
      execution_feedback_status || 'no_data',
      execution_feedback_confidence || 'none',
      summaryJson,
      backtest_score ?? null,
      strategy_config_id
    ]);

    result = await db.getPromise(
      'SELECT * FROM strategy_config_feedback WHERE strategy_config_id = ?',
      [strategy_config_id]
    );
  } else {
    // 插入新记录
    const insertResult = await db.runPromise(`
      INSERT INTO strategy_config_feedback (
        strategy_config_id,
        source_version_id,
        execution_feedback_status,
        execution_feedback_confidence,
        execution_summary_json,
        backtest_score,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      strategy_config_id,
      source_version_id,
      execution_feedback_status || 'no_data',
      execution_feedback_confidence || 'none',
      summaryJson,
      backtest_score ?? null
    ]);

    result = await db.getPromise(
      'SELECT * FROM strategy_config_feedback WHERE id = ?',
      [insertResult.lastID]
    );
  }

  return result;
}

/**
 * 获取反馈快照
 * @param {number} strategy_config_id - 策略配置 ID
 * @returns {Promise<Object|null>} - 返回快照记录或 null
 */
async function getFeedbackSnapshot(strategy_config_id) {
  if (!strategy_config_id) {
    throw new Error('strategy_config_id is required');
  }

  await ensureSideTablesExist();

  const db = await getDatabase();
  const row = await db.getPromise(
    'SELECT * FROM strategy_config_feedback WHERE strategy_config_id = ?',
    [strategy_config_id]
  );

  if (row && row.execution_summary_json) {
    row.execution_summary_json = safeParseJSON(row.execution_summary_json);
  }

  return row || null;
}

/**
 * TASK_V4_027: Upsert 反馈快照（接受 db 参数版本）
 * 用于外部调用，支持事务场景
 *
 * @param {Object} db - 数据库连接对象（需支持 getPromise/runPromise）
 * @param {Object} payload - 快照数据
 * @param {number} payload.strategy_config_id - 策略配置 ID（必填）
 * @param {string} payload.source_version_id - 来源版本 ID（必填）
 * @param {string} [payload.execution_feedback_status] - 执行反馈状态 (no_data | positive | mixed | caution)
 * @param {string} [payload.execution_feedback_confidence] - 置信度 (none | low | medium | high)
 * @param {Object|string} [payload.execution_summary_json] - 执行反馈摘要对象
 * @param {number} [payload.backtest_score] - 回测分数
 * @returns {Promise<Object>} - 返回插入/更新的记录
 */
async function upsertStrategyConfigFeedbackSnapshot(db, payload) {
  const {
    strategy_config_id,
    source_version_id,
    execution_feedback_status,
    execution_feedback_confidence,
    execution_summary_json,
    backtest_score
  } = payload;

  // 参数验证
  if (!db) {
    throw new Error('db is required');
  }
  if (!strategy_config_id) {
    throw new Error('strategy_config_id is required');
  }
  if (!source_version_id) {
    throw new Error('source_version_id is required');
  }

  // 确保 side table 存在（幂等操作）
  await ensureSideTablesExist();

  // 序列化 execution_summary_json
  const summaryJson = typeof execution_summary_json === 'object'
    ? JSON.stringify(execution_summary_json)
    : execution_summary_json || null;

  // 检查是否已存在该 strategy_config_id 的记录
  const existing = await db.getPromise(
    'SELECT id FROM strategy_config_feedback WHERE strategy_config_id = ?',
    [strategy_config_id]
  );

  let result;
  if (existing) {
    // 更新现有记录
    await db.runPromise(`
      UPDATE strategy_config_feedback SET
        source_version_id = ?,
        execution_feedback_status = ?,
        execution_feedback_confidence = ?,
        execution_summary_json = ?,
        backtest_score = ?,
        updated_at = datetime('now')
      WHERE strategy_config_id = ?
    `, [
      source_version_id,
      execution_feedback_status || 'no_data',
      execution_feedback_confidence || 'none',
      summaryJson,
      backtest_score ?? null,
      strategy_config_id
    ]);

    result = await db.getPromise(
      'SELECT * FROM strategy_config_feedback WHERE strategy_config_id = ?',
      [strategy_config_id]
    );
  } else {
    // 插入新记录
    const insertResult = await db.runPromise(`
      INSERT INTO strategy_config_feedback (
        strategy_config_id,
        source_version_id,
        execution_feedback_status,
        execution_feedback_confidence,
        execution_summary_json,
        backtest_score,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      strategy_config_id,
      source_version_id,
      execution_feedback_status || 'no_data',
      execution_feedback_confidence || 'none',
      summaryJson,
      backtest_score ?? null
    ]);

    result = await db.getPromise(
      'SELECT * FROM strategy_config_feedback WHERE id = ?',
      [insertResult.lastID]
    );
  }

  return result;
}

/**
 * 获取所有策略配置
 */
async function getStrategyConfigs(req, res) {
  try {
    const db = await getDatabase();
    const { activeOnly } = req.query;
    
    let query = 'SELECT * FROM strategy_configs';
    const params = [];
    
    if (activeOnly === 'true') {
      query += ' WHERE is_active = 1';
    }
    
    query += ' ORDER BY is_default DESC, created_at DESC';
    
    const rows = await db.allPromise(query, params);
    
    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('[策略配置] 获取列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取单个策略配置详情
 */
async function getStrategyConfig(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
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
    console.error('[策略配置] 获取详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取默认策略配置
 */
async function getDefaultStrategyConfig(req, res) {
  try {
    const db = await getDatabase();
    
    const row = await db.getPromise('SELECT * FROM strategy_configs WHERE is_default = 1 AND is_active = 1 LIMIT 1');
    
    if (!row) {
      return res.status(404).json({
        success: false,
        error: '未找到默认策略配置'
      });
    }
    
    res.json({
      success: true,
      data: row
    });
  } catch (error) {
    console.error('[策略配置] 获取默认配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 创建新的策略配置
 */
async function createStrategyConfig(req, res) {
  try {
    const config = req.body;
    const db = await getDatabase();
    
    // 验证四维度权重总和
    const weightSum = (config.policy_weight || 0) + 
                      (config.commercialization_weight || 0) + 
                      (config.sentiment_weight || 0) + 
                      (config.capital_weight || 0);
    
    if (weightSum < 0.99 || weightSum > 1.01) {
      return res.status(400).json({
        success: false,
        error: '四维度权重总和必须为 100%（允许±1% 误差）'
      });
    }
    
    // 验证核心 - 卫星比例
    const positionSum = (config.core_ratio || 0) + (config.satellite_ratio || 0);
    if (positionSum < 0.99 || positionSum > 1.01) {
      return res.status(400).json({
        success: false,
        error: '核心仓和卫星仓比例总和必须为 100%'
      });
    }
    
    // 如果是默认配置，先取消其他默认
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
        is_default, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      config.name || '新策略配置',
      config.version || '1.0.0',
      config.description || '',
      config.policy_weight || 0.25,
      config.commercialization_weight || 0.30,
      config.sentiment_weight || 0.25,
      config.capital_weight || 0.20,
      config.revenue_growth_min || 0.20,
      config.gross_margin_min || 0.25,
      config.sentiment_top_percentile || 0.20,
      config.seven_factor_min_score || 0.75,
      config.pe_max || 60.0,
      config.peg_max || 2.0,
      config.core_ratio || 0.75,
      config.satellite_ratio || 0.25,
      config.satellite_count || 3,
      config.grid_step || 0.012,
      config.grid_price_range || '3_months',
      config.grid_single_amount || 30000,
      config.grid_trend_filter !== undefined ? (config.grid_trend_filter ? 1 : 0) : 1,
      config.max_drawdown || -0.20,
      config.min_annual_return || 0.15,
      config.min_win_rate || 0.55,
      config.is_default ? 1 : 0,
      config.created_by || 'user'
    ];
    
    const result = await db.runPromise(sql, params);
    
    const newRow = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [result.lastID]);
    
    res.json({
      success: true,
      message: '策略配置创建成功',
      data: newRow
    });
  } catch (error) {
    console.error('[策略配置] 创建失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 更新策略配置
 */
async function updateStrategyConfig(req, res) {
  try {
    const { id } = req.params;
    const config = req.body;
    const db = await getDatabase();
    
    // 验证四维度权重总和
    const weightSum = (config.policy_weight || 0) + 
                      (config.commercialization_weight || 0) + 
                      (config.sentiment_weight || 0) + 
                      (config.capital_weight || 0);
    
    if (weightSum < 0.99 || weightSum > 1.01) {
      return res.status(400).json({
        success: false,
        error: '四维度权重总和必须为 100%（允许±1% 误差）'
      });
    }
    
    // 验证核心 - 卫星比例
    const positionSum = (config.core_ratio || 0) + (config.satellite_ratio || 0);
    if (positionSum < 0.99 || positionSum > 1.01) {
      return res.status(400).json({
        success: false,
        error: '核心仓和卫星仓比例总和必须为 100%'
      });
    }
    
    // 如果是默认配置，先取消其他默认
    if (config.is_default) {
      await db.runPromise('UPDATE strategy_configs SET is_default = 0, updated_at = datetime("now") WHERE id != ?', [id]);
    }
    
    const sql = `
      UPDATE strategy_configs SET
        name = ?, version = ?, description = ?,
        policy_weight = ?, commercialization_weight = ?, sentiment_weight = ?, capital_weight = ?,
        revenue_growth_min = ?, gross_margin_min = ?, sentiment_top_percentile = ?,
        seven_factor_min_score = ?, pe_max = ?, peg_max = ?,
        core_ratio = ?, satellite_ratio = ?, satellite_count = ?,
        grid_step = ?, grid_price_range = ?, grid_single_amount = ?, grid_trend_filter = ?,
        max_drawdown = ?, min_annual_return = ?, min_win_rate = ?,
        is_default = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `;
    
    const params = [
      config.name || '策略配置',
      config.version || '1.0.0',
      config.description || '',
      config.policy_weight,
      config.commercialization_weight,
      config.sentiment_weight,
      config.capital_weight,
      config.revenue_growth_min,
      config.gross_margin_min,
      config.sentiment_top_percentile,
      config.seven_factor_min_score,
      config.pe_max,
      config.peg_max,
      config.core_ratio,
      config.satellite_ratio,
      config.satellite_count,
      config.grid_step,
      config.grid_price_range,
      config.grid_single_amount,
      config.grid_trend_filter !== undefined ? (config.grid_trend_filter ? 1 : 0) : 1,
      config.max_drawdown,
      config.min_annual_return,
      config.min_win_rate,
      config.is_default ? 1 : 0,
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
    console.error('[策略配置] 更新失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 删除策略配置
 */
async function deleteStrategyConfig(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    // 检查是否是默认配置
    const row = await db.getPromise('SELECT is_default FROM strategy_configs WHERE id = ?', [id]);
    
    if (!row) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }
    
    if (row.is_default) {
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
    console.error('[策略配置] 删除失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 激活/禁用策略配置
 */
async function toggleStrategyConfig(req, res) {
  try {
    const { id } = req.params;
    const { active } = req.body;
    const db = await getDatabase();
    
    await db.runPromise(
      'UPDATE strategy_configs SET is_active = ?, updated_at = datetime("now") WHERE id = ?',
      [active ? 1 : 0, id]
    );
    
    res.json({
      success: true,
      message: `策略配置已${active ? '激活' : '禁用'}`
    });
  } catch (error) {
    console.error('[策略配置] 切换状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 设置为默认策略配置
 */
async function setDefaultStrategyConfig(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    // 先取消所有默认
    await db.runPromise('UPDATE strategy_configs SET is_default = 0, updated_at = datetime("now")');
    
    // 设置新的默认
    await db.runPromise(
      'UPDATE strategy_configs SET is_default = 1, is_active = 1, updated_at = datetime("now") WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: '默认策略配置已更新'
    });
  } catch (error) {
    console.error('[策略配置] 设置默认失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================================
// TASK_V4_015: 策略保存/加载 API（扩展）
// 路径：/api/strategy-config/...
// ============================================================

/**
 * 保存策略配置（创建或更新）
 * POST /api/strategy-config/save
 */
async function saveStrategyConfig(req, res) {
  try {
    const config = req.body;
    const db = await getDatabase();

    // 验证四维度权重总和
    const weightSum = (config.policy_weight || 0) +
                      (config.commercialization_weight || 0) +
                      (config.sentiment_weight || 0) +
                      (config.capital_weight || 0);

    if (weightSum > 0 && (weightSum < 0.99 || weightSum > 1.01)) {
      return res.status(400).json({
        success: false,
        error: '四维度权重总和必须为 100%（允许±1% 误差）'
      });
    }

    // 如果有 id，则更新；否则创建
    if (config.id) {
      // 更新现有配置
      const existing = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [config.id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: '策略配置不存在'
        });
      }

      // 如果设为默认，先取消其他默认
      if (config.is_default) {
        await db.runPromise('UPDATE strategy_configs SET is_default = 0, updated_at = datetime("now") WHERE id != ?', [config.id]);
      }

      const updateFields = [];
      const updateParams = [];

      const fieldMapping = {
        name: 'name',
        version: 'version',
        description: 'description',
        template_id: 'template_id',
        policy_weight: 'policy_weight',
        commercialization_weight: 'commercialization_weight',
        sentiment_weight: 'sentiment_weight',
        capital_weight: 'capital_weight',
        revenue_growth_min: 'revenue_growth_min',
        gross_margin_min: 'gross_margin_min',
        sentiment_top_percentile: 'sentiment_top_percentile',
        seven_factor_min_score: 'seven_factor_min_score',
        pe_max: 'pe_max',
        peg_max: 'peg_max',
        core_ratio: 'core_ratio',
        satellite_ratio: 'satellite_ratio',
        satellite_count: 'satellite_count',
        grid_step: 'grid_step',
        grid_price_range: 'grid_price_range',
        grid_single_amount: 'grid_single_amount',
        grid_trend_filter: 'grid_trend_filter',
        max_drawdown: 'max_drawdown',
        min_annual_return: 'min_annual_return',
        min_win_rate: 'min_win_rate',
        portfolio_config: 'portfolio_config',
        grid_config: 'grid_config',
        backtest_period: 'backtest_period',
        is_default: 'is_default',
        is_active: 'is_active'
      };

      for (const [bodyKey, dbField] of Object.entries(fieldMapping)) {
        if (config[bodyKey] !== undefined) {
          updateFields.push(`${dbField} = ?`);
          if (bodyKey === 'grid_trend_filter' || bodyKey === 'is_default' || bodyKey === 'is_active') {
            updateParams.push(config[bodyKey] ? 1 : 0);
          } else if (bodyKey === 'portfolio_config' || bodyKey === 'grid_config' || bodyKey === 'backtest_period') {
            updateParams.push(typeof config[bodyKey] === 'object' ? JSON.stringify(config[bodyKey]) : config[bodyKey]);
          } else {
            updateParams.push(config[bodyKey]);
          }
        }
      }

      if (updateFields.length > 0) {
        updateFields.push("updated_at = datetime('now')");
        updateParams.push(config.id);

        await db.runPromise(
          `UPDATE strategy_configs SET ${updateFields.join(', ')} WHERE id = ?`,
          updateParams
        );
      }

      const updated = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [config.id]);

      return res.json({
        success: true,
        message: '策略配置更新成功',
        data: updated
      });
    } else {
      // 创建新配置
      // 如果是默认配置，先取消其他默认
      if (config.is_default) {
        await db.runPromise('UPDATE strategy_configs SET is_default = 0, updated_at = datetime("now")');
      }

      const sql = `
        INSERT INTO strategy_configs (
          name, version, description, template_id,
          policy_weight, commercialization_weight, sentiment_weight, capital_weight,
          revenue_growth_min, gross_margin_min, sentiment_top_percentile,
          seven_factor_min_score, pe_max, peg_max,
          core_ratio, satellite_ratio, satellite_count,
          grid_step, grid_price_range, grid_single_amount, grid_trend_filter,
          max_drawdown, min_annual_return, min_win_rate,
          portfolio_config, grid_config, backtest_period,
          is_default, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        config.name || '新策略配置',
        config.version || '1.0.0',
        config.description || '',
        config.template_id || null,
        config.policy_weight || 0.25,
        config.commercialization_weight || 0.30,
        config.sentiment_weight || 0.25,
        config.capital_weight || 0.20,
        config.revenue_growth_min || 0.20,
        config.gross_margin_min || 0.25,
        config.sentiment_top_percentile || 0.20,
        config.seven_factor_min_score || 0.75,
        config.pe_max || 60.0,
        config.peg_max || 2.0,
        config.core_ratio || 0.75,
        config.satellite_ratio || 0.25,
        config.satellite_count || 3,
        config.grid_step || 0.012,
        config.grid_price_range || '3_months',
        config.grid_single_amount || 30000,
        config.grid_trend_filter !== undefined ? (config.grid_trend_filter ? 1 : 0) : 1,
        config.max_drawdown || -0.20,
        config.min_annual_return || 0.15,
        config.min_win_rate || 0.55,
        config.portfolio_config ? (typeof config.portfolio_config === 'object' ? JSON.stringify(config.portfolio_config) : config.portfolio_config) : null,
        config.grid_config ? (typeof config.grid_config === 'object' ? JSON.stringify(config.grid_config) : config.grid_config) : null,
        config.backtest_period ? (typeof config.backtest_period === 'object' ? JSON.stringify(config.backtest_period) : config.backtest_period) : null,
        config.is_default ? 1 : 0,
        config.created_by || 'user'
      ];

      const result = await db.runPromise(sql, params);

      const newRow = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [result.lastID]);

      return res.json({
        success: true,
        message: '策略配置创建成功',
        data: newRow
      });
    }
  } catch (error) {
    console.error('[策略配置] 保存失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取策略列表（支持筛选）
 * GET /api/strategy-config/list
 */
async function listStrategyConfigs(req, res) {
  try {
    const db = await getDatabase();
    const { template_id, is_active, is_default } = req.query;

    let query = 'SELECT * FROM strategy_configs WHERE 1=1';
    const params = [];

    if (template_id) {
      query += ' AND template_id = ?';
      params.push(template_id);
    }

    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
    }

    if (is_default !== undefined) {
      query += ' AND is_default = ?';
      params.push(is_default === 'true' || is_default === '1' ? 1 : 0);
    }

    query += ' ORDER BY is_default DESC, created_at DESC';

    const rows = await db.allPromise(query, params);

    // 解析 JSON 字段
    const parsedRows = rows.map(row => ({
      ...row,
      portfolio_config: row.portfolio_config ? safeParseJSON(row.portfolio_config) : null,
      grid_config: row.grid_config ? safeParseJSON(row.grid_config) : null,
      backtest_period: row.backtest_period ? safeParseJSON(row.backtest_period) : null
    }));

    res.json({
      success: true,
      data: parsedRows,
      meta: {
        total: parsedRows.length,
        filters: { template_id, is_active, is_default }
      }
    });
  } catch (error) {
    console.error('[策略配置] 获取列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 加载单个策略配置
 * GET /api/strategy-config/:id
 */
async function loadStrategyConfig(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();

    const row = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }

    // 解析 JSON 字段
    const parsedRow = {
      ...row,
      portfolio_config: row.portfolio_config ? safeParseJSON(row.portfolio_config) : null,
      grid_config: row.grid_config ? safeParseJSON(row.grid_config) : null,
      backtest_period: row.backtest_period ? safeParseJSON(row.backtest_period) : null
    };

    res.json({
      success: true,
      data: parsedRow
    });
  } catch (error) {
    console.error('[策略配置] 加载失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 删除策略配置
 * DELETE /api/strategy-config/:id
 */
async function removeStrategyConfig(req, res) {
  try {
    const { id } = req.params;
    const db = await getDatabase();

    // 检查是否存在
    const row = await db.getPromise('SELECT is_default FROM strategy_configs WHERE id = ?', [id]);

    if (!row) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }

    if (row.is_default) {
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
    console.error('[策略配置] 删除失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 安全解析 JSON
 */
function safeParseJSON(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return null;
  }
}

// ============================================================
// TASK_V4_016: 策略导入/导出 API
// 路径：/api/strategy-config/export, /import, /public
// ============================================================

/**
 * 导出策略（设置为公开）
 * POST /api/strategy-config/export
 */
async function exportStrategy(req, res) {
  try {
    const { id } = req.body;
    const db = await getDatabase();

    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少策略 ID'
      });
    }

    // 检查策略是否存在
    const existing = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }

    // 设置为公开
    await db.runPromise(
      'UPDATE strategy_configs SET is_public = 1, updated_at = datetime("now") WHERE id = ?',
      [id]
    );

    const updated = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);

    res.json({
      success: true,
      message: '策略已导出为公开',
      data: updated
    });
  } catch (error) {
    console.error('[策略配置] 导出失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 导入策略（复制公开策略到新 ID）
 * POST /api/strategy-config/import
 */
async function importStrategy(req, res) {
  try {
    const { id, name } = req.body;
    const db = await getDatabase();

    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少策略 ID'
      });
    }

    // 获取源策略
    const source = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }

    // 复制策略到新记录
    const sql = `
      INSERT INTO strategy_configs (
        name, version, description, template_id,
        policy_weight, commercialization_weight, sentiment_weight, capital_weight,
        revenue_growth_min, gross_margin_min, sentiment_top_percentile,
        seven_factor_min_score, pe_max, peg_max,
        core_ratio, satellite_ratio, satellite_count,
        grid_step, grid_price_range, grid_single_amount, grid_trend_filter,
        max_drawdown, min_annual_return, min_win_rate,
        portfolio_config, grid_config, backtest_period,
        is_default, is_public, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      name || `${source.name}（副本）`,
      source.version,
      source.description,
      source.template_id,
      source.policy_weight,
      source.commercialization_weight,
      source.sentiment_weight,
      source.capital_weight,
      source.revenue_growth_min,
      source.gross_margin_min,
      source.sentiment_top_percentile,
      source.seven_factor_min_score,
      source.pe_max,
      source.peg_max,
      source.core_ratio,
      source.satellite_ratio,
      source.satellite_count,
      source.grid_step,
      source.grid_price_range,
      source.grid_single_amount,
      source.grid_trend_filter,
      source.max_drawdown,
      source.min_annual_return,
      source.min_win_rate,
      source.portfolio_config,
      source.grid_config,
      source.backtest_period,
      0, // 新复制的策略不是默认
      0, // 新复制的策略不是公开
      'imported'
    ];

    const result = await db.runPromise(sql, params);
    const newStrategy = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [result.lastID]);
    const sourceFeedback = await db.getPromise(
      'SELECT source_version_id FROM strategy_config_feedback WHERE strategy_config_id = ? ORDER BY id DESC LIMIT 1',
      [source.id]
    ).catch(() => null);

    res.json({
      success: true,
      message: '策略导入成功',
      data: {
        ...newStrategy,
        source_version_id: sourceFeedback?.source_version_id || null
      }
    });
  } catch (error) {
    console.error('[策略配置] 导入失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取所有公开策略
 * GET /api/strategy-config/public
 */
async function listPublicStrategies(req, res) {
  try {
    await getInitPromise();
    const db = await getDatabase();

    const rows = await db.allPromise(
      'SELECT * FROM strategy_configs WHERE is_public = 1 ORDER BY updated_at DESC'
    );

    // 解析 JSON 字段
    const parsedRows = await Promise.all(rows.map(async (row) => {
      const feedback = await getFeedbackSnapshot(row.id);
      const feedbackStatus = feedback?.execution_feedback_status || 'no_data';
      const feedbackConfidence = feedback?.execution_feedback_confidence || 'none';
      return {
        ...row,
        portfolio_config: row.portfolio_config ? safeParseJSON(row.portfolio_config) : null,
        grid_config: row.grid_config ? safeParseJSON(row.grid_config) : null,
        backtest_period: row.backtest_period ? safeParseJSON(row.backtest_period) : null,
        feedback,
        feedback_status: feedbackStatus,
        feedback_confidence: feedbackConfidence,
      };
    }));

    res.json({
      success: true,
      data: parsedRows,
      meta: {
        total: parsedRows.length
      }
    });
  } catch (error) {
    console.error('[策略配置] 获取公开策略失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 复制策略
 * POST /api/strategy-config/copy
 */
async function copyStrategy(req, res) {
  try {
    const { id, name } = req.body;
    const db = await getDatabase();

    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少策略 ID'
      });
    }

    // 获取源策略
    const source = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [id]);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: '策略配置不存在'
      });
    }

    // 复制策略到新记录
    const sql = `
      INSERT INTO strategy_configs (
        name, version, description, template_id,
        policy_weight, commercialization_weight, sentiment_weight, capital_weight,
        revenue_growth_min, gross_margin_min, sentiment_top_percentile,
        seven_factor_min_score, pe_max, peg_max,
        core_ratio, satellite_ratio, satellite_count,
        grid_step, grid_price_range, grid_single_amount, grid_trend_filter,
        max_drawdown, min_annual_return, min_win_rate,
        portfolio_config, grid_config, backtest_period,
        is_default, is_public, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      name || `${source.name}（副本）`,
      source.version,
      source.description,
      source.template_id,
      source.policy_weight,
      source.commercialization_weight,
      source.sentiment_weight,
      source.capital_weight,
      source.revenue_growth_min,
      source.gross_margin_min,
      source.sentiment_top_percentile,
      source.seven_factor_min_score,
      source.pe_max,
      source.peg_max,
      source.core_ratio,
      source.satellite_ratio,
      source.satellite_count,
      source.grid_step,
      source.grid_price_range,
      source.grid_single_amount,
      source.grid_trend_filter,
      source.max_drawdown,
      source.min_annual_return,
      source.min_win_rate,
      source.portfolio_config,
      source.grid_config,
      source.backtest_period,
      0, // 新复制的策略不是默认
      source.is_public, // 保持原有公开状态
      'copied'
    ];

    const result = await db.runPromise(sql, params);
    const newStrategy = await db.getPromise('SELECT * FROM strategy_configs WHERE id = ?', [result.lastID]);
    const sourceFeedback = await db.getPromise(
      'SELECT source_version_id FROM strategy_config_feedback WHERE strategy_config_id = ? ORDER BY id DESC LIMIT 1',
      [source.id]
    ).catch(() => null);

    res.json({
      success: true,
      message: '策略复制成功',
      data: {
        ...newStrategy,
        source_version_id: sourceFeedback?.source_version_id || null
      }
    });
  } catch (error) {
    console.error('[策略配置] 复制失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 创建 TASK_V4_015 路由
 */
function createV4_015Router(express) {
  const router = express.Router();

  router.post('/save', saveStrategyConfig);
  router.get('/list', listStrategyConfigs);
  // 注意：/public 必须在 /:id 之前定义，否则会被动态路由吞掉
  router.get('/public', listPublicStrategies);
  router.get('/:id', loadStrategyConfig);
  router.delete('/:id', removeStrategyConfig);

  return router;
}

// ============================================================
// 研究版本发布到策略库 API
// 路径：POST /api/strategy-config/publish-version
// ============================================================

/**
 * 聚合 execution_feedback 数据
 * @param {string} versionId - strategy_versions.version_id
 * @returns {Promise<Object>} 聚合后的反馈摘要
 */
async function aggregateExecutionFeedback(versionId) {
  const db = await getDatabase();

  // 查询该版本的所有执行反馈
  const feedbacks = await db.allPromise(
    `SELECT * FROM execution_feedback WHERE version_id = ?`,
    [versionId]
  );

  if (!feedbacks || feedbacks.length === 0) {
    return {
      status: 'no_data',
      confidence: 'none',
      total_trades: 0,
      successful_trades: 0,
      failed_trades: 0,
      total_pnl: 0,
      summary: null
    };
  }

  // 聚合统计
  const totalTrades = feedbacks.length;
  const simulatedTradeCount = feedbacks.filter(f => f.event_type === 'simulated_trade').length;
  const positionClosedCount = feedbacks.filter(f => f.event_type === 'position_closed').length;
  const triggerFailureCount = feedbacks.filter(f => f.event_type === 'conditional_trigger').length;
  const successfulTrades = feedbacks.filter(f =>
    f.realized_return !== null && f.realized_return > 0
  ).length;
  const failedTrades = feedbacks.filter(f =>
    f.realized_return !== null && f.realized_return < 0
  ).length;

  const totalPnl = feedbacks.reduce((sum, f) => {
    return sum + (f.realized_pnl || 0);
  }, 0);
  const avgRealizedReturn = feedbacks.length > 0
    ? feedbacks.reduce((sum, f) => sum + (f.realized_return || 0), 0) / feedbacks.length
    : 0;
  const avgHoldingDays = feedbacks.length > 0
    ? feedbacks.reduce((sum, f) => sum + (f.holding_days || 0), 0) / feedbacks.length
    : 0;
  const triggerTotal = triggerFailureCount + simulatedTradeCount;
  const triggerFailureRate = triggerTotal > 0 ? triggerFailureCount / triggerTotal : 0;

  const successRate = totalTrades > 0 ? successfulTrades / totalTrades : 0;

  let confidence = 'none';
  if (totalTrades >= 10) {
    confidence = 'high';
  } else if (totalTrades >= 3) {
    confidence = 'medium';
  } else if (totalTrades >= 1) {
    confidence = 'low';
  }

  let status = 'no_data';
  if (totalTrades > 0) {
    if (totalPnl > 0 && successRate >= 0.5) {
      status = 'positive';
    } else if (totalPnl < 0 || successRate < 0.4) {
      status = 'caution';
    } else {
      status = 'mixed';
    }
  }

  return {
    status,
    confidence,
    total_trades: totalTrades,
    successful_trades: successfulTrades,
    failed_trades: failedTrades,
    total_pnl: totalPnl,
    summary: {
      simulated_trade_count: simulatedTradeCount,
      position_closed_count: positionClosedCount,
      win_rate: positionClosedCount > 0 ? successfulTrades / positionClosedCount : 0,
      total_realized_pnl: totalPnl,
      avg_realized_return: avgRealizedReturn,
      avg_holding_days: avgHoldingDays,
      trigger_failure_count: triggerFailureCount,
      trigger_failure_rate: triggerFailureRate,
      event_types: [...new Set(feedbacks.map(f => f.event_type))],
      ts_codes: [...new Set(feedbacks.map(f => f.ts_code))],
      avg_return: avgRealizedReturn
    }
  };
}

function canPublishVersion(feedbackAggregation, backtestScore = 0) {
  const totalTrades = Number(feedbackAggregation?.total_trades || 0);
  const status = feedbackAggregation?.status || 'no_data';
  const score = Number(backtestScore || 0);
  if (totalTrades > 0 && status !== 'no_data') {
    return true;
  }
  // 允许高分版本先发布，再通过执行反馈持续校验
  return Number.isFinite(score) && score >= 75;
}

/**
 * 从 strategy_versions 发布到 strategy_configs
 * POST /api/strategy-config/publish-version
 *
 * 请求体：
 * {
 *   version_id: string,  // 必填，strategy_versions.version_id
 *   name: string,        // 可选，新策略名称，默认使用原版本名称
 *   description: string  // 可选，策略描述
 * }
 */
async function publishVersionToStrategyLibrary(req, res) {
  try {
    // 确保 side tables 已创建
    await getInitPromise();

    const { version_id, name, description } = req.body;
    const db = await getDatabase();

    // 参数验证
    if (!version_id) {
      return res.status(400).json({
        success: false,
        error: '缺少 version_id 参数'
      });
    }

    // 查询源版本
    const sourceVersion = await db.getPromise(
      'SELECT * FROM strategy_versions WHERE version_id = ?',
      [version_id]
    );

    if (!sourceVersion) {
      return res.status(404).json({
        success: false,
        error: `未找到版本: ${version_id}`
      });
    }

    // 解析 config_json
    let configJson;
    try {
      configJson = JSON.parse(sourceVersion.config_json);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: '版本的 config_json 格式无效'
      });
    }

    // 映射字段到 strategy_configs
    const strategyConfig = {
      name: name || sourceVersion.strategy_name || '未命名策略',
      version: sourceVersion.strategy_version || '1.0.0',
      description: description || sourceVersion.change_log || '',
      template_id: configJson.template_id || null,

      // 四维度权重（从 config 映射或使用默认值）
      policy_weight: configJson.policy_weight ?? configJson.weights?.policy ?? configJson.dimensionWeights?.policy ?? 0.25,
      commercialization_weight: configJson.commercialization_weight ?? configJson.weights?.commercialization ?? configJson.dimensionWeights?.business ?? 0.30,
      sentiment_weight: configJson.sentiment_weight ?? configJson.weights?.sentiment ?? configJson.dimensionWeights?.public ?? 0.25,
      capital_weight: configJson.capital_weight ?? configJson.weights?.capital ?? 0.20,

      // 商业化阈值
      revenue_growth_min: configJson.revenue_growth_min ?? 0.20,
      gross_margin_min: configJson.gross_margin_min ?? 0.25,
      sentiment_top_percentile: configJson.sentiment_top_percentile ?? 0.20,

      // 7 因子阈值
      seven_factor_min_score: configJson.seven_factor_min_score ?? 0.75,

      // 估值阈值
      pe_max: configJson.pe_max ?? 60.0,
      peg_max: configJson.peg_max ?? 2.0,

      // 核心-卫星配置
      core_ratio: configJson.core_ratio ?? 0.75,
      satellite_ratio: configJson.satellite_ratio ?? 0.25,
      satellite_count: configJson.satellite_count ?? 3,

      // 网格交易配置
      grid_step: configJson.grid_step ?? 0.012,
      grid_price_range: configJson.grid_price_range ?? '3_months',
      grid_single_amount: configJson.grid_single_amount ?? 30000,
      grid_trend_filter: configJson.grid_trend_filter ?? true,

      // 风控配置
      max_drawdown: configJson.max_drawdown ?? -0.20,
      min_annual_return: configJson.min_annual_return ?? 0.15,
      min_win_rate: configJson.min_win_rate ?? 0.55,

      // JSON 配置字段（包含七因子权重）
      portfolio_config: {
        ...(configJson.portfolio_config || {}),
        // 保存七因子权重供个股分析使用
        factorWeights: configJson.factorWeights || null,
        dimensionWeights: configJson.dimensionWeights || null
      },
      grid_config: configJson.grid_config || null,
      backtest_period: configJson.backtest_period || null
    };

    // 聚合执行反馈；缺少执行样本时直接阻断发布
    const feedbackAggregation = await aggregateExecutionFeedback(version_id);
    if (!canPublishVersion(feedbackAggregation, Number(sourceVersion.backtest_score || 0))) {
      return res.status(409).json({
        success: false,
        error: '该版本尚无执行反馈样本且评分未达 75 分，暂不允许发布到策略库'
      });
    }

    // 插入 strategy_configs
    const insertSql = `
      INSERT INTO strategy_configs (
        name, version, description, template_id,
        policy_weight, commercialization_weight, sentiment_weight, capital_weight,
        revenue_growth_min, gross_margin_min, sentiment_top_percentile,
        seven_factor_min_score, pe_max, peg_max,
        core_ratio, satellite_ratio, satellite_count,
        grid_step, grid_price_range, grid_single_amount, grid_trend_filter,
        max_drawdown, min_annual_return, min_win_rate,
        portfolio_config, grid_config, backtest_period,
        is_public,
        is_default, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      strategyConfig.name,
      strategyConfig.version,
      strategyConfig.description,
      strategyConfig.template_id,
      strategyConfig.policy_weight,
      strategyConfig.commercialization_weight,
      strategyConfig.sentiment_weight,
      strategyConfig.capital_weight,
      strategyConfig.revenue_growth_min,
      strategyConfig.gross_margin_min,
      strategyConfig.sentiment_top_percentile,
      strategyConfig.seven_factor_min_score,
      strategyConfig.pe_max,
      strategyConfig.peg_max,
      strategyConfig.core_ratio,
      strategyConfig.satellite_ratio,
      strategyConfig.satellite_count,
      strategyConfig.grid_step,
      strategyConfig.grid_price_range,
      strategyConfig.grid_single_amount,
      strategyConfig.grid_trend_filter ? 1 : 0,
      strategyConfig.max_drawdown,
      strategyConfig.min_annual_return,
      strategyConfig.min_win_rate,
      strategyConfig.portfolio_config ? JSON.stringify(strategyConfig.portfolio_config) : null,
      strategyConfig.grid_config ? JSON.stringify(strategyConfig.grid_config) : null,
      strategyConfig.backtest_period ? JSON.stringify(strategyConfig.backtest_period) : null,
      1, // is_public: 发布到策略库后显式进入公开口径
      0, // is_default
      1, // is_active
      'published_from_version'
    ];

    const result = await db.runPromise(insertSql, params);
    const newConfigId = result.lastID;

    // 写入 strategy_config_feedback
    await db.runPromise(
      `INSERT INTO strategy_config_feedback (
        strategy_config_id, source_version_id,
        execution_feedback_status, execution_feedback_confidence,
        execution_summary_json, backtest_score,
        total_trades, successful_trades, failed_trades, total_pnl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newConfigId,
        version_id,
        feedbackAggregation.status,
        feedbackAggregation.confidence,
        JSON.stringify(feedbackAggregation.summary),
        sourceVersion.backtest_score,
        feedbackAggregation.total_trades,
        feedbackAggregation.successful_trades,
        feedbackAggregation.failed_trades,
        feedbackAggregation.total_pnl
      ]
    );

    // 获取新创建的完整记录
    const newStrategy = await db.getPromise(
      'SELECT * FROM strategy_configs WHERE id = ?',
      [newConfigId]
    );

    const feedbackRecord = await db.getPromise(
      'SELECT * FROM strategy_config_feedback WHERE strategy_config_id = ?',
      [newConfigId]
    );

    res.json({
      success: true,
      message: `版本 ${version_id} 已成功发布到策略库`,
      data: {
        strategy_config: newStrategy,
        feedback: {
          status: feedbackRecord.execution_feedback_status,
          confidence: feedbackRecord.execution_feedback_confidence,
          total_trades: feedbackRecord.total_trades,
          successful_trades: feedbackRecord.successful_trades,
          failed_trades: feedbackRecord.failed_trades,
          total_pnl: feedbackRecord.total_pnl,
          backtest_score: feedbackRecord.backtest_score
        }
      }
    });
  } catch (error) {
    console.error('[策略配置] 发布版本失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取策略的执行反馈摘要
 * GET /api/strategy-config/:id/feedback
 */
async function getStrategyFeedback(req, res) {
  try {
    await getInitPromise();

    const { id } = req.params;
    const db = await getDatabase();

    const feedback = await db.getPromise(
      `SELECT scf.*, sv.strategy_name, sv.backtest_score as version_backtest_score
       FROM strategy_config_feedback scf
       LEFT JOIN strategy_versions sv ON scf.source_version_id = sv.version_id
       WHERE scf.strategy_config_id = ?`,
      [id]
    );

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: '未找到该策略的执行反馈记录'
      });
    }

    // 解析 summary JSON
    const result = {
      ...feedback,
      execution_summary_json: feedback.execution_summary_json
        ? safeParseJSON(feedback.execution_summary_json)
        : null
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[策略配置] 获取反馈失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 创建发布版本路由
 */
function createPublishVersionRouter(express) {
  const router = express.Router();

  // 发布研究版本到策略库
  router.post('/publish-version', publishVersionToStrategyLibrary);

  // 获取策略执行反馈
  router.get('/:id/feedback', getStrategyFeedback);

  return router;
}

/**
 * 创建 TASK_V4_016 路由（导入/导出）
 */
function createV4_016Router(express) {
  const router = express.Router();

  // 导出策略（设置为公开）
  router.post('/export', exportStrategy);

  // 导入策略（复制公开策略）
  router.post('/import', importStrategy);

  // 注意：/public 路由已移至 createV4_015Router，确保在 /:id 之前定义

  // 复制策略
  router.post('/copy', copyStrategy);

  // 发布版本相关路由
  router.use('/', createPublishVersionRouter(express));

  return router;
}

module.exports = {
  // 原有导出（TASK_V4_004）
  getStrategyConfigs,
  getStrategyConfig,
  getDefaultStrategyConfig,
  createStrategyConfig,
  updateStrategyConfig,
  deleteStrategyConfig,
  toggleStrategyConfig,
  setDefaultStrategyConfig,

  // TASK_V4_015 新增导出
  saveStrategyConfig,
  listStrategyConfigs,
  loadStrategyConfig,
  removeStrategyConfig,
  createV4_015Router,

  // TASK_V4_016 新增导出
  exportStrategy,
  importStrategy,
  listPublicStrategies,
  copyStrategy,
  createV4_016Router,

  // TASK_V4_027 新增导出（反馈快照 helper）
  ensureSideTablesExist,
  upsertFeedbackSnapshot,
  getFeedbackSnapshot,
  upsertStrategyConfigFeedbackSnapshot,

  // 研究版本发布到策略库
  publishVersionToStrategyLibrary,
  getStrategyFeedback,
  aggregateExecutionFeedback,
  createPublishVersionRouter
};
