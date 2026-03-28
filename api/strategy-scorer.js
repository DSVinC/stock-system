/**
 * 策略评分器 (strategy-scorer.js)
 * 
 * 职责：根据回测结果计算策略综合评分
 * 评分维度：夏普比率、最大回撤、卡玛比率、盈亏比、胜率、总收益
 * 
 * 评分标准（参考 docs/design/STRATEGY_SCORE_CONFIG.md）：
 * - 夏普比率：>2.0 得 100 分，1.5-2.0 得 80 分，1.0-1.5 得 60 分，<1.0 得 40 分
 * - 最大回撤：<10% 得 100 分，10-20% 得 80 分，20-30% 得 60 分，>30% 得 40 分
 * - 卡玛比率：>3.0 得 100 分，2.0-3.0 得 80 分，1.0-2.0 得 60 分，<1.0 得 40 分
 * - 盈亏比：>3.0 得 100 分，2.0-3.0 得 80 分，1.5-2.0 得 60 分，<1.5 得 40 分
 * - 胜率：>60% 得 100 分，50-60% 得 80 分，40-50% 得 60 分，<40% 得 40 分
 * - 总收益：>50% 得 100 分，30-50% 得 80 分，10-30% 得 60 分，<10% 得 40 分
 * 
 * 综合评分 = 各维度加权平均（默认权重相等）
 */

const Database = require('better-sqlite3');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

// 评分标准配置
const SCORE_CONFIG = {
  sharpe: {
    thresholds: [2.0, 1.5, 1.0],
    scores: [100, 80, 60, 40],
    weight: 1.0
  },
  drawdown: {
    thresholds: [10, 20, 30], // 百分比
    scores: [100, 80, 60, 40],
    weight: 1.0,
    inverse: true // 越小越好
  },
  calmar: {
    thresholds: [3.0, 2.0, 1.0],
    scores: [100, 80, 60, 40],
    weight: 1.0
  },
  profitLoss: {
    thresholds: [3.0, 2.0, 1.5],
    scores: [100, 80, 60, 40],
    weight: 1.0
  },
  winRate: {
    thresholds: [0.6, 0.5, 0.4],
    scores: [100, 80, 60, 40],
    weight: 1.0
  },
  totalReturn: {
    thresholds: [0.5, 0.3, 0.1], // 百分比
    scores: [100, 80, 60, 40],
    weight: 1.0
  }
};

/**
 * 计算单项得分
 * @param {number} value - 实际值
 * @param {Array} thresholds - 阈值数组
 * @param {Array} scores - 得分数组
 * @param {boolean} inverse - 是否反向评分（越小越好）
 * @returns {number} 得分
 */
function calculateScore(value, thresholds, scores, inverse = false) {
  if (value === null || value === undefined || isNaN(value)) {
    return 40; // 默认最低分
  }
  
  if (inverse) {
    // 反向评分：值越小得分越高
    for (let i = 0; i < thresholds.length; i++) {
      if (value <= thresholds[i]) {
        return scores[i];
      }
    }
    return scores[scores.length - 1];
  } else {
    // 正向评分：值越大得分越高
    for (let i = 0; i < thresholds.length; i++) {
      if (value >= thresholds[i]) {
        return scores[i];
      }
    }
    return scores[scores.length - 1];
  }
}

/**
 * 策略评分器类
 */
class StrategyScorer {
  constructor(dbPath = DB_PATH) {
    this.db = new Database(dbPath);
  }
  
  /**
   * 计算策略综合评分
   * @param {Object} metrics - 回测指标
   * @returns {Object} 评分结果
   */
  calculateScore(metrics) {
    const {
      sharpeRatio = 0,
      maxDrawdown = 0,
      calmarRatio = 0,
      profitLossRatio = 0,
      winRate = 0,
      totalReturn = 0
    } = metrics;
    
    // 计算各维度得分
    const sharpeScore = calculateScore(
      sharpeRatio,
      SCORE_CONFIG.sharpe.thresholds,
      SCORE_CONFIG.sharpe.scores
    );
    
    const drawdownScore = calculateScore(
      maxDrawdown * 100, // 转换为百分比
      SCORE_CONFIG.drawdown.thresholds,
      SCORE_CONFIG.drawdown.scores,
      SCORE_CONFIG.drawdown.inverse
    );
    
    const calmarScore = calculateScore(
      calmarRatio,
      SCORE_CONFIG.calmar.thresholds,
      SCORE_CONFIG.calmar.scores
    );
    
    const profitLossScore = calculateScore(
      profitLossRatio,
      SCORE_CONFIG.profitLoss.thresholds,
      SCORE_CONFIG.profitLoss.scores
    );
    
    const winRateScore = calculateScore(
      winRate,
      SCORE_CONFIG.winRate.thresholds,
      SCORE_CONFIG.winRate.scores
    );
    
    const totalReturnScore = calculateScore(
      totalReturn,
      SCORE_CONFIG.totalReturn.thresholds,
      SCORE_CONFIG.totalReturn.scores
    );
    
    // 计算综合评分（加权平均）
    const totalScore = (
      sharpeScore * SCORE_CONFIG.sharpe.weight +
      drawdownScore * SCORE_CONFIG.drawdown.weight +
      calmarScore * SCORE_CONFIG.calmar.weight +
      profitLossScore * SCORE_CONFIG.profitLoss.weight +
      winRateScore * SCORE_CONFIG.winRate.weight +
      totalReturnScore * SCORE_CONFIG.totalReturn.weight
    ) / 6;
    
    return {
      scoreTotal: Math.round(totalScore),
      scoreSharpe: sharpeScore,
      scoreDrawdown: drawdownScore,
      scoreCalmar: calmarScore,
      scoreProfitLoss: profitLossScore,
      scoreWinRate: winRateScore,
      scoreTotalReturn: totalReturnScore,
      metrics: {
        sharpeRatio,
        maxDrawdown,
        calmarRatio,
        profitLossRatio,
        winRate,
        totalReturn
      },
      level: this.getScoreLevel(totalScore)
    };
  }
  
