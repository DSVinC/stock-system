/**
 * 策略模板 API
 * 提供策略模板的列表、加载功能
 */

const { getAllTemplates, getTemplateById, getDefaultTemplate } = require('../utils/strategy-template-loader');

const STRATEGY_PROFILES = [
  {
    strategy_type: 'industry_7factor',
    name: '行业 + 七因子',
    category: 'core',
    description: '主策略：行业筛选 + 个股七因子综合评分，适合研究流到执行流主链路。'
  },
  {
    strategy_type: 'trend_following',
    name: '趋势跟踪',
    category: 'satellite',
    description: '以趋势确认和动量延续为核心，适合顺势行情。'
  },
  {
    strategy_type: 'mean_reversion',
    name: '均值回归',
    category: 'satellite',
    description: '利用价格偏离均值后的回归特性，适合震荡行情。'
  },
  {
    strategy_type: 'multi_factor',
    name: '多因子',
    category: 'research',
    description: '组合价值、成长、质量、动量等多维因子进行综合打分。'
  }
];

/**
 * 创建策略模板路由
 */
function createStrategyTemplateRouter(express) {
  const router = express.Router();
  /**
   * GET /list
   * 获取所有策略模板列表
   */
  router.get('/list', (req, res) => {
    try {
      const templates = getAllTemplates(true);
      res.json({
        success: true,
        data: templates,
        count: templates.length
      });
    } catch (error) {
      console.error('[策略模板 API] 获取列表失败:', error);
      res.status(500).json({
        success: false,
        error: '加载策略模板失败',
        message: error.message
      });
    }
  });

  /**
   * GET /profiles
   * 获取策略库 4 类策略画像（V5_009 对接执行）
   */
  router.get('/profiles', (req, res) => {
    res.json({
      success: true,
      data: STRATEGY_PROFILES,
      count: STRATEGY_PROFILES.length
    });
  });

  /**
   * GET /default
   * 获取默认策略模板
   */
  router.get('/default', (req, res) => {
    try {
      const template = getDefaultTemplate();
      
      if (template) {
        res.json({
          success: true,
          data: template
        });
      } else {
        res.status(404).json({
          success: false,
          error: '默认模板不存在',
          message: '未找到默认策略模板'
        });
      }
    } catch (error) {
      console.error('[策略模板 API] 获取默认模板失败:', error);
      res.status(500).json({
        success: false,
        error: '加载默认策略模板失败',
        message: error.message
      });
    }
  });

  /**
   * GET /:id
   * 根据 ID 获取单个策略模板
   */
  router.get('/:id', (req, res) => {
    try {
      const templateId = req.params.id;
      const template = getTemplateById(templateId);
      
      if (template) {
        res.json({
          success: true,
          data: template
        });
      } else {
        res.status(404).json({
          success: false,
          error: '模板不存在',
          message: `未找到模板：${templateId}`
        });
      }
    } catch (error) {
      console.error('[策略模板 API] 获取模板失败:', error);
      res.status(500).json({
        success: false,
        error: '加载策略模板失败',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createStrategyTemplateRouter;
