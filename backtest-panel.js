/**
 * 回测面板前端逻辑
 * TASK_V3_403
 */

// 状态管理
let optimizationData = null;
let gridConfigData = null;
let monitorStocks = [];

// 页面加载
document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

// 加载数据
async function loadData() {
  showLoading();

  try {
    // 并行加载优化结果和评估
    const [summaryRes, evalRes] = await Promise.all([
      fetch('/api/backtest-to-conditional/summary'),
      fetch('/api/backtest-to-monitor/evaluate')
    ]);

    const summaryData = await summaryRes.json();
    const evalData = await evalRes.json();

    if (!summaryData.success) {
      showEmpty();
      return;
    }

    optimizationData = summaryData.data.optimization;
    gridConfigData = summaryData.data.gridConfig;

    renderSummary();
    renderCombinations();
    renderGridConfig();

    if (evalData.success) {
      renderEvaluation(evalData.data.evaluation);
    }

    showContent();
  } catch (error) {
    console.error('加载数据失败:', error);
    showToast('加载失败: ' + error.message, 'error');
    showEmpty();
  }
}

// 渲染摘要
function renderSummary() {
  if (!optimizationData) return;

  const { bestAllocation, bestMetrics, timestamp, status } = optimizationData;

  // 状态标签
  document.getElementById('statusBadge').textContent = status === 'completed' ? '已完成' : status;
  document.getElementById('statusBadge').className = `status-badge status-${status}`;

  // 时间戳
  if (timestamp) {
    const date = new Date(timestamp);
    document.getElementById('timestampBadge').textContent = date.toLocaleString('zh-CN');
  }

  // 仓位配置
  document.getElementById('coreWeight').textContent = bestAllocation.coreWeightPercent;
  document.getElementById('satelliteWeight').textContent = bestAllocation.satelliteWeightPercent;

  // 绩效指标
  document.getElementById('sharpeRatio').textContent = bestMetrics.sharpeRatio.toFixed(2);
  document.getElementById('maxDrawdown').textContent = (bestMetrics.maxDrawdown * 100).toFixed(2) + '%';
  document.getElementById('annualizedReturn').textContent = (bestMetrics.annualizedReturn * 100).toFixed(2) + '%';
  document.getElementById('calmarRatio').textContent = bestMetrics.calmarRatio.toFixed(2);
  document.getElementById('totalReturn').textContent = (bestMetrics.totalReturn * 100).toFixed(2) + '%';
  document.getElementById('validCombinations').textContent = optimizationData.validCombinations + '/' + optimizationData.totalCombinations;

  // 设置指标颜色
  setMetricClass('sharpeRatio', bestMetrics.sharpeRatio, 1, 2);
  setMetricClass('maxDrawdown', bestMetrics.maxDrawdown, 0.15, 0.1, true);
  setMetricClass('annualizedReturn', bestMetrics.annualizedReturn, 0.1, 0.2);
}

// 设置指标颜色类
function setMetricClass(elementId, value, threshold1, threshold2, inverse = false) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.classList.remove('positive', 'negative', 'neutral');

  if (inverse) {
    if (value <= threshold2) {
      el.classList.add('positive');
    } else if (value <= threshold1) {
      el.classList.add('neutral');
    } else {
      el.classList.add('negative');
    }
  } else {
    if (value >= threshold2) {
      el.classList.add('positive');
    } else if (value >= threshold1) {
      el.classList.add('neutral');
    } else {
      el.classList.add('negative');
    }
  }
}