  /**
   * 获取评分等级
   * @param {number} score - 综合评分
   * @returns {string} 等级
   */
  getScoreLevel(score) {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }
  
  /**
   * 保存评分记录到数据库
   * @param {Object} record - 评分记录
   * @returns {string} 记录 ID
   */
  saveScoreRecord(record) {
    const recordId = `SCORE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO strategy_score_records (
        record_id, version_id, strategy_type, config_json,
        score_total, score_sharpe, score_drawdown, score_calmar,
        score_profit_loss, score_win_rate, score_return,
        iteration_round, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      recordId,
      record.versionId || null,
      record.strategyType,
      JSON.stringify(record.config),
      record.scoreTotal,
      record.scoreSharpe,
      record.scoreDrawdown,
      record.scoreCalmar,
      record.scoreProfitLoss,
      record.scoreWinRate,
      record.scoreTotalReturn,
      record.iterationRound || 1,
      createdAt
    );
    
    return recordId;
  }
  
  /**
   * 保存策略版本
   * @param {Object} version - 版本信息
   * @returns {string} 版本 ID
   */
  saveVersion(version) {
    const versionId = `V_${version.strategyType}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const createdAt = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO strategy_versions (
        version_id, strategy_type, strategy_name, config_json,
        backtest_score, sharpe_ratio, max_drawdown, calmar_ratio,
        profit_loss_ratio, win_rate, total_return,
        created_at, parent_version, change_log, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      versionId,
      version.strategyType,
      version.strategyName || null,
      JSON.stringify(version.config),
      version.backtestScore,
      version.sharpeRatio,
      version.maxDrawdown,
      version.calmarRatio,
      version.profitLossRatio,
      version.winRate,
      version.totalReturn,
      createdAt,
      version.parentVersion || null,
      version.changeLog || null,
      version.createdBy || 'system'
    );
    
    return versionId;
  }
  
  /**
   * 获取策略历史版本
   * @param {string} strategyType - 策略类型
   * @returns {Array} 版本列表
   */
  getStrategyVersions(strategyType) {
    const stmt = this.db.prepare(`
      SELECT version_id, strategy_name, backtest_score, created_at, parent_version
      FROM strategy_versions
      WHERE strategy_type = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(strategyType);
  }
  
  /**
   * 关闭数据库连接
   */
  close() {
    this.db.close();
  }
}

/**
 * 快速评分函数（无需实例化）
 * @param {Object} metrics - 回测指标
 * @returns {Object} 评分结果
 */
function quickScore(metrics) {
  const scorer = new StrategyScorer();
  const result = scorer.calculateScore(metrics);
  scorer.close();
  return result;
}

module.exports = {
  StrategyScorer,
  quickScore,
  SCORE_CONFIG
};

/**
 * 二次迭代决策分析
 * @param {Object} scoreResult - 评分结果
 * @returns {Object} 决策建议
 */
function analyzeIteration(scoreResult) {
  const { scoreTotal, scoreSharpe, scoreDrawdown, metrics } = scoreResult;
  
  const issues = [];
  const suggestions = [];
  
  // 分析弱点
  if (scoreSharpe < 60) {
    issues.push('夏普比率偏低，风险调整后收益不足');
    suggestions.push('考虑优化止盈止损比例，或调整持仓周期');
  }
  if (scoreDrawdown < 60) {
    issues.push('最大回撤过大');
    suggestions.push('降低仓位或增加止损条件');
  }
  if (scoreResult.scoreWinRate < 60) {
    issues.push('胜率偏低');
    suggestions.push('优化入场条件，增加过滤条件');
  }
  
  // 决策建议
  let decision = 'CONTINUE';
  if (scoreTotal >= 80) {
    decision = 'SAVE_AND_STOP'; // 保存并停止
  } else if (scoreTotal >= 60) {
    decision = 'CONTINUE'; // 继续迭代
  } else {
    decision = 'ADJUST_PARAMS'; // 调整参数范围
  }
  
  return {
    decision,
    issues,
    suggestions,
    nextParams: generateNextParams(metrics, decision)
  };
}

function generateNextParams(metrics, decision) {
  // 简单的参数调整逻辑
  if (decision === 'ADJUST_PARAMS') {
    return { adjustRisk: true, narrowRange: true };
  }
  return {};
}

module.exports.analyzeIteration = analyzeIteration;
