#!/usr/bin/env node
/**
 * 每日监控脚本
 * 读取模拟账户持仓，尝试读取对应分析报告，生成JSON监控报告
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.join(__dirname, '..', 'api');
const DATA_DIR = path.join(__dirname, '..', 'data');
const MONITOR_REPORTS_DIR = path.join(DATA_DIR, 'monitor-reports');
const ANALYSIS_REPORTS_DIR = path.join(__dirname, '..', 'report', 'analysis');

// 确保监控报告目录存在
if (!fs.existsSync(MONITOR_REPORTS_DIR)) {
  fs.mkdirSync(MONITOR_REPORTS_DIR, { recursive: true });
}

// 动态导入CommonJS模块
const { getDatabase } = await import(`file://${path.join(API_DIR, 'db.js')}`);

/**
 * 生成持仓监控评估
 */
function generatePositionAssessment(position, reportInfo) {
  const parsedData = reportInfo?.parsed_data || {};
  const assessment = {
    action: 'hold', // default
    risk_level: 'medium', // default
    summary: '',
    follow_ups: [],
    watch_items: [],
    risk_alerts: []
  };

  // 根据决策、报告评分、收益率确定操作建议
  if (parsedData.decision) {
    if (parsedData.decision.includes('买入') || parsedData.decision.includes('增持')) {
      assessment.action = 'buy';
    } else if (parsedData.decision.includes('卖出') || parsedData.decision.includes('减持')) {
      assessment.action = 'sell';
    }
  }

  // 根据收益率和报告评分确定风险等级
  if (position.unrealized_pnl_rate <= -10) {
    assessment.risk_level = 'high';
  } else if (parsedData.report_score && parsedData.report_score <= 2) {
    assessment.risk_level = 'high';
  } else if (position.unrealized_pnl_rate <= -5 || (parsedData.report_score && parsedData.report_score <= 3)) {
    assessment.risk_level = 'medium';
  } else {
    assessment.risk_level = 'low';
  }

  // 生成摘要
  const parts = [];
  if (parsedData.decision) {
    parts.push(`决策: ${parsedData.decision}`);
  }
  if (parsedData.report_score) {
    parts.push(`报告评分: ${parsedData.report_score}/5`);
  }
  parts.push(`收益率: ${position.unrealized_pnl_rate.toFixed(2)}%`);
  assessment.summary = parts.join('; ');

  // 生成跟进事项
  const followUps = [];

  // 添加 watch_items
  if (parsedData.key_watch_points && parsedData.key_watch_points.length > 0) {
    parsedData.key_watch_points.slice(0, 3).forEach(point => {
      followUps.push(`观察点: ${point}`);
      assessment.watch_items.push(point);
    });
  }

  // 添加 risk_alerts
  if (parsedData.risk_controls && parsedData.risk_controls.length > 0) {
    parsedData.risk_controls.slice(0, 3).forEach(risk => {
      followUps.push(`关注风险: ${risk}`);
      assessment.risk_alerts.push(risk);
    });
  }

  if (parsedData.parse_status && parsedData.parse_status.startsWith('error')) {
    const errorMsg = parsedData.parse_status === 'error' ? '报告解析失败' : parsedData.parse_status;
    followUps.push('报告解析失败，建议检查报告格式');
    assessment.risk_alerts.push(errorMsg);
  } else if (parsedData.parse_status === 'partial_success') {
    followUps.push('报告解析部分成功，数据可能不完整');
    assessment.risk_alerts.push('报告解析部分成功，数据可能不完整');
  }

  if (position.unrealized_pnl_rate <= -10) {
    const alert = `收益率持续低迷 ${position.unrealized_pnl_rate.toFixed(2)}%，建议评估止损策略`;
    followUps.push(alert);
    assessment.risk_alerts.push(alert);
  } else if (position.unrealized_pnl_rate <= -5) {
    const alert = `收益率为负 ${position.unrealized_pnl_rate.toFixed(2)}%，需要关注`;
    followUps.push(alert);
    assessment.risk_alerts.push(alert);
  }

  if (assessment.risk_level === 'high') {
    assessment.risk_alerts.push('持仓风险等级为高');
  }

  // 限制数组长度
  assessment.watch_items = assessment.watch_items.slice(0, 3);
  assessment.risk_alerts = assessment.risk_alerts.slice(0, 3);

  if (position.unrealized_pnl_rate >= 20) {
    followUps.push('收益率表现优异，建议评估止盈策略');
  }

  // 确保有2-5条跟进事项
  while (followUps.length < 2) {
    followUps.push('定期监控股价走势');
  }
  assessment.follow_ups = followUps.slice(0, 5);

  return assessment;
}

