#!/usr/bin/env node
/**
 * 条件单监控定时任务
 * 每5分钟检查一次pending状态的条件单
 * 触发条件时执行模拟交易并推送飞书通知
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(__dirname, '..', 'api');

// 动态导入CommonJS模块
const { checkAllConditionalOrders, runMonitorJob } = await import(
  `file://${path.join(API_DIR, 'monitor-conditional.js')}`
);

console.log('🎯 条件单监控任务启动');
console.log(`⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);

// 设置超时控制（100秒，留出20秒缓冲）
const timeoutMs = 100000; // 100秒
const startTime = Date.now();

try {
  // 创建超时Promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`监控任务执行超时（${timeoutMs/1000}秒），已终止`));
    }, timeoutMs);
  });

  // 执行监控，带超时控制
  const result = await Promise.race([
    runMonitorJob(),
    timeoutPromise
  ]);

  const elapsed = Date.now() - startTime;
  console.log(`⏱️ 执行耗时: ${elapsed}ms`);

  if (result.success) {
    console.log(`\n✅ 监控完成: 触发 ${result.triggered}/${result.total} 个条件单`);
    process.exit(0);
  } else {
    console.error('\n❌ 监控失败:', result.error);
    process.exit(1);
  }
} catch (error) {
  const elapsed = Date.now() - startTime;
  console.error(`\n⏱️ 执行耗时: ${elapsed}ms`);
  console.error('❌ 监控任务异常:', error.message);
  process.exit(1);
}
