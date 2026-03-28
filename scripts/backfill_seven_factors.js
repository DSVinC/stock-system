#!/usr/bin/env node
/**
 * 七因子原始数据回填脚本
 * 
 * 用途：根据现有数据计算七个因子的原始分数，填入新添加的列
 * 执行：node scripts/backfill_seven_factors.js [--auto] [--date YYYY-MM-DD]
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.STOCK_DB || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

// 七因子计算逻辑（与 score-factors.js 保持一致）
function calculateSevenFactors(row) {
  const factors = {};
  
  // 1. 趋势因子 (RSI + MACD + 均线趋势)
  // RSI: 30-70 为中性，<30 超卖（高分），>70 超买（低分）
  const rsi = row.rsi || 50;
  const rsiScore = rsi < 30 ? 0.9 : rsi < 50 ? 0.7 : rsi < 70 ? 0.5 : 0.3;
  
  // MACD: 金叉高分，死叉低分
  const macdScore = row.macd_signal === 'bullish' ? 0.8 : row.macd_signal === 'bearish' ? 0.3 : 0.5;
  
  factors.trend_score = (rsiScore * 0.6 + macdScore * 0.4) * 10;
  
  // 2. 动量因子（涨跌幅）
  // 使用 industry_total_score 作为动量代理（因为缺少直接的涨跌幅数据）
  const momentumProxy = (row.industry_total_score || 5) / 10;
  factors.momentum_score = Math.min(1, Math.max(0, momentumProxy)) * 10;
  
  // 3. 估值因子（PE + PB）
  const pe = row.pe_ttm;
  const pb = row.pb;
  
  let peScore = 0.5;
  if (pe > 0) {
    if (pe < 15) peScore = 0.9;      // 低估值
    else if (pe < 25) peScore = 0.7;  // 合理
    else if (pe < 40) peScore = 0.5;  // 中等
    else if (pe < 60) peScore = 0.3;  // 偏高
    else peScore = 0.1;               // 高估
  }
  
  let pbScore = 0.5;
  if (pb > 0) {
    if (pb < 2) pbScore = 0.9;
    else if (pb < 4) pbScore = 0.7;
    else if (pb < 6) pbScore = 0.5;
    else if (pb < 10) pbScore = 0.3;
    else pbScore = 0.1;
  }
  
  factors.valuation_score = (peScore * 0.7 + pbScore * 0.3) * 10;
  
  // 4. 业绩因子（ROE + 营收增长 + 净利润增长）
  const roe = row.roe || 0;
  const revenueGrowth = row.revenue_growth || 0;
  const netprofitGrowth = row.netprofit_growth || 0;
  
  const roeScore = Math.min(1, roe / 20);  // ROE 20% 为满分
  const revenueScore = Math.min(1, Math.max(0, revenueGrowth / 30));  // 营收增长 30% 为满分
  const profitScore = Math.min(1, Math.max(0, netprofitGrowth / 30));  // 净利润增长 30% 为满分
  
  factors.earnings_score = (roeScore * 0.4 + revenueScore * 0.3 + profitScore * 0.3) * 10;
  
  // 5. 资金因子（主力流入）
  const mainFlowIn = row.main_flow_in || 0;
  const capitalScore = mainFlowIn > 1e8 ? 0.9 :    // 1 亿以上
                       mainFlowIn > 5e7 ? 0.7 :    // 5 千万以上
                       mainFlowIn > 1e7 ? 0.5 :    // 1 千万以上
                       mainFlowIn > 0 ? 0.3 : 0.1;  // 流入/流出
  
  factors.capital_score_raw = capitalScore * 10;
  
  // 6. 波动率因子（使用 RSI 波动代理）
  // RSI 接近 50 为低波动（稳定），远离 50 为高波动
  const rsiDeviation = Math.abs(rsi - 50) / 50;
  const volatilityScore = 1 - rsiDeviation;  // 越稳定分数越高
  
  factors.volatility_score = volatilityScore * 10;
  
  // 7. 舆情因子（使用 sentiment_score 字段）
  const sentimentRaw = row.sentiment_score || 5;
  factors.sentiment_score_raw = (sentimentRaw / 10) * 10;
  
  return factors;
}

// 计算四维度分数（行业评分用）
function calculateDimensions(row) {
  return {
    social_score: 5,  // 临时值，后续从新闻/ESG 数据计算
    policy_score_raw: row.policy_score || 5,
    public_score: 5,  // 临时值，后续从热度数据计算
    business_score: row.commercialization_score || 5
  };
}

// 验证计算结果是否合理
function validateFactors(factors) {
  for (const [key, value] of Object.entries(factors)) {
    if (typeof value !== 'number' || isNaN(value)) {
      return false;
    }
    if (value < 0 || value > 10) {
      console.warn(`  ⚠️  ${key} = ${value} 超出 [0-10] 范围`);
    }
  }
  return true;
}

function backfill(options = {}) {
  const { auto, targetDate } = options;
  
  console.log('🔧 开始七因子数据回填...');
  console.log(`📁 数据库路径：${DB_PATH}`);
  
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  
  // 检查是否需要回填（新列是否为空）
  const checkSql = `
    SELECT COUNT(*) as count 
    FROM stock_factor_snapshot 
    WHERE trade_date = (SELECT MAX(trade_date) FROM stock_factor_snapshot)
    AND trend_score = 0
  `;
  const checkResult = db.prepare(checkSql).get();
  
  if (checkResult.count === 0) {
    console.log('✅ 最新数据已存在七因子数据，跳过回填');
    
    // 检查是否有历史数据需要回填
    const historicalCheck = `
      SELECT COUNT(DISTINCT trade_date) as days, COUNT(*) as rows
      FROM stock_factor_snapshot
      WHERE trend_score = 0
    `;
    const histResult = db.prepare(historicalCheck).get();
    
    if (histResult.rows > 0) {
      console.log(`⚠️  还有 ${histResult.rows} 条历史记录 (${histResult.days} 天) 需要回填`);
      if (!auto) {
        console.log('   使用 --auto 参数执行完整回填');
        db.close();
        return;
      }
    } else {
      console.log('✅ 所有数据已完成回填');
      db.close();
      return;
    }
  }
  
  // 获取需要回填的日期列表
  let datesSql;
  if (targetDate) {
    datesSql = `
      SELECT DISTINCT trade_date 
      FROM stock_factor_snapshot 
      WHERE trend_score = 0 AND trade_date = '${targetDate.replace(/-/g, '')}'
      ORDER BY trade_date DESC
    `;
  } else if (auto) {
    datesSql = `
      SELECT DISTINCT trade_date 
      FROM stock_factor_snapshot 
      WHERE trend_score = 0
      ORDER BY trade_date DESC
      LIMIT 10000
    `;
  } else {
    datesSql = `
      SELECT DISTINCT trade_date 
      FROM stock_factor_snapshot 
      WHERE trend_score = 0
      ORDER BY trade_date DESC
      LIMIT 1
    `;
  }
  
  const dates = db.prepare(datesSql).all().map(r => r.trade_date);
  console.log(`\n📅 需要回填 ${dates.length} 个交易日`);
  
  if (dates.length === 0) {
    console.log('✅ 无需回填');
    db.close();
    return;
  }
  
  // 准备更新语句
  const updateSql = `
    UPDATE stock_factor_snapshot SET
      trend_score = ?,
      momentum_score = ?,
      valuation_score = ?,
      earnings_score = ?,
      capital_score_raw = ?,
      volatility_score = ?,
      sentiment_score_raw = ?,
      social_score = ?,
      policy_score_raw = ?,
      public_score = ?,
      business_score = ?
    WHERE ts_code = ? AND trade_date = ?
  `;
  
  const updateStmt = db.prepare(updateSql);
  
  let totalRows = 0;
  let updatedRows = 0;
  let errorRows = 0;
  
  // 按日期处理
  for (const tradeDate of dates) {
    console.log(`\n📅 处理日期：${tradeDate}`);
    
    // 获取该日期的所有股票数据
    const stocksSql = `
      SELECT ts_code, industry, 
             roe, revenue_growth, netprofit_growth,
             pe_ttm, pb, rsi, macd_signal,
             main_flow_in,
             policy_score, commercialization_score, sentiment_score,
             industry_total_score, seven_factor_score
      FROM stock_factor_snapshot
      WHERE trade_date = ?
    `;
    
    const stocks = db.prepare(stocksSql).all(tradeDate);
    totalRows += stocks.length;
    
    console.log(`   共 ${stocks.length} 只股票`);
    
    // 批量更新（使用事务提高性能）
    const transaction = db.transaction((rows) => {
      for (const row of rows) {
        try {
          const factors = calculateSevenFactors(row);
          const dimensions = calculateDimensions(row);
          
          if (!validateFactors(factors)) {
            console.warn(`   ⚠️  ${row.ts_code} 因子计算异常`);
            errorRows++;
            continue;
          }
          
          updateStmt.run(
            factors.trend_score,
            factors.momentum_score,
            factors.valuation_score,
            factors.earnings_score,
            factors.capital_score_raw,
            factors.volatility_score,
            factors.sentiment_score_raw,
            dimensions.social_score,
            dimensions.policy_score_raw,
            dimensions.public_score,
            dimensions.business_score,
            row.ts_code,
            tradeDate
          );
          updatedRows++;
        } catch (error) {
          console.error(`   ❌ ${row.ts_code} 更新失败：${error.message}`);
          errorRows++;
        }
      }
    });
    
    transaction(stocks);
    
    // 进度报告
    const progress = ((updatedRows / totalRows) * 100).toFixed(1);
    console.log(`   进度：${updatedRows}/${totalRows} (${progress}%)`);
  }
  
  // 验证回填结果
  console.log('\n📊 回填结果验证...');
  
  const sampleSql = `
    SELECT ts_code, trade_date, 
           trend_score, momentum_score, valuation_score, earnings_score,
           capital_score_raw, volatility_score, sentiment_score_raw,
           seven_factor_score
    FROM stock_factor_snapshot
    WHERE trend_score > 0
    ORDER BY trade_date DESC, seven_factor_score DESC
    LIMIT 5
  `;
  
  const samples = db.prepare(sampleSql).all();
  console.log('\n✅ 样本数据（七因子分数最高的 5 只股票）:');
  console.table(samples.map(s => ({
    code: s.ts_code,
    date: s.trade_date,
    trend: s.trend_score.toFixed(2),
    momentum: s.momentum_score.toFixed(2),
    valuation: s.valuation_score.toFixed(2),
    earnings: s.earnings_score.toFixed(2),
    capital: s.capital_score_raw.toFixed(2),
    volatility: s.volatility_score.toFixed(2),
    sentiment: s.sentiment_score_raw.toFixed(2),
    original: s.seven_factor_score.toFixed(2)
  })));
  
  // 统计信息
  const statsSql = `
    SELECT 
      COUNT(*) as total,
      AVG(trend_score) as avg_trend,
      AVG(momentum_score) as avg_momentum,
      AVG(valuation_score) as avg_valuation,
      AVG(earnings_score) as avg_earnings,
      AVG(capital_score_raw) as avg_capital,
      AVG(volatility_score) as avg_volatility,
      AVG(sentiment_score_raw) as avg_sentiment
    FROM stock_factor_snapshot
    WHERE trend_score > 0
  `;
  
  const stats = db.prepare(statsSql).get();
  console.log('\n📈 统计信息:');
  console.log(`   总记录数：${stats.total}`);
  console.log(`   平均趋势分：${stats.avg_trend?.toFixed(2)}`);
  console.log(`   平均动量分：${stats.avg_momentum?.toFixed(2)}`);
  console.log(`   平均估值分：${stats.avg_valuation?.toFixed(2)}`);
  console.log(`   平均业绩分：${stats.avg_earnings?.toFixed(2)}`);
  console.log(`   平均资金分：${stats.avg_capital?.toFixed(2)}`);
  console.log(`   平均波动分：${stats.avg_volatility?.toFixed(2)}`);
  console.log(`   平均舆情分：${stats.avg_sentiment?.toFixed(2)}`);
  
  db.close();
  
  console.log('\n🎉 七因子数据回填完成！');
  console.log(`   总记录：${totalRows}`);
  console.log(`   成功：${updatedRows}`);
  console.log(`   失败：${errorRows}`);
}

// CLI 参数解析
const args = process.argv.slice(2);
const options = {
  auto: args.includes('--auto'),
  targetDate: args.find(a => a.startsWith('--date='))?.split('=')[1]
};

if (require.main === module) {
  try {
    backfill(options);
  } catch (error) {
    console.error('❌ 回填失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = { backfill, calculateSevenFactors };
