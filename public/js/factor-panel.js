/**
 * 因子权重面板模块
 * Factor Weight Panel Module
 *
 * 用于条件单的多因子评分条件配置
 */

// 因子分类定义
const FACTOR_CATEGORIES = {
  technical: { name: '技术面因子', key: 'technical' },
  fundamental: { name: '基本面因子', key: 'fundamental' },
  capital: { name: '资金面因子', key: 'capital' }
};

// 默认因子定义（与后端 score-factors.js 保持一致）
const FACTOR_DEFINITIONS = [
  // 技术面因子
  { key: 'trend', name: '趋势因子', defaultWeight: 0.20, category: 'technical', isDefault: true, description: '基于均线排列和斜率' },
  { key: 'momentum', name: '动能因子', defaultWeight: 0.18, category: 'technical', isDefault: true, description: '基于MACD和RSI' },
  { key: 'volatility', name: '波动率因子', defaultWeight: 0.12, category: 'technical', isDefault: false, description: '基于ATR和布林带' },
  // 基本面因子
  { key: 'valuation', name: '估值因子', defaultWeight: 0.18, category: 'fundamental', isDefault: true, description: '基于PE、PB、历史分位数' },
  { key: 'earnings', name: '业绩因子', defaultWeight: 0.15, category: 'fundamental', isDefault: false, description: '基于营收、净利润增速' },
  // 资金面因子
  { key: 'capital', name: '资金因子', defaultWeight: 0.12, category: 'capital', isDefault: true, description: '基于主力资金流向' },
  { key: 'sentiment', name: '舆情因子', defaultWeight: 0.05, category: 'capital', isDefault: false, description: '基于舆情分析' }
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
 */
function initFactorPanel(containerId, options = {}) {
  const container = typeof containerId === 'string'
    ? document.getElementById(containerId)
    : containerId;

  if (!container) {
    console.error('Factor panel container not found');
    return null;
  }

  // 初始化因子状态
  factorPanelState = {
    factors: {},
    totalWeight: 0,
    previewScore: null,
    stockCode: options.stockCode || null
  };

  // 使用默认权重初始化，仅默认选中核心因子
  FACTOR_DEFINITIONS.forEach(factor => {
    factorPanelState.factors[factor.key] = {
      enabled: factor.isDefault || false,
      weight: factor.defaultWeight,
      score: null
    };
  });

  // 如果有初始因子配置，覆盖默认值
  if (options.initialFactors) {
    Object.keys(options.initialFactors).forEach(key => {
      if (factorPanelState.factors[key]) {
        factorPanelState.factors[key] = {
          ...factorPanelState.factors[key],
          ...options.initialFactors[key]
        };
      }
    });
  }

  // 渲染面板
  renderFactorPanel(container);

  // 绑定事件
  bindFactorPanelEvents(container);

  return container;
}

/**
 * 渲染因子面板
 */
function renderFactorPanel(container) {
  // 按分类渲染因子列表
  const categoriesHtml = Object.keys(FACTOR_CATEGORIES).map(catKey => {
    const category = FACTOR_CATEGORIES[catKey];
    const catFactors = FACTOR_DEFINITIONS.filter(f => f.category === catKey);

    const factorsHtml = catFactors.map(factor => {
      const state = factorPanelState.factors[factor.key];
      const weightPercent = Math.round(state.weight * 100);

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
                max="100"
                step="1"
                value="${weightPercent}"
                ${state.enabled ? '' : 'disabled'}
                aria-label="${factor.name}权重"
              >
              <span class="weight-value" id="factor-${factor.key}-weight-display">${weightPercent}%</span>
            </div>
          </div>
          <span class="factor-score-badge" id="factor-${factor.key}-score">
            ${state.score !== null ? state.score.toFixed(2) : '-'}
          </span>
        </div>
      `;
    }).join('');

    return `
      <div class="factor-category" data-category="${catKey}">
        <div class="factor-category-header">
          <span class="factor-category-name">${category.name}</span>
          <span class="factor-category-count" id="category-${catKey}-count">0/0</span>
        </div>
        <div class="factor-category-list">
          ${factorsHtml}
        </div>
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
        <div class="factor-panel-actions">
          <button type="button" class="factor-action-btn" id="factor-select-all">全选</button>
          <button type="button" class="factor-action-btn" id="factor-clear-all">清空</button>
        </div>
      </div>

      <div class="factor-list" id="factor-list">
        ${categoriesHtml}
      </div>

      <div class="factor-panel-footer">
        <div class="score-preview-box">
          <div class="score-preview-label">预估综合评分</div>
          <div class="score-preview-value" id="factor-preview-score">-</div>
        </div>
        <div class="weight-total-box">
          <div class="weight-total-label">权重总计</div>
          <div class="weight-total-value" id="factor-weight-total">0%</div>
        </div>
      </div>

      <div class="factor-hint">
        提示：权重总和应为100%。评分范围0-5分，分数越高代表投资价值越高。
        默认选中4个核心因子（趋势、动能、估值、资金）。
      </div>
    </div>
  `;

  // 更新显示
  updateFactorPanelDisplay();
}

/**
 * 绑定因子面板事件
 */
function bindFactorPanelEvents(container) {
  // 全选按钮
  const selectAllBtn = container.querySelector('#factor-select-all');
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      Object.keys(factorPanelState.factors).forEach(key => {
        factorPanelState.factors[key].enabled = true;
      });
      normalizeWeights();
      reRenderFactorItems(container);
      updateFactorPanelDisplay();
      triggerChangeCallback();
    });
  }

  // 清空按钮
  const clearAllBtn = container.querySelector('#factor-clear-all');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      Object.keys(factorPanelState.factors).forEach(key => {
        factorPanelState.factors[key].enabled = false;
      });
      reRenderFactorItems(container);
      updateFactorPanelDisplay();
      triggerChangeCallback();
    });
  }

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
      triggerChangeCallback();
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
      triggerChangeCallback();
    });

    // 滑块释放时归一化权重
    slider.addEventListener('change', () => {
      normalizeWeights();
      updateFactorPanelDisplay();
    });
  });
}

/**
 * 重新渲染因子项（用于全选/清空后刷新UI）
 */
function reRenderFactorItems(container) {
  FACTOR_DEFINITIONS.forEach(factor => {
    const state = factorPanelState.factors[factor.key];
    const factorItem = container.querySelector(`[data-factor-key="${factor.key}"]`);
    if (!factorItem) return;

    const checkbox = factorItem.querySelector('.factor-checkbox');
    const slider = factorItem.querySelector('.weight-slider');
    const weightDisplay = factorItem.querySelector('.weight-value');

    checkbox.checked = state.enabled;
    factorItem.classList.toggle('disabled', !state.enabled);
    slider.disabled = !state.enabled;

    if (state.enabled) {
      slider.value = Math.round(state.weight * 100);
      weightDisplay.textContent = `${Math.round(state.weight * 100)}%`;
    }
  });
}

/**
 * 触发变化回调
 */
function triggerChangeCallback() {
  if (typeof onFactorPanelChange === 'function') {
    onFactorPanelChange(factorPanelState);
  }
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

  // 更新各分类的选中计数
  Object.keys(FACTOR_CATEGORIES).forEach(catKey => {
    const catFactors = FACTOR_DEFINITIONS.filter(f => f.category === catKey);
    const enabledCount = catFactors.filter(f => factorPanelState.factors[f.key]?.enabled).length;
    const countEl = document.getElementById(`category-${catKey}-count`);
    if (countEl) {
      countEl.textContent = `${enabledCount}/${catFactors.length}`;
    }
  });

  // 重新计算并更新预估评分显示
  calculatePreviewScore();

  // 更新权重校验提示
  updateWeightValidation();
}

/**
 * 更新预估评分显示
 */
function updatePreviewScore() {
  const previewEl = document.getElementById('factor-preview-score');
  if (!previewEl) return;

  if (factorPanelState.previewScore !== null) {
    previewEl.textContent = `${factorPanelState.previewScore.toFixed(1)} 分`;
    previewEl.classList.remove('no-score');
  } else {
    previewEl.textContent = '-';
    previewEl.classList.add('no-score');
  }
}

/**
 * 更新权重校验提示
 */
function updateWeightValidation() {
  const totalEl = document.getElementById('factor-weight-total');
  const hintEl = document.querySelector('.factor-hint');
  if (!totalEl || !hintEl) return;

  const totalPercent = Math.round(factorPanelState.totalWeight * 100);
  const isValid = totalPercent === 100;

  // 更新权重校验状态
  totalEl.classList.remove('valid', 'invalid', 'warning');
  if (isValid) {
    totalEl.classList.add('valid');
    hintEl.classList.remove('error');
    hintEl.textContent = '提示：权重总和为100%。评分范围0-5分，分数越高代表投资价值越高。';
  } else if (totalPercent > 100) {
    totalEl.classList.add('invalid');
    hintEl.classList.add('error');
    hintEl.textContent = `警告：权重总和${totalPercent}%，超过100%！请调整权重。`;
  } else {
    totalEl.classList.add('warning');
    hintEl.classList.add('error');
    hintEl.textContent = `提示：权重总和${totalPercent}%，不足100%。建议调整至100%。`;
  }
}

/**
 * 设置因子评分数据
 */
function setFactorScores(scores) {
  if (!scores || typeof scores !== 'object') return;

  Object.keys(scores).forEach(key => {
    if (factorPanelState.factors[key]) {
      factorPanelState.factors[key].score = scores[key];

      const scoreEl = document.getElementById(`factor-${key}-score`);
      if (scoreEl) {
        scoreEl.textContent = scores[key].toFixed(2);
      }
    }
  });

  calculatePreviewScore();
}

/**
 * 计算预估综合评分
 */
function calculatePreviewScore() {
  let weightedSum = 0;
  let totalWeight = 0;
  let hasScore = false;

  Object.keys(factorPanelState.factors).forEach(key => {
    const factor = factorPanelState.factors[key];
    if (factor.enabled && factor.score !== null) {
      weightedSum += factor.score * factor.weight;
      totalWeight += factor.weight;
      hasScore = true;
    }
  });

  if (hasScore && totalWeight > 0) {
    factorPanelState.previewScore = weightedSum / totalWeight;
  } else {
    factorPanelState.previewScore = null;
  }

  updatePreviewScore();
}

/**
 * 获取因子配置数据
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
      enabled: factor.isDefault || false,
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
 */
async function loadFactorScores(stockCode) {
  if (!stockCode) return;

  factorPanelState.stockCode = stockCode;

  try {
    const response = await fetch(`/api/v2/analysis/${encodeURIComponent(stockCode)}`);
    const result = await response.json();

    if (result.success && result.data?.factors) {
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

// 回调函数（可被外部覆盖）
let onFactorPanelChange = null;

/**
 * 设置因子面板变化回调
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
  setChangeCallback: setFactorPanelChangeCallback,
  FACTOR_DEFINITIONS
};