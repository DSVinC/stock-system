    function applyStrategyToUI(strategy, copiedData) {
      const config = getConfig();

      // 应用七因子最低评分
      if (strategy.seven_factor_min_score) {
        const minScore = Math.round(strategy.seven_factor_min_score * 100);
        document.getElementById('configMinScore').value = minScore;
        config.minScore = minScore;
      }

      // 保存复制后的策略副本身份信息，标记来源为策略配置
      if (copiedData) {
        config.strategyConfigId = copiedData.id;
        config.strategyConfigName = copiedData.name;
        config.strategySource = 'strategy_config';
        
        // 兼容旧版本，templateId/templateName 回填为策略配置 ID
        config.templateId = copiedData.id;
        config.templateName = copiedData.name;
      }

      saveConfig(config);

      // 应用其他参数（如果有）
      // 可以根据实际需求扩展

      console.log('[导入策略] 已应用参数:', strategy);
    }
