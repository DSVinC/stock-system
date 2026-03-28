/**
 * 策略模板加载工具
 * 支持从 JSON 文件加载策略模板
 */

const fs = require('fs');
const path = require('path');

// 模板目录路径
const TEMPLATES_DIR = path.join(__dirname, '..', 'strategy_templates');

// 模板缓存
let templatesCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 60000; // 缓存 60 秒

/**
 * 获取所有策略模板
 * @param {boolean} useCache 是否使用缓存，默认 true
 * @returns {Object[]} 模板数组
 */
function getAllTemplates(useCache = true) {
  const now = Date.now();

  if (useCache && templatesCache && (now - lastLoadTime) < CACHE_TTL) {
    return templatesCache;
  }

  try {
    const files = fs.readdirSync(TEMPLATES_DIR);
    const templates = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(TEMPLATES_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const template = JSON.parse(content);
        template._source_file = file;
        templates.push(template);
      }
    }

    templatesCache = templates;
    lastLoadTime = now;

    return templates;
  } catch (error) {
    console.error('[策略模板] 加载模板失败:', error);
    return [];
  }
}

/**
 * 根据 template_id 获取模板
 * @param {string} templateId 模板 ID
 * @returns {Object|null} 模板对象，不存在返回 null
 */
function getTemplateById(templateId) {
  const templates = getAllTemplates();
  return templates.find(t => t.template_id === templateId) || null;
}

/**
 * 获取默认模板
 * @returns {Object|null} 默认模板对象，不存在返回 null
 */
function getDefaultTemplate() {
  const templates = getAllTemplates();
  return templates.find(t => t.is_default === true) || templates[0] || null;
}

/**
 * 验证模板结构
 * @param {Object} template 模板对象
 * @returns {{ valid: boolean, errors: string[] }} 验证结果
 */
function validateTemplate(template) {
  const errors = [];

  // 必填字段检查
  const requiredFields = ['template_id', 'name', 'description', 'params', 'compatible_with'];
  for (const field of requiredFields) {
    if (!template[field]) {
      errors.push(`缺少必填字段: ${field}`);
    }
  }

  // template_id 格式检查 (允许大写字母、数字和下划线)
  if (template.template_id && !/^[A-Z][A-Z0-9_]*$/.test(template.template_id)) {
    errors.push('template_id 必须以大写字母开头，仅包含大写字母、数字和下划线');
  }

  // compatible_with 检查
  const validModules = ['selection', 'backtest', 'monitor'];
  if (template.compatible_with && Array.isArray(template.compatible_with)) {
    for (const mod of template.compatible_with) {
      if (!validModules.includes(mod)) {
        errors.push(`不支持的模块: ${mod}`);
      }
    }
  }

  // 权重总和检查
  if (template.params) {
    const industryWeights = template.params.industry_weights;
    if (industryWeights) {
      const sum = Object.values(industryWeights).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.01) {
        errors.push(`行业权重总和必须为 1，当前为 ${sum.toFixed(2)}`);
      }
    }

    const factorWeights = template.params.factor_weights;
    if (factorWeights) {
      const sum = Object.values(factorWeights).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.01) {
        errors.push(`因子权重总和必须为 1，当前为 ${sum.toFixed(2)}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 将模板参数转换为数据库配置格式
 * @param {Object} template 模板对象
 * @returns {Object} 数据库配置格式
 */
function templateToDbConfig(template) {
  if (!template || !template.params) {
    return null;
  }

  const { params } = template;

  return {
    name: template.name,
    version: template.version || '1.0.0',
    description: template.description,
    // 四维度权重
    policy_weight: params.industry_weights?.policy || 0.25,
    commercialization_weight: params.industry_weights?.commercial || 0.25,
    sentiment_weight: params.industry_weights?.sentiment || 0.25,
    capital_weight: params.industry_weights?.social || 0.25,
    // 选股参数
    revenue_growth_min: params.selection?.revenue_growth_min || 0.20,
    gross_margin_min: params.selection?.gross_margin_min || 0.25,
    sentiment_top_percentile: params.selection?.industry_top_n ? params.selection.industry_top_n / 100 : 0.20,
    seven_factor_min_score: params.selection?.min_seven_factor_score || 0.75,
    pe_max: params.selection?.pe_max || 60,
    peg_max: params.selection?.peg_max || 2.0,
    // 仓位配置
    core_ratio: params.position?.core_ratio || 0.75,
    satellite_ratio: params.position?.satellite_ratio || 0.25,
    satellite_count: params.position?.satellite_count || 3,
    // 网格配置
    grid_step: params.grid?.step || 0.012,
    grid_price_range: params.grid?.price_range || '3_months',
    grid_single_amount: params.grid?.single_amount || 30000,
    grid_trend_filter: params.grid?.trend_filter !== false,
    // 风控参数
    max_drawdown: params.risk_control?.max_drawdown || -0.20,
    min_annual_return: params.risk_control?.min_annual_return || 0.15,
    min_win_rate: params.risk_control?.min_win_rate || 0.55,
    // 默认设置
    is_default: template.is_default ? 1 : 0,
    created_by: 'template:' + template.template_id
  };
}

/**
 * 清除模板缓存
 */
function clearCache() {
  templatesCache = null;
  lastLoadTime = 0;
}

/**
 * 获取模板文件路径
 * @param {string} templateId 模板 ID
 * @returns {string|null} 文件路径，不存在返回 null
 */
function getTemplateFilePath(templateId) {
  const templates = getAllTemplates();
  const template = templates.find(t => t.template_id === templateId);
  if (template && template._source_file) {
    return path.join(TEMPLATES_DIR, template._source_file);
  }
  return null;
}

module.exports = {
  getAllTemplates,
  getTemplateById,
  getDefaultTemplate,
  validateTemplate,
  templateToDbConfig,
  clearCache,
  getTemplateFilePath,
  TEMPLATES_DIR
};