/**
 * 生成账户汇总
 */
function generateAccountSummary(accountReport) {
  const summary = {
    action_items: [],
    high_risk_positions: [],
    positive_positions: [],
    negative_positions: [],
    watch_items_count: 0,
    risk_alerts_count: 0
  };

  accountReport.positions.forEach(position => {
    // 高风险持仓
    if (position.monitor_assessment.risk_level === 'high') {
      summary.high_risk_positions.push(`${position.stock_name} (${position.ts_code})`);
    }

    // 正收益持仓
    if (position.unrealized_pnl_rate > 0) {
      summary.positive_positions.push(`${position.stock_name} (${position.ts_code})`);
    } else if (position.unrealized_pnl_rate < 0) {
      // 负收益持仓
      summary.negative_positions.push(`${position.stock_name} (${position.ts_code})`);
    }

    // 操作建议
    if (position.monitor_assessment.action === 'buy') {
      summary.action_items.push(`建议增持: ${position.stock_name}`);
    } else if (position.monitor_assessment.action === 'sell') {
      summary.action_items.push(`建议减持: ${position.stock_name}`);
    }

    // 统计 watch_items 和 risk_alerts
    summary.watch_items_count += position.monitor_assessment.watch_items.length;
    summary.risk_alerts_count += position.monitor_assessment.risk_alerts.length;
  });

  // 添加账户级别的操作建议
  if (summary.high_risk_positions.length > 0) {
    summary.action_items.push(`有 ${summary.high_risk_positions.length} 个高风险持仓需要关注`);
  }

  if (summary.negative_positions.length > summary.positive_positions.length) {
    summary.action_items.push('负收益持仓数量多于正收益持仓，建议优化持仓结构');
  }

  return summary;
}

/**
 * 生成报告概览
 */
function generateReportOverview(report) {
  const overview = {
    high_risk_positions: [],
    positive_positions: [],
    negative_positions: [],
    accounts_requiring_attention: [],
    headline: '',
    watch_items_count: 0,
    risk_alerts_count: 0
  };

  // 统计总持仓数
  let totalPositions = 0;

  report.accounts.forEach(account => {
    totalPositions += account.positions.length;

    // 收集所有高风险持仓
    account.positions.forEach(position => {
      if (position.monitor_assessment.risk_level === 'high') {
        overview.high_risk_positions.push(`${account.account_name} - ${position.stock_name} (${position.ts_code})`);
      }
    });

    // 收集所有正收益持仓
    account.positions.forEach(position => {
      if (position.unrealized_pnl_rate > 0) {
        overview.positive_positions.push(`${account.account_name} - ${position.stock_name} (${position.ts_code})`);
      }
    });

    // 收集所有负收益持仓
    account.positions.forEach(position => {
      if (position.unrealized_pnl_rate < 0) {
        overview.negative_positions.push(`${account.account_name} - ${position.stock_name} (${position.ts_code})`);
      }
    });

    // 识别需要关注的账户
    if (account.summary.high_risk_positions.length > 0) {
      overview.accounts_requiring_attention.push(account.account_name);
    } else if (account.positions.length > 0 && account.summary.negative_positions.length === account.positions.length) {
      overview.accounts_requiring_attention.push(account.account_name);
    }

    // 累计 watch_items 和 risk_alerts 计数
    overview.watch_items_count += account.summary.watch_items_count;
    overview.risk_alerts_count += account.summary.risk_alerts_count;
  });

  // 生成标题
  const parts = [];
  if (overview.high_risk_positions.length > 0) {
    parts.push(`⚠️ 高风险持仓: ${overview.high_risk_positions.length} 个`);
  }
  if (overview.positive_positions.length > 0) {
    parts.push(`📈 正收益持仓: ${overview.positive_positions.length} 个`);
  }
  if (overview.negative_positions.length > 0) {
    parts.push(`📉 负收益持仓: ${overview.negative_positions.length} 个`);
  }
  if (overview.accounts_requiring_attention.length > 0) {
    parts.push(`🔍 需要关注的账户: ${overview.accounts_requiring_attention.length} 个`);
  }

  // 处理有持仓但 high/positive/negative 都为 0 的情况（盈亏率为 0）
  if (totalPositions > 0 && parts.length === 0) {
    overview.headline = `📊 存在 ${totalPositions} 个持仓，整体需继续跟踪`;
  } else {
    overview.headline = parts.length > 0 ? parts.join(' | ') : '📊 每日监控报告: 市场表现平稳';
  }

  return overview;
}

