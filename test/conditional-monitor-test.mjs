#!/usr/bin/env node

/**
 * 条件单监控功能测试脚本
 * 验证 TASK_CONDITIONAL_MONITOR_001 实现是否正确
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';
import fetch from 'node-fetch';

// 数据库配置
const db = new Database('./database/stock.db');
const dbAll = promisify(db.all.bind(db));
const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));

async function main() {
  console.log('🔄 开始条件单监控功能测试...\n');

  // 1. 准备测试账户
  console.log('1. 准备测试账户...');
  await dbRun(`
    INSERT OR REPLACE INTO portfolio_account 
    (id, name, current_cash, initial_cash, created_at, updated_at)
    VALUES (999, '测试账户', 100000, 100000, datetime('now'), datetime('now'))
  `);
  console.log('✅ 测试账户已创建（账户ID: 999）');

  // 2. 准备测试条件单
  console.log('\n2. 准备测试条件单...');
  const testOrder = {
    id: 999,
    account_id: 999,
    ts_code: '000001.SZ',
    stock_name: '平安银行',
    action: 'buy',
    order_type: 'quantity',
    quantity: 100,
    conditions: JSON.stringify([
      { 
        trigger_type: 'price_below', 
        params: { price: 10.5 }
      }
    ]),
    status: 'enabled',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    created_at: '2026-03-22 14:00:00',
    updated_at: '2026-03-22 14:00:00'
  };

  await dbRun(`
    INSERT OR REPLACE INTO conditional_order 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(testOrder));
  console.log('✅ 测试条件单已创建（条件：价格低于10.5时买入100股）');

  // 3. 调用监控API
  console.log('\n3. 调用条件单监控API...');
  try {
    const response = await fetch('http://localhost:3000/api/monitor/conditional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true })  // 仅检查，不执行交易
    });

    const result = await response.json();
    console.log('✅ API响应：', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('🎉 监控功能正常！');
      
      // 4. 验证条件单状态
      console.log('\n4. 验证条件单状态...');
      const order = await dbGet(
        'SELECT * FROM conditional_order WHERE id = 999'
      );
      
      console.log(`📋 条件单信息:`);
      console.log(`   - 状态: ${order.status}`);
      console.log(`   - 触发次数: ${order.trigger_count}`);
      console.log(`   - 股票: ${order.ts_code} ${order.stock_name}`);
      console.log(`   - 条件: ${order.conditions}`);
      
    } else {
      console.log('⚠️ 监控功能异常：', result.error);
    }

  } catch (error) {
    console.error('❌ API调用失败：', error.message);
    console.log('ℹ️ 请确保服务已启动：npm start');
  }

  // 5. 清理测试数据（可选）
  console.log('\n5. 清理测试数据...');
  await dbRun('DELETE FROM conditional_order WHERE id = 999');
  await dbRun('DELETE FROM portfolio_account WHERE id = 999');
  console.log('✅ 测试数据已清理\n');

  console.log('🏁 测试完成！');
  db.close();
}

main().catch(console.error);