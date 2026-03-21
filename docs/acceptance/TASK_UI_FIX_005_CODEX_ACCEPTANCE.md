# TASK_UI_FIX_005 验收报告

## 验收结论

验收结果：**不通过**

## 验收范围

- `api/select.js` 职责注释
- `api/analyze.js` 职责注释
- `api/analysis.js` 职责注释

## 验收结果明细

- [ ] API 职责文档清晰
- [ ] 无重复代码
- [ ] 注释准确描述职责

## 问题说明

### 1. `select.js` 的接口职责注释与实际导出不一致

文件头声明了以下主要接口：

- [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L9) 写明 `GET /api/select`
- [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L11) 写明 `GET /api/select/:name/picks`

但当前实际路由只有：

- [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L281) `router.get('/')`
- [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L295) `router.post('/report')`

未发现 `/:name/picks` 路由实现。该注释会让读者误判此模块对外暴露了按行业名称读取 picks 的 API，职责说明不准确。

### 2. `analyze.js` 的职责边界描述过宽，且历史接口注释失真

文件头将该模块描述为“负责生成个股深度分析报告”：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L4)

但当前实际入口分为两类：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L687) `analyzeHandler` 按 `directions` 产出股票列表
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L710) `POST /api/analyze`
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L712) `POST /api/analyze/report`

这说明该模块至少同时承担了“行业方向下的个股筛选/排序”和“个股 Markdown 报告落盘”两种职责，不是单一的“个股深度分析报告 JSON”边界。

同时，文件头还声明了一个不存在的接口：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L13) `GET /api/analyze/:code/history`

当前文件内未发现对应 `history` 路由实现，因此注释不准确。

### 3. `analysis.js` 的接口说明与实际路由名称不一致

文件头声明：

- [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L14) `POST /api/analysis/generate`
- [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L15) `GET /api/analysis/:code`

但当前实际导出路由为：

- [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L524) `router.post('/')`
- [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L525) `router.post('/report')`

未发现 `POST /generate` 或 `GET /:code`。因此该文件的“主要接口”注释与实现不匹配，无法支撑“职责文档清晰”的验收标准。

### 4. 三个文件间仍存在重复实现，不满足“无重复代码”

当前至少存在以下重复工具函数：

- [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L62) 与 [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L139) 均实现了 `toMarkdownTable`
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L97) 与 [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L40) 均实现了 `slugify`

这部分不是本次“加注释”直接引入的新增问题，但按本次验收标准“无重复代码”判定，当前状态不能通过。

## 综合判断

本次修复只补充了文件头职责注释，但没有把注释与真实路由、真实输出形态、真实职责边界对齐：

- `select.js` 注释多写了未实现接口
- `analyze.js` 注释把模块职责写得过于单一，且包含不存在的历史接口
- `analysis.js` 注释中的接口路径与实际导出完全不一致
- 相关文件之间仍保留重复辅助函数

因此，`TASK_UI_FIX_005` 当前不满足验收标准，判定为 **不通过**。

## 建议修复方向

1. 逐一按真实路由修正文档头注释，不要写未实现的接口。
2. 明确 `analyze.js` 与 `analysis.js` 的边界：
   - `analyze.js` 如果负责方向下个股筛选与 Node 报告生成，应按此描述。
   - `analysis.js` 如果负责 Python 分析与 HTML 报告生成，应按实际 `POST /`、`POST /report` 描述。
3. 将 `slugify`、`toMarkdownTable` 等公共函数下沉到共享模块，再由三个 API 文件复用。