/**
 * 从 HTML 报告中解析关键数据
 */
function parseAnalysisReport(reportPath) {
  const result = {
    parse_status: 'success',
    buyZone: null,
    stopLoss: null,
    targetPrice: null,
    strategy: null,
    decision: null,
    report_score: null,
    key_watch_points: [],
    operation_suggestions: {},
    risk_controls: [],
    footnote: null
  };

  try {
    const html = fs.readFileSync(reportPath, 'utf8');

    // 解析最终决策 - 更加健壮的匹配方式，确保匹配到正确的summary-item
    let decisionMatch = html.match(/<div[^>]*class="summary-item"[^>]*>[\s\S]*?<div[^>]*class="summary-label"[^>]*>最终决策<\/div>[\s\S]*?<div[^>]*class="summary-value"[^>]*>([^<]+)/);
    if (decisionMatch) {
      result.decision = decisionMatch[1].trim();
    }

    // 解析报告评分 - 更加健壮的匹配方式，确保匹配到正确的summary-item
    let scoreMatch = html.match(/<div[^>]*class="summary-item"[^>]*>[\s\S]*?<div[^>]*class="summary-label"[^>]*>研究评级<\/div>[\s\S]*?<div[^>]*class="summary-value"[^>]*>[\s\S]*?([0-9.]+)\s*\/\s*5/);
    if (scoreMatch) {
      result.report_score = parseFloat(scoreMatch[1]);
    }

    // 尝试从 HTML 中提取建仓区间、止损点、目标价
    // 这些字段在某些报告版本中可能存在

    // 支持格式："建仓区间：X.XX 元 ~ Y.YY 元" 或 "- 建仓区间：X.XX 元 ~ Y.YY 元"
    let buyZoneMatch = html.match(/-?\s*建仓区间[：:]\s*([0-9.]+)\s*元\s*[~-]\s*([0-9.]+)\s*元/);
    if (!buyZoneMatch) {
      buyZoneMatch = html.match(/建仓区间[：:]\s*([0-9.]+)\s*~?\s*([0-9.]+)/);
    }
    if (!buyZoneMatch) {
      buyZoneMatch = html.match(/建仓区间[：:]\s*([^<~]+)~([^<]+)/);
    }
    if (buyZoneMatch) {
      const buyLow = parseFloat(buyZoneMatch[1].replace(/[^0-9.]/g, ''));
      const buyHigh = parseFloat(buyZoneMatch[2].replace(/[^0-9.]/g, ''));
      if (!isNaN(buyLow) && !isNaN(buyHigh)) {
        result.buyZone = [buyLow, buyHigh];
      }
    }

    // 支持格式："止损点：X.XX 元" 或 "- 止损点：X.XX 元" 或 "止损：X.XX 元"
    let stopLossMatch = html.match(/-?\s*止损点?[：:]\s*([0-9.]+)\s*元/);
    if (!stopLossMatch) {
      stopLossMatch = html.match(/止损点?[：:]\s*([0-9.]+)/);
    }
    if (!stopLossMatch) {
      stopLossMatch = html.match(/止损点?[：:]\s*([^<]+)/);
    }
    if (stopLossMatch) {
      const stopLoss = parseFloat(stopLossMatch[1].replace(/[^0-9.]/g, ''));
      if (!isNaN(stopLoss)) {
        result.stopLoss = stopLoss;
      }
    }

    // 支持格式："目标价：X.XX 元" 或 "- 目标价：X.XX 元"
    let targetPriceMatch = html.match(/-?\s*目标价?[：:]\s*([0-9.]+)\s*元/);
    if (!targetPriceMatch) {
      targetPriceMatch = html.match(/目标价?[：:]\s*([0-9.]+)/);
    }
    if (!targetPriceMatch) {
      targetPriceMatch = html.match(/目标价?[：:]\s*([^<]+)/);
    }
    if (targetPriceMatch) {
      const targetPrice = parseFloat(targetPriceMatch[1].replace(/[^0-9.]/g, ''));
      if (!isNaN(targetPrice)) {
        result.targetPrice = targetPrice;
      }
    }

    // 尝试提取策略信息（激进、稳健、保守）
    const strategyResult = {};
    const aggressiveMatch = html.match(/激进型[\s\S]*?<p>([^<]+)<\/p>/);
    if (aggressiveMatch) {
      strategyResult.aggressive = aggressiveMatch[1].trim();
    }
    const balancedMatch = html.match(/稳健型[\s\S]*?<p>([^<]+)<\/p>/);
    if (balancedMatch) {
      strategyResult.balanced = balancedMatch[1].trim();
    }
    const conservativeMatch = html.match(/保守型[\s\S]*?<p>([^<]+)<\/p>/);
    if (conservativeMatch) {
      strategyResult.conservative = conservativeMatch[1].trim();
    }

    if (Object.keys(strategyResult).length > 0) {
      result.strategy = strategyResult;
    }

    // 解析关键观察点
    const keyWatchPointsMatch = html.match(/关键观察点[\s\S]*?<ul[^>]*class="plain-list"[^>]*>([\s\S]*?)<\/ul>/);
    if (keyWatchPointsMatch) {
      const pointsHtml = keyWatchPointsMatch[1];
      const pointMatches = pointsHtml.matchAll(/<li>([^<]+)<\/li>/g);
      for (const match of pointMatches) {
        const point = match[1].trim();
        if (point) {
          result.key_watch_points.push(point);
        }
      }
    }

    // 解析操作建议
    const operationSuggestionsMatch = html.match(/操作建议[\s\S]*?<ul>([\s\S]*?)<\/ul>/);
    if (operationSuggestionsMatch) {
      const suggestionsHtml = operationSuggestionsMatch[1];
      const shortTermMatch = suggestionsHtml.match(/短线（1周）：([^<]+)/);
      if (shortTermMatch) {
        result.operation_suggestions.short_term = shortTermMatch[1].trim();
      }
      const mediumTermMatch = suggestionsHtml.match(/中线（1-3个月）：([^<]+)/);
      if (mediumTermMatch) {
        result.operation_suggestions.medium_term = mediumTermMatch[1].trim();
      }
      const longTermMatch = suggestionsHtml.match(/长线（6个月以上）：([^<]+)/);
      if (longTermMatch) {
        result.operation_suggestions.long_term = longTermMatch[1].trim();
      }
    }

    // 解析风险控制 - 确保只匹配到操作建议与风险控制 section 中的内容
    const riskSectionMatch = html.match(/操作建议与风险控制[\s\S]*?<h3>风险控制<\/h3>[\s\S]*?<ul>([\s\S]*?)<\/ul>/);
    if (riskSectionMatch) {
      const risksHtml = riskSectionMatch[1];
      const riskMatches = risksHtml.matchAll(/<li[^>]*>([^<]+)<\/li>/g);
      for (const match of riskMatches) {
        const risk = match[1].trim();
        if (risk) {
          result.risk_controls.push(risk);
        }
      }
    }

    // 解析脚注
    const footnoteMatch = html.match(/<p[^>]*class="footnote"[^>]*>([^<]+)<\/p>/);
    if (footnoteMatch) {
      result.footnote = footnoteMatch[1].trim();
    } else {
      // 尝试其他可能的脚注格式
      const otherFootnoteMatch = html.match(/提示：[^<]+/);
      if (otherFootnoteMatch) {
        result.footnote = otherFootnoteMatch[0].trim();
      }
    }

    // 调整解析状态
    const hasCoreFields = result.decision !== null || result.report_score !== null || result.strategy !== null;
    const hasNumericalFields = result.buyZone !== null || result.stopLoss !== null || result.targetPrice !== null;

    if (hasCoreFields && !hasNumericalFields) {
      result.parse_status = 'partial_success';
    } else if (!hasCoreFields && !hasNumericalFields) {
      result.parse_status = 'error: 未解析到核心字段';
    }

  } catch (error) {
    result.parse_status = `error: ${error.message}`;
  }

  return result;
}

