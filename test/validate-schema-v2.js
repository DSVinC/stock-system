// Schema 校验脚本 - v2 结构化输出
const fs = require('fs');

const schema = {
  strategies: {
    aggressive: { type: 'object', required: ['risk_level', 'actions', 'summary_text'] },
    balanced: { type: 'object', required: ['risk_level', 'actions', 'summary_text'] },
    conservative: { type: 'object', required: ['risk_level', 'actions', 'summary_text'] }
  },
  operations: {
    short_term: { type: 'object', required: ['buy_zone', 'stop_loss', 'summary'] }
  },
  target_prices: { type: 'array', itemSchema: { type: 'object', required: ['period', 'price', 'logic'] } }
};

function validate(data, path = '') {
  const errors = [];
  
  // 验证 strategies
  if (data.strategies) {
    for (const [riskType, config] of Object.entries(schema.strategies)) {
      const strategy = data.strategies[riskType];
      if (!strategy) {
        errors.push(`${path}strategies.${riskType} 缺失`);
        continue;
      }
      if (typeof strategy !== 'object' || Array.isArray(strategy)) {
        errors.push(`${path}strategies.${riskType} 应该是对象`);
        continue;
      }
      for (const field of config.required) {
        if (!(field in strategy)) {
          errors.push(`${path}strategies.${riskType}.${field} 缺失`);
        }
      }
      if (strategy.actions && !Array.isArray(strategy.actions)) {
        errors.push(`${path}strategies.${riskType}.actions 应该是数组`);
      }
    }
  }
  
  // 验证 target_prices
  if (data.target_prices) {
    if (!Array.isArray(data.target_prices)) {
      errors.push(`${path}target_prices 应该是数组`);
    } else {
      data.target_prices.forEach((item, i) => {
        if (typeof item !== 'object' || Array.isArray(item)) {
          errors.push(`${path}target_prices[${i}] 应该是对象`);
        } else if (!('period' in item) || !('price' in item)) {
          errors.push(`${path}target_prices[${i}] 缺少 period 或 price`);
        }
      });
    }
  }
  
  return errors;
}

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('用法：node validate-schema-v2.js <json-file>');
  process.exit(1);
}

try {
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const errors = validate(data);
  
  if (errors.length === 0) {
    console.log('✅ Schema 校验通过！');
    process.exit(0);
  } else {
    console.log('❌ Schema 校验失败：');
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
} catch (err) {
  console.error('❌ JSON 解析失败:', err.message);
  process.exit(1);
}
