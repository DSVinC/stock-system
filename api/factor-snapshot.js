'use strict';

/**
 * 因子快照库模块
 * Factor Snapshot Library
 * 
 * 实现 TASK_P0_003 要求：
 * 1. recordSnapshot(snapshotData) - 记录因子快照
 * 2. querySnapshot(stockCode, date) - 查询指定日期的快照
 * 3. querySnapshotsByDate(date) - 查询某日所有股票的快照
 * 
 * 按天归档（YYYY-MM-DD.json），支持追加模式
 */

const path = require('path');
const fs = require('fs');

// 快照存储目录
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'factor-snapshots');

// 确保目录存在
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

/**
 * 获取指定日期的快照文件路径
 * @param {string} date - 日期字符串，格式：YYYY-MM-DD
 * @returns {string} 文件路径
 */
function getSnapshotPath(date) {
  return path.join(SNAPSHOTS_DIR, `${date}.json`);
}

/**
 * 读取指定日期的快照文件
 * @param {string} date - 日期字符串，格式：YYYY-MM-DD
 * @returns {Object|null} 快照数据或null
 */
function readSnapshotFile(date) {
  const filePath = getSnapshotPath(date);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`读取快照文件失败 (${date}):`, error.message);
    return null;
  }
}

/**
 * 写入指定日期的快照文件
 * @param {string} date - 日期字符串，格式：YYYY-MM-DD
 * @param {Object} snapshotData - 快照数据
 * @returns {boolean} 是否成功
 */
function writeSnapshotFile(date, snapshotData) {
  const filePath = getSnapshotPath(date);
  
  try {
    const content = JSON.stringify(snapshotData, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`因子快照已保存：${filePath}`);
    return true;
  } catch (error) {
    console.error(`保存快照失败 (${date}):`, error.message);
    return false;
  }
}

/**
 * 1. 记录因子快照
 * @param {Object} snapshotData - 快照数据
 * @returns {Promise<boolean>} 是否成功
 */
async function recordSnapshot(snapshotData) {
  try {
    // 验证必要字段
    if (!snapshotData || !snapshotData.stockCode || !snapshotData.timestamp) {
      throw new Error('缺少必要字段: stockCode 和 timestamp');
    }
    
    // 提取日期
    const date = snapshotData.timestamp.split('T')[0];
    
    // 读取现有快照或创建新的
    let snapshot = readSnapshotFile(date);
    if (!snapshot) {
      snapshot = {
        date: date,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        snapshots: []
      };
    }
    
    // 准备快照记录
    const record = {
      stockCode: snapshotData.stockCode,
      stockName: snapshotData.stockName || null,
      timestamp: snapshotData.timestamp,
      
      // 7因子得分
      factors: {
        trend: snapshotData.factors?.trend || 0,
        momentum: snapshotData.factors?.momentum || 0,
        valuation: snapshotData.factors?.valuation || 0,
        capital: snapshotData.factors?.capital || 0,
        earnings: snapshotData.factors?.earnings || 0,
        volatility: snapshotData.factors?.volatility || 0,
        sentiment: snapshotData.factors?.sentiment || 0
      },
      
      // 7因子权重
      weights: {
        trend: snapshotData.weights?.trend || 0.17,
        momentum: snapshotData.weights?.momentum || 0.15,
        valuation: snapshotData.weights?.valuation || 0.15,
        capital: snapshotData.weights?.capital || 0.13,
        earnings: snapshotData.weights?.earnings || 0.13,
        volatility: snapshotData.weights?.volatility || 0.10,
        sentiment: snapshotData.weights?.sentiment || 0.15
      },
      
      // 综合得分和决策
      weightedScore: snapshotData.weightedScore || 0,
      decision: snapshotData.decision || '未定义',
      confidence: snapshotData.confidence || null,
      
      // 风险信息
      riskWarnings: snapshotData.riskWarnings || [],
      blackSwanCheck: snapshotData.blackSwanCheck || false,
      
      // 元数据
      recordedAt: new Date().toISOString(),
      recordId: `${snapshotData.stockCode}_${Date.now()}`
    };
    
    // 检查是否已存在该股票的记录（同一天同一股票）
    const existingIndex = snapshot.snapshots.findIndex(s => 
      s.stockCode === snapshotData.stockCode
    );
    
    if (existingIndex >= 0) {
      // 更新现有记录
      snapshot.snapshots[existingIndex] = record;
    } else {
      // 追加新记录
      snapshot.snapshots.push(record);
    }
    
    snapshot.updatedAt = new Date().toISOString();
    
    // 写入文件
    const success = writeSnapshotFile(date, snapshot);
    return success;
    
  } catch (error) {
    console.error('记录因子快照失败:', error.message);
    return false;
  }
}