// 渲染所有组合
function renderCombinations() {
  if (!optimizationData || !optimizationData.allResults) return;

  const tbody = document.getElementById('combinationsBody');
  tbody.innerHTML = '';

  const results = optimizationData.allResults;
  const bestSharpe = optimizationData.bestMetrics.sharpeRatio;

  results.forEach(result => {
    const tr = document.createElement('tr');
    const isBest = result.metrics.sharpeRatio === bestSharpe;

    if (isBest) {
      tr.classList.add('best-row');
    }

    tr.innerHTML = `
      <td>${(result.coreWeight * 100).toFixed(0)}%</td>
      <td>${(result.satelliteWeight * 100).toFixed(0)}%</td>
      <td class="${result.metrics.sharpeRatio >= 2 ? 'positive' : result.metrics.sharpeRatio >= 1 ? 'neutral' : 'negative'}">${result.metrics.sharpeRatio.toFixed(2)}</td>
      <td class="${result.metrics.maxDrawdown <= 0.1 ? 'positive' : result.metrics.maxDrawdown <= 0.15 ? 'neutral' : 'negative'}">${(result.metrics.maxDrawdown * 100).toFixed(2)}%</td>
      <td class="${result.metrics.annualizedReturn >= 0.2 ? 'positive' : result.metrics.annualizedReturn >= 0.1 ? 'neutral' : 'negative'}">${(result.metrics.annualizedReturn * 100).toFixed(2)}%</td>
      <td>${result.metrics.calmarRatio.toFixed(2)}</td>
      <td><span class="status-dot ${result.valid ? 'valid' : 'invalid'}"></span>${result.valid ? '有效' : '无效'}</td>
    `;

    tbody.appendChild(tr);
  });

  document.getElementById('combinationsPanel').style.display = 'block';
}

// 渲染网格配置
function renderGridConfig() {
  if (!gridConfigData) {
    document.getElementById('gridConfigPanel').style.display = 'none';
    return;
  }

  document.getElementById('gridStep').textContent = ((gridConfigData.gridStep || 0.012) * 100).toFixed(1) + '%';
  document.getElementById('singleAmount').textContent = (gridConfigData.singleAmount || 30000).toLocaleString() + ' 元';
  document.getElementById('trendFilter').textContent = gridConfigData.trendFilter ? '开启' : '关闭';

  document.getElementById('gridConfigPanel').style.display = 'block';
}

// 渲染评估结果
function renderEvaluation(evaluation) {
  document.getElementById('recommendScore').textContent = evaluation.score;

  const reasonsContainer = document.getElementById('recommendReasons');
  reasonsContainer.innerHTML = evaluation.reasons.map(r => `<div class="reason-item">✓ ${r}</div>`).join('');
}

// 显示状态控制
function showLoading() {
  document.getElementById('loadingState').style.display = 'flex';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultContent').style.display = 'none';
}

function showEmpty() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('emptyState').style.display = 'flex';
  document.getElementById('resultContent').style.display = 'none';
}

function showContent() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('resultContent').style.display = 'block';
}

// 刷新数据
function refreshData() {
  loadData();
  showToast('数据已刷新', 'success');
}

// 打开导出弹窗
function openExportModal() {
  document.getElementById('exportModal').classList.add('active');
  document.getElementById('exportPreview').style.display = 'none';
}

// 打开监控池弹窗
function openMonitorModal() {
  document.getElementById('monitorModal').classList.add('active');
  monitorStocks = [];
  renderMonitorStockList();
}

// 关闭弹窗
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// 预览导出
async function previewExport() {
  const stockCode = document.getElementById('exportStockCode').value.trim();
  const stockName = document.getElementById('exportStockName').value.trim();
  const accountId = document.getElementById('exportAccountId').value;

  if (!stockCode) {
    showToast('请输入股票代码', 'error');
    return;
  }

  const orderTypes = Array.from(document.querySelectorAll('input[name="orderTypes"]:checked'))
    .map(cb => cb.value);

  if (orderTypes.length === 0) {
    showToast('请至少选择一种条件单类型', 'error');
    return;
  }

  try {
    const res = await fetch('/api/backtest-to-conditional/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ts_code: stockCode,
        stock_name: stockName,
        account_id: parseInt(accountId)
      })
    });

    const data = await res.json();

    if (data.success) {
      const orders = data.data.orders.filter(o => orderTypes.includes(o.order_type));
      renderExportPreview(orders);
      document.getElementById('exportPreview').style.display = 'block';
    } else {
      showToast(data.error || '预览失败', 'error');
    }
  } catch (error) {
    showToast('请求失败: ' + error.message, 'error');
  }
}

