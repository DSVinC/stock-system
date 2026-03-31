#!/usr/bin/env node
/**
 * Position Monitoring Script
 * Task: TASK_POSITION_MONITOR_003
 * 
 * Monitors all holdings and sends Feishu alerts when signals are generated
 * 
 * Usage:
 *   node scripts/monitor-positions.mjs --mode=daily    # 盘后日报
 *   node scripts/monitor-positions.mjs --mode=intraday # 盘中监控
 *   node scripts/monitor-positions.mjs --mode=morning  # 盘前关注
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Parse arguments
const args = process.argv.slice(2);
const modeArg = args.find(a => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'daily';

console.log(`[${new Date().toISOString()}] 启动持仓监控 - 模式：${mode}`);

// Database path
const dbPath = process.env.STOCK_DB_PATH || '/Volumes/SSD500/openclaw/stock-system/stock_system.db';

// Feishu webhook (from environment or config)
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK || '';

/**
 * Get all holdings from database
 */
async function getHoldings() {
  const sqlite3 = await import('better-sqlite3');
  const db = new sqlite3.default(dbPath);
  
  const holdings = db.prepare(`
    SELECT DISTINCT account_id, ts_code, stock_name, quantity, avg_price
    FROM portfolio_position 
    WHERE quantity > 0
  `).all();
  
  db.close();
  return holdings;
}

/**
 * Send Feishu alert
 */
async function sendFeishuAlert(signals) {
  if (signals.length === 0) return;
  
  const content = formatFeishuMessage(signals);
  
  console.log('📢 飞书推送:', content);
  
  if (FEISHU_WEBHOOK) {
    try {
      const response = await fetch(FEISHU_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: content }
        })
      });
      
      if (response.ok) {
        console.log('✅ 飞书推送成功');
      } else {
        console.error('❌ 飞书推送失败:', await response.text());
      }
    } catch (error) {
      console.error('❌ 飞书推送异常:', error.message);
    }
  } else {
    console.log('⚠️ FEISHU_WEBHOOK 未配置，仅日志记录');
  }
}

/**
 * Send morning brief (even when no signals)
 */
async function sendMorningBrief(holdings) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  let text = `🌅 盘前关注 - ${now}\n\n`;
  text += `📊 持仓股票：${holdings.length}只\n\n`;
  
  holdings.forEach(h => {
    text += `• ${h.stock_name}(${h.ts_code}) - 持仓${h.quantity}股\n`;
  });
  
  text += `\n✅ 暂无异常信号，今日请继续关注持仓变化`;
  
  console.log('\n📢 盘前推送:', text);
  
  if (process.env.FEISHU_WEBHOOK) {
    try {
      const response = await fetch(process.env.FEISHU_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: 'text', content: { text } })
      });
      
      if (response.ok) {
        console.log('✅ 飞书推送成功');
      } else {
        console.error('❌ 飞书推送失败:', await response.text());
      }
    } catch (error) {
      console.error('❌ 飞书推送异常:', error.message);
    }
  } else {
    console.log('⚠️ FEISHU_WEBHOOK 未配置，仅日志记录');
  }
}

/**
 * Format Feishu message
 */
function formatFeishuMessage(signals) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  
  let text = `📊 持仓监控告警 - ${now}\n\n`;
  
  // Group by signal level
  const highSignals = signals.filter(s => s.level === 'HIGH');
  const mediumSignals = signals.filter(s => s.level === 'MEDIUM');
  const lowSignals = signals.filter(s => s.level === 'LOW');
  
  if (highSignals.length > 0) {
    text += `🔴 高危告警 (${highSignals.length}条)\n`;
    highSignals.forEach(s => {
      text += `  • ${s.stock_name}(${s.ts_code}): ${s.reason}\n`;
    });
    text += '\n';
  }
  
  if (mediumSignals.length > 0) {
    text += `🟡 中危告警 (${mediumSignals.length}条)\n`;
    mediumSignals.forEach(s => {
      text += `  • ${s.stock_name}(${s.ts_code}): ${s.reason}\n`;
    });
    text += '\n';
  }
  
  if (lowSignals.length > 0) {
    text += `⚪ 低危告警 (${lowSignals.length}条)\n`;
    lowSignals.forEach(s => {
      text += `  • ${s.stock_name}(${s.ts_code}): ${s.reason}\n`;
    });
  }
  
  return text;
}

/**
 * Format announcement summary message (带摘要，单条≤100 字)
 */
function formatAnnouncementMessage(announcements) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
  
  let text = `📋 持仓公告 ${now}\n\n`;
  
  let count = 0;
  announcements.forEach(item => {
    item.announcements.forEach(ann => {
      // 摘要处理：取 content 前 60 字
      let summary = ann.content || ann.title;
      if (summary.length > 60) summary = summary.slice(0, 57) + '...';
      // 格式：股票名：标题：摘要
      const line = `• ${item.stock_name}: ${ann.title}: ${summary}`;
      // 单条≤100 字
      text += line.length > 100 ? line.slice(0, 97) + '...\n' : line + '\n';
      count++;
    });
  });
  
  if (count === 0) {
    text += `\n✅ 暂无公告`;
  } else {
    text += `\n共${count}条`;
  }
  
  return text;
}

/**
 * Main monitoring function
 */
async function monitorPositions() {
  const { runFullMonitoring } = await import('../api/position-signals.js');
  
  console.log('📈 开始执行持仓监控...');
  const result = await runFullMonitoring();
  
  if (!result.success) {
    console.error('❌ 监控执行失败:', result.message || '未知错误');
    return;
  }
  
  const { signals, count, announcements } = result;
  console.log(`📊 持仓股票：${count}只`);
  
  let hasPushed = false;
  
  // 1. 优先推送高危/中危信号
  if (signals && signals.length > 0) {
    console.log(`⚠️ 生成 ${signals.length} 条信号`);
    await sendFeishuAlert(signals);
    hasPushed = true;
  }
  
  // 2. 盘前关注：推送摘要（包括公告）
  if (mode === 'morning') {
    const holdings = await getHoldings();
    await sendMorningBrief(holdings);
    hasPushed = true;
  }
  
  // 3. 其他模式：有公告也推送摘要（选项 C：有公告就推送，标记风险等级）
  if (!hasPushed && announcements && announcements.length > 0) {
    const hasAnnouncements = announcements.some(item => item.announcements && item.announcements.length > 0);
    if (hasAnnouncements) {
      const message = formatAnnouncementMessage(announcements);
      // 输出到 stdout，由 cron 的 delivery 机制推送到飞书
      console.log('\n' + message);
      hasPushed = true;
    }
  }
  
  if (!hasPushed) {
    console.log('\n✅ 无异常信号，不推送');
  }
  
  console.log('\n✅ 持仓监控完成');
}

// Run based on mode
async function run() {
  try {
    await monitorPositions();
  } catch (error) {
    console.error('❌ 监控脚本执行失败:', error.message);
    process.exit(1);
  }
}

run();