async function main() {
  console.log('📊 每日监控任务启动');
  console.log(`⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);

  try {
    // 获取所有模拟账户
    const db = await getDatabase();
    const accounts = await db.allPromise('SELECT * FROM portfolio_account ORDER BY created_at DESC');

    console.log(`📈 找到 ${accounts.length} 个模拟账户`);

    const monitorReport = {
      generated_at: new Date().toISOString(),
      account_count: accounts.length,
      total_positions: 0,
      accounts: [],
      failed_stocks: [],
      report_version: '1.0.0',
      // 为后续扩展预留位置
      metadata: {
        market_date: new Date().toISOString().split('T')[0],
        environment: process.env.NODE_ENV || 'development',
        source: 'daily-monitor'
      }
    };

    // 遍历所有账户
    for (const account of accounts) {
      console.log(`\n🔍 检查账户: ${account.account_name} (ID: ${account.id})`);

      const positions = await db.allPromise(
        'SELECT * FROM portfolio_position WHERE account_id = ? ORDER BY market_value DESC',
        [account.id]
      );

      const accountReport = {
        account_id: account.id,
        account_name: account.account_name,
        total_value: account.total_value,
        total_return: account.total_return,
        return_rate: account.return_rate,
        cash: account.current_cash,
        position_count: positions.length,
        positions: []
      };

      // 遍历持仓
      for (const position of positions) {
        console.log(`   📦 股票: ${position.stock_name} (${position.ts_code})`);

        try {
          // 尝试查找对应的分析报告
          const reportInfo = findAnalysisReport(position.ts_code, position.stock_name);

          const positionReport = {
            ts_code: position.ts_code,
            stock_name: position.stock_name,
            quantity: position.quantity,
            avg_price: position.avg_price,
            cost_amount: position.cost_amount,
            current_price: position.current_price,
            market_value: position.market_value,
            unrealized_pnl: position.unrealized_pnl,
            unrealized_pnl_rate: position.unrealized_pnl_rate,
            report: reportInfo,
            monitor_assessment: generatePositionAssessment(position, reportInfo)
          };

          accountReport.positions.push(positionReport);
          monitorReport.total_positions++;
        } catch (error) {
          console.error(`   ❌ 处理 ${position.stock_name} 失败:`, error.message);
          monitorReport.failed_stocks.push({
            ts_code: position.ts_code,
            stock_name: position.stock_name,
            account_id: account.id,
            account_name: account.account_name,
            error: error.message
          });
        }
      }

      // 添加账户摘要
      accountReport.summary = generateAccountSummary(accountReport);
      monitorReport.accounts.push(accountReport);
    }

    // 生成顶层概览
    monitorReport.overview = generateReportOverview(monitorReport);

    // 生成报告文件
    const reportFileName = `monitor_report_${new Date().toISOString().split('T')[0]}.json`;
    const reportFilePath = path.join(MONITOR_REPORTS_DIR, reportFileName);
    fs.writeFileSync(reportFilePath, JSON.stringify(monitorReport, null, 2), 'utf8');

    console.log(`\n✅ 监控完成`);
    console.log(`📄 报告已保存: ${reportFilePath}`);
    console.log(`📊 统计信息:`);
    console.log(`   - 账户数: ${monitorReport.account_count}`);
    console.log(`   - 持仓数: ${monitorReport.total_positions}`);
    console.log(`   - 失败股票: ${monitorReport.failed_stocks.length}`);

    return monitorReport;

  } catch (error) {
    console.error('\n❌ 监控任务失败:', error);
    throw error;
  }
}

/**
 * 查找股票对应的分析报告
 */
function findAnalysisReport(ts_code, stock_name) {
  if (!fs.existsSync(ANALYSIS_REPORTS_DIR)) {
    return null;
  }

  const files = fs.readdirSync(ANALYSIS_REPORTS_DIR);

  // 尝试匹配分析报告文件
  // 报告文件名格式：stock_report_股票名称_日期.html
  const reportFile = files.find(file => {
    const matchName = file.includes(stock_name) || file.includes(ts_code);
    const matchType = file.endsWith('.html');
    return matchName && matchType;
  });

  if (reportFile) {
    const reportPath = path.join(ANALYSIS_REPORTS_DIR, reportFile);
    const stat = fs.statSync(reportPath);

    // 解析报告关键数据
    const parsedData = parseAnalysisReport(reportPath);

    return {
      file_name: reportFile,
      file_path: reportPath,
      created_at: stat.ctime.toISOString(),
      size: stat.size,
      parsed_data: parsedData
    };
  }

  return null;
}

// 启动任务
main().catch(error => {
  console.error('任务执行失败:', error);
  process.exit(1);
});
