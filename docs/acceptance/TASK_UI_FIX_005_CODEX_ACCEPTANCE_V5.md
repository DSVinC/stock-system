# TASK_UI_FIX_005 第 5 次验收报告

## 验收结论

**结论：未通过**

本轮相较前几次，`api/analyze.js` 与 `api/analysis.js` 的文件头已经明确写出双实现架构分工，但“注释说明”“公开 API 文档”“真实路由返回结构”“前端实际调用”仍未完全对齐，因此还不能判定为“API 职责边界清晰化”已完成。

## 验收项结果

- [ ] API 职责文档清晰（注释与实际路由一致）
- [ ] 注释准确描述职责
- [ ] 两个接口边界清晰

## 主要问题

### 1. `api/analyze.js` 对 `/api/analyze/report` 的输出描述仍与真实实现不一致

`api/analyze.js` 文件头把 `POST /api/analyze/report` 描述为“输出：分析报告 JSON（技术面、基本面、资金面、估值、策略建议）”，但真实路由返回的是 `success + report_path + stock` 摘要，而不是完整 JSON 报告对象。

证据：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L16)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L18)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L20)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L719)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L734)

影响：

- 注释已经开始澄清边界，但对 Node 版报告接口的返回形态仍然写错。
- 这直接违反“注释准确描述职责”的验收标准。

### 2. `docs/api-reference.md` 仍未准确反映两套接口的真实返回结构

公开 API 文档虽然增加了“双实现”说明，但响应示例仍然与真实代码不一致：

- `POST /api/analyze/report` 文档写的是 `.json` 报告路径，且暗示前端再去加载完整 JSON。
- 实际 `api/analyze.js` 写入的是 Markdown 文件，返回对象里只有摘要字段。
- `POST /api/analysis/report` 文档写的是直接返回 `html` 字符串。
- 实际 `api/analysis.js` 返回的是 `report_path + markdown_report_path + data`，并不返回 `html` 字段。

证据：

- [docs/api-reference.md](/Users/vvc/.openclaw/workspace/stock-system/docs/api-reference.md#L323)
- [docs/api-reference.md](/Users/vvc/.openclaw/workspace/stock-system/docs/api-reference.md#L360)
- [docs/api-reference.md](/Users/vvc/.openclaw/workspace/stock-system/docs/api-reference.md#L380)
- [docs/api-reference.md](/Users/vvc/.openclaw/workspace/stock-system/docs/api-reference.md#L391)
- [docs/api-reference.md](/Users/vvc/.openclaw/workspace/stock-system/docs/api-reference.md#L411)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L734)
- [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L493)
- [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L507)

影响：

- 文档与代码没有闭环，无法支撑“API 职责文档清晰（注释与实际路由一致）”。

### 3. 两套报告接口的边界仍未真正落到使用层

当前前端页面实际生成报告时调用的仍是 `/api/analysis/report`，说明系统真实使用路径依然是 Python 报告下载链路；而 `docs/api-reference.md` 又单独描述了 `/api/analyze/report` 的“前端实时渲染”职责。两条路径并存，但页面没有使用 Node 版报告接口，导致“哪一个才是前端应依赖的报告接口”仍不够明确。

证据：

- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L340)
- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L345)
- [api/server.js](/Users/vvc/.openclaw/workspace/stock-system/api/server.js#L180)
- [api/server.js](/Users/vvc/.openclaw/workspace/stock-system/api/server.js#L184)

影响：

- 虽然代码注释已经声明“Node.js 实时渲染 / Python 下载报告”的分工，但实际接入关系仍未完全呈现这条边界。
- 这使“两个接口边界清晰”仍不能判通过。

## 已确认改善项

1. `api/analyze.js` 文件头已经把双实现架构写出来，方向比前几轮清晰：
   - `analyze.js: Node.js 原生分析 → 返回 JSON → 前端实时渲染`
   - `analysis.js: 调用 Python 脚本 → 生成 HTML 报告 → 深度分析报告下载`
   证据：
   - [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L6)
   - [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L6)

2. `POST /api/analyze` 的职责说明已与实现一致，当前这一条接口边界是清楚的。
   证据：
   - [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L11)
   - [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L694)
   - [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L717)

## 结论说明

本轮不是“完全没修”，而是“修到一半”：

- 模块级分工口径已经基本建立。
- 但 Node 版报告接口的注释仍写错输出形态。
- 公开 API 文档仍与真实返回结构不一致。
- 前端实际使用的仍是 Python 报告接口，导致报告能力的边界没有在系统使用层完全收口。

因此，本轮仍判定 **未通过**。

## 建议修复方向

1. 把 [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L16) 的 `/report` 输出描述改成真实返回形态，不要再写“完整分析报告 JSON”。
2. 按真实实现修正 [docs/api-reference.md](/Users/vvc/.openclaw/workspace/stock-system/docs/api-reference.md#L360) 与 [docs/api-reference.md](/Users/vvc/.openclaw/workspace/stock-system/docs/api-reference.md#L391) 的响应示例。
3. 明确前端报告按钮到底应绑定 `/api/analyze/report` 还是 `/api/analysis/report`，并在文档中只保留一致的口径。
