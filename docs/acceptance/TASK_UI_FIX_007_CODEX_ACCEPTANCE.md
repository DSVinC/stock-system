# TASK_UI_FIX_007 验收报告

## 验收结论

验收结果：**不通过**

## 验收范围

- 统一 `select.html` 和 `analysis.html` 导航结构
- 统一导航链接顺序和文案

## 验收结果明细

- [ ] 两页面布局类名一致
- [x] 导航文案风格统一
- [ ] 标题风格统一

## 问题说明

### 1. 两页面布局类名未统一

`select.html` 仍使用 `container`、`page-header` 结构，且导航位于 `main` 外部：

- [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L385) 使用 `<nav class="top-nav">`
- [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L395) 使用 `<main class="container">`
- [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L397) 使用 `<div class="page-header">`

`analysis.html` 已切换为 `page-shell`、`hero`、`panel` 结构，且导航位于 `main` 内部：

- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L40) 使用 `<main class="page-shell">`
- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L41) 在 `main` 内使用 `<nav class="top-nav">`
- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L50) 使用 `<section class="hero">`
- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L56) 使用 `<section class="panel">`

结论：两页主体布局类名体系和导航包裹层级均不一致，不满足“布局类名一致”。

### 2. 导航文案风格已统一

两页导航链接顺序一致，文案一致，均为：

`首页` / `行业选股` / `个股分析` / `监控池` / `账户管理` / `条件单` / `回测系统`

对应证据：

- [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L385)
- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L41)

结论：该项通过。

### 3. 标题风格未统一

`select.html` 标题包含 emoji 和“推荐”后缀，属于强化展示风格：

- [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L398) `🎯 行业选股推荐`

`analysis.html` 标题为纯文本，且包含英文 eyebrow：

- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L50) `A-Share Analysis`
- [analysis.html](/Users/vvc/.openclaw/workspace/stock-system/analysis.html#L52) `个股分析`

结论：标题文案形式、装饰元素和展示层级不一致，不满足“标题风格统一”。

## 建议修复方向

1. 将 `select.html` 主体结构统一到 `analysis.html` 的 `page-shell / hero / panel` 体系，或反向统一为同一套布局规范。
2. 统一导航所在层级，避免一个页面在 `main` 内，另一个页面在 `main` 外。
3. 统一标题策略，二选一即可：
   - 都使用纯中文标题，无 emoji、无英文 eyebrow。
   - 都使用同一套 eyebrow + h1 组合，且文案风格一致。
