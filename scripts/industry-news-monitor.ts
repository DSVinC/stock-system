#!/usr/bin/env node

import { runIndustryNewsMonitor } from '../api/industry-news-monitor.js';

async function main() {
  console.log(`[${new Date().toISOString()}] 开始执行行业新闻监控任务...`);
  
  try {
    const result = await runIndustryNewsMonitor();
    
    console.log(`[${new Date().toISOString()}] 监控任务完成:`, {
      industries_monitored: result.industries_monitored,
      news_processed: result.news_processed,
      high_impact_count: result.high_impact_count
    });
    
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 监控任务失败:`, error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();