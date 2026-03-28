# TASK_V4_014 - 策略模板加载 API

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 2 - 策略管理 API  
**状态**: pending

---

## 📋 任务描述

创建策略模板加载 API，读取 strategy_templates/ 目录中的 JSON 模板文件。

---

## 🎯 验收标准

- [ ] 创建 `api/strategy-template.js` 模块
- [ ] 实现 GET `/api/strategy-template/list` - 获取所有模板列表
- [ ] 实现 GET `/api/strategy-template/:id` - 获取单个模板详情
- [ ] 实现模板缓存机制
- [ ] 挂载到 server.js
- [ ] API 测试通过

---

## 📐 技术方案

**API 路由**:
```javascript
GET /api/strategy-template/list     // 返回所有模板列表
GET /api/strategy-template/:id      // 返回指定模板详情
```

**响应格式**:
```json
{
  "success": true,
  "data": [
    {
      "template_id": "CORE_FACTOR_V1",
      "name": "四维度 + 七因子策略",
      "description": "...",
      "compatible_with": ["selection", "backtest", "monitor"]
    }
  ]
}
```

---

## 📁 交付物

- `api/strategy-template.js`
- 更新后的 `api/server.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_011（策略模板库）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
