# TASK_UI_FIX_005 第 2 次验收报告

## 验收结论

验收结果：**不通过**

## 验收范围

- `api/select.js`
- `api/analyze.js`
- `api/analysis.js`

## 验收标准

- [ ] API 职责文档清晰（注释与实际路由一致）
- [ ] 注释准确描述职责

## 主要问题

### 1. `analyze.js` 的接口注释仍未准确反映真实路由职责

文件头将主接口写为“生成个股分析报告”：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L11)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L12)

但实际 `POST /api/analyze` 对应的是：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L687)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L688)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L698)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L710)

这里要求传入 `directions`，返回的是 `stocks` 列表，本质上是“按行业方向筛出待分析股票列表”，而不是直接生成单只股票分析报告。

真正按 `stock_name` / `stock_code` 生成报告并落盘的是：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L712)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L713)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L714)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L725)

因此，`POST /api/analyze` 和 `POST /api/analyze/report` 在输入和输出形态上承担的是两类不同职责，但文件头没有把这条边界写清楚。

### 2. `analyze.js` 的职责描述仍然偏窄，不能准确概括模块行为

文件头当前写法是：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L4)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L5)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L9)

这段描述强调的是“个股深度分析报告”的分析维度，但模块实际还承担了基于行业方向聚合候选股票的职责：

- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L142)
- [api/analyze.js](/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js#L687)

也就是说，这个模块不是单纯的“报告生成器”，而是同时包含：

- 方向到股票列表的筛选/排序
- 单只股票报告生成与落盘

当前职责注释没有把这两层职责拆开写，仍然会误导读者理解接口边界。

## 已修复部分

以下两处较第一次验收已有改进，问题已关闭：

### 1. `select.js` 路由注释已与实际实现一致

- 注释声明 `GET /api/select`、`POST /api/select/report`：
  [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L9)
  [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L10)
- 实际路由：
  [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L281)
  [api/select.js](/Users/vvc/.openclaw/workspace/stock-system/api/select.js#L295)

未再发现第一次验收中指出的 `/:name/picks` 虚构接口。

### 2. `analysis.js` 路由注释已与实际实现一致

- 注释声明 `POST /api/analysis`、`POST /api/analysis/report`：
  [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L13)
  [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L14)
- 实际路由：
  [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L524)
  [api/analysis.js](/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js#L525)

未再发现第一次验收中指出的 `/generate` 或 `/:code` 虚构接口。

## 综合判断

本次修复完成了 `select.js` 和 `analysis.js` 的接口路径对齐，但 `analyze.js` 仍然没有把“方向筛股”和“单股报告生成”两类职责区分清楚，导致：

- 注释与真实接口行为没有完全一致
- 职责描述仍不足以支撑“API 职责边界清晰化”

因此本次第 2 次验收结论仍为 **不通过**。

## 建议修复方向

1. 将 `api/analyze.js` 的“主要接口”改成按真实行为描述，例如：
   - `POST /api/analyze`：根据 `directions` 返回候选股票列表
   - `POST /api/analyze/report`：根据 `stock_name` / `stock_code` 生成并落盘个股报告
2. 将 `api/analyze.js` 的“职责”拆成两条，不要只写“个股深度分析报告”。
3. 若团队希望职责更单一，建议后续把“方向筛股”和“单股报告”拆成不同模块，但这不属于本次注释修复的必做项。
