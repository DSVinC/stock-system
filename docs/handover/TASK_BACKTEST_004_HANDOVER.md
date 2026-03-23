# TASK_BACKTEST_004_HANDOVER - 交接文档

**任务**: 策略参数扫描回测  
**创建时间**: 2026-03-23 09:15  

---

## 📋 任务背景

需要通过回测验证不同策略参数的效果，为风险偏好参数提供数据支撑。

---

## 🎯 任务目标

实现参数扫描和最优参数推荐功能

---

## ✅ 验收标准

1. 支持双均线策略参数扫描
2. 输出最优参数组合
3. 输出收益/风险对比

---

## 📁 相关文件

- `api/backtest.js`
- `config/strategies.json`

---

## 🧪 测试命令

```bash
curl -X POST http://localhost:3000/api/backtest/scan \
  -H "Content-Type: application/json" \
  -d '{"strategy": "dual_ma", "params": {"fast": [5,10,20], "slow": [20,30,60]}}'
```

---

## 📝 注意事项

- 参数组合可能很多，注意性能
- 支持并行回测加速
- 结果按夏普比率排序