// 渲染导出预览
function renderExportPreview(orders) {
  const container = document.getElementById('exportPreviewContent');
  container.innerHTML = orders.map(order => `
    <div class="preview-item">
      <span class="preview-type ${order.action}">${getOrderTypeName(order.order_type)}</span>
      <span class="preview-action">${order.action === 'buy' ? '买入' : '卖出'}</span>
      <span class="preview-position">${order.position_pct}%</span>
      <span class="preview-condition">${formatCondition(order.conditions)}</span>
    </div>
  `).join('');
}

// 执行导出
async function executeExport() {
  const stockCode = document.getElementById('exportStockCode').value.trim();
  const stockName = document.getElementById('exportStockName').value.trim();
  const accountId = document.getElementById('exportAccountId').value;

  if (!stockCode) {
    showToast('请输入股票代码', 'error');
    return;
  }

  const orderTypes = Array.from(document.querySelectorAll('input[name="orderTypes"]:checked'))
    .map(cb => cb.value);

  try {
    const res = await fetch('/api/backtest-to-conditional/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ts_code: stockCode,
        stock_name: stockName,
        account_id: parseInt(accountId),
        order_types: orderTypes
      })
    });

    const data = await res.json();

    if (data.success) {
      showToast(`成功创建 ${data.data.success} 个条件单`, 'success');
      closeModal('exportModal');
    } else {
      showToast(data.error || '导出失败', 'error');
    }
  } catch (error) {
    showToast('请求失败: ' + error.message, 'error');
  }
}

// 添加监控池股票
function addMonitorStock() {
  const stockCode = prompt('输入股票代码（如 600519.SH）:');
  const stockName = prompt('输入股票名称:');

  if (stockCode) {
    monitorStocks.push({
      ts_code: stockCode,
      stock_name: stockName || stockCode
    });
    renderMonitorStockList();
  }
}

// 渲染监控池股票列表
function renderMonitorStockList() {
  const container = document.getElementById('monitorStockList');
  container.innerHTML = monitorStocks.map((stock, index) => `
    <div class="stock-item">
      <span>${stock.stock_name} (${stock.ts_code})</span>
      <button class="remove-btn" onclick="removeMonitorStock(${index})">×</button>
    </div>
  `).join('');
}

// 移除监控池股票
function removeMonitorStock(index) {
  monitorStocks.splice(index, 1);
  renderMonitorStockList();
}

// 执行推荐到监控池
async function executeMonitorRecommend() {
  if (monitorStocks.length === 0) {
    showToast('请添加至少一只股票', 'error');
    return;
  }

  try {
    const res = await fetch('/api/backtest-to-monitor/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stocks: monitorStocks })
    });

    const data = await res.json();

    if (data.success) {
      showToast(`成功添加 ${data.data.added} 只股票到监控池`, 'success');
      closeModal('monitorModal');
    } else {
      showToast(data.error || '推荐失败', 'error');
    }
  } catch (error) {
    showToast('请求失败: ' + error.message, 'error');
  }
}

// 获取条件单类型名称
function getOrderTypeName(type) {
  const names = {
    core_entry: '核心仓入场',
    satellite_entry: '卫星仓入场',
    stop_loss: '止损单',
    take_profit: '止盈单'
  };
  return names[type] || type;
}

// 格式化条件
function formatCondition(conditions) {
  if (!conditions || conditions.length === 0) return '-';

  return conditions.map(c => {
    if (c.trigger_type) {
      const typeNames = {
        ma_golden_cross: 'MA金叉',
        ma_death_cross: 'MA死叉',
        daily_loss: `日跌${c.params?.percent || 0}%`,
        daily_gain: `日涨${c.params?.percent || 0}%`,
        price_above: `价格>${c.params?.price}`,
        price_below: `价格<${c.params?.price}`
      };
      return typeNames[c.trigger_type] || c.trigger_type;
    }
    return `${c.type} ${c.operator} ${c.value}`;
  }).join(' & ');
}

// 显示提示
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} active`;

  setTimeout(() => {
    toast.classList.remove('active');
  }, 3000);
}