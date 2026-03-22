'use strict';

/**
 * 黑天鹅事件检测模块
 * Black Swan Event Detection
 * 
 * 检测到重大风险事件时，触发一票否决（卖出信号）
 * 优先级高于所有因子评分
 */

const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// 数据库路径
const DB_PATH = path.join(__dirname, '..', 'data', 'stock_system.db');
const NEWS_DB_PATH = '/Volumes/SSD500/data/news_system/news.db';

/**
 * 黑天鹅关键词库
 * 按严重程度分类
 */
const BLACK_SWAN_KEYWORDS = {
  // 监管处罚 (最严重)
  regulatory: [
    '立案调查', '行政处罚', '证监会调查', '立案侦查',
    '公开谴责', '监管函', '警示函', '责令改正'
  ],
  
  // 财务问题 (极严重)
  financial: [
    '财务造假', '虚增利润', '虚假记载', '无法表示意见',
    '否定意见', '重大会计差错', '追溯调整', '审计机构辞任'
  ],
  
  // 退市风险 (极严重)
  delisting: [
    '退市风险警示', '暂停上市', '终止上市', '面值退市',
    '强制退市', '退市整理期', '*ST', 'ST 股'
  ],
  
  // 经营异常 (严重)
  operational: [
    '破产重整', '破产清算', '无法持续经营', '主要账户冻结',
    '停产停业', '重大诉讼', '实际控制人失联', '老板跑路'
  ],
  
  // 重大风险 (严重)
  majorRisk: [
    '重大违法', '欺诈发行', '信息披露违法', '内幕交易',
    '操纵市场', '资金占用', '违规担保'
  ]
};

/**
 * 严重程度映射
 */
const SEVERITY_MAP = {
  regulatory: 'critical',
  financial: 'critical',
  delisting: 'critical',
  operational: 'high',
  majorRisk: 'high'
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
 * 检查单只股票的黑天鹅事件
 * @param {string} stockCode - 股票代码 (格式：000001.SZ 或 600519.SH)
 * @param {number} days - 检查最近 N 天的新闻
 * @returns {Promise<Object>} 检测结果
 */
async function checkBlackSwan(stockCode, days = 30) {
  const results = {
    isBlackSwan: false,
    reason: null,
    severity: 'none',
    action: null,
    category: null,
    detectedAt: new Date().toISOString(),
    details: []
  };

  // 提取纯股票代码（去掉市场后缀）
  const pureCode = stockCode.split('.')[0];
  
  // 1. 检查新闻数据库（新浪财经）
  if (require('fs').existsSync(NEWS_DB_PATH)) {
    const newsSql = `
      SELECT title, content, pub_date, category
      FROM news_raw
      WHERE pub_date >= datetime('now', '-${days} days')
        AND (
          title LIKE '%${pureCode}%'
          OR content LIKE '%${pureCode}%'
        )
      ORDER BY pub_date DESC
      LIMIT 100;
    `;

    const newsStdout = await runSql(newsSql, NEWS_DB_PATH, { json: true });
    
    if (newsStdout) {
      try {
        const newsList = JSON.parse(newsStdout);
        
        for (const news of newsList) {
          const text = (news.title || '') + ' ' + (news.content || '');
          
          // 检查各类关键词
          for (const [category, keywords] of Object.entries(BLACK_SWAN_KEYWORDS)) {
            for (const keyword of keywords) {
              if (text.includes(keyword)) {
                results.isBlackSwan = true;
                results.reason = `检测到黑天鹅事件：${keyword}`;
                results.severity = SEVERITY_MAP[category];
                results.action = 'sell';  // 一票否决，立即卖出
                results.category = category;
                results.details.push({
                  type: 'news',
                  keyword,
                  category,
                  title: news.title,
                  pubDate: news.pub_date,
                  source: '新浪财经'
                });
                
                // 严重事件直接返回
                if (results.severity === 'critical') {
                  return results;
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn('解析新闻数据失败:', error.message);
      }
    }
  }

  // 2. 检查公告事件表
  const eventSql = `
    SELECT event_type, event_time, title, content
    FROM company_events
    WHERE stock_code = '${stockCode}'
      AND event_time >= datetime('now', '-${days} days')
    ORDER BY event_time DESC
    LIMIT 50;
  `;

  const eventStdout = await runSql(eventSql, DB_PATH, { json: true });
  
  if (eventStdout) {
    try {
      const events = JSON.parse(eventStdout);
      
      for (const event of events) {
        const text = (event.title || '') + ' ' + (event.content || '');
        
        // 检查各类关键词
        for (const [category, keywords] of Object.entries(BLACK_SWAN_KEYWORDS)) {
          for (const keyword of keywords) {
            if (text.includes(keyword)) {
              results.isBlackSwan = true;
              results.reason = `检测到黑天鹅事件：${keyword}`;
              results.severity = SEVERITY_MAP[category];
              results.action = 'sell';
              results.category = category;
              results.details.push({
                type: 'announcement',
                keyword,
                category,
                title: event.title,
                eventTime: event.event_time,
                eventType: event.event_type
              });
              
              // 严重事件直接返回
              if (results.severity === 'critical') {
                return results;
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('解析公告数据失败:', error.message);
    }
  }

  // 3. 检查公司基础信息表（ST 状态）
  const companySql = `
    SELECT stock_name, list_status, special_treatment
    FROM stocks
    WHERE ts_code = '${stockCode}';
  `;

  const companyStdout = await runSql(companySql, DB_PATH, { json: true });
  
  if (companyStdout) {
    try {
      const company = JSON.parse(companyStdout)[0];
      
      if (company && company.special_treatment) {
        const stText = company.special_treatment.toLowerCase();
        if (stText.includes('*st') || stText.includes('st')) {
          results.isBlackSwan = true;
          results.reason = `股票被标记为 ${company.special_treatment}`;
          results.severity = 'critical';
          results.action = 'sell';
          results.category = 'delisting';
          results.details.push({
            type: 'company_info',
            keyword: company.special_treatment,
            category: 'delisting',
            stockName: company.stock_name,
            listStatus: company.list_status
          });
        }
      }
    } catch (error) {
      console.warn('解析公司信息失败:', error.message);
    }
  }

  return results;
}

/**
 * 批量检查多只股票的黑天鹅事件
 * @param {Array<string>} stockCodes - 股票代码列表
 * @param {number} days - 检查最近 N 天的新闻
 * @returns {Promise<Object>} 检测结果汇总
 */
async function checkBlackSwanBatch(stockCodes, days = 30) {
  const results = {};
  let criticalCount = 0;
  let highCount = 0;

  for (const code of stockCodes) {
    const result = await checkBlackSwan(code, days);
    results[code] = result;
    
    if (result.severity === 'critical') criticalCount++;
    else if (result.severity === 'high') highCount++;
  }

  return {
    results,
    summary: {
      total: stockCodes.length,
      critical: criticalCount,
      high: highCount,
      normal: stockCodes.length - criticalCount - highCount
    }
  };
}

/**
 * 获取黑天鹅关键词统计
 */
function getKeywordStats() {
  const stats = {};
  let total = 0;
  
  for (const [category, keywords] of Object.entries(BLACK_SWAN_KEYWORDS)) {
    stats[category] = {
      count: keywords.length,
      keywords: keywords,
      severity: SEVERITY_MAP[category]
    };
    total += keywords.length;
  }
  
  stats.total = total;
  return stats;
}

module.exports = {
  checkBlackSwan,
  checkBlackSwanBatch,
  getKeywordStats,
  BLACK_SWAN_KEYWORDS
};
