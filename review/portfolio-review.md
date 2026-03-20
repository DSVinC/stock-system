# Phase 2: 账户API (portfolio.js) 验收任务

## 你的身份
你是代码审查专家，负责验收股票投资系统的账户API模块。

## 验收目标
审查 `/Users/vvc/.openclaw/workspace/stock-system/api/portfolio.js` 代码质量。

## 审查清单

### 1. 功能完整性
- [ ] 创建账户接口正常工作
- [ ] 查询账户列表接口正常工作
- [ ] 查询账户详情接口正常工作
- [ ] 更新账户接口正常工作
- [ ] 删除账户接口正常工作
- [ ] 获取持仓列表接口正常工作
- [ ] 获取交易记录接口正常工作

### 2. 代码质量
- [ ] 代码结构清晰，函数职责单一
- [ ] 错误处理完善（try-catch）
- [ ] 数据库操作使用参数化查询（防SQL注入）
- [ ] API返回格式统一
- [ ] 输入参数校验

### 3. 安全性
- [ ] 无SQL注入风险
- [ ] 无XSS风险
- [ ] 敏感数据正确处理

### 4. 性能
- [ ] 数据库查询有适当索引
- [ ] 无N+1查询问题

## 输出格式
请输出JSON格式的审查报告：

```json
{
  "module": "portfolio.js",
  "score": 8.5,
  "status": "pass|conditional_pass|fail",
  "issues": [
    {"severity": "high|medium|low", "line": 123, "description": "问题描述", "suggestion": "修复建议"}
  ],
  "summary": "总体评价"
}
```

## 执行命令
请读取文件并输出审查报告。
