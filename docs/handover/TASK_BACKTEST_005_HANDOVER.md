# TASK_BACKTEST_005_HANDOVER - 交接文档

**任务**: 行情阶段识别框架  
**创建时间**: 2026-03-23 09:15  

---

## 📋 任务背景

回测系统需要行情阶段标签来分类回测结果，当前七因子分析缺少此功能。

---

## 🎯 任务目标

在 `api/score-factors.js` 中添加行情阶段识别功能

---

## ✅ 验收标准

1. 七因子分析输出包含 `market_phase` 字段
2. 能正确识别中际旭创为"底部反弹"
3. 识别规则可配置

---

## 📁 相关文件

- `api/score-factors.js`
- `config/market-phase.json`

---

## 🧪 测试命令

```bash
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{"stock_code": "300308.SZ", "stock_name": "中际旭创"}'
```

检查返回结果中是否包含 `market_phase` 字段，值为 `bottom_rebound`。

---

## 📝 注意事项

- 行情阶段定义参考项目文档
- 支持规则配置化
- 为回测系统提供标签
