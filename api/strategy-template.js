/**
 * 策略模板 API
 * 提供策略模板的列表、加载功能
 */

const { getAllTemplates, getTemplateById, getDefaultTemplate } = require('../utils/strategy-template-loader');

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

  return router;
}

module.exports = createStrategyTemplateRouter;
