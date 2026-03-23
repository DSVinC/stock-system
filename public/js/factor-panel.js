/**
 * 因子权重面板模块
 * Factor Weight Panel Module
 *
 * 用于条件单的多因子评分条件配置
 */

// 默认因子定义（与后端 score-factors.js 保持一致）
const FACTOR_DEFINITIONS = [
  { key: 'trend', name: '趋势因子', defaultWeight: 0.17, description: '基于均线排列和斜率' },
  { key: 'momentum', name: '动能因子', defaultWeight: 0.15, description: '基于MACD和RSI' },
  { key: 'valuation', name: '估值因子', defaultWeight: 0.15, description: '基于PE、PB、历史分位数' },
  { key: 'capital', name: '资金因子', defaultWeight: 0.13, description: '基于主力资金流向' },
  { key: 'earnings', name: '业绩因子', defaultWeight: 0.13, description: '基于营收、净利润增速' },
  { key: 'volatility', name: '波动率因子', defaultWeight: 0.12, description: '基于ATR和布林带' },
  { key: 'sentiment', name: '舆情因子', defaultWeight: 0.15, description: '基于舆情分析' }
];

// 因子面板状态
let factorPanelState = {
  factors: {},
  totalWeight: 1.0,
  previewScore: null,
  stockCode: null
};

/**
 * 初始化因子面板
 * @param {string} containerId - 容器元素ID
 * @param {Object} options - 配置选项
 * @returns {HTMLElement} 面板元素
 */
