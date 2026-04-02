#!/usr/bin/env node

// 使用动态导入避免ESM/CJS问题
async function main() {
  const { sendDailyIndustrySummary } = await import('../api/industry-news-monitor.js');

  console.log(`[${new Date().toISOString()}] 开始生成每日行业摘要...`);
  
  try {
    const result = await sendDailyIndustrySummary();
    
    if (result) {
      console.log(`[${new Date().toISOString()}] 行业摘要推送成功`);
    } else {
      console.log(`[${new Date().toISOString()}] 无行业新闻，跳过推送`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 行业摘要任务失败:`, error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();