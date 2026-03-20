'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
// Supabase 客户端（如果需要连接外部数据库）
// const { createClient } = require('@supabase/supabase-js');

const execFileAsync = promisify(execFile);

// 数据库路径
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'stock_system.db');

// 新闻数据库路径（现有）
const NEWS_DB_PATH = path.join(__dirname, '..', '..', 'news_system', 'news.db');

// Feishu推送配置
const FEISHU_CONFIG = {
  webhook_url: process.env.FEISHU_WEBHOOK_URL || '',
  receiver_id: process.env.FEISHU_RECEIVER_ID || 'ou_a21807011c59304bedfaf2f7440f5361'
};

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function toSqlValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }
  return `'${escapeSqlString(value)}'`;
}

async function runSql(sql, dbPath = DB_PATH, options = {}) {
  fs.mkdirSync(DB_DIR, { recursive: true });

  const args = [];
  if (options.json) {
    args.push('-json');
  }

  args.push(dbPath, sql);

  const { stdout, stderr } = await execFileAsync('/usr/bin/sqlite3', args, {
    maxBuffer: 1024 * 1024
  });

  if (stderr && stderr.trim()) {
    throw new Error(stderr.trim());
  }

  return stdout.trim();
}

/**
 * 获取监控池中的行业信息
 */
async function getMonitoredIndustries() {
  const sql = `
    SELECT DISTINCT
      industry_code_l3 as industry_code,
      industry_name_l3 as industry_name,
      industry_keywords,
      GROUP_CONCAT(stock_code) as monitored_stocks,
      COUNT(*) as stock_count
    FROM monitor_pool
    WHERE industry_code_l3 IS NOT NULL
    GROUP BY industry_code_l3, industry_name_l3
    ORDER BY stock_count DESC;
  `;
  
  const stdout = await runSql(sql, DB_PATH, { json: true });
  if (!stdout) return [];
  
  const industries = JSON.parse(stdout).map(row => ({
    ...row,
    monitored_stocks: row.monitored_stocks ? row.monitored_stocks.split(',') : [],
    industry_keywords: row.industry_keywords ? JSON.parse(row.industry_keywords) : []
  }));
  
  return industries;
}

/**
 * 从新闻数据库抓取行业新闻
 */
async function fetchIndustryNews(industryCode, industryName, keywords, hours = 1) {
  if (!fs.existsSync(NEWS_DB_PATH)) {
    console.warn(`新闻数据库不存在: ${NEWS_DB_PATH}`);
    return [];
  }
  
  // 构建关键词查询条件
  const keywordConditions = keywords.map(kw => `title LIKE '%${kw}%'`).join(' OR ');
  const whereClause = keywordConditions ? `AND (${keywordConditions})` : '';
  
  const sql = `
    SELECT 
      id,
      title,
      content,
      link,
      pub_date,
      fetched_at
    FROM news_raw 
    WHERE 
      fetched_at >= datetime('now', '-${hours} hours')
      ${whereClause}
    ORDER BY fetched_at DESC
    LIMIT 50;
  `;
  
  try {
    const stdout = await runSql(sql, NEWS_DB_PATH, { json: true });
    if (!stdout) return [];
    
    const newsList = JSON.parse(stdout);
    
    // 添加行业信息
    return newsList.map(news => ({
      ...news,
      industry_code: industryCode,
      industry_name: industryName,
      matched_keywords: keywords.filter(kw => 
        news.title.toLowerCase().includes(kw.toLowerCase()) ||
        (news.content && news.content.toLowerCase().includes(kw.toLowerCase()))
      )
    }));
  } catch (error) {
    console.error(`抓取行业新闻失败 (${industryCode}):`, error.message);
    return [];
  }
}

/**
 * AI分析新闻情感（简化版，后续可接入OpenAI等）
 */
