/**
 * 飞书推送模块
 * 用于发送监控报告、风险预警、个股提醒和每日摘要到飞书私聊
 * 使用飞书开放平台 API（非 webhook）
 */

/**
 * 飞书接收者 open_id
 */
const FEISHU_OPEN_ID = 'ou_a21807011c59304bedfaf2f7440f5361';

/**
 * 最大重试次数
 */
const MAX_RETRIES = 3;

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 获取飞书 app access token
 * @returns {Promise<string|null>}
 */
async function getAccessToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('Missing FEISHU_APP_ID or FEISHU_APP_SECRET environment variable');
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    throw new Error(`获取 token 失败：${data.msg || response.statusText}`);
  }

  return data.app_access_token;
}

/**
 * 发送消息到飞书私聊
 * @param {string} receiveId - 接收者 open_id
 * @param {string} text - 消息内容
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function sendFeishuPrivateMessage(receiveId, text) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 获取 access token
      const accessToken = await getAccessToken();

      // 发送消息
      const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          receive_id: receiveId,
          msg_type: 'text',
          content: JSON.stringify({
            text: String(text)
          })
        })
      });

      const data = await response.json();

      if (!response.ok || data.code !== 0) {
        lastError = data.msg || `HTTP ${response.status}: ${response.statusText}`;
        if (attempt < MAX_RETRIES) {
          await delay(1000 * attempt);
          continue;
        }
        return {
          success: false,
          error: lastError
        };
      }

      return { success: true, data };
    } catch (err) {
      lastError = err.message;
      if (attempt < MAX_RETRIES) {
        await delay(1000 * attempt);
      }
    }
  }

  return {
    success: false,
    error: `Failed after ${MAX_RETRIES} attempts: ${lastError}`
  };
}

/**
 * 发送监控报告
 * @param {Object} report - 监控报告数据
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function sendMonitorReport(report) {
  const message = `📊 每日监控报告

📈 账户概览：
   - 账户数：${report.account_count || 0}
   - 持仓数：${report.total_positions || 0}
   - 总市值：¥${report.total_market_value?.toLocaleString() || '0'}

⚠️ 风险预警：${report.risk_alerts?.length || 0} 条
👀 关注标的：${report.watch_items?.length || 0} 个
📰 盘后事件：${report.after_hours_events?.length || 0} 条

生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

  const result = await sendFeishuPrivateMessage(FEISHU_OPEN_ID, message);
  if (!result.success) {
    console.error('[飞书私聊推送失败] 监控报告:', result.error);
  } else {
    console.log('[飞书私聊推送成功] 监控报告已发送');
  }
  return result;
}

/**
 * 发送风险预警
 * @param {Array} alerts - 风险预警列表
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function sendRiskAlert(alerts) {
  const alertsText = Array.isArray(alerts) && alerts.length > 0
    ? alerts.map(a => `• [${a.level || '未知'}] ${a.message || a.title || '未知预警'}`).join('\n')
    : '无风险预警';

  const message = `🚨 风险预警

${alertsText}

时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

  const result = await sendFeishuPrivateMessage(FEISHU_OPEN_ID, message);
  if (!result.success) {
    console.error('[飞书私聊推送失败] 风险预警:', result.error);
  } else {
    console.log('[飞书私聊推送成功] 风险预警已发送');
  }
  return result;
}

/**
 * 发送个股提醒
 * @param {Object} stock - 股票信息
 * @param {Object} alert - 提醒详情
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function sendSingleStockAlert(stock, alert) {
  const stockInfo = stock ? `${stock.name || '未知'} (${stock.code || 'N/A'})` : '未知股票';
  const alertInfo = alert ? `${alert.type || '提醒'}: ${alert.message || alert.title || '无详情'}` : '无详情';

  const message = `📈 个股提醒

股票：${stockInfo}
${alertInfo}

时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

  const result = await sendFeishuPrivateMessage(FEISHU_OPEN_ID, message);
  if (!result.success) {
    console.error('[飞书私聊推送失败] 个股提醒:', result.error);
  } else {
    console.log('[飞书私聊推送成功] 个股提醒已发送');
  }
  return result;
}

/**
 * 发送每日摘要
 * @param {Object} summary - 每日摘要数据
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function sendDailySummary(summary) {
  const date = summary?.date || new Date().toISOString().split('T')[0];
  const summaryText = summary?.summary || '今日无重要摘要';

  const message = `📋 每日摘要

日期：${date}

${summaryText}

时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

  const result = await sendFeishuPrivateMessage(FEISHU_OPEN_ID, message);
  if (!result.success) {
    console.error('[飞书私聊推送失败] 每日摘要:', result.error);
  } else {
    console.log('[飞书私聊推送成功] 每日摘要已发送');
  }
  return result;
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  const handleResult = (result) => {
    if (result.success) {
      console.log('✅ 消息发送成功');
      process.exit(0);
    } else {
      console.error(`❌ 发送失败：${result.error}`);
      process.exit(1);
    }
  };

  switch (command) {
    case 'monitor-report':
      sendMonitorReport({ 
        account_count: 1, 
        total_positions: 2, 
        total_market_value: 100000,
        risk_alerts: [],
        watch_items: [],
        after_hours_events: []
      }).then(handleResult);
      break;
    case 'risk-alert':
      sendRiskAlert([{ type: 'risk', level: 'high', message: '测试预警' }]).then(handleResult);
      break;
    case 'stock-alert':
      sendSingleStockAlert({ code: '000001', name: '平安银行' }, { type: 'price', message: '价格触发' }).then(handleResult);
      break;
    case 'daily-summary':
      sendDailySummary({ date: new Date().toISOString().split('T')[0], summary: '今日摘要' }).then(handleResult);
      break;
    default:
      // 默认行为：发送文本消息
      const message = process.argv.slice(2).join(' ');
      if (!message) {
        console.error('Usage: node scripts/feishu-push.mjs "<message>"');
        console.error('       node scripts/feishu-push.mjs <command>');
        console.error('可用命令：monitor-report, risk-alert, stock-alert, daily-summary');
        process.exit(1);
      }
      sendFeishuPrivateMessage(FEISHU_OPEN_ID, message).then(handleResult);
  }
}
