/**
 * 监控池管理 API
 * Task: TASK_FIX_001
 * 
 * 提供监控池管理端点：
 * - POST /api/monitor-pool/add - 添加股票到监控池
 * - GET /api/monitor-pool/list - 获取监控池列表
 * - DELETE /api/monitor-pool/remove - 从监控池移除
 * - POST /api/monitor-pool/batch-add - 批量添加
 * - DELETE /api/monitor-pool/batch-remove - 批量移除
 */

const { getDatabase } = require('./db');

function inferStrategyVersion({ strategyVersion, strategyConfigName, templateName } = {}) {
  const direct = String(strategyVersion || '').trim();
  if (direct) {
    return direct;
  }
  const candidates = [strategyConfigName, templateName]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const matched = candidate.match(/ITER_[A-Za-z0-9_]+/);
    if (matched) {
      return matched[0];
    }
  }
  return null;
}

async function ensureMonitorPoolContextTable(db) {
  await db.runPromise(`
    CREATE TABLE IF NOT EXISTS monitor_pool_context (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_pool_id INTEGER NOT NULL,
      strategy_source TEXT,
      strategy_config_id INTEGER,
      strategy_config_name TEXT,
      template_id INTEGER,
      template_name TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (monitor_pool_id) REFERENCES monitor_pool(id) ON DELETE CASCADE
    )
  `);
  await db.runPromise('ALTER TABLE monitor_pool_context ADD COLUMN strategy_version TEXT').catch(() => {});
}

/**
 * 添加股票到监控池
 */
