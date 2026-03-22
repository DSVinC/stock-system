/**
 * LLM 情感分析模块测试
 */

const { analyzeWithLLM, analyzeWithKeywords, getLLMStats } = require('./llm-sentiment');

// 测试用例
const testCases = [
  {
    name: '正面新闻测试',
    text: '公司业绩预告超预期，净利润增长 50%',
    expectedScore: { min: 0.5, max: 1.0 },
  },
  {
    name: '负面新闻测试',
    text: '公司涉嫌违规被立案调查',
    expectedScore: { min: -1.0, max: -0.5 },
  },
  {
    name: '中性新闻测试',
    text: '公司发布日常经营公告',
    expectedScore: { min: -0.2, max: 0.2 },
  },
  {
    name: '混合情感测试',
    text: '公司业绩增长但毛利率下滑',
    expectedScore: { min: -0.3, max: 0.5 },
  },
];

// 运行测试
async function runTests() {
  console.log('=== LLM 情感分析模块测试 ===\n');
  
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`测试：${testCase.name}`);
    console.log(`文本：${testCase.text}`);
    
    try {
      const result = analyzeWithKeywords(testCase.text, 'news');
      console.log(`结果：score=${result.score.toFixed(2)}, confidence=${result.confidence.toFixed(2)}`);
      console.log(`关键词：${result.keywords.join(', ')}`);
      
      // 验证得分范围
      if (result.score >= testCase.expectedScore.min && result.score <= testCase.expectedScore.max) {
        console.log('✅ 通过\n');
        passed++;
      } else {
        console.log(`❌ 失败：得分${result.score.toFixed(2)}不在预期范围[${testCase.expectedScore.min}, ${testCase.expectedScore.max}]\n`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ 异常：${error.message}\n`);
      failed++;
    }
  }

  // 统计测试
  console.log('=== 测试统计 ===');
  console.log(`通过：${passed}/${testCases.length}`);
  console.log(`失败：${failed}/${testCases.length}`);
  
  const stats = getLLMStats();
  console.log(`LLM 状态：${stats.llmEnabled ? '已启用' : '未启用（降级模式）'}`);
  console.log(`关键词库：正面${stats.keywordCount.positive}个，负面${stats.keywordCount.negative}个`);
  
  return failed === 0;
}

// 导出测试函数
module.exports = { runTests };

// 如果直接运行
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
