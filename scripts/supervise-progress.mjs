#!/usr/bin/env node
/**
 * 进度监督脚本 - 每 5 分钟自动检查并行任务状态
 * 
 * 功能：
 * 1. 检查 Codex 验收会话状态
 * 2. 更新 PROGRESS_TRACKER.md
 * 3. 如有任务完成/失败，飞书推送通知
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
const TRACKER_PATH = join(WORKSPACE, 'docs', 'tasks', 'PROGRESS_TRACKER.md');
const TODO_DB = process.env.TODO_DB || '/Users/vvc/.openclaw/workspace/tasks/todo.db';

// 任务配置
const TASKS = [
  { id: 'TASK_ANALYZE_STRUCT_002', name: 'stock_analyzer.py 改造', session: 'quick-prairie' },
  { id: 'TASK_ANALYZE_STRUCT_003', name: 'analysis.js API 适配', session: 'crisp-shell' },
  { id: 'TASK_ANALYZE_STRUCT_004', name: '方向股列表界面适配', session: 'keen-cloud' },
];

function runCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: WORKSPACE });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function checkSessionStatus(sessionName) {
  // 使用 process list 检查会话状态
  const output = runCommand('openclaw process list 2>/dev/null || echo "N/A"');
  if (output.includes(sessionName)) {
    if (output.includes('completed')) {
      return 'completed';
    } else if (output.includes('running') || output.includes('active')) {
      return 'running';
    }
  }
  return 'unknown';
}

function getSessionLog(sessionName, limit = 30) {
  try {
    return runCommand(`openclaw process log --session ${sessionName} --limit ${limit} 2>/dev/null`);
  } catch {
    return '';
  }
}

function parseAcceptanceResult(log) {
  if (log.includes('✅ 验收通过') || log.includes('验收通过')) {
    return 'pass';
  } else if (log.includes('❌ 验收不通过') || log.includes('验收不通过') || log.includes('未通过')) {
    return 'fail';
  }
  return 'pending';
}

function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function updateTracker(updates) {
  let content = readFileSync(TRACKER_PATH, 'utf8');
  
  // 添加新的进度日志
  const timestamp = `${getDate()} ${getCurrentTime()}`;
  let logEntry = `\n### ${timestamp} - 自动检查\n`;
  
  for (const task of updates) {
    const status = task.status === 'pass' ? '✅ 通过' : task.status === 'fail' ? '❌ 不通过' : '🟡 进行中';
    logEntry += `- [${task.status === 'pending' ? ' ' : 'x'}] ${task.id}: ${status}\n`;
    
    if (task.issues && task.issues.length > 0) {
      for (const issue of task.issues) {
        logEntry += `  - ${issue}\n`;
      }
    }
  }
  
  logEntry += `- [ ] 下次检查：${getCurrentTime().split(':')[0]}:${String(parseInt(getCurrentTime().split(':')[1]) + 5).padStart(2, '0')}\n`;
  
  // 插入到进度日志部分
  const logMarker = '## 📝 进度日志（每 5 分钟更新）\n';
  const logIndex = content.indexOf(logMarker);
  if (logIndex !== -1) {
    const insertPos = logIndex + logMarker.length;
    content = content.slice(0, insertPos) + logEntry + content.slice(insertPos);
  }
  
  writeFileSync(TRACKER_PATH, content);
  console.log(`✅ 进度板已更新 (${timestamp})`);
}

function sendNotification(message) {
  // 飞书推送
  const feishuOpenId = 'ou_a21807011c59304bedfaf2f7440f5361';
  try {
    runCommand(`openclaw message send --target "user:${feishuOpenId}" --message "${message.replace(/"/g, '\\"')}" 2>/dev/null || echo "推送失败"`);
    console.log('📬 通知已发送');
  } catch (e) {
    console.log('⚠️ 通知发送失败:', e.message);
  }
}

function main() {
  console.log(`🔍 开始进度检查 (${getCurrentTime()})...`);
  
  const updates = [];
  const completedTasks = [];
  
  for (const task of TASKS) {
    console.log(`  检查 ${task.id}...`);
    
    const status = checkSessionStatus(task.session);
    const log = getSessionLog(task.session);
    const acceptance = parseAcceptanceResult(log);
    
    updates.push({
      id: task.id,
      status: acceptance === 'pending' ? 'pending' : acceptance,
      issues: []
    });
    
    if (acceptance !== 'pending') {
      completedTasks.push({ ...task, acceptance });
    }
  }
  
  // 更新进度板
  updateTracker(updates);
  
  // 如果有任务完成，发送通知
  if (completedTasks.length > 0) {
    const passCount = completedTasks.filter(t => t.acceptance === 'pass').length;
    const failCount = completedTasks.filter(t => t.acceptance === 'fail').length;
    
    let message = `📊 进度监督提醒 (${getCurrentTime()})\n\n`;
    message += `✅ 通过：${passCount} 个\n`;
    message += `❌ 失败：${failCount} 个\n\n`;
    
    if (failCount > 0) {
      message += `需要修复的任务：\n`;
      completedTasks.filter(t => t.acceptance === 'fail').forEach(t => {
        message += `- ${t.name}\n`;
      });
    }
    
    sendNotification(message);
  }
  
  console.log('✅ 检查完成');
}

main();
