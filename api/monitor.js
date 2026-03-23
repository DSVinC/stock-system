/**
 * Position Monitoring API
 * Task: TASK_POSITION_MONITOR_004
 * 
 * Provides endpoints for position monitoring:
 * - GET /api/monitor/overview - Monitoring summary
 * - GET /api/monitor/signals - Signal list
 * - POST /api/monitor/run - Run monitoring manually
 */

const { getDatabase } = require('./db');
const { getUnreadSignals, markAsRead } = require('./position-signals');

/**
 * Get monitoring overview
 */
async function getOverview(req, res) {
  try {
    const db = getDatabase();
    // Get position count
    const positionResult = await db.all(`
      SELECT COUNT(DISTINCT ts_code) as count 
      FROM portfolio_position 
      WHERE quantity > 0
    `);
    
    // Get today's signals
    const today = new Date().toISOString().split('T')[0];
    const signalResult = await db.all(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN signal_level = 'HIGH' THEN 1 ELSE 0 END) as high_risk,
        SUM(CASE WHEN signal_level = 'MEDIUM' THEN 1 ELSE 0 END) as warning
      FROM position_signals 
      WHERE DATE(created_at) = ?
    `, [today]);
    
    res.json({
      success: true,
      data: {
        positionCount: positionResult[0]?.count || 0,
        todaySignals: signalResult[0]?.total || 0,
        highRiskCount: signalResult[0]?.high_risk || 0,
        warningSignals: signalResult[0]?.warning || 0
      }
    });
  } catch (error) {
    console.error('Get monitor overview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Get signals list
 */
async function getSignals(req, res) {
  try {
    const db = getDatabase();
    const { limit = 50, signal_type, account_id } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (signal_type && signal_type !== 'all') {
      whereClause += ' AND signal_type = ?';
      params.push(signal_type);
    }
    
    if (account_id) {
      whereClause += ' AND account_id = ?';
      params.push(account_id);
    }
    
    const signals = await db.all(`
      SELECT * FROM position_signals 
      WHERE ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ?
    `, [...params, parseInt(limit)]);
    
    res.json({
      success: true,
      data: signals || []
    });
  } catch (error) {
    console.error('Get signals error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Run monitoring manually
 */
async function runMonitor(req, res) {
  try {
    const { execSync } = require('child_process');
    const path = require('path');
    
    const scriptPath = path.join(__dirname, '..', 'scripts', 'monitor-positions.mjs');
    
    // Run monitoring script
    const output = execSync(`node "${scriptPath}" --mode=manual`, {
      encoding: 'utf8',
      timeout: 60000
    });
    
    // Parse output to get signal count
    const signalMatch = output.match(/生成信号：(\d+) 个/);
    const signalCount = signalMatch ? parseInt(signalMatch[1]) : 0;
    
    res.json({
      success: true,
      data: {
        signals: signalCount,
        output: output
      }
    });
  } catch (error) {
    console.error('Run monitor error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    });
  }
}

/**
 * Mark signals as read
 */
async function markSignalsRead(req, res) {
  try {
    const { signal_ids } = req.body;
    
    if (!signal_ids || !Array.isArray(signal_ids)) {
      return res.status(400).json({ 
        success: false, 
        error: 'signal_ids required' 
      });
    }
    
    await markAsRead(signal_ids);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark signals read error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  getOverview,
  getSignals,
  runMonitor,
  markSignalsRead,
  createMonitorRouter
};

/**
 * Create Express router for monitor endpoints
 */
function createMonitorRouter() {
  const express = require('express');
  const router = express.Router();
  
  router.get('/overview', getOverview);
  router.get('/signals', getSignals);
  router.post('/run', runMonitor);
  router.post('/mark-read', markSignalsRead);
  
  return router;
}
