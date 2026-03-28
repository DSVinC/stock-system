# TASK_V4_016 - 策略导入/导出 API

**创建时间**: 2026-03-25  
**优先级**: P1  
**阶段**: 阶段 2 - 策略管理 API  
**状态**: completed

---

## 📋 任务描述

创建策略导入/导出 API，支持选股↔回测策略参数互相流转。

---

## 🎯 验收标准

- [ ] 实现 POST `/api/strategy-config/export` - 导出策略（标记为 public）
- [ ] 实现 POST `/api/strategy-config/import` - 导入策略（加载 public 策略）
- [ ] 实现 GET `/api/strategy-config/public` - 获取所有公开策略
- [ ] 支持策略复制（复制一份到新 ID）
- [ ] API 测试通过

---

## 📐 技术方案

**API 路由**:
```javascript
POST /api/strategy-config/export    // 导出策略（设置 is_public=1）
POST /api/strategy-config/import    // 导入策略（复制策略）
GET /api/strategy-config/public     // 获取公开策略列表
```

---

## 📁 交付物

- `api/strategy-config.js`（扩展导入导出功能）
- 更新后的 `api/server.js`

---

## 🔗 依赖关系

- 依赖：TASK_V4_015（策略保存/加载 API）

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`
