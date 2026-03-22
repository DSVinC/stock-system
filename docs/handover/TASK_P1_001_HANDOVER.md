# TASK_P1_001 交接文档

**任务名称**: LLM 情感分析模块  
**创建时间**: 2026-03-22 19:45  

---

## 🎯 任务目标

将现有关键词匹配情感分析升级为 LLM 驱动的智能情感分析。

---

## 📋 核心需求

1. **LLM 集成**: 使用 OpenClaw 内置 LLM（百炼/火山引擎）
2. **降级机制**: LLM 失败时回退到关键词匹配
3. **超时控制**: ≤3 秒
4. **输出格式**: JSON 结构化（score, confidence, reasoning, keywords）

---

## 🔧 技术要点

### Prompt 设计
- 系统提示词定义 A 股情感分析专家角色
- 强制 JSON 输出格式
- 包含正/负面示例

### 降级逻辑
```javascript
try {
  return await callLLM(text, { timeout: 3000 });
} catch (e) {
  return analyzeWithKeywords(text);
}
```

---

## 📁 相关文件

- 输入：`api/sentiment-factor.js` (现有模块)
- 输出：`api/llm-sentiment.js` (新模块)
- 配置：`config/llm-config.json` (如需)

---

## ✅ 验收标准

详见 `docs/tasks/TASK_P1_001.md`
