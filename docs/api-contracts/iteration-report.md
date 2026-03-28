# API 契约：迭代任务报告导出接口 (iteration/report)

**路径**: `GET /api/iteration/report/:taskId?format=markdown[&download=1]`  
**创建日期**: 2026-03-28  
**最后更新**: 2026-03-28  
**相关任务**: `TASK_FLOW_REFACTOR_035E`, `TASK_FLOW_REFACTOR_035F`  
**负责人**: 开发/验收 (Codex)

---

## 请求参数

### Path 参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | 是 | 迭代任务 ID（例如 `ITER_1774663403571_n0xul7`） |

### Query 参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| format | string | 否 | `markdown` | 目前仅支持 `markdown` |
| download | string | 否 | - | 传 `1` 时返回 markdown 附件流（非 JSON） |

---

## 成功返回结构（200）

```json
{
  "success": true,
  "data": {
    "taskId": "ITER_xxx",
    "format": "markdown",
    "fileName": "ITER_xxx_report.md",
    "generatedAt": "2026-03-28T02:25:00.000Z",
    "markdown": "# 迭代任务回测报告\n..."
  }
}
```

### data 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| taskId | string | 任务 ID |
| format | string | 固定 `markdown` |
| fileName | string | 建议下载文件名 |
| generatedAt | string | 生成时间（ISO） |
| markdown | string | 报告正文（Markdown） |

## 下载模式返回（200, `download=1`）

- `Content-Type`: `text/markdown; charset=utf-8`
- `Content-Disposition`: `attachment; filename="{taskId}_report.md"`
- 响应体：markdown 文本（不再包裹 JSON）

---

## 错误返回

### 400（不支持格式）

```json
{
  "success": false,
  "error": "仅支持 format=markdown"
}
```

### 404（任务不存在）

```json
{
  "success": false,
  "error": "任务不存在"
}
```

### 500（快照读取失败）

```json
{
  "success": false,
  "error": "具体错误信息"
}
```

---

## 报告内容约定（Markdown）

报告默认包含以下章节：

1. 任务信息
2. 回测输入
3. 结果摘要
4. 最佳参数
5. 实盘前检查（deploymentReadiness）
6. 下一步建议（nextActionSuggestion）

---

## 数据来源优先级

1. 活跃任务内存（`activeTasks`）  
2. 任务快照表（`iteration_task_runs`）

若内存不存在则回退到快照读取。

---

## 前端调用约定

`iteration-manager.html` 中 `exportIterationReport()` 使用该接口：

- 调用成功后按 `fileName` 下载 `.md`
- 调用失败时写入日志面板并保留错误信息
- 如需外部系统直接下载，可使用 `download=1` 模式

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-03-28 | 初始契约创建 | Codex |