async function analyzeNewsSentiment(news) {
  const { title, content, industry_name } = news;
  
  // 关键词匹配（简化情感分析）
  const positiveKeywords = [
    '利好', '增长', '盈利', '突破', '上涨', '创新高', '政策支持',
    '订单', '签约', '合作', '扩张', '升级', '优化', '提升'
  ];
  
  const negativeKeywords = [
    '利空', '下跌', '亏损', '下滑', '风险', '警告', '违规',
    '调查', '处罚', '减持', '解禁', '诉讼', '破产', '衰退'
  ];
  
  const text = (title + ' ' + (content || '')).toLowerCase();
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  positiveKeywords.forEach(keyword => {
    if (text.includes(keyword.toLowerCase())) positiveCount++;
  });
  
  negativeKeywords.forEach(keyword => {
    if (text.includes(keyword.toLowerCase())) negativeCount++;
  });
  
  // 情感判断
  let sentiment = 'neutral';
  let confidence = 0.5;
  
  if (positiveCount > negativeCount && positiveCount >= 2) {
    sentiment = positiveCount >= 4 ? 'strong_positive' : 'positive';
    confidence = Math.min(0.5 + (positiveCount * 0.1), 0.9);
  } else if (negativeCount > positiveCount && negativeCount >= 2) {
    sentiment = negativeCount >= 4 ? 'strong_negative' : 'negative';
    confidence = Math.min(0.5 + (negativeCount * 0.1), 0.9);
  }
  
  // 影响级别判断
  let impactLevel = 'low';
  if (sentiment.includes('strong_') || positiveCount + negativeCount >= 5) {
    impactLevel = 'high';
  } else if (positiveCount + negativeCount >= 3) {
    impactLevel = 'medium';
  }
  
  return {
    sentiment,
    confidence: Math.round(confidence * 100) / 100,
    impact_level: impactLevel,
    positive_count: positiveCount,
    negative_count: negativeCount
  };
}

/**
 * 保存行业新闻因子
 */
async function saveIndustryNewsFactor(news, analysis) {
  const sql = `
    INSERT OR IGNORE INTO industry_news_factor (
      news_id, industry_code, industry_name, news_title, news_url,
      publish_time, sentiment, confidence, keywords_matched, impact_level,
      created_at
    ) VALUES (
      ${toSqlValue(news.id)},
      ${toSqlValue(news.industry_code)},
      ${toSqlValue(news.industry_name)},
      ${toSqlValue(news.title)},
      ${toSqlValue(news.link)},
      ${toSqlValue(news.pub_date)},
      ${toSqlValue(analysis.sentiment)},
      ${analysis.confidence},
      ${toSqlValue(JSON.stringify(news.matched_keywords || []))},
      ${toSqlValue(analysis.impact_level)},
      datetime('now')
    );
  `;
  
  await runSql(sql, DB_PATH);
}

/**
 * 发送飞书即时推送
 */
async function sendFeishuImmediateNotification(news, analysis, monitoredStocks) {
  if (!FEISHU_CONFIG.webhook_url) {
    console.warn('未配置飞书Webhook URL，跳过推送');
    return false;
  }
  
  const sentimentEmoji = {
    'strong_positive': '🔥🔥',
    'positive': '🔥',
    'neutral': '📊',
    'negative': '⚠️',
    'strong_negative': '⚠️⚠️'
  }[analysis.sentiment] || '📰';
  
  const impactEmoji = {
    'high': '🚨',
    'medium': '📈',
    'low': '📊'
  }[analysis.impact_level] || '📊';
  
  const stocksText = monitoredStocks.length > 0 
    ? monitoredStocks.slice(0, 5).map(s => `• ${s}`).join('\n')
    : '暂无相关监控股票';
  
  const message = {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: `${sentimentEmoji} 行业重大新闻`
        },
        template: analysis.sentiment.includes('positive') ? 'green' : 
                  analysis.sentiment.includes('negative') ? 'red' : 'blue'
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${news.title}**\n\n🏭 **关联行业**: ${news.industry_name}\n${impactEmoji} **影响评估**: ${analysis.sentiment} (置信度: ${Math.round(analysis.confidence * 100)}%)`
          }
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**📈 影响股票** (${monitoredStocks.length}只):\n${stocksText}`
          }
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: '查看原文'
              },
              type: 'primary',
              url: news.link || 'javascript:void(0)'
            }
          ]
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: `推送时间: ${new Date().toLocaleString('zh-CN')}`
            }
          ]
        }
      ]
    }
  };
  
  try {
    const response = await fetch(FEISHU_CONFIG.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    
    if (response.ok) {
      console.log(`飞书推送成功: ${news.industry_name} - ${news.title}`);
      
      // 标记为已推送
      await runSql(`
        UPDATE industry_news_factor 
        SET is_notified = 1, notified_at = datetime('now')
        WHERE news_id = ${toSqlValue(news.id)} 
          AND industry_code = ${toSqlValue(news.industry_code)};
      `, DB_PATH);
      
      return true;
    } else {
      console.error('飞书推送失败:', await response.text());
      return false;
    }
  } catch (error) {
    console.error('飞书推送异常:', error.message);
    return false;
  }
}

