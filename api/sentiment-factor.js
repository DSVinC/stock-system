'use strict';

/**
 * 舆情因子计算模块
 * Sentiment Factor Calculator
 * 
 * 整合新浪财经新闻和公告事件，计算舆情因子得分
 * 支持时间衰减、置信度加权、重大事件覆盖
 */

const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const execFileAsync = promisify(execFile);

// 数据库路径
const DB_PATH = '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
const NEWS_DB_PATH = '/Volumes/SSD500/data/news_system/news.db';

/**
 * 公告事件影响映射
 */
const EVENT_IMPACT_MAP = {
  // 重大利好
  '业绩预告超预期': 1.0,
  '重大订单': 0.9,
  '战略合作': 0.8,
  '并购重组': 0.8,
  '高管增持': 0.7,
  '股份回购': 0.7,
  '分红预案': 0.6,
  
  // 中性
  '财报披露': 0.5,
  '中性公告': 0.5,
  '人事变动': 0.5,
  '股东大会': 0.5,
  
  // 利空
  '股东减持': 0.2,
  '解禁': 0.3,
  '业绩下滑': 0.3,
  '处罚': 0.1,
  '诉讼': 0.2,
  '监管函': 0.2,
  '立案调查': 0.1
};

/**
 * 情感分析词库（基础版，后续升级为 LLM）
 */
const SENTIMENT_KEYWORDS = {
  positive: [
    '利好', '增长', '盈利', '突破', '上涨', '创新高', '支持',
    '订单', '签约', '合作', '扩张', '升级', '优化', '提升',
    '超预期', '预增', '扭亏', '复苏', '回暖', '景气', '繁荣'
  ],
  negative: [
    '利空', '下跌', '亏损', '下滑', '风险', '警告', '违规',
    '调查', '处罚', '减持', '解禁', '诉讼', '破产', '衰退',
    '低于预期', '预亏', '恶化', '低迷', '萎缩', '暴雷'
  ]
};

/**
 * 运行 SQL 查询
 */
async function runSql(sql, dbPath, options = {}) {
  const args = [];
  if (options.json) {
    args.push('-json');
  }
  args.push(dbPath, sql);

  try {
    const { stdout, stderr } = await execFileAsync('/usr/bin/sqlite3', args, {
      maxBuffer: 1024 * 1024
    });

    if (stderr && stderr.trim()) {
      throw new Error(stderr.trim());
    }

    return stdout.trim();
  } catch (error) {
    console.warn(`SQL 查询失败 (${dbPath}):`, error.message);
    return '';
  }
}

/**
 * 时间衰减函数（新闻）
 * 半衰期：12 小时（A 股新闻时效极短）
 */
function applyNewsTimeDecay(sentiment, pubDate, currentTime) {
  const hoursSince = (currentTime - pubDate) / (1000 * 60 * 60);
  const halfLife = 12;  // 12 小时半衰期
  const decayFactor = Math.exp(-0.693 * hoursSince / halfLife);
  return sentiment * decayFactor;
}

/**
 * 时间衰减函数（公告）
 * 半衰期：5 天（重大事件长尾效应）
 */
function applyEventTimeDecay(score, eventDate, currentTime) {
  const daysSince = (currentTime - eventDate) / (1000 * 60 * 60 * 24);
  const halfLife = 5;  // 5 天半衰期
  const decayFactor = Math.exp(-0.693 * daysSince / halfLife);
  return score * decayFactor;
}

/**
 * 简单情感分析（基础版）
 * 后续升级为 LLM-based 分析
 */
function analyzeNewsSentiment(title, content) {
  const text = (title + ' ' + (content || '')).toLowerCase();
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  SENTIMENT_KEYWORDS.positive.forEach(word => {
    if (text.includes(word.toLowerCase())) positiveCount++;
  });
  
  SENTIMENT_KEYWORDS.negative.forEach(word => {
    if (text.includes(word.toLowerCase())) negativeCount++;
  });
  
  // 情感判断
  let sentiment = 0;  // -1 ~ +1
  let confidence = 0.5;
  
  const total = positiveCount + negativeCount;
  
  if (total > 0) {
    sentiment = (positiveCount - negativeCount) / total;
    confidence = Math.min(0.5 + total * 0.1, 0.9);
  }
  
  return {
    sentiment,  // -1 ~ +1
    confidence, // 0.5 ~ 0.9
    positiveCount,
    negativeCount
  };
}

/**
 * 计算新闻情感分
 */