function initFactorPanel(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Factor panel container not found: ${containerId}`);
    return null;
  }

  // 初始化因子状态
  factorPanelState = {
    factors: {},
    totalWeight: 0,
    previewScore: null,
    stockCode: options.stockCode || null
  };

  // 使用默认权重初始化
  FACTOR_DEFINITIONS.forEach(factor => {
    factorPanelState.factors[factor.key] = {
      enabled: true,
      weight: factor.defaultWeight,
      score: null,
      ...options.initialFactors?.[factor.key]
    };
  });

  // 渲染面板
  renderFactorPanel(container);

  // 绑定事件
  bindFactorPanelEvents(container);

  return container;
}

/**
 * 渲染因子面板
 * @param {HTMLElement} container - 容器元素
 */
function renderFactorPanel(container) {
  const factorsHtml = FACTOR_DEFINITIONS.map(factor => {
    const state = factorPanelState.factors[factor.key];
    return `
      <div class="factor-item ${state.enabled ? '' : 'disabled'}" data-factor-key="${factor.key}">
        <input
          type="checkbox"
          class="factor-checkbox"
          id="factor-${factor.key}-checkbox"
          ${state.enabled ? 'checked' : ''}
          aria-label="启用${factor.name}"
        >
        <div class="factor-info">
          <span class="factor-name">${factor.name}</span>
          <div class="factor-weight-slider">
            <input
              type="range"
              class="weight-slider"
              id="factor-${factor.key}-weight"
              min="0"
              max="50"
              step="1"
              value="${Math.round(state.weight * 100)}"
              ${state.enabled ? '' : 'disabled'}
              aria-label="${factor.name}权重"
            >
            <span class="weight-value" id="factor-${factor.key}-weight-display">${(state.weight * 100).toFixed(0)}%</span>
          </div>
        </div>
        <span class="factor-score-badge" id="factor-${factor.key}-score">
          ${state.score !== null ? state.score.toFixed(2) : '-'}
        </span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="factor-panel">
      <div class="factor-panel-header">
        <div>
          <div class="factor-panel-title">因子权重配置</div>
          <div class="factor-panel-subtitle">选择因子并调整权重，综合评分达到阈值时触发</div>
        </div>
      </div>

      <div class="factor-list" id="factor-list">
        ${factorsHtml}
      </div>

      <div class="factor-panel-footer">
        <div class="score-preview-box">
          <div class="score-preview-label">预估综合评分</div>
          <div class="score-preview-value" id="factor-preview-score">-</div>
        </div>
        <div class="weight-total-box">
          <div class="weight-total-label">权重总计</div>
          <div class="weight-total-value" id="factor-weight-total">100%</div>
        </div>
      </div>

      <div class="factor-hint">
        提示：权重总和应为100%。评分范围0-5分，分数越高代表投资价值越高。
        系统默认权重基于历史数据回测优化得出。
      </div>
    </div>
  `;

  // 更新显示
  updateFactorPanelDisplay();
}

/**
 * 绑定因子面板事件
 * @param {HTMLElement} container - 容器元素
 */
function bindFactorPanelEvents(container) {
  // 因子启用/禁用切换
  container.querySelectorAll('.factor-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const factorItem = e.target.closest('.factor-item');
      const factorKey = factorItem.dataset.factorKey;

      factorPanelState.factors[factorKey].enabled = e.target.checked;
      factorItem.classList.toggle('disabled', !e.target.checked);

      // 禁用时禁用滑块
      const slider = factorItem.querySelector('.weight-slider');
      slider.disabled = !e.target.checked;

      // 重新计算权重
      normalizeWeights();
      updateFactorPanelDisplay();

      // 触发回调
      if (typeof onFactorPanelChange === 'function') {
        onFactorPanelChange(factorPanelState);
      }
    });
  });

  // 权重滑块变化
  container.querySelectorAll('.weight-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const factorItem = e.target.closest('.factor-item');
      const factorKey = factorItem.dataset.factorKey;
      const weightPercent = parseInt(e.target.value);

      factorPanelState.factors[factorKey].weight = weightPercent / 100;

      // 更新显示
      const weightDisplay = factorItem.querySelector('.weight-value');
      weightDisplay.textContent = `${weightPercent}%`;

      // 计算总权重
      calculateTotalWeight();
      updateFactorPanelDisplay();

      // 触发回调
      if (typeof onFactorPanelChange === 'function') {
        onFactorPanelChange(factorPanelState);
      }
    });

    // 滑块释放时归一化权重
    slider.addEventListener('change', () => {
      normalizeWeights();
      updateFactorPanelDisplay();
    });
  });
}

/**
 * 计算总权重
 */
function calculateTotalWeight() {
  let total = 0;
  Object.values(factorPanelState.factors).forEach(factor => {
    if (factor.enabled) {
      total += factor.weight;
    }
  });
  factorPanelState.totalWeight = total;
}

/**
 * 归一化权重（使总和为100%）
 */
function normalizeWeights() {
  calculateTotalWeight();

  if (factorPanelState.totalWeight === 0 || factorPanelState.totalWeight === 1) {
    return;
  }

  const factor = 1 / factorPanelState.totalWeight;

  Object.keys(factorPanelState.factors).forEach(key => {
    const f = factorPanelState.factors[key];
    if (f.enabled) {
      f.weight = Math.min(1, Math.max(0, f.weight * factor));
    }
  });

  factorPanelState.totalWeight = 1;

  // 更新滑块显示
  Object.keys(factorPanelState.factors).forEach(key => {
    const f = factorPanelState.factors[key];
    const slider = document.getElementById(`factor-${key}-weight`);
    const display = document.getElementById(`factor-${key}-weight-display`);

    if (slider && display && f.enabled) {
      slider.value = Math.round(f.weight * 100);
      display.textContent = `${Math.round(f.weight * 100)}%`;
    }
  });
}

/**
 * 更新因子面板显示
 */
function updateFactorPanelDisplay() {
  // 更新总权重显示
  const totalEl = document.getElementById('factor-weight-total');
  if (totalEl) {
    calculateTotalWeight();
    const totalPercent = Math.round(factorPanelState.totalWeight * 100);
    totalEl.textContent = `${totalPercent}%`;
    totalEl.classList.remove('valid', 'invalid');
    totalEl.classList.add(totalPercent === 100 ? 'valid' : 'invalid');
  }

  // 更新预估评分显示
  updatePreviewScore();
}

/**
 * 更新预估评分显示
 */
function updatePreviewScore() {
  const previewEl = document.getElementById('factor-preview-score');
  if (!previewEl) return;

  // 如果有股票代码，尝试获取实时评分
  if (factorPanelState.stockCode && factorPanelState.previewScore !== null) {
    previewEl.textContent = factorPanelState.previewScore.toFixed(2);
  } else {
    // 显示基于默认权重的预期分数范围
    previewEl.textContent = '-';
  }
}

/**
 * 设置因子评分数据（从API获取后调用）
 * @param {Object} scores - 各因子评分 { trend: 3.5, momentum: 4.2, ... }
 */
function setFactorScores(scores) {
  if (!scores || typeof scores !== 'object') return;

  Object.keys(scores).forEach(key => {
    if (factorPanelState.factors[key]) {
      factorPanelState.factors[key].score = scores[key];

      // 更新显示
      const scoreEl = document.getElementById(`factor-${key}-score`);
      if (scoreEl) {
        scoreEl.textContent = scores[key].toFixed(2);
      }
    }
  });

  // 计算加权总分
  calculatePreviewScore();
}

/**
 * 计算预估综合评分
 */
function calculatePreviewScore() {
  let weightedSum = 0;
  let totalWeight = 0;

  Object.keys(factorPanelState.factors).forEach(key => {
    const factor = factorPanelState.factors[key];
    if (factor.enabled && factor.score !== null) {
      weightedSum += factor.score * factor.weight;
      totalWeight += factor.weight;
    }
  });

  if (totalWeight > 0) {
    factorPanelState.previewScore = weightedSum / totalWeight;
  } else {
    factorPanelState.previewScore = null;
  }

  updatePreviewScore();
}

/**
 * 获取因子配置数据
 * @returns {Object} 因子配置
 */
function getFactorConfig() {
  const enabledFactors = {};

  Object.keys(factorPanelState.factors).forEach(key => {
    const factor = factorPanelState.factors[key];
    if (factor.enabled) {
      enabledFactors[key] = {
        weight: factor.weight,
        score: factor.score
      };
    }
  });

  return {
    factors: enabledFactors,
    totalWeight: factorPanelState.totalWeight,
    previewScore: factorPanelState.previewScore,
    isValid: Math.abs(factorPanelState.totalWeight - 1) < 0.01
  };
}

/**
 * 重置因子面板到默认状态
 */
function resetFactorPanel() {
  FACTOR_DEFINITIONS.forEach(factor => {
    factorPanelState.factors[factor.key] = {
      enabled: true,
      weight: factor.defaultWeight,
      score: null
    };
  });

  factorPanelState.totalWeight = 1;
  factorPanelState.previewScore = null;

  const container = document.querySelector('.factor-panel')?.parentElement;
  if (container) {
    renderFactorPanel(container);
    bindFactorPanelEvents(container);
  }
}

/**
 * 设置股票代码并加载评分数据
 * @param {string} stockCode - 股票代码
 */
async function loadFactorScores(stockCode) {
  if (!stockCode) return;

  factorPanelState.stockCode = stockCode;

  try {
    // 尝试获取因子评分数据
    const response = await fetch(`/api/v2/analysis/${encodeURIComponent(stockCode)}`);
    const result = await response.json();

    if (result.success && result.data?.factors) {
      // 从 v2 API 返回的数据中提取因子评分
      const factors = result.data.factors;
      const scores = {};

      Object.keys(factors).forEach(key => {
        if (factors[key]?.score !== undefined) {
          scores[key] = factors[key].score;
        }
      });

      setFactorScores(scores);
    }
  } catch (error) {
    console.warn('加载因子评分失败:', error.message);
  }
}

/**
 * 创建因子面板触发条件配置
 * @param {HTMLElement} row - 条件行元素
 * @param {string} triggerType - 触发类型
 * @param {Object} params - 参数
 */
function renderFactorScoreParams(row, triggerType, params = {}) {
  const paramsEl = row.querySelector('.condition-params');
  if (!paramsEl) return;

  const scoreThreshold = params.score_threshold ?? 3.5;
  const comparison = params.comparison ?? 'above';

  paramsEl.innerHTML = `
    <div>
      <label class="form-label">评分阈值 (0-5分)</label>
      <input
        type="number"
        class="cond-param-input"
        data-param-key="score_threshold"
        placeholder="如 3.5"
        min="0"
        max="5"
        step="0.1"
        value="${scoreThreshold}"
        oninput="updateConditionPreview(this.closest('.condition-item'))"
      >
    </div>
    <div>
      <label class="form-label">触发条件</label>
      <select
        class="cond-param-input"
        data-param-key="comparison"
        onchange="updateConditionPreview(this.closest('.condition-item'))"
      >
        <option value="above" ${comparison === 'above' ? 'selected' : ''}>评分高于阈值</option>
        <option value="below" ${comparison === 'below' ? 'selected' : ''}>评分低于阈值</option>
      </select>
    </div>
  `;

  // 在条件行后面添加因子配置面板
  const existingPanel = row.querySelector('.factor-panel-container');
  if (!existingPanel) {
    const panelContainer = document.createElement('div');
    panelContainer.className = 'factor-panel-container';
    panelContainer.style.gridColumn = '1 / -1';
    row.appendChild(panelContainer);

    // 初始化因子面板
    initFactorPanel(panelContainer, {
      stockCode: window.currentStockCode
    });
  }
}

/**
 * 收集因子评分条件数据
 * @param {HTMLElement} row - 条件行元素
 * @returns {Object} 条件数据
 */
function collectFactorScoreCondition(row) {
  const params = {};
  row.querySelectorAll('.cond-param-input').forEach(input => {
    params[input.dataset.paramKey] = input.type === 'number'
      ? parseFloat(input.value) || 0
      : input.value;
  });

  const factorConfig = getFactorConfig();

  return {
    trigger_type: 'factor_score',
    category: 'composite',
    params: {
      ...params,
      factor_weights: factorConfig.factors
    },
    preview: `多因子评分${params.comparison === 'below' ? '低于' : '高于'} ${params.score_threshold} 分`,
    factorConfig
  };
}

// 回调函数（可被外部覆盖）
let onFactorPanelChange = null;

/**
 * 设置因子面板变化回调
 * @param {Function} callback - 回调函数
 */
function setFactorPanelChangeCallback(callback) {
  onFactorPanelChange = callback;
}

// 导出模块（挂载到 window）
window.FactorPanel = {
  init: initFactorPanel,
  getFactorConfig,
  setFactorScores,
  loadFactorScores,
  reset: resetFactorPanel,
  renderParams: renderFactorScoreParams,
  collectCondition: collectFactorScoreCondition,
  setChangeCallback: setFactorPanelChangeCallback,
  FACTOR_DEFINITIONS
};