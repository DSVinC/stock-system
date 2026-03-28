/**
 * 分析报告存储 API
 * 提供分析报告的存储、查询和条件单导入功能
 */

const { getDatabase } = require('./db');
const { v4: uuidv4 } = require('uuid');

/**
 * 存储分析报告
 * POST /api/report/store
 */
async function storeReport(req, res) {
  try {
    const {
      report_id: reportId,
      stock_code: stockCode,
      stock_name: stockName,
      report_json: reportJson,
      decision,
      rating,
      stop_loss: stopLoss,
      stop_profit: stopProfit,
      entry_zone: entryZone,
      add_position: addPosition,
      key_events: keyEvents
    } = req.body;

    // 参数验证
    if (!stockCode) {
      return res.status(400).json({ error: 'stock_code 是必填项' });
    }

    if (!reportJson) {
      return res.status(400).json({ error: 'report_json 是必填项' });
    }

    // 解析reportJson获取决策信息
    let parsedReport;
    try {
      parsedReport = typeof reportJson === 'string' ? JSON.parse(reportJson) : reportJson;
    } catch (parseError) {
      return res.status(400).json({ error: 'report_json 格式不正确' });
    }

    // 从报告中提取决策信息（如果未单独提供）
    const finalDecision = decision || parsedReport.decision;
    const finalRating = rating || parsedReport.rating;
    const finalStopLoss = stopLoss || parsedReport.stop_loss;
    const finalStopProfit = stopProfit || parsedReport.stop_profit;
    const finalEntryZone = entryZone || parsedReport.entry_zone;
    const finalAddPosition = addPosition || parsedReport.add_position;
    const finalKeyEvents = keyEvents || parsedReport.key_events;

    // 生成报告ID
    const finalReportId = reportId || `${stockCode}_${uuidv4().slice(0, 8)}`;
    
    const db = getDatabase();
    
    // 检查是否已存在相同的report_id
    const existing = await db.getPromise(
      'SELECT id FROM stock_analysis_reports WHERE report_id = ?',
      [finalReportId]
    );

    let result;
    if (existing) {
      // 更新现有报告
      result = await db.runPromise(
        `UPDATE stock_analysis_reports SET 
          stock_code = ?,
          stock_name = ?,
          report_json = ?,
          decision = ?,
          rating = ?,
          stop_loss = ?,
          stop_profit = ?,
          entry_zone = ?,
          add_position = ?,
          key_events = ?
        WHERE report_id = ?`,
        [
          stockCode,
          stockName,
          typeof reportJson === 'string' ? reportJson : JSON.stringify(reportJson),
          finalDecision,
          finalRating,
          finalStopLoss,
          finalStopProfit ? JSON.stringify(finalStopProfit) : null,
          finalEntryZone ? JSON.stringify(finalEntryZone) : null,
          finalAddPosition ? JSON.stringify(finalAddPosition) : null,
          finalKeyEvents ? JSON.stringify(finalKeyEvents) : null,
          finalReportId
        ]
      );
    } else {
      // 插入新报告
      result = await db.runPromise(
        `INSERT INTO stock_analysis_reports (
          report_id, stock_code, stock_name, report_json,
          decision, rating, stop_loss, stop_profit, entry_zone,
          add_position, key_events
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalReportId,
          stockCode,
          stockName,
          typeof reportJson === 'string' ? reportJson : JSON.stringify(reportJson),
          finalDecision,
          finalRating,
          finalStopLoss,
          finalStopProfit ? JSON.stringify(finalStopProfit) : null,
          finalEntryZone ? JSON.stringify(finalEntryZone) : null,
          finalAddPosition ? JSON.stringify(finalAddPosition) : null,
          finalKeyEvents ? JSON.stringify(finalKeyEvents) : null
        ]
      );
    }

    res.json({
      success: true,
      report_id: finalReportId,
      stock_code: stockCode,
      action: existing ? 'updated' : 'created',
      id: result.lastID
    });

  } catch (error) {
    console.error('存储分析报告失败:', error);
    res.status(500).json({ error: '存储失败', details: error.message });
  }
}

/**
 * 获取报告列表
 * GET /api/report/list
 */
async function getReportList(req, res) {
  try {
    const { limit = 50, offset = 0, stock_code: stockCode } = req.query;
    
    const db = getDatabase();
    
    let query = 'SELECT * FROM stock_analysis_reports';
    const params = [];
    
    if (stockCode) {
      query += ' WHERE stock_code = ?';
      params.push(stockCode);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const reports = await db.allPromise(query, params);
    
    // 解析JSON字段
    const parsedReports = reports.map(report => {
      const parsed = { ...report };
      
      try {
        parsed.report_json = JSON.parse(report.report_json);
      } catch (e) {
        parsed.report_json = report.report_json;
      }
      
      if (report.stop_profit) {
        try {
          parsed.stop_profit = JSON.parse(report.stop_profit);
        } catch (e) {
          parsed.stop_profit = report.stop_profit;
        }
      }
      
      if (report.entry_zone) {
        try {
          parsed.entry_zone = JSON.parse(report.entry_zone);
        } catch (e) {
          parsed.entry_zone = report.entry_zone;
        }
      }
      
      if (report.add_position) {
        try {
          parsed.add_position = JSON.parse(report.add_position);
        } catch (e) {
          parsed.add_position = report.add_position;
        }
      }
      
      if (report.key_events) {
        try {
          parsed.key_events = JSON.parse(report.key_events);
        } catch (e) {
          parsed.key_events = report.key_events;
        }
      }
      
      return parsed;
    });
    
    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM stock_analysis_reports';
    let countParams = [];
    
    if (stockCode) {
      countQuery += ' WHERE stock_code = ?';
      countParams.push(stockCode);
    }
    
    const countResult = await db.getPromise(countQuery, countParams);
    
    res.json({
      success: true,
      reports: parsedReports,
      total: countResult.total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch (error) {
    console.error('获取报告列表失败:', error);
    res.status(500).json({ error: '获取失败', details: error.message });
  }
}

/**
 * 获取指定股票的最新报告
 * GET /api/report/:stockCode/latest
 */
async function getLatestReport(req, res) {
  try {
    const { stockCode } = req.params;
    
    if (!stockCode) {
      return res.status(400).json({ error: '股票代码不能为空' });
    }
    
    const db = getDatabase();
    
    // 使用视图或查询获取最新报告
    const report = await db.getPromise(
      `SELECT * FROM stock_analysis_reports 
       WHERE stock_code = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [stockCode]
    );
    
    if (!report) {
      return res.status(404).json({ 
        success: false, 
        error: `未找到股票 ${stockCode} 的分析报告` 
      });
    }
    
    // 解析JSON字段
    const parsedReport = { ...report };
    
    try {
      parsedReport.report_json = JSON.parse(report.report_json);
    } catch (e) {
      parsedReport.report_json = report.report_json;
    }
    
    if (report.stop_profit) {
      try {
        parsedReport.stop_profit = JSON.parse(report.stop_profit);
      } catch (e) {
        parsedReport.stop_profit = report.stop_profit;
      }
    }
    
    if (report.entry_zone) {
      try {
        parsedReport.entry_zone = JSON.parse(report.entry_zone);
      } catch (e) {
        parsedReport.entry_zone = report.entry_zone;
      }
    }
    
    if (report.add_position) {
      try {
        parsedReport.add_position = JSON.parse(report.add_position);
      } catch (e) {
        parsedReport.add_position = report.add_position;
      }
    }
    
    if (report.key_events) {
      try {
        parsedReport.key_events = JSON.parse(report.key_events);
      } catch (e) {
        parsedReport.key_events = report.key_events;
      }
    }
    
    res.json({
      success: true,
      report: parsedReport
    });
    
  } catch (error) {
    console.error('获取最新报告失败:', error);
    res.status(500).json({ error: '获取失败', details: error.message });
  }
}

/**
 * 从分析报告导入条件单
 * POST /api/report/:reportId/import-to-order
 */
async function importToOrderFromReport(req, res) {
  try {
    const { reportId } = req.params;
    const { 
      account_id: accountId = 1, 
      position_pct = 10,
      use_stop_loss = true,
      use_stop_profit = true,
      use_entry_zone = true
    } = req.body;
    
    const db = getDatabase();
    
    // 获取报告
    const report = await db.getPromise(
      'SELECT * FROM stock_analysis_reports WHERE report_id = ?',
      [reportId]
    );
    
    if (!report) {
      return res.status(404).json({ error: '报告不存在' });
    }
    
    // 解析报告JSON
    let reportJson;
    try {
      reportJson = typeof report.report_json === 'string' 
        ? JSON.parse(report.report_json)
        : report.report_json;
    } catch (e) {
      return res.status(400).json({ error: '报告JSON格式错误' });
    }
    
    const stockCode = report.stock_code;
    const stockName = report.stock_name;
    const decision = report.decision;
    
    // 只有buy决策可以导入
    if (decision !== 'buy') {
      return res.status(400).json({ 
        error: '只有buy决策可以导入条件单',
        current_decision: decision
      });
    }
    
    // 构建条件单
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 3);

    const conditionalOrder = {
      account_id: accountId,
      ts_code: stockCode,
      stock_name: stockName,
      action: 'buy',
      order_type: 'position_pct',
      position_pct: position_pct,
      conditions: [],
      condition_logic: 'AND',
      status: 'enabled',
      trigger_count: 0,
      max_trigger_count: 1,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      remark: `从分析报告导入: ${reportId}`
    };
    
    // 解析决策字段
    const stopLoss = report.stop_loss;
    let stopProfit = [];
    let entryZone = [];
    let addPosition = [];
    let keyEvents = [];
    
    try {
      stopProfit = report.stop_profit ? JSON.parse(report.stop_profit) : [];
    } catch (e) {
      stopProfit = [];
    }
    
    try {
      entryZone = report.entry_zone ? JSON.parse(report.entry_zone) : [];
    } catch (e) {
      entryZone = [];
    }
    
    try {
      addPosition = report.add_position ? JSON.parse(report.add_position) : [];
    } catch (e) {
      addPosition = [];
    }
    
    try {
      keyEvents = report.key_events ? JSON.parse(report.key_events) : [];
    } catch (e) {
      keyEvents = [];
    }
    
    // 根据报告决策构建条件
    
    // 1. 止损条件
    if (use_stop_loss && stopLoss) {
      conditionalOrder.conditions.push({
        type: 'price',
        field: 'price',
        operator: '<',
        value: stopLoss,
        description: `止损价: ${stopLoss}`
      });
    }
    
    // 2. 止盈条件
    if (use_stop_profit && stopProfit.length > 0) {
      // 如果有多个止盈价位，创建多个条件
      stopProfit.forEach((profitPrice, index) => {
        conditionalOrder.conditions.push({
          type: 'price',
          field: 'price',
          operator: '>',
          value: profitPrice,
          description: `止盈价 ${index + 1}: ${profitPrice}`
        });
      });
    }
    
    // 3. 建仓区间条件
    if (use_entry_zone && entryZone.length === 2) {
      const [zoneLow, zoneHigh] = entryZone;
      
      conditionalOrder.conditions.push({
        type: 'price',
        field: 'price',
        operator: '>=',
        value: zoneLow,
        description: `建仓区间下限: ${zoneLow}`
      });
      
      conditionalOrder.conditions.push({
        type: 'price',
        field: 'price',
        operator: '<=',
        value: zoneHigh,
        description: `建仓区间上限: ${zoneHigh}`
      });
    }
    
    // 4. 加仓条件（如果有）
    if (addPosition.length > 0) {
      addPosition.forEach((addCondition, index) => {
        if (addCondition.type === 'price' && addCondition.value) {
          conditionalOrder.conditions.push({
            type: 'price',
            field: 'price',
            operator: '<',
            value: addCondition.value,
            description: `加仓条件 ${index + 1}: ${addCondition.description || addCondition.value}`
          });
        }
      });
    }
    
    // 如果没有任何条件，添加一个简单的价格条件
    if (conditionalOrder.conditions.length === 0) {
      conditionalOrder.conditions.push({
        type: 'price',
        field: 'price',
        operator: '<=',
        value: reportJson.current_price || 100,
        description: `当前价格买入条件`
      });
    }
    
    // 保存条件单到数据库。主表保持现有 schema，报告来源上下文写入侧表。
    const result = await db.runPromise(
      `INSERT INTO conditional_order (
        account_id, ts_code, stock_name, action, order_type,
        position_pct, conditions, condition_logic, status,
        trigger_count, max_trigger_count, start_date, end_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        conditionalOrder.account_id,
        conditionalOrder.ts_code,
        conditionalOrder.stock_name,
        conditionalOrder.action,
        conditionalOrder.order_type,
        conditionalOrder.position_pct,
        JSON.stringify(conditionalOrder.conditions),
        conditionalOrder.condition_logic,
        conditionalOrder.status,
        conditionalOrder.trigger_count,
        conditionalOrder.max_trigger_count,
        conditionalOrder.start_date,
        conditionalOrder.end_date
      ]
    );

    await db.runPromise(
      `INSERT INTO conditional_order_context (
        conditional_order_id,
        strategy_source,
        strategy_config_name,
        report_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        result.lastID,
        'analysis_report',
        conditionalOrder.remark,
        reportId
      ]
    );
    
    // 返回导入结果
    const createdOrder = await db.getPromise(
      'SELECT * FROM conditional_order WHERE id = ?',
      [result.lastID]
    );
    
    res.json({
      success: true,
      message: '条件单导入成功',
      report_id: reportId,
      order_id: result.lastID,
      order: {
        ...createdOrder,
        conditions: JSON.parse(createdOrder.conditions || '[]')
      },
      imported_conditions: {
        stop_loss: use_stop_loss && stopLoss ? stopLoss : null,
        stop_profit: use_stop_profit ? stopProfit : [],
        entry_zone: use_entry_zone ? entryZone : [],
        add_position: addPosition,
        key_events: keyEvents
      }
    });
    
  } catch (error) {
    console.error('导入条件单失败:', error);
    res.status(500).json({ error: '导入失败', details: error.message });
  }
}

module.exports = {
  storeReport,
  getReportList,
  getLatestReport,
  importToOrderFromReport
};
