/**
 * 个股选股 + 分钟线获取整合 API
 * TASK_V3_006_003
 *
 * 功能：
 * - 选股完成后自动获取 Top10 股票的分钟线数据
 * - 提供一键选股+分钟线获取功能
 */

'use strict';

const { createRequire } = require('node:module');

const express = require('express');
// express already required above

const { selectTopStocks } = require('./stock-select');
const { handleMinuteFetch } = require('./minute-fetch');

const router = express.Router();

/**
 * 触发分钟线获取（内部调用）
 * @param {string} tsCode - 股票代码
 * @param {string} startDate - 开始日期（可选）
 * @param {string} endDate - 结束日期（可选）
 * @returns {Promise<Object>} 获取结果
 */
async function triggerMinuteFetch(tsCode, startDate = null, endDate = null) {
  return new Promise((resolve) => {
    const mockReq = {
      body: {
        ts_code: tsCode,
        start_date: startDate,
        end_date: endDate,
        force_refresh: false
      }
    };

    const mockRes = {
      status: () => mockRes,
      json: (data) => resolve(data)
    };

    handleMinuteFetch(mockReq, mockRes);
  });
}

/**
 * POST /api/stock/select-with-minute
 * 选股完成后自动获取 Top10 股票的分钟线数据
 *
 * 请求体：
 * {
 *   "limit": 10,
 *   "start_date": "2025-01-01",
 *   "end_date": "2025-03-24"
 * }
 */
router.post('/select-with-minute', async (req, res) => {
  const startTime = Date.now();

  try {
    const limit = Math.min(20, Math.max(1, req.body.limit || 10));
    const startDate = req.body.start_date || null;
    const endDate = req.body.end_date || null;

    console.log(`[stock] 开始选股 + 分钟线获取流程，Top ${limit}...`);

    // 1. 执行选股
    const selectResult = await selectTopStocks(limit);

    if (!selectResult.success || selectResult.core_pool.length === 0) {
      return res.json({
        success: false,
        message: '选股未返回结果',
        select_result: selectResult,
        minute_tasks: []
      });
    }

    const topStocks = selectResult.core_pool;
    console.log(`[stock] 选股完成，共 ${topStocks.length} 只股票`);

    // 2. 对 Top10 股票触发分钟线获取
    const minuteTasks = [];
    const stocksForMinute = topStocks.slice(0, 10);

    console.log(`[stock] 开始获取 ${stocksForMinute.length} 只股票的分钟线...`);

    for (const stock of stocksForMinute) {
      try {
        const minuteResult = await triggerMinuteFetch(stock.ts_code, startDate, endDate);

        minuteTasks.push({
          ts_code: stock.ts_code,
          stock_name: stock.stock_name,
          rank: stock.rank,
          task_id: minuteResult.task_id || null,
          status: minuteResult.success ? 'started' : 'failed',
          message: minuteResult.message || minuteResult.error || null,
          check_status_url: minuteResult.check_status_url || null
        });

        console.log(`[stock] 触发分钟线获取: ${stock.ts_code} (${stock.stock_name})`);
      } catch (error) {
        console.error(`[stock] 触发分钟线获取失败: ${stock.ts_code}`, error.message);
        minuteTasks.push({
          ts_code: stock.ts_code,
          stock_name: stock.stock_name,
          rank: stock.rank,
          task_id: null,
          status: 'error',
          message: error.message
        });
      }
    }

    const elapsed = Date.now() - startTime;
    const successCount = minuteTasks.filter(t => t.status === 'started').length;

    console.log(`[stock] 流程完成，耗时 ${elapsed}ms，分钟线任务 ${successCount}/${minuteTasks.length}`);

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      elapsed_ms: elapsed,

      // 选股结果
      select_result: {
        tradeDate: selectResult.tradeDate,
        selected_count: selectResult.selected_count,
        total_evaluated: selectResult.total_evaluated,
        core_pool: topStocks
      },

      // 分钟线获取任务
      minute_tasks: minuteTasks,
      minute_summary: {
        total: minuteTasks.length,
        started: successCount,
        failed: minuteTasks.length - successCount
      }
    });

  } catch (error) {
    console.error('[stock] 选股+分钟线流程失败:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      select_result: null,
      minute_tasks: []
    });
  }
});

/**
 * GET /api/stock/select-with-minute
 * 选股完成后自动获取 Top10 股票的分钟线数据（GET 方式）
 *
 * 查询参数：
 * - limit: 返回数量（默认 10，范围 1-20）
 * - start_date: 分钟线开始日期
 * - end_date: 分钟线结束日期
 */
router.get('/select-with-minute', async (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
    const startDate = req.query.start_date || null;
    const endDate = req.query.end_date || null;

    // 复用 POST 逻辑
    const mockReq = {
      body: { limit, start_date: startDate, end_date: endDate }
    };

    // 直接调用处理逻辑
    const startTime = Date.now();
    console.log(`[stock] 开始选股 + 分钟线获取流程（GET），Top ${limit}...`);

    const selectResult = await selectTopStocks(limit);

    if (!selectResult.success || selectResult.core_pool.length === 0) {
      return res.json({
        success: false,
        message: '选股未返回结果',
        select_result: selectResult,
        minute_tasks: []
      });
    }

    const topStocks = selectResult.core_pool;
    const minuteTasks = [];
    const stocksForMinute = topStocks.slice(0, 10);

    for (const stock of stocksForMinute) {
      try {
        const minuteResult = await triggerMinuteFetch(stock.ts_code, startDate, endDate);
        minuteTasks.push({
          ts_code: stock.ts_code,
          stock_name: stock.stock_name,
          rank: stock.rank,
          task_id: minuteResult.task_id || null,
          status: minuteResult.success ? 'started' : 'failed',
          message: minuteResult.message || minuteResult.error || null
        });
      } catch (error) {
        minuteTasks.push({
          ts_code: stock.ts_code,
          stock_name: stock.stock_name,
          rank: stock.rank,
          task_id: null,
          status: 'error',
          message: error.message
        });
      }
    }

    const elapsed = Date.now() - startTime;
    const successCount = minuteTasks.filter(t => t.status === 'started').length;

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      elapsed_ms: elapsed,
      select_result: {
        tradeDate: selectResult.tradeDate,
        selected_count: selectResult.selected_count,
        total_evaluated: selectResult.total_evaluated,
        core_pool: topStocks
      },
      minute_tasks: minuteTasks,
      minute_summary: {
        total: minuteTasks.length,
        started: successCount,
        failed: minuteTasks.length - successCount
      }
    });

  } catch (error) {
    console.error('[stock] 选股+分钟线流程失败:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 导出
module.exports = router;
module.exports.triggerMinuteFetch = triggerMinuteFetch;