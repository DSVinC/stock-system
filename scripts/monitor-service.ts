#!/usr/bin/env node
/**
 * 条件单监控后台服务
 * 持续运行，每5分钟检查一次pending状态的条件单
 * 支持手动触发和自动定时两种模式
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(__dirname, '..', 'api');

// 配置
const CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟

// 动态导入CommonJS模块
const { runMonitorJob } = await import(
  `file://${path.join(API_DIR, 'monitor-conditional.js')}`
);

/**
 * 检查是否在交易时间（工作日 9:30-11:30, 13:00-15:00）
 */
function isMarketHours() {
  const now = new Date();
  const day = now.getDay();
  
  // 周末不交易
  if (day === 0 || day === 6) return false;
  
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeMinutes = hours * 60 + minutes;
  
  // 上午交易时段：9:30-11:30
  const isMorning = timeMinutes >= (9 * 60 + 30) && timeMinutes <= (11 * 60 + 30);
  // 下午交易时段：13:00-15:00
  const isAfternoon = timeMinutes >= (13 * 60) && timeMinutes <= (15 * 60);
  
  return isMorning || isAfternoon;
}

/**
 * 执行一次监控检查
 */
async function runCheck() {
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`\n[${timestamp}] 🔍 开始条件单监控检查...`);
  
  try {
    const result = await runMonitorJob();
    
    if (result.success) {
      console.log(`[${timestamp}] ✅ 检查完成: 触发 ${result.triggered}/${result.total} 个条件单`);
    } else {
      console.error(`[${timestamp}] ❌ 检查失败:`, result.error);
    }
    
    return result;
  } catch (error) {
    console.error(`[${timestamp}] 💥 执行异常:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 主循环
 */
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     股票投资系统 - 条件单监控服务      ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`启动时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log(`检查间隔: ${CHECK_INTERVAL / 60000} 分钟`);
  console.log(`交易时间: 工作日 9:30-11:30, 13:00-15:00`);
  console.log('');
  
  // 命令行参数
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once');
  const forceCheck = args.includes('--force');
  
  if (runOnce) {
    // 单次运行模式
    console.log('📍 单次运行模式');
    await runCheck();
    process.exit(0);
  }
  
  // 持续运行模式
  console.log('📍 持续运行模式（按 Ctrl+C 停止）\n');
  
  // 立即执行一次检查
  if (forceCheck || isMarketHours()) {
    await runCheck();
  } else {
    console.log('⏳ 当前非交易时间，等待交易时间开始...');
  }
  
  // 定时循环
  setInterval(async () => {
    if (isMarketHours() || forceCheck) {
      await runCheck();
    } else {
      const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      console.log(`[${now}] ⏸️ 非交易时间，跳过检查`);
    }
  }, CHECK_INTERVAL);
  
  // 保持进程运行
  process.stdin.resume();
}

// 启动服务
main().catch(error => {
  console.error('服务启动失败:', error);
  process.exit(1);
});
