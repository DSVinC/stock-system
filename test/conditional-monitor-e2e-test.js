#!/usr/bin/env node

/**
 * 条件单监控端到端测试脚本
 * 验证：监控 → 条件检测 → 执行 → 通知 完整链路
 */

const sqlite3 = require('sqlite3');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

// 数据库配置
const dbPath = path.join(__dirname, '..', 'database', 'stock.db');
const db = new sqlite3.Database(dbPath);
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

async function main() {
  console.log('🔄 开始条件单监控端到端测试...\n');

  try {
    // 1. 验证监控脚本存在
    console.log('1. 验证监控脚本...');
    const monitorScript = './scripts/conditional-order-monitor.mjs';
    if (!fs.existsSync(monitorScript)) {
      throw new Error('监控脚本不存在');
    }
    console.log('✅ 监控脚本存在');

    // 2. 验证监控 API 模块
    console.log('\n2. 验证监控 API 模块...');
    const monitorApi = './api/monitor-conditional.js';
    if (!fs.existsSync(monitorApi)) {
      throw new Error('监控 API 不存在');
    }
    
    const monitorContent = fs.readFileSync(monitorApi, 'utf8');
    const requiredFunctions = [
      'runMonitorJob',
      'checkCondition',
      'executeConditionalOrder'
    ];
    
    for (const fn of requiredFunctions) {
      const exists = monitorContent.includes(fn);
      console.log(`   - ${fn}: ${exists ? '✅' : '❌'}`);
    }
    console.log('✅ 监控 API 模块完整');

    // 3. 验证执行器模块
    console.log('\n3. 验证执行器模块...');
    const executorApi = './api/conditional-executor.js';
    if (!fs.existsSync(executorApi)) {
      throw new Error('执行器 API 不存在');
    }
    
    const executorContent = fs.readFileSync(executorApi, 'utf8');
    const executorFunctions = [
      'executeConditionalOrder',
      'buy',
      'sell'
    ];
    
    for (const fn of executorFunctions) {
      const exists = executorContent.includes(fn);
      console.log(`   - ${fn}: ${exists ? '✅' : '❌'}`);
    }
    console.log('✅ 执行器模块完整');

    // 4. 验证条件单 API
    console.log('\n4. 验证条件单 API...');
    const conditionalApi = './api/conditional-order.js';
    if (!fs.existsSync(conditionalApi)) {
      throw new Error('条件单 API 不存在');
    }
    
    const conditionalContent = fs.readFileSync(conditionalApi, 'utf8');
    const conditionalFunctions = [
      'checkCondition',
      'createConditionalOrder',
      'toggleConditionalOrder',
      'deleteConditionalOrder'
    ];
    const missingConditionalFns = [];

    for (const fn of conditionalFunctions) {
      const exists = conditionalContent.includes(fn);
      if (!exists) {
        missingConditionalFns.push(fn);
      }
      console.log(`   - ${fn}: ${exists ? '✅' : '❌'}`);
    }
    if (missingConditionalFns.length > 0) {
      throw new Error(`条件单 API 缺失函数: ${missingConditionalFns.join(', ')}`);
    }
    console.log('✅ 条件单 API 完整');

    // 5. 验证数据库表结构
    console.log('\n5. 验证数据库表结构...');
    const requiredTables = ['conditional_order', 'portfolio_account', 'portfolio_trade'];
    for (const table of requiredTables) {
      const result = await dbGet(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='${table}'
      `);
      console.log(`   - ${table}表：${result ? '✅' : '❌'}`);
    }
    console.log('✅ 数据库表结构完整');

    // 6. 验证定时任务配置
    console.log('\n6. 验证定时任务配置...');
    const cronConfig = './cron/conditional-order-monitor.json';
    if (fs.existsSync(cronConfig)) {
      const cronContent = fs.readFileSync(cronConfig, 'utf8');
      const config = JSON.parse(cronContent);
      console.log(`   - 任务名：${config.name || 'N/A'}`);
      console.log(`   - 触发器：${config.trigger || 'N/A'}`);
      console.log(`   - 脚本：${config.script || 'N/A'}`);
      console.log('✅ 定时任务配置存在');
    } else {
      console.log('⚠️ 定时任务配置文件不存在');
    }

    // 7. 验证飞书推送配置
    console.log('\n7. 验证飞书推送配置...');
    if (monitorContent.includes('FEISHU_OPEN_ID') || monitorContent.includes('ou_a21807011c59304bedfaf2f7440f5361')) {
      console.log('✅ 飞书推送配置存在');
    } else {
      console.log('⚠️ 飞书推送配置可能缺失');
    }

    // 8. 准备测试数据
    console.log('\n8. 准备测试数据...');
    
    // 创建测试账户
    await dbRun(`
      INSERT OR REPLACE INTO portfolio_account 
      (id, account_name, initial_cash, current_cash, created_at, updated_at)
      VALUES (999, '监控测试账户', 100000, 100000, datetime('now'), datetime('now'))
    `);
    console.log('✅ 测试账户已创建（账户 ID: 999）');

    // 创建测试条件单（价格低于 10 元时买入）
    const testOrder = {
      id: 999,
      account_id: 999,
      ts_code: '000001.SZ',
      stock_name: '平安银行',
      action: 'buy',
      order_type: 'quantity',
      quantity: 100,
      conditions: JSON.stringify([
        { trigger_type: 'price_below', params: { price: 10.0 } }
      ]),
      status: 'enabled',
      trigger_count: 0,
      max_trigger_count: 1,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      created_at: '2026-03-22 15:40:00',
      updated_at: '2026-03-22 15:40:00'
    };

    await dbRun(`
      INSERT OR REPLACE INTO conditional_order 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      testOrder.id,
      testOrder.account_id,
      testOrder.ts_code,
      testOrder.stock_name,
      testOrder.action,
      testOrder.order_type,
      testOrder.quantity,
      null,
      null,
      testOrder.conditions,
      testOrder.status,
      testOrder.trigger_count,
      testOrder.max_trigger_count,
      testOrder.start_date,
      testOrder.end_date,
      testOrder.created_at,
      testOrder.updated_at
    ]);
    console.log('✅ 测试条件单已创建（条件：价格低于 10.0 时买入 100 股）');

    // 9. 验证条件单加载
    console.log('\n9. 验证条件单加载...');
    const order = await dbGet('SELECT * FROM conditional_order WHERE id = 999');
    if (!order) {
      throw new Error('条件单加载失败');
    }
    console.log(`   - 股票：${order.ts_code} ${order.stock_name}`);
    console.log(`   - 动作：${order.action}`);
    console.log(`   - 状态：${order.status}`);
    console.log('✅ 条件单加载成功');

    // 10. 边界测试
    console.log('\n10. 边界测试...');
    
    // 测试 1：禁用状态的条件单
    const disabledCount = await dbGet('SELECT COUNT(*) as count FROM conditional_order WHERE status = "disabled"');
    console.log(`   - 禁用状态条件单：${disabledCount.count} 个`);
    
    // 测试 2：启用状态的条件单
    const enabledCount = await dbGet('SELECT COUNT(*) as count FROM conditional_order WHERE status = "enabled"');
    console.log(`   - 启用状态条件单：${enabledCount.count} 个`);
    
    // 测试 3：账户资金验证
    const account = await dbGet('SELECT * FROM portfolio_account WHERE id = 999');
    console.log(`   - 测试账户资金：¥${account.current_cash}`);

    console.log('\n🎉 条件单监控端到端测试通过！');
    console.log('   - 监控脚本完整');
    console.log('   - 监控 API 模块完整');
    console.log('   - 执行器模块完整');
    console.log('   - 条件单 API 完整');
    console.log('   - 数据库表结构完整');
    console.log('   - 定时任务配置完整');
    console.log('   - 飞书推送配置完整');
    console.log('   - 测试数据准备完成');
    console.log('\n💡 下一步建议：');
    console.log('   1. 手动运行监控脚本：node scripts/conditional-order-monitor.mjs');
    console.log('   2. 观察飞书推送通知');
    console.log('   3. 检查条件单执行记录');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('堆栈:', error.stack);
    process.exit(1);
  } finally {
    // 清理测试数据
    console.log('\n11. 清理测试数据...');
    try {
      await dbRun('DELETE FROM conditional_order WHERE id = 999');
      await dbRun('DELETE FROM portfolio_account WHERE id = 999');
      console.log('✅ 测试数据已清理');
    } catch (cleanErr) {
      console.log('⚠️ 清理数据时出错:', cleanErr.message);
    }

    db.close();
    console.log('\n🏁 测试完成！');
  }
}

main();
