#!/usr/bin/env node

/**
 * 政策事件数据回填脚本
 * 用途：将预设的政策事件数据导入到数据库
 * 运行：node scripts/backfill/backfill_policy_events.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// 配置文件路径
const DB_PATH = '/Volumes/SSD500/openclaw/stock-system/stock_system.db';
const PRESET_DATA_PATH = path.join(__dirname, '../../data/preset/policy_events_preset.json');

// 数据验证 schema
const POLICY_EVENT_SCHEMA = {
  event_id: 'string',
  publish_date: 'string',  // YYYY-MM-DD
  industry: 'string',
  policy_type: 'string',
  title: 'string',
  source: 'string',
  impact_score: 'number',
  content: 'string',
  url: 'string'
};

// 验证单个事件数据
function validateEvent(event, index) {
  const errors = [];
  
  // 检查必填字段
  for (const [field, type] of Object.entries(POLICY_EVENT_SCHEMA)) {
    if (!(field in event)) {
      errors.push(`[事件 ${index}] 缺少字段: ${field}`);
    } else if (typeof event[field] !== type) {
      errors.push(`[事件 ${index}] 字段类型错误: ${field} 应为 ${type}, 实际为 ${typeof event[field]}`);
    }
  }
  
  // 验证 event_id 格式
  if (event.event_id && !/^POL_\d{8}_\d{3}$/.test(event.event_id)) {
    errors.push(`[事件 ${index}] event_id 格式错误: ${event.event_id}`);
  }
  
  // 验证日期格式
  if (event.publish_date && !/^\d{4}-\d{2}-\d{2}$/.test(event.publish_date)) {
    errors.push(`[事件 ${index}] publish_date 格式错误: ${event.publish_date}`);
  }
  
  // 验证 impact_score 范围
  if (event.impact_score && (event.impact_score < 1 || event.impact_score > 5)) {
    errors.push(`[事件 ${index}] impact_score 超出范围 (1-5): ${event.impact_score}`);
  }
  
  return errors;
}

// 统计行业分布
function analyzeIndustryDistribution(events) {
  const industryCounts = {};
  const policyTypeCounts = {};
  const yearCounts = {};
  
  for (const event of events) {
    // 行业统计
    industryCounts[event.industry] = (industryCounts[event.industry] || 0) + 1;
    
    // 政策类型统计
    policyTypeCounts[event.policy_type] = (policyTypeCounts[event.policy_type] || 0) + 1;
    
    // 年份统计
    const year = event.publish_date.substring(0, 4);
    yearCounts[year] = (yearCounts[year] || 0) + 1;
  }
  
  return { industryCounts, policyTypeCounts, yearCounts };
}

// 导入数据到数据库
function importEventsToDatabase(events) {
  console.log('🚀 开始导入政策事件数据...');
  
  // 连接数据库
  const db = new Database(DB_PATH, { readonly: false });
  
  try {
    // 开始事务
    db.exec('BEGIN TRANSACTION');
    
    // 准备插入语句
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO policy_events (
        event_id,
        publish_date,
        industry,
        policy_type,
        title,
        source,
        impact_score,
        content,
        url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    // 批量插入
    for (const event of events) {
      try {
        const result = stmt.run(
          event.event_id,
          event.publish_date,
          event.industry,
          event.policy_type,
          event.title,
          event.source,
          event.impact_score,
          event.content,
          event.url || ''
        );
        
        if (result.changes > 0) {
          imported++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`❌ 插入失败 ${event.event_id}:`, error.message);
        errors++;
      }
    }
    
    // 提交事务
    db.exec('COMMIT');
    
    console.log('✅ 数据导入完成！');
    console.log(`📊 统计结果:`);
    console.log(`   - 成功导入: ${imported} 条`);
    console.log(`   - 跳过重复: ${skipped} 条`);
    console.log(`   - 导入失败: ${errors} 条`);
    
    return { imported, skipped, errors };
    
  } catch (error) {
    // 回滚事务
    db.exec('ROLLBACK');
    console.error('❌ 数据库事务失败:', error.message);
    throw error;
  } finally {
    db.close();
  }
}

// 主函数
async function main() {
  console.log('📋 ========================================');
  console.log('📋 政策事件数据回填脚本');
  console.log('📋 ========================================');
  
  // 检查数据库连接
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='policy_events'
    `).get();
    db.close();
    
    if (!tableExists) {
      console.error('❌ 错误: policy_events 表不存在，请先创建表');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    process.exit(1);
  }
  
  // 读取预设数据
  console.log('📖 读取预设数据文件...');
  let presetData;
  try {
    const rawData = fs.readFileSync(PRESET_DATA_PATH, 'utf8');
    presetData = JSON.parse(rawData);
    
    if (!presetData.events || !Array.isArray(presetData.events)) {
      console.error('❌ 数据格式错误: 缺少 events 数组');
      process.exit(1);
    }
    
    console.log(`📖 读取到 ${presetData.events.length} 条政策事件`);
    console.log(`📖 数据版本: ${presetData.version || '未知'}`);
    console.log(`📖 生成时间: ${presetData.generated_at || '未知'}`);
  } catch (error) {
    console.error('❌ 读取数据文件失败:', error.message);
    process.exit(1);
  }
  
  // 验证数据
  console.log('🔍 验证数据格式...');
  const events = presetData.events;
  const allErrors = [];
  
  for (let i = 0; i < events.length; i++) {
    const errors = validateEvent(events[i], i);
    if (errors.length > 0) {
      allErrors.push(...errors);
    }
  }
  
  if (allErrors.length > 0) {
    console.error('❌ 数据验证失败:');
    allErrors.forEach(error => console.error(`   - ${error}`));
    process.exit(1);
  }
  
  console.log('✅ 数据验证通过');
  
  // 分析数据分布
  console.log('📊 分析数据分布...');
  const distribution = analyzeIndustryDistribution(events);
  
  console.log('📅 年份分布:');
  Object.entries(distribution.yearCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([year, count]) => {
      console.log(`   - ${year}年: ${count} 条`);
    });
  
  console.log('🏭 行业分布:');
  Object.entries(distribution.industryCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([industry, count]) => {
      console.log(`   - ${industry}: ${count} 条`);
    });
  
  console.log('📑 政策类型分布:');
  Object.entries(distribution.policyTypeCounts)
    .forEach(([type, count]) => {
      console.log(`   - ${type}: ${count} 条`);
    });
  
  // 确认导入
  console.log('\n⚠️ 确认导入? (y/N)');
  
  // 如果是交互式环境，等待用户确认
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk) => {
      const input = chunk.toString().toLowerCase().trim();
      if (input === 'y') {
        process.stdin.pause();
        process.stdin.setRawMode(false);
        performImport(events);
      } else {
        console.log('🚫 取消导入');
        process.exit(0);
      }
    });
  } else {
    // 非交互式环境，直接导入
    console.log('非交互式环境，自动确认导入...');
    performImport(events);
  }
}

// 执行导入
function performImport(events) {
  try {
    const result = importEventsToDatabase(events);
    
    // 验证导入结果
    console.log('\n🔍 验证数据库导入结果...');
    const db = new Database(DB_PATH, { readonly: true });
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM policy_events').get().count;
    const latestEvent = db.prepare(`
      SELECT publish_date, industry, title 
      FROM policy_events 
      ORDER BY publish_date DESC 
      LIMIT 1
    `).get();
    db.close();
    
    console.log(`📊 数据库总记录数: ${totalCount} 条`);
    if (latestEvent) {
      console.log(`📅 最新政策: ${latestEvent.publish_date} - ${latestEvent.industry} - ${latestEvent.title}`);
    }
    
    console.log('\n✅ ========================================');
    console.log('✅ 政策事件回填完成！');
    console.log('✅ ========================================');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 导入过程失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = { main, validateEvent, importEventsToDatabase };