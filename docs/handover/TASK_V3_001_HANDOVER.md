# TASK_V3_001 交接文档

**任务 ID**: TASK_V3_001
**任务名称**: 4 维度行业自动评分
**开发人员**: Claude Code
**完成日期**: 2026-03-24
**状态**: 待验收

---

## 📋 任务概述

实现 4 维度（政策/商业化/舆论/资本）行业自动评分功能，替代当前手动选择行业的流程。

---

## 📁 交付物

### 1. 新增文件

| 文件 | 说明 |
|------|------|
| `api/industry-score.js` | 行业评分 API 模块 |

### 2. 修改文件

| 文件 | 变更说明 |
|------|----------|
| `api/server.js` | 添加路由 `/api/industry/score` |

---

## 🔌 API 接口说明

### 1. GET /api/industry/score

获取行业评分排行榜（使用默认权重）。

**请求参数**:
- `limit` (可选): 返回数量，默认 50，最大 100

**响应示例**:
```json
{
  "success": true,
  "generatedAt": "2026-03-24T00:36:31.352Z",
  "tradeDate": "20260323",
  "weights": {
    "policy": 0.25,
    "commercial": 0.30,
    "public": 0.25,
    "capital": 0.20
  },
  "elapsed_ms": 1002,
  "total_industries": 387,
  "ranking": [
    {
      "rank": 1,
      "name": "储能",
      "policy_score": 100,
      "commercial_score": 100,
      "public_score": 100,
      "capital_score": 100,
      "total_score": 100,
      "metrics": { ... }
    }
  ],
  "top3": [
    { "rank": 1, "industry": "储能", "total_score": 100 },
    { "rank": 2, "industry": "存储芯片", "total_score": 95 },
    { "rank": 3, "industry": "雄安新区", "total_score": 90 }
  ]
}
```

### 2. POST /api/industry/score

获取行业评分排行榜（自定义权重）。

**请求体**:
```json
{
  "weights": {
    "policy": 0.25,
    "commercial": 0.30,
    "public": 0.25,
    "capital": 0.20
  },
  "limit": 50
}
```

### 3. GET /api/industry/score/top3

快速获取 Top3 行业。

**响应示例**:
```json
{
  "success": true,
  "generatedAt": "2026-03-24T00:36:40.619Z",
  "tradeDate": "20260323",
  "top3": [
    { "rank": 1, "industry": "储能", "total_score": 100 },
    { "rank": 2, "industry": "存储芯片", "total_score": 95 },
    { "rank": 3, "industry": "雄安新区", "total_score": 90 }
  ]
}
```

---

## 📐 评分算法说明

### 4 维度定义

| 维度 | 权重 | 数据来源 | 计算方法 |
|------|------|----------|----------|
| 政策 (policy) | 25% | 关键词匹配 | 匹配政策关键词得 5 分，否则得 3 分 |
| 商业化 (commercial) | 30% | 公司数/IPO/涨幅 | 公司数×0.6 + IPO数×22 + 涨幅贡献 |
| 舆论 (public) | 25% | 热度值/排名 | 热度值/2000 + 排名贡献 + 涨幅×6 |
| 资本 (capital) | 20% | 资金净流入 | max(净流入,0)×4 + 公司数×0.4 + 成分涨幅×8 |

### 综合评分计算

```
total_score = (policy × 0.25 + commercial × 0.30 + public × 0.25 + capital × 0.20) × 20
```

---

## ✅ 验收标准检查

| 标准 | 状态 | 测试结果 |
|------|------|----------|
| 支持全市场行业自动评分 | ✅ | 返回 387 个行业 |
| 权重可配置（默认 25/30/25/20） | ✅ | POST 接口支持自定义权重 |
| 输出评分排行榜（JSON 格式） | ✅ | 返回完整 JSON 结构 |
| 性能：全市场行业评分 < 5 秒 | ✅ | 实测 1002ms |

---

## 🧪 测试命令

```bash
# 启动服务器
npm start

# 测试 GET 接口
curl http://127.0.0.1:3000/api/industry/score?limit=5

# 测试 POST 接口（自定义权重）
curl -X POST http://127.0.0.1:3000/api/industry/score \
  -H "Content-Type: application/json" \
  -d '{"weights": {"policy": 0.4, "commercial": 0.2, "public": 0.2, "capital": 0.2}, "limit": 3}'

# 测试 Top3 接口
curl http://127.0.0.1:3000/api/industry/score/top3
```

---

## 📝 后续任务

- **TASK_V3_002**: 行业 Top3 自动筛选（依赖本任务）
- **TASK_V3_005**: 选股 UI 改造（调用本 API）

---

## 🔗 相关文档

- 任务文档: `docs/tasks/TASK_V3_001.md`
- 运行时状态: `docs/runtime/TASK_V3_001_STATUS.md`
- V3 开发计划: `docs/V3_DEVELOPMENT_PLAN.md`

---

**交接人**: Claude Code
**交接时间**: 2026-03-24 08:40
**验收人**: 待指定（Gemini CLI / Codex）