/**
 * 生成每日行业摘要
 */
async function generateDailyIndustrySummary() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  const sql = `
    SELECT 
      industry_code,
      industry_name,
      COUNT(*) as news_count,
      AVG(CASE 
        WHEN sentiment = 'strong_positive' THEN 1.0
        WHEN sentiment = 'positive' THEN 0.5
        WHEN sentiment = 'neutral' THEN 0.0
        WHEN sentiment = 'negative' THEN -0.5
        WHEN sentiment = 'strong_negative' THEN -1.0
        ELSE 0.0
      END) as sentiment_score,
      SUM(CASE WHEN impact_level = 'high' THEN 1 ELSE 0 END) as high_impact_count,
      GROUP_CONCAT(DISTINCT news_title) as news_titles
    FROM industry_news_factor
    WHERE DATE(created_at) = '${yesterdayStr}'
    GROUP BY industry_code, industry_name
    HAVING news_count > 0
    ORDER BY ABS(sentiment_score) DESC, news_count DESC
    LIMIT 20;
  `;
  
  const stdout = await runSql(sql, DB_PATH, { json: true });
  if (!stdout) return null;
  
  const summary = JSON.parse(stdout).map(row => ({
    ...row,
    news_titles: row.news_titles ? row.news_titles.split(',').slice(0, 3) : [],
    sentiment_score: Math.round(row.sentiment_score * 100) / 100
  }));
  
  return {
    date: yesterdayStr,
    total_industries: summary.length,
    summary
  };
}

/**
 * 发送每日行业摘要
 */