async function addToPool(req, res) {
  try {
    const { stock_code, stock_name, report_path, industry_code_l1, industry_name_l1, industry_code_l2, industry_name_l2, industry_code_l3, industry_name_l3, industry_keywords, strategySource, strategyConfigId, strategyConfigName, strategyVersion, templateId, templateName } = req.body;
    
    if (!stock_code || !stock_name) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：stock_code, stock_name'
      });
    }
    
    const db = getDatabase();
    await ensureMonitorPoolContextTable(db);
    
    // 检查是否已存在
    const existing = await db.getPromise(
      'SELECT id FROM monitor_pool WHERE stock_code = ?',
      [stock_code]
    );
    
    if (existing) {
      return res.status(409).json({
        success: false,
        error: '股票已在监控池中',
        code: 'DUPLICATE'
      });
    }
    
    // 插入新记录
    const now = new Date().toISOString();
    const result = await db.runPromise(`
      INSERT INTO monitor_pool (
        stock_code, stock_name, report_path,
        industry_code_l1, industry_name_l1,
        industry_code_l2, industry_name_l2,
        industry_code_l3, industry_name_l3,
        industry_keywords, added_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      stock_code, stock_name, report_path || null,
      industry_code_l1 || null, industry_name_l1 || null,
      industry_code_l2 || null, industry_name_l2 || null,
      industry_code_l3 || null, industry_name_l3 || null,
      industry_keywords || null, now, now
    ]);

    const normalizedStrategyVersion = inferStrategyVersion({ strategyVersion, strategyConfigName, templateName });
    if (strategySource || strategyConfigId || strategyConfigName || normalizedStrategyVersion || templateId || templateName) {
      await db.runPromise(`
        INSERT INTO monitor_pool_context (
          monitor_pool_id,
          strategy_source,
          strategy_config_id,
          strategy_config_name,
          strategy_version,
          template_id,
          template_name,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        result.lastID,
        strategySource || null,
        strategyConfigId || null,
        strategyConfigName || null,
        normalizedStrategyVersion,
        templateId || null,
        templateName || null,
        now,
        now
      ]);
    }
    
    res.json({
      success: true,
      data: {
        stock_code,
        stock_name,
        added_at: now
      }
    });
  } catch (error) {
    console.error('Add to monitor pool error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取监控池列表
 */
async function getPoolList(req, res) {
  try {
    const db = getDatabase();
    await ensureMonitorPoolContextTable(db);
    
    const stocks = await db.allPromise(`
      SELECT
        mp.*,
        mpc.strategy_source,
        mpc.strategy_config_id,
        mpc.strategy_config_name,
        mpc.strategy_version,
        mpc.template_id,
        mpc.template_name
      FROM monitor_pool mp
      LEFT JOIN monitor_pool_context mpc ON mpc.monitor_pool_id = mp.id
      ORDER BY added_at DESC
    `);
    
    res.json({
      success: true,
      data: stocks || []
    });
  } catch (error) {
    console.error('Get monitor pool list error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 从监控池移除股票
 */
async function removeFromPool(req, res) {
  try {
    const { stock_code } = req.body;
    
    if (!stock_code) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：stock_code'
      });
    }
    
    const db = getDatabase();
    
    const result = await db.runPromise(
      'DELETE FROM monitor_pool WHERE stock_code = ?',
      [stock_code]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: '股票不在监控池中'
      });
    }
    
    res.json({
      success: true,
      data: {
        stock_code,
        removed: true
      }
    });
  } catch (error) {
    console.error('Remove from monitor pool error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 批量添加股票到监控池
 */
async function batchAddToPool(req, res) {
  try {
    const { stocks } = req.body;
    
    if (!Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：stocks (数组)'
      });
    }
    
    const db = getDatabase();
    const now = new Date().toISOString();
    
    let imported = 0;
    let duplicates = 0;
    const errors = [];
    
    for (const stock of stocks) {
      try {
        // 检查是否已存在
        const existing = await db.getPromise(
          'SELECT id FROM monitor_pool WHERE stock_code = ?',
          [stock.stock_code]
        );
        
        if (existing) {
          duplicates += 1;
          continue;
        }
        
        // 插入新记录
        await db.runPromise(`
          INSERT INTO monitor_pool (
            stock_code, stock_name, report_path,
            industry_code_l1, industry_name_l1,
            industry_code_l2, industry_name_l2,
            industry_code_l3, industry_name_l3,
            industry_keywords, added_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          stock.stock_code, stock.stock_name, stock.report_path || null,
          stock.industry_code_l1 || null, stock.industry_name_l1 || null,
          stock.industry_code_l2 || null, stock.industry_name_l2 || null,
          stock.industry_code_l3 || null, stock.industry_name_l3 || null,
          stock.industry_keywords || null, now, now
        ]);
        
        imported += 1;
      } catch (error) {
        errors.push({
          stock_code: stock.stock_code,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        imported,
        duplicates,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('Batch add to monitor pool error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 批量从监控池移除
 */
async function batchRemoveFromPool(req, res) {
  try {
    const { stock_codes } = req.body;
    
    if (!Array.isArray(stock_codes) || stock_codes.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：stock_codes (数组)'
      });
    }
    
    const db = getDatabase();
    
    // 使用事务批量删除
    const placeholders = stock_codes.map(() => '?').join(',');
    const result = await db.runPromise(
      `DELETE FROM monitor_pool WHERE stock_code IN (${placeholders})`,
      stock_codes
    );
    
    res.json({
      success: true,
      data: {
        removed: result.changes,
        requested: stock_codes.length
      }
    });
  } catch (error) {
    console.error('Batch remove from monitor pool error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * 获取监控池股票代码列表（用于条件单页面）
 */
async function getStockList(req, res) {
  try {
    const db = getDatabase();
    
    const stocks = await db.allPromise(`
      SELECT stock_code, stock_name FROM monitor_pool
      ORDER BY added_at DESC
    `);
    
    res.json({
      success: true,
      stocks: stocks || []
    });
  } catch (error) {
    console.error('Get monitor pool stock list error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  addToPool,
  getPoolList,
  removeFromPool,
  batchAddToPool,
  batchRemoveFromPool,
  getStockList
};
