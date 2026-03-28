# TASK_V4_015 - 策略保存/加载 API

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 2 - 策略管理 API  
**状态**: ✅ 已完成 (2026-03-25)
**验收状态**: ✅ 已通过

---

## 📋 任务描述

创建策略保存和加载 API，操作 strategy_configs 表。

---

## 🎯 验收标准

- [ ] 创建 `api/strategy-config.js` 模块（已有基础，需扩展）
- [ ] 实现 POST `/api/strategy-config/save` - 保存策略配置
- [ ] 实现 GET `/api/strategy-config/:id` - 加载单个策略
- [ ] 实现 GET `/api/strategy-config/list` - 策略列表（支持筛选）
- [ ] 实现 DELETE `/api/strategy-config/:id` - 删除策略
- [ ] 支持按 template_id、strategy_type、config_type 筛选
- [ ] API 测试通过

---

## 📐 技术方案

**API 路由**:
```javascript
POST /api/strategy-config/save      // 保存策略配置
GET /api/strategy-config/list       // 策略列表（支持筛选）
GET /api/strategy-config/:id        // 加载单个策略
DELETE /api/strategy-config/:id     // 删除策略
```

**请求参数**:
```json
{
  "name": "我的策略",
  "template_id": "CORE_FACTOR_V1",
  "strategy_type": "core_factor",
  "config_type": "backtest",
  "params": {...},
  "is_public": 1
}
```

---

## 📁 交付物

- `api/strategy-config.js`（扩展版）
- 更新后的 `api/server.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_012（strategy_configs 表扩展）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