async function sendDailyIndustrySummary() {
  const summary = await generateDailyIndustrySummary();
  if (!summary || summary.total_industries === 0) {
    console.log('今日无行业新闻，跳过摘要推送');
    return;
  }
  
  if (!FEISHU_CONFIG.webhook_url) {
    console.warn('未配置飞书Webhook URL，跳过摘要推送');
    return;
  }
  
  const summaryElements = summary.summary.map(industry => {
    const sentimentEmoji = industry.sentiment_score > 0.3 ? '😊' :
                          industry.sentiment_score < -0.3 ? '😟' : '😐';
    
    return [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**🏭 ${industry.industry_name}**\n${sentimentEmoji} 情感指数: ${industry.sentiment_score.toFixed(2)} (${industry.news_count}条新闻)`
        }
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**主要新闻**:\n${industry.news_titles.map((title, idx) => `${idx + 1}. ${title}`).join('\n')}`
        }
      },
      {
        tag: 'hr'
      }
    ];
  }).flat();
  
  const message = {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: `📊 行业监控日报 - ${summary.date}`
        },
        template: 'blue'
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**监控概况**\n共监控 ${summary.total_industries} 个行业，${summary.summary.reduce((sum, ind) => sum + ind.news_count, 0)} 条相关新闻`
          }
        },
        {
          tag: 'hr'
        },
        ...summaryElements.slice(0, 10) // 限制最多显示10个行业
      ]
    }
  };
  
  try {
    const response = await fetch(FEISHU_CONFIG.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    
    if (response.ok) {
      console.log(`行业摘要推送成功: ${summary.date}`);
      return true;
    } else {
      console.error('行业摘要推送失败:', await response.text());
      return false;
    }
  } catch (error) {
    console.error('行业摘要推送异常:', error.message);
    return false;
  }
}

/**
 * 主监控函数：每小时执行
 */
async function runIndustryNewsMonitor() {
  console.log(`[${new Date().toLocaleString()}] 开始执行行业新闻监控...`);
  
  // 1. 获取监控行业
  const industries = await getMonitoredIndustries();
  
  if (industries.length === 0) {
    console.log('监控池中没有股票设置行业信息');
    return;
  }
  
  console.log(`监控 ${industries.length} 个行业:`, industries.map(i => i.industry_name));
  
  // 2. 为每个行业抓取新闻
  const allNews = [];
  
  for (const industry of industries) {
    const newsList = await fetchIndustryNews(
      industry.industry_code,
      industry.industry_name,
      industry.industry_keywords,
      1 // 最近1小时的新闻
    );
    
    if (newsList.length > 0) {
      console.log(`行业 ${industry.industry_name} 发现 ${newsList.length} 条新闻`);
      
      // 3. 分析每条新闻
      for (const news of newsList) {
        const analysis = await analyzeNewsSentiment(news);
        
        // 4. 保存到因子表
        await saveIndustryNewsFactor(news, analysis);
        
        // 5. 检查是否需要即时推送（重大新闻）
        if (analysis.impact_level === 'high' && !analysis.sentiment.includes('neutral')) {
          console.log(`发现重大新闻，准备推送: ${news.title}`);
          await sendFeishuImmediateNotification(news, analysis, industry.monitored_stocks);
        }
        
        allNews.push({ news, analysis });
      }
    }
  }
  
  console.log(`[${new Date().toLocaleString()}] 行业新闻监控完成，处理 ${allNews.length} 条新闻`);
  
  return {
    industries_monitored: industries.length,
    news_processed: allNews.length,
    high_impact_count: allNews.filter(n => n.analysis.impact_level === 'high').length
  };
}

/**
 * 初始化申万行业数据（一次性）
 */
async function initShenwanIndustryData() {
  console.log('初始化申万行业数据...');
  
  // 这里需要从Tushare获取申万行业数据
  // 暂时使用示例数据
  const exampleIndustries = [
    {
      industry_code: '270000',
      industry_name: '电子',
      parent_code: null,
      level: 1,
      keywords: ['电子', '半导体', '芯片', '集成电路', '消费电子']
    },
    {
      industry_code: '270100',
      industry_name: '半导体',
      parent_code: '270000',
      level: 2,
      keywords: ['半导体', '芯片', '集成电路', 'IC', '硅片']
    },
    {
      industry_code: '270104',
      industry_name: '数字芯片设计',
      parent_code: '270100',
      level: 3,
      keywords: ['数字芯片', '芯片设计', 'IC设计', 'ASIC', 'FPGA']
    }
  ];
  
  for (const industry of exampleIndustries) {
    const sql = `
      INSERT OR IGNORE INTO shenwan_industry_def (
        industry_code, industry_name, parent_code, level, keywords, created_at
      ) VALUES (
        ${toSqlValue(industry.industry_code)},
        ${toSqlValue(industry.industry_name)},
        ${toSqlValue(industry.parent_code)},
        ${industry.level},
        ${toSqlValue(JSON.stringify(industry.keywords))},
        datetime('now')
      );
    `;
    
    await runSql(sql, DB_PATH);
  }
  
  console.log('申万行业数据初始化完成');
}

module.exports = {
  runIndustryNewsMonitor,
  sendDailyIndustrySummary,
  initShenwanIndustryData,
  getMonitoredIndustries,
  generateDailyIndustrySummary
};