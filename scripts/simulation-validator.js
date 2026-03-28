/**
 * 模拟账户验证周期脚本 (V5_010)
 * 职责：验证策略在模拟账户中的表现
 */
const Database = require('better-sqlite3');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

// 验证周期标准
const VALIDATION_CONFIG = {
  minDays: 30,        // 最少验证天数
  minTrades: 20,      // 最少交易次数
  maxDrawdown: 0.15,  // 最大允许回撤
  minSharpe: 1.0,     // 最小夏普比率
  minWinRate: 0.45    // 最小胜率
};

function validateStrategy(versionId) {
  const db = new Database(DB_PATH);
  
  // 获取策略版本
  const version = db.prepare('SELECT * FROM strategy_versions WHERE version_id = ?')
    .get(versionId);
  
  if (!version) {
    return { valid: false, reason: '策略版本不存在' };
  }
  
  // 检查回测指标
  const issues = [];
  if (version.max_drawdown > VALIDATION_CONFIG.maxDrawdown) {
    issues.push(`最大回撤 ${version.max_drawdown} 超过阈值 ${VALIDATION_CONFIG.maxDrawdown}`);
  }
  if (version.sharpe_ratio < VALIDATION_CONFIG.minSharpe) {
    issues.push(`夏普比率 ${version.sharpe_ratio} 低于阈值 ${VALIDATION_CONFIG.minSharpe}`);
  }
  if (version.win_rate < VALIDATION_CONFIG.minWinRate) {
    issues.push(`胜率 ${version.win_rate} 低于阈值 ${VALIDATION_CONFIG.minWinRate}`);
  }
  
  const result = {
    valid: issues.length === 0,
    issues,
    metrics: {
      sharpe: version.sharpe_ratio,
      drawdown: version.max_drawdown,
      winRate: version.win_rate
    }
  };
  
  db.close();
  return result;
}

// CLI 入口
if (process.argv.length > 2) {
  const versionId = process.argv[2];
  const result = validateStrategy(versionId);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { validateStrategy, VALIDATION_CONFIG };
