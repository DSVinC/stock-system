# API 契约：策略画像接口 (strategy-template/profiles)

**路径**: `GET /api/strategy-template/profiles`  
**创建日期**: 2026-03-28  
**最后更新**: 2026-03-28  
**相关任务**: `TASK_FLOW_REFACTOR_037B`  
**负责人**: 开发/验收 (Codex)

---

## 请求参数

无。

---

## 成功返回结构（200）

```json
{
  "success": true,
  "data": [
    {
      "strategy_type": "industry_7factor",
      "name": "行业 + 七因子",
      "category": "core",
      "description": "..."
    }
  ],
  "count": 4
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否成功 |
| data | array | 策略画像列表 |
| count | number | 列表数量，当前固定 4 |

### data[i] 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| strategy_type | string | 策略类型标识 |
| name | string | 中文名称 |
| category | string | 分类（`core/satellite/research`） |
| description | string | 策略画像说明 |

---

## 策略类型清单（当前版本）

1. `industry_7factor`
2. `trend_following`
3. `mean_reversion`
4. `multi_factor`

---

## 失败返回

当前实现为静态内存数据，正常情况下不返回业务错误；如后续接数据库或配置中心，需补充 5xx 错误契约。

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-03-28 | 初始契约创建 | Codex |
