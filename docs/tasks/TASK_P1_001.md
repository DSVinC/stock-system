# TASK_P1_001 - LLM 情感分析模块

**优先级**: P1  
**类型**: 功能增强  
**状态**: `pending`  
**创建时间**: 2026-03-22 19:45  

---

## 📋 任务描述

将现有的关键词匹配情感分析升级为 LLM 驱动的智能情感分析，提升情感判断准确性。

**现状问题**:
- 当前 `api/sentiment-factor.js` 使用简单关键词匹配
- 无法理解上下文语义（如"业绩下滑但超预期"）
- 无法识别反讽、委婉表达
- 情感强度判断粗糙（只有正/负，没有程度）

**目标**:
- 使用 LLM 分析新闻标题和公告内容
- 输出结构化情感评分（-1.0 ~ +1.0）
- 支持置信度评估
- 保留关键词匹配作为兜底

---

## 🎯 验收标准

### 1. 功能要求
- [ ] 创建 `api/llm-sentiment.js` 模块
- [ ] 导出函数：`analyzeWithLLM(text, sourceType)`
- [ ] 返回格式：
  ```javascript
  {
    score: -1.0 ~ +1.0,  // 情感得分
    confidence: 0.0 ~ 1.0,  // 置信度
    reasoning: string,  // 简要推理
    keywords: string[],  // 触发词
    llmUsed: boolean  // 是否使用 LLM
  }
  ```

### 2. LLM 集成
- [ ] 使用 OpenClaw 内置 LLM（百炼/火山引擎）
- [ ] 支持降级：LLM 失败时回退到关键词匹配
- [ ] 调用超时：≤3 秒
- [ ] 批量处理：支持一次分析多条新闻

### 3. Prompt 设计
- [ ] 系统提示词定义清晰
- [ ] 输出格式强制 JSON
- [ ] 包含 A 股语境示例
- [ ] 支持新闻/公告两种类型

### 4. 性能要求
- [ ] 单条分析：≤3 秒
- [ ] 批量分析（10 条）：≤10 秒
- [ ] 降级响应：≤500ms

### 5. 测试要求
- [ ] 单元测试覆盖率 ≥80%
- [ ] 测试用例包含边界情况
- [ ] 测试 LLM 降级逻辑

---

## 📁 交付物

- [ ] `api/llm-sentiment.js` (新模块)
- [ ] `api/llm-sentiment.test.js` (测试)
- [ ] `docs/prompts/llm-sentiment-prompt.md` (Prompt 文档)
- [ ] `docs/tasks/TASK_P1_001.md` (任务文档)
- [ ] `docs/handover/TASK_P1_001_HANDOVER.md` (交接文档)
- [ ] `docs/runtime/TASK_P1_001_STATUS.md` (运行时状态)
- [ ] `docs/acceptance/TASK_P1_001_ACCEPTANCE.md` (验收报告)

---

## 🔗 依赖关系

- 依赖：`api/sentiment-factor.js` (现有模块)
- 被依赖：TASK_P1_002 (异步流水线)

---

## 📝 实现提示

### Prompt 设计建议
```
你是 A 股情感分析专家。分析以下文本的情感倾向。

输出 JSON 格式：
{
  "score": -1.0~+1.0,
  "confidence": 0.0~1.0,
  "reasoning": "50 字内推理",
  "keywords": ["触发词 1", "触发词 2"]
}

示例：
输入："公司业绩预告超预期，净利润增长 50%"
输出：{"score": 0.8, "confidence": 0.9, "reasoning": "业绩超预期，增速显著", "keywords": ["超预期", "增长"]}
```

### 降级逻辑
```javascript
try {
  const result = await callLLM(text, { timeout: 3000 });
  return result;
} catch (e) {
  // 降级到关键词匹配
  return analyzeWithKeywords(text);
}
```

---

## ⏱️ 预估工时

- 开发：2 小时
- 测试：1 小时
- 验收：30 分钟
