/**
 * LLM 情感分析模块
 * 
 * 使用 LLM 进行智能情感分析，提升情感判断准确性
 * 支持降级：LLM 失败时回退到关键词匹配
 */

const { calculateSentimentFactor } = require('./sentiment-factor');

// LLM 配置
const LLM_CONFIG = {
  timeout: 3000,  // 3 秒超时
  maxRetries: 2,
};

// 情感分析 Prompt 模板
const SENTIMENT_PROMPT = `你是 A 股情感分析专家。分析以下文本的情感倾向。

输出严格的 JSON 格式（不要其他文字）：
{
  "score": -1.0~+1.0,
  "confidence": 0.0~1.0,
  "reasoning": "50 字内推理",
  "keywords": ["触发词 1", "触发词 2"]
}

示例：
输入："公司业绩预告超预期，净利润增长 50%"
输出：{"score": 0.8, "confidence": 0.9, "reasoning": "业绩超预期，增速显著", "keywords": ["超预期", "增长"]}

输入："公司涉嫌违规被立案调查"
输出：{"score": -0.9, "confidence": 0.95, "reasoning": "违规调查，重大利空", "keywords": ["违规", "立案调查"]}

请分析以下文本：
{text}

{sourceType}类型：{sourceType}
`;

/**
 * 调用 LLM 进行情感分析
 * @param {string} text - 分析文本
 * @param {string} sourceType - 来源类型：'news' | 'announcement'
 * @returns {Promise<Object>} 情感分析结果
 */
async function analyzeWithLLM(text, sourceType = 'news') {
  const prompt = SENTIMENT_PROMPT
    .replace('{text}', text)
    .replace('{sourceType}', sourceType);

  try {
    // 使用 OpenClaw 内置 LLM 调用
    // 注意：实际使用时需要通过 OpenClaw 的 LLM 工具调用
    // 这里使用模拟实现，实际部署时替换为真实 LLM 调用
    const result = await callLLM(prompt);
    return {
      ...result,
      llmUsed: true,
    };
  } catch (error) {
    console.warn(`LLM 情感分析失败，降级到关键词匹配：${error.message}`);
    // 降级到关键词匹配
    const fallbackResult = analyzeWithKeywords(text, sourceType);
    return {
      ...fallbackResult,
      llmUsed: false,
      fallbackReason: error.message,
    };
  }
}

/**
 * 调用 LLM（模拟实现）
 * 实际部署时替换为真实的 LLM 调用
 */
async function callLLM(prompt) {
  // TODO: 实际部署时替换为 OpenClaw LLM 工具调用
  // 示例：const result = await openclaw.llm.complete({ prompt, timeout: 3000 });
  
  // 模拟实现：返回关键词匹配结果
  // 实际使用时需要实现真实的 LLM 调用
  throw new Error('LLM 未配置，使用降级方案');
}

/**
 * 关键词匹配情感分析（降级方案）
 * @param {string} text - 分析文本
 * @param {string} sourceType - 来源类型
 * @returns {Object} 情感分析结果
 */
function analyzeWithKeywords(text, sourceType) {
  // 正面情感词
  const positiveWords = [
    '利好', '增长', '盈利', '突破', '上涨', '创新高', '支持', '订单',
    '签约', '合作', '重组', '并购', '扩张', '获奖', '认可', '领先',
    '超预期', '预增', '扭亏', '复苏', '回暖', '景气'
  ];

  // 负面情感词
  const negativeWords = [
    '利空', '下跌', '亏损', '下滑', '风险', '警告', '违规', '调查',
    '处罚', '减持', '诉讼', '仲裁', '退市', 'ST', '爆雷', '违约',
    '减值', '商誉', '担保', '质押', '冻结', '立案'
  ];

  let positiveCount = 0;
  let negativeCount = 0;
  const keywords = [];

  // 统计正面词
  for (const word of positiveWords) {
    if (text.includes(word)) {
      positiveCount++;
      keywords.push(word);
    }
  }

  // 统计负面词
  for (const word of negativeWords) {
    if (text.includes(word)) {
      negativeCount++;
      keywords.push(word);
    }
  }

  // 计算情感得分
  const total = positiveCount + negativeCount;
  let score = 0;
  let confidence = 0;

  if (total > 0) {
    score = (positiveCount - negativeCount) / total;
    confidence = Math.min(0.5 + total * 0.1, 0.95);
  }

  return {
    score,
    confidence,
    reasoning: total > 0 
      ? `检测到${positiveCount}个正面词，${negativeCount}个负面词`
      : '未检测到明显情感词',
    keywords,
    positiveCount,
    negativeCount,
  };
}

/**
 * 批量 LLM 情感分析
 * @param {Array<{text: string, sourceType: string}>} items - 分析项列表
 * @returns {Promise<Array>} 分析结果列表
 */
async function analyzeWithLLMBatch(items) {
  const results = [];
  
  // 并发处理（限制并发数）
  const concurrency = 5;
  const semaphore = new Semaphore(concurrency);
  
  const tasks = items.map((item, index) => 
    semaphore.wrap(async () => {
      try {
        const result = await analyzeWithLLM(item.text, item.sourceType);
        results[index] = { success: true, data: result };
      } catch (error) {
        results[index] = { 
          success: false, 
          error: error.message,
          data: analyzeWithKeywords(item.text, item.sourceType)
        };
      }
    })
  );
  
  await Promise.all(tasks);
  return results;
}

/**
 * 信号量类（并发控制）
 */
class Semaphore {
  constructor(limit) {
    this.limit = limit;
    this.count = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.count < this.limit) {
      this.count++;
      return Promise.resolve();
    }
    
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.count--;
    if (this.queue.length > 0 && this.count < this.limit) {
      this.count++;
      const next = this.queue.shift();
      next();
    }
  }

  wrap(fn) {
    return async () => {
      await this.acquire();
      try {
        return await fn();
      } finally {
        this.release();
      }
    };
  }
}

/**
 * 获取 LLM 情感分析统计
 * @returns {Object} 统计信息
 */
function getLLMStats() {
  return {
    llmEnabled: false,  // 当前 LLM 未配置
    fallbackEnabled: true,
    keywordCount: {
      positive: 22,
      negative: 22,
    },
  };
}

module.exports = {
  analyzeWithLLM,
  analyzeWithLLMBatch,
  analyzeWithKeywords,
  getLLMStats,
  Semaphore,
};