/**
 * 2. 查询指定日期的快照
 * @param {string} stockCode - 股票代码
 * @param {string} date - 日期，格式：YYYY-MM-DD
 * @returns {Object|null} 快照数据或null
 */
async function querySnapshot(stockCode, date) {
  try {
    // 读取指定日期的快照文件
    const snapshot = readSnapshotFile(date);
    if (!snapshot || !snapshot.snapshots) {
      return null;
    }
    
    // 查找匹配的股票记录
    const record = snapshot.snapshots.find(s => s.stockCode === stockCode);
    if (!record) {
      return null;
    }
    
    // 返回完整的快照信息
    return {
      date: snapshot.date,
      ...record
    };
    
  } catch (error) {
    console.error(`查询快照失败 (${stockCode}, ${date}):`, error.message);
    return null;
  }
}

/**
 * 3. 查询某日所有股票的快照
 * @param {string} date - 日期，格式：YYYY-MM-DD
 * @returns {Array} 快照数据数组
 */
async function querySnapshotsByDate(date) {
  try {
    // 读取指定日期的快照文件
    const snapshot = readSnapshotFile(date);
    if (!snapshot || !snapshot.snapshots) {
      return [];
    }
    
    // 返回所有快照记录，并添加日期信息
    return snapshot.snapshots.map(record => ({
      date: snapshot.date,
      ...record
    }));
    
  } catch (error) {
    console.error(`查询日期快照失败 (${date}):`, error.message);
    return [];
  }
}

/**
 * 获取快照统计信息
 * @param {string} date - 日期，格式：YYYY-MM-DD
 * @returns {Object|null} 统计信息
 */
async function getSnapshotStats(date) {
  try {
    const snapshot = readSnapshotFile(date);
    if (!snapshot || !snapshot.snapshots) {
      return null;
    }
    
    const snapshots = snapshot.snapshots;
    const total = snapshots.length;
    
    if (total === 0) {
      return {
        date: date,
        totalStocks: 0,
        message: '暂无快照数据'
      };
    }
    
    // 计算决策分布
    const decisions = snapshots.reduce((acc, s) => {
      acc[s.decision] = (acc[s.decision] || 0) + 1;
      return acc;
    }, {});
    
    // 计算平均得分
    const avgScore = snapshots.reduce((sum, s) => sum + (s.weightedScore || 0), 0) / total;
    
    // 风险统计
    const blackSwanCount = snapshots.filter(s => s.blackSwanCheck).length;
    const warningCount = snapshots.reduce((sum, s) => sum + (s.riskWarnings?.length || 0), 0);
    
    return {
      date: date,
      totalStocks: total,
      decisions,
      avgScore: parseFloat(avgScore.toFixed(3)),
      blackSwanCount,
      warningCount,
      confidenceRange: {
        min: Math.min(...snapshots.map(s => s.confidence || 0)),
        max: Math.max(...snapshots.map(s => s.confidence || 0)),
        avg: parseFloat((snapshots.reduce((sum, s) => sum + (s.confidence || 0), 0) / total).toFixed(3))
      }
    };
    
  } catch (error) {
    console.error(`获取统计信息失败 (${date}):`, error.message);
    return null;
  }
}

/**
 * 列出所有可用的快照日期
 * @returns {Array} 日期数组
 */
async function listSnapshotDates() {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      return [];
    }
    
    const files = fs.readdirSync(SNAPSHOTS_DIR);
    const dates = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort()
      .reverse(); // 最新的日期在前
    
    return dates;
  } catch (error) {
    console.error('列出快照日期失败:', error.message);
    return [];
  }
}

/**
 * 清除指定日期的快照
 * @param {string} date - 日期，格式：YYYY-MM-DD
 * @returns {boolean} 是否成功
 */
async function clearSnapshot(date) {
  try {
    const filePath = getSnapshotPath(date);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`已清除快照: ${filePath}`);
      return true;
    }
    
    console.log(`快照文件不存在: ${filePath}`);
    return false;
    
  } catch (error) {
    console.error(`清除快照失败 (${date}):`, error.message);
    return false;
  }
}

module.exports = {
  // 核心功能
  recordSnapshot,
  querySnapshot,
  querySnapshotsByDate,
  
  // 辅助功能
  getSnapshotStats,
  listSnapshotDates,
  clearSnapshot,
  
  // 常量
  SNAPSHOTS_DIR
};