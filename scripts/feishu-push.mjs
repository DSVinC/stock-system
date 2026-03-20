/**
 * 飞书推送模块
 * 用于发送监控报告、风险预警、个股提醒和每日摘要到飞书
 * 支持命令行和模块调用两种方式
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
 * 发送纯文本消息到飞书群聊
 * @param {string} text - 要发送的文本消息
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function sendFeishuTextMessage(text) {
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      success: false,
      error: 'Missing FEISHU_WEBHOOK_URL environment variable'
    };
  }

  const payload = {
    msg_type: 'text',
    content: {
      text: String(text)
    }
  };

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
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
  const message = `📊 监控报告
接收者: ${FEISHU_OPEN_ID}
时间: ${new Date().toISOString()}

${JSON.stringify(report, null, 2)}`;

  const result = await sendFeishuTextMessage(message);
  if (!result.success) {
    console.error('[飞书推送失败] 监控报告:', result.error);
  }
  return result;
}

/**
 * 发送风险预警
 * @param {Array} alerts - 风险预警列表
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function sendRiskAlert(alerts) {
  const alertsText = Array.isArray(alerts)
    ? alerts.map(a => `- ${a.level || '未知'}: ${a.message || JSON.stringify(a)}`).join('\n')
    : JSON.stringify(alerts, null, 2);

  const message = `🚨 风险预警
接收者: ${FEISHU_OPEN_ID}
时间: ${new Date().toISOString()}

${alertsText}`;

  const result = await sendFeishuTextMessage(message);
  if (!result.success) {
    console.error('[飞书推送失败] 风险预警:', result.error);
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
  const stockInfo = stock ? `${stock.name || stock.code || '未知'} (${stock.code || 'N/A'})` : '未知股票';
  const alertInfo = alert ? `${alert.type || '提醒'}: ${alert.message || JSON.stringify(alert)}` : JSON.stringify(alert);

  const message = `📈 个股提醒
接收者: ${FEISHU_OPEN_ID}
股票: ${stockInfo}
时间: ${new Date().toISOString()}

${alertInfo}`;

  const result = await sendFeishuTextMessage(message);
  if (!result.success) {
    console.error('[飞书推送失败] 个股提醒:', result.error);
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
  const summaryText = summary?.summary || JSON.stringify(summary, null, 2);

  const message = `📋 每日摘要
接收者: ${FEISHU_OPEN_ID}
日期: ${date}

${summaryText}`;

  const result = await sendFeishuTextMessage(message);
  if (!result.success) {
    console.error('[飞书推送失败] 每日摘要:', result.error);
  }
  return result;
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  const handleResult = (result) => {
    if (result.success) {
      console.log('Message sent successfully');
      process.exit(0);
    } else {
      console.error(`Failed to send message: ${result.error}`);
      process.exit(1);
    }
  };

  switch (command) {
    case 'monitor-report':
      sendMonitorReport({ type: 'monitor', timestamp: new Date().toISOString() }).then(handleResult);
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
      // 默认行为：发送文本消息（保持向后兼容）
      const message = process.argv[2];
      if (!message) {
        console.error('Usage: node scripts/feishu-push.mjs "<message>"');
        console.error('       node scripts/feishu-push.mjs <command>');
        console.error('可用命令：monitor-report, risk-alert, stock-alert, daily-summary');
        process.exit(1);
      }
      sendFeishuTextMessage(message).then(handleResult);
  }
}