async function calculateNewsScore(stockCode, hours = 72) {
  const pureCode = stockCode.split('.')[0];
  const now = new Date();
  
  // 检查新闻数据库是否存在
  if (!fs.existsSync(NEWS_DB_PATH)) {
    console.warn('新闻数据库不存在:', NEWS_DB_PATH);
    return { score: 0.5, details: { newsCount: 0 } };
  }
  
  // 查询相关新闻（最近 72 小时）
  const sql = `
    SELECT id, title, content, pub_date, category
    FROM news_raw
    WHERE source_id = 100  -- 新浪财经
      AND pub_date >= datetime('now', '-${hours} hours')
      AND (
        title LIKE '%${pureCode}%'
        OR content LIKE '%${pureCode}%'
      )
    ORDER BY pub_date DESC
    LIMIT 50;
  `;
  
  const stdout = await runSql(sql, NEWS_DB_PATH, { json: true });
  
  if (!stdout) {
    return { score: 0.5, details: { newsCount: 0 } };
  }
  
  try {
    const newsList = JSON.parse(stdout);
    
    if (newsList.length === 0) {
      return { score: 0.5, details: { newsCount: 0 } };
    }
    
    // 计算加权情感分
    let scoreSum = 0;
    let weightSum = 0;
    
    for (const news of newsList) {
      // 情感分析
      const analysis = analyzeNewsSentiment(news.title, news.content);
      
      // 归一化：-1~+1 → 0~1
      const normalizedSentiment = (analysis.sentiment + 1) / 2;
      
      // 时间衰减
      const pubDate = new Date(news.pub_date);
      const decayedSentiment = applyNewsTimeDecay(normalizedSentiment, pubDate, now);
      
      // 置信度加权（新浪财经基础置信度 0.8）
      const weight = analysis.confidence * 0.8;
      
      scoreSum += decayedSentiment * weight;
      weightSum += weight;
    }
    
    const score = weightSum > 0 ? scoreSum / weightSum : 0.5;
    
    return {
      score: Math.round(score * 100) / 100,
      details: {
        newsCount: newsList.length,
        avgSentiment: Math.round((score - 0.5) * 2 * 100) / 100  // 转回 -1~+1
      }
    };
  } catch (error) {
    console.warn('计算新闻情感分失败:', error.message);
    return { score: 0.5, details: { newsCount: 0 } };
  }
}

/**
 * 计算公告事件分
 */
async function calculateEventScore(stockCode, days = 7) {
  const now = new Date();
  
  // 查询公告事件（最近 7 天）
  const sql = `
    SELECT event_type, event_time, title, content
    FROM company_events
    WHERE stock_code = '${stockCode}'
      AND event_time >= datetime('now', '-${days} days')
    ORDER BY event_time DESC
    LIMIT 20;
  `;
  
  const stdout = await runSql(sql, DB_PATH, { json: true });
  
  if (!stdout) {
    return { score: 0.5, details: { eventCount: 0 } };
  }
  
  try {
    const events = JSON.parse(stdout);
    
    if (events.length === 0) {
      return { score: 0.5, details: { eventCount: 0 } };
    }
    
    // 计算加权事件分
    let scoreSum = 0;
    let weightSum = 0;
    
    for (const event of events) {
      // 基础影响分
      const baseScore = EVENT_IMPACT_MAP[event.event_type] || 0.5;
      
      // 时间衰减
      const eventDate = new Date(event.event_time);
      const decayedScore = applyEventTimeDecay(baseScore, eventDate, now);
      
      scoreSum += decayedScore;
      weightSum += 1;
    }
    
    const score = weightSum > 0 ? scoreSum / weightSum : 0.5;
    
    return {
      score: Math.round(score * 100) / 100,
      details: {
        eventCount: events.length,
        eventTypes: [...new Set(events.map(e => e.event_type))]
      }
    };
  } catch (error) {
    console.warn('计算公告事件分失败:', error.message);
    return { score: 0.5, details: { eventCount: 0 } };
  }
}

/**
 * 计算风险调整（重大事件覆盖）
 * ±2% 调整
 */
async function calculateRiskAdjustment(stockCode, eventDetails) {
  // 检查是否有重大利好或利空
  const majorPositive = ['业绩预告超预期', '重大订单', '并购重组'];
  const majorNegative = ['立案调查', '处罚', '股东减持', '解禁'];
  
  let adjustment = 0;
  
  if (eventDetails.eventTypes) {
    const hasMajorPositive = eventDetails.eventTypes.some(t => majorPositive.includes(t));
    const hasMajorNegative = eventDetails.eventTypes.some(t => majorNegative.includes(t));
    
    if (hasMajorPositive && !hasMajorNegative) {
      adjustment = 0.02;  // +2%
    } else if (hasMajorNegative && !hasMajorPositive) {
      adjustment = -0.02;  // -2%
    }
  }
  
  return adjustment;
}

/**
 * 计算舆情因子
 * @param {string} stockCode - 股票代码
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 舆情因子得分和详情
 */
async function calculateSentimentFactor(stockCode, options = {}) {
  const {
    newsHours = 72,
    eventDays = 7,
    newsWeight = 0.5,
    eventWeight = 0.5
  } = options;
  
  // 1. 计算新闻情感分 (50%)
  const newsResult = await calculateNewsScore(stockCode, newsHours);
  
  // 2. 计算公告事件分 (50%)
  const eventResult = await calculateEventScore(stockCode, eventDays);
  
  // 3. 综合舆情分
  const rawScore = newsResult.score * newsWeight + eventResult.score * eventWeight;
  
  // 4. 风险调整（±2%）
  const riskAdjustment = await calculateRiskAdjustment(stockCode, eventResult.details);
  
  // 5. 最终得分（限制在 0.6~1.2 范围）
  const finalScore = Math.min(Math.max(rawScore + riskAdjustment, 0.6), 1.2);
  
  return {
    score: Math.round(finalScore * 100) / 100,
    details: {
      newsScore: newsResult.score,
      eventScore: eventResult.score,
      ...newsResult.details,
      ...eventResult.details,
      riskAdjustment: Math.round(riskAdjustment * 100) / 100
    },
    calculatedAt: new Date().toISOString()
  };
}

/**
 * 批量计算舆情因子
 */
async function calculateSentimentFactorBatch(stockCodes, options = {}) {
  const results = {};
  
  for (const code of stockCodes) {
    results[code] = await calculateSentimentFactor(code, options);
  }
  
  return results;
}

module.exports = {
  calculateSentimentFactor,
  calculateSentimentFactorBatch,
  calculateNewsScore,
  calculateEventScore,
  analyzeNewsSentiment,
  SENTIMENT_KEYWORDS,
  EVENT_IMPACT_MAP
};
