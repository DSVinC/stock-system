# 项目经验总结 (PROJECT_LESSONS)

> 本文档记录项目开发过程中的重要经验教训，用于团队知识沉淀和预防类似问题再次发生。

## 📖 使用指南（防止遗忘）

### 什么时候读取本文档？

| 时机 | 读取内容 | 目的 |
|------|----------|------|
| **新任务启动** | 搜索类似问题类型 | 避免重复踩坑 |
| **修复开始前** | 阅读「预防措施」部分 | 参考已有方案 |
| **验收遇到阻塞** | 查看高频问题分类 | 快速定位根因 |
| **新会话启动** | 阅读最新 5 条经验 | 快速了解项目痛点 |
| **开发新功能** | 搜索相关技术栈经验 | 提前规避风险 |

### 快速搜索命令

```bash
# 搜索关键词（如"数据库"、"API"、"飞书"）
rg "关键词" docs/PROJECT_LESSONS.md

# 查看问题类型分类
rg "^### 问题类型" docs/PROJECT_LESSONS.md

# 查看最新 5 条经验
head -100 docs/PROJECT_LESSONS.md
```

### 经验分类索引

| 问题类型 | 出现次数 | 典型场景 |
|----------|----------|----------|
| 代码质量 | 5+ | 命名不一致、逻辑错误、API 使用错误 |
| 功能开发 | 3+ | 功能遗漏、数据库表缺失 |
| 配置管理 | 2+ | 环境变量、定时任务配置 |
| 文档与实现不一致 | 2+ | 文档过时、注释错误 |

---

## 2026-03-24 | TASK_V3_001 & TASK_V3_DB_FIX_001 | V3 版行业评分与数据库修复

### 问题类型
**功能开发** - 新功能实现 + 数据库表补充

### 背景
V3 版开发启动，需要实现 4 维度行业自动评分功能。同时发现监控功能缺少 `company_events` 和 `stocks` 表。

### 任务完成情况

#### TASK_V3_001 - 4 维度行业自动评分
- **状态**: completed
- **交付物**: `api/industry-score.js`, 路由配置
- **验收**: 387 个行业评分，耗时 967ms < 5 秒要求
- **API 接口**:
  - `GET /api/industry/score` - 获取排行榜
  - `POST /api/industry/score` - 自定义权重评分
  - `GET /api/industry/score/top3` - 快速获取 Top3

#### TASK_V3_DB_FIX_001 - 补充缺失数据库表
- **状态**: completed
- **交付物**: `database/migrations/005_add_company_tables.sql`
- **新增表**: `company_events`, `stocks`
- **验收**: 表结构正确，查询正常

### 经验总结

1. **先检查再开发**: TASK_V3_001 的 API 在之前的开发中已实现，启动任务前应先检查代码是否已存在
2. **数据库表依赖**: 开发 `black-swan-check.js` 和 `sentiment-factor.js` 时依赖的表当时未创建，应在功能开发后立即补充相关表结构
3. **迁移脚本编号**: 使用递增编号（005）避免冲突，符合迁移规范

### 预防措施

1. ✅ **功能检查清单**: 开发前先搜索相关文件，避免重复开发
2. ✅ **数据库表同步**: 新功能依赖的表应在功能开发时一并创建
3. ✅ **迁移脚本管理**: 每个迁移使用独立文件，编号递增

---

## 2026-03-23 | TASK_CODEX_FIX_001~005 | PR #4 合并后 Codex 审查问题修复

### 问题类型
**代码质量** - 命名不一致 + 逻辑错误 + API 使用错误 + 功能遗漏

### 背景
PR #4 "feat: 完成回测系统全部功能" 合并后，Codex 第二次审查发现 5 个遗留问题，导致部分 API 无法正常工作。

### 根因分析

#### 直接原因
1. **TASK_CODEX_FIX_001**: `analyze.js` 中 `calculateCompositeScore()` 调用使用未定义变量 `stockCode`
2. **TASK_CODEX_FIX_002**: `portfolio.js` 清仓 API 重置 `current_cash` 为 `initial_cash`，丢弃已实现损益
3. **TASK_CODEX_FIX_003**: `monitor.js` 使用 `db.all()` callback 方法而非 `db.allPromise()`
4. **TASK_CODEX_FIX_004**: `backtest.js` 的 `calculateMetrics()` 未计算 `annualizedReturn`
5. **TASK_CODEX_FIX_005**: `backtest.js` 报告模板使用 `trade.qty` 而非 `trade.quantity`

#### 深层原因
1. **代码审查不充分**: PR #4 合并前未经过完整验收，Codex 第一次审查后未修复所有问题就合并
2. **测试覆盖不足**: 缺少端到端 API 测试，未能及时发现字段名不一致和功能遗漏
3. **命名规范不统一**: 字段名在不同模块不一致（qty vs quantity）
4. **sqlite3 API 不熟悉**: callback API 与 promise API 混用

### 解决方案

#### 修改文件
- `api/analyze.js` - 第 144 行附近
- `api/portfolio.js` - 清仓逻辑部分
- `api/monitor.js` - getSignals 等函数
- `api/backtest.js` - calculateMetrics() 和报告模板

#### 关键代码变更
```javascript
// analyze.js: 变量名修复
- const compositeScore = calculateCompositeScore(stockCode, factors);
+ const compositeScore = calculateCompositeScore(basicInfo.ts_code, factors);

// portfolio.js: 清仓损益修复
- account.current_cash = account.initial_cash;
+ const sellValue = position.quantity * currentPrice;
+ account.current_cash = account.current_cash + sellValue;

// monitor.js: DB 方法修复
- const signals = await db.all(`SELECT ...`, params);
+ const signals = await db.allPromise(`SELECT ...`, params);

// backtest.js: 年化收益计算
+ const days = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
+ this.metrics.annualizedReturn = Math.pow(1 + this.metrics.returnRate, 365 / days) - 1;

// backtest.js: 字段名修复 (HTML 和 Markdown 模板)
- ¥${(trade.qty * trade.price).toLocaleString()}
+ ¥${(trade.quantity * trade.price).toLocaleString()}
```

### 预防措施

1. ✅ **PR 审查纪律**: 所有 PR 必须经过 Codex 完整审查并通过后才能合并，不得跳过审查
2. ✅ **验收流程**: 关键功能必须编写验收文档并执行端到端测试
3. ✅ **命名规范**: 建立数据模型字段命名规范，统一使用 `quantity` 而非 `qty`
4. ✅ **API 使用规范**: 统一使用 promise API（`db.allPromise`），避免 callback/promise 混用
5. ✅ **审查检查清单**: Codex 审查时必须检查：
   - 变量命名一致性
   - 数据库 API 使用正确性
   - 关键指标计算完整性
   - 模板字段名与数据模型一致性

---

## 2026-03-22 | TASK_ANALYSIS_FIX_001 | Python 脚本变量作用域错误修复

### 问题类型
**代码质量** - 变量未定义 + 逻辑错误

### 背景
个股分析脚本 `stock_analyzer.py` 在生成报告时报 `NameError: vol_ratio not defined`，导致无法查看分析报告。

### 根因分析

#### 直接原因
第 711 行代码使用了未定义的变量 `vol_ratio`，应该从 `capital` 参数中获取：
```python
# 错误代码
elif vol_ratio < 0.8:

# 正确代码
elif to_float(capital.get('vol_ratio')) < 0.8:
```

#### 深层原因
1. **变量作用域意识不足**: 函数参数中的 `capital` 字典需要通过 `.get()` 方法访问
2. **代码复制粘贴错误**: 第 709-710 行 PE 估值偏高逻辑存在两个错误：
   - PE 偏高应该**扣分**，但代码写了加分（`report_score += 0.3`）
   - 错误地添加了"成交量活跃"因素（应该在 vol_ratio >= 1 时添加）

### 解决方案

#### 修改文件
- `skills/a 股个股分析/scripts/stock_analyzer.py` (第 707-713 行)

#### 关键代码变更
```python
# 修复 1: vol_ratio 引用
- elif vol_ratio < 0.8:
+ elif to_float(capital.get('vol_ratio')) < 0.8:

# 修复 2: PE 估值逻辑
if pe_val > 50:
    score_factors.append('PE 估值偏高')
-   report_score += 0.3
+   report_score -= 0.3
-   score_factors.append('成交量活跃')
```

### 预防措施
1. **代码审查重点**: 检查所有变量是否在使用前已定义
2. **评分逻辑测试**: 对评分增减逻辑编写单元测试
3. **复制粘贴检查**: 复制代码块后必须检查所有变量引用和逻辑
4. **静态分析工具**: 在 CI 流程中添加 Python 静态分析（pylint/flake8）

### 验证结果
✅ 脚本恢复正常，成功生成宁德时代分析报告（评分 5.0/5）

---

## 2026-03-22 | TASK_CONDITIONAL_EXECUTOR_001 | 条件单执行器设计与事务处理

### 问题类型
**架构设计** - 事务一致性 + 错误处理

### 背景
条件单触发后需要执行交易、更新持仓、记录历史、推进状态，涉及多个数据库表的原子性操作。初期实现分散在监控模块中，代码重复且难以测试。

### 根因分析

#### 直接原因
1. **职责分离不清晰**: 监控模块同时负责条件检查和交易执行，代码臃肿
2. **事务处理不完善**: 初期实现在异常情况下可能出现部分更新
3. **错误场景覆盖不足**: 资金不足、持仓不足、停牌等场景未统一处理

#### 深层原因
1. **缺乏独立执行器模块**: 交易执行逻辑应该独立于监控触发逻辑
2. **测试驱动不足**: 没有独立的单元测试验证各种边界场景
3. **复用意识不足**: 监控模块和执行器应该解耦，便于复用

### 解决方案

#### 修改文件
- `api/conditional-executor.js` (新建) - 条件单执行器核心模块
- `api/monitor-conditional.js` - 改造为调用执行器，删除重复逻辑
- `test/conditional-executor-check.js` (新建) - 7 场景验收测试

#### 关键设计
```javascript
// 执行器核心接口
async function executeConditionalOrder(orderId, marketData, technicalData, options) {
  // 1. 获取订单 + 验证状态
  // 2. 检查停牌 + 获取价格
  // 3. 条件检查（可选跳过）
  // 4. BEGIN TRANSACTION
  // 5. 加载账户状态
  // 6. 计算交易数量（数量/金额/仓位百分比）
  // 7. 验证交易请求（资金/持仓）
  // 8. 执行买入/卖出
  // 9. 记录执行历史
  // 10. 更新订单状态
  // 11. 更新账户快照
  // 12. COMMIT / ROLLBACK
}
```

#### 事务一致性保障
1. **原子性**: 所有数据库操作在一个事务内，失败时全部回滚
2. **状态不更新**: 执行失败时不更新 `trigger_count`，允许下次继续尝试
3. **错误码统一**: 定义标准错误码（INSUFFICIENT_FUNDS/INSUFFICIENT_POSITION/SECURITY_SUSPENDED）

### 预防措施
1. **独立执行器模式**: 交易执行逻辑独立成模块，便于测试和复用
2. **测试场景覆盖**: 编写 7 个验收场景（数量买入/金额买入/仓位买入/卖出/资金不足/持仓不足/停牌）
3. **事务模板**: 所有涉及多表更新的操作都使用事务模板
4. **错误码枚举**: 定义统一的错误码常量，便于前端处理

### 验证结果
✅ 7 个测试场景全部通过
✅ 监控模块成功切换为调用执行器
✅ 代码行数减少 100+ 行（删除重复逻辑）

---

## 2026-03-22 | TASK_UI_FIX_005 | API 职责边界清晰化（7 次验收通过）

### 问题类型
**文档与实现不一致** + **职责边界模糊**

### 背景
系统存在两套"个股分析"API 实现：
- `analyze.js`: Node.js 原生分析，返回 JSON
- `analysis.js`: Python 深度分析，生成 HTML 报告

但代码注释和 API 文档对两个接口的职责描述模糊，导致验收不通过。

### 根因分析

#### 直接原因
1. `analyze.js` 文件头注释将 `POST /api/analyze/report` 描述为"输出：分析报告 JSON"，但实际返回的是 `success + report_path + stock` 摘要
2. `docs/api-reference.md` 的响应示例与实际代码返回结构不一致
3. `analysis.js` 文件头将 `POST /api/analysis` 描述为"生成 Python 分析报告（同 analyze.js 的/report）"，但实际两个接口返回结构不同

#### 深层原因
1. **开发时未同步更新文档**：代码修改后，注释和文档未同步更新
2. **缺乏文档验证机制**：没有自动化检查确保文档与实现一致
3. **双实现架构未明确声明**：系统存在两套分析实现，但缺乏清晰的架构说明文档

### 解决方案

#### 修改文件
1. `api/analyze.js` - 文件头添加与 `analysis.js` 的分工说明，修正返回结构描述
2. `api/analysis.js` - 文件头精简职责描述，明确两个接口的不同返回
3. `docs/api-reference.md` - 添加"双实现"说明章节，修正响应示例

#### 关键代码变更
```javascript
// api/analyze.js 文件头
/**
 * 与 analysis.js 的分工：
 * - analyze.js: Node.js 原生分析 → 返回 JSON → 前端实时渲染
 * - analysis.js: 调用 Python 脚本 → 生成 HTML 报告 → 深度分析报告下载
 * 
 * 接口分工：
 * 1. POST /api/analyze - 按行业方向筛选股票列表
 *    - 输出：success + stocks (待分析的股票列表)
 * 2. POST /api/analyze/report - 生成单只股票分析报告 (Node.js 版)
 *    - 输出：success + report_path (Markdown URL) + stock (摘要)
 */
```

### 预防措施

#### 可执行检查项
1. [ ] **代码审查时检查注释**：PR 审查时必须验证文件头注释与实际返回结构一致
2. [ ] **文档与实现同步更新**：修改 API 返回结构时，必须同时更新 `docs/api-reference.md`
3. [ ] **验收前自检清单**：提交验收前，运行自检脚本验证注释、文档、实现三者一致
4. [ ] **架构决策记录**：双实现架构等重大设计决策，应在 `docs/ARCHITECTURE.md` 中明确记录

### 验收过程
| 验收次数 | 结果 | 主要问题 |
|----------|------|----------|
| V1 | ❌ | API 职责文档与实际路由不一致 |
| V2 | ❌ | 注释描述不准确 |
| V3 | ❌ | 文档响应示例与实际返回结构不一致 |
| V4 | ❌ | 两套接口并存，前端仍调用旧接口 |
| V5 | ❌ | 双实现架构已明确，但返回结构描述仍有偏差 |
| V6 | ❌ | `api/analysis.js` 文件头对接口描述不准确 |
| V7 | ✅ | 所有问题修复，验收通过 |

### 经验总结
1. **文档即代码**：注释和文档是代码的一部分，必须与实现保持同步
2. **验收标准前置**：在开发前明确验收标准，避免反复修改
3. **双实现需要明确边界**：当系统存在多套实现时，必须在架构层面明确分工
4. **迭代是常态**：复杂修复可能需要多次验收，每次都要准确定位问题

### 相关文件
- 任务分配单：`docs/tasks/TASK_UI_FIX_005_ASSIGNMENT.md`
- 状态文件：`docs/runtime/TASK_UI_FIX_005_STATUS.md`
- 验收报告：`docs/acceptance/TASK_UI_FIX_005_CODEX_ACCEPTANCE_V{1-7}.md`
- 记忆锚点：`memory/project/stock_system/2026-03-22T09-30-00.json`

---

## 2026-03-22 | TASK_UI_FIX_006 | 复选框状态同步（2 次验收通过）

### 问题类型
**功能缺失** - 交互状态不同步

### 背景
选股页面的复选框选中状态与卡片视觉反馈不同步，用户点击复选框后卡片不变色。

### 根因分析
- `toggleSelection` 函数只更新了数据状态，未同步更新 `.checkbox-custom.checked` 类名

### 解决方案
- 修改 `select.html` 中的 `toggleSelection` 函数，同时更新复选框样式

### 预防措施
1. [ ] **交互组件状态管理**：状态变更时必须检查所有相关 UI 元素的同步更新
2. [ ] **自测清单**：开发完成后，手动测试所有交互路径

### 验收过程
| 验收次数 | 结果 |
|----------|------|
| V1 | ✅ 通过 |
| V2 | ✅ 通过（巩固验证）|

---

## 2026-03-22 | TASK_UI_FIX_007 | UI 风格统一（2 次验收通过）

### 问题类型
**UI 不一致** - 页面风格差异

### 背景
选股页面 (`select.html`) 与个股分析页面 (`analysis.html`) 的导航栏、布局结构不一致，用户体验割裂。

### 根因分析
- 两个页面由不同人开发，未统一 UI 规范
- 缺乏页面模板或布局组件

### 解决方案
1. 将 `select.html` 布局统一为 `page-shell/hero/panel` 结构
2. 统一导航栏文案、顺序、激活态
3. 统一标题和按钮风格

### 预防措施
1. [ ] **UI 组件库**：建立统一的页面模板和组件库
2. [ ] **设计规范文档**：维护 `docs/UI_GUIDELINES.md`，记录布局、配色、字体等规范
3. [ ] **页面审查**：新页面开发前，先审查现有页面的布局和风格

### 验收过程
| 验收次数 | 结果 |
|----------|------|
| V1 | ✅ 通过 |
| V2 | ✅ 通过（巩固验证）|

---

## 2026-03-24 | TASK_V3_DB_FIX_001 | 数据库表结构缺失（监控功能反馈）

### 问题类型
**功能缺失** - 数据库表未创建 + 模块间依赖未验证

### 背景
2026-03-24 08:34 三木反馈：监控功能运行时，数据库缺少 `company_events` 和 `stocks` 表，导致事件监控和特殊处理状态检查未能执行。不影响当前盘前简报功能，但黑天鹅检测和舆情因子计算功能无法完整工作。

### 根因分析

#### 直接原因
1. `api/black-swan-check.js` 第 172 行和 222 行分别查询 `company_events` 和 `stocks` 表，但表未创建
2. `api/sentiment-factor.js` 第 238 行查询 `company_events` 表，但表未创建
3. 数据库初始化脚本未包含这两个表的创建语句

#### 深层原因
1. **模块间依赖未验证**：黑天鹅检测模块依赖 `company_events` 和 `stocks` 表，但开发时未检查表是否存在
2. **数据库迁移不完整**：V2 版本开发时可能计划了这两个表，但未实际创建
3. **测试覆盖不足**：缺少端到端测试验证黑天鹅检测功能的完整执行路径
4. **防御性编程不足**：查询前未检查表是否存在，导致静默失败

### 解决方案

#### 修改文件
- `database/migrations/v3.0_add_company_tables.sql` (新建) - 数据库迁移脚本
- `docs/fixes/TASK_V3_DB_FIX_001.md` (新建) - 修复文档
- `docs/runtime/TASK_V3_DB_FIX_001_STATUS.md` (新建) - 运行时状态

#### 表结构设计
```sql
-- company_events 表：公司公告事件
CREATE TABLE IF NOT EXISTS company_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_time DATETIME NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  source TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- stocks 表：股票基本信息
CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL UNIQUE,
  stock_name TEXT NOT NULL,
  list_status TEXT,
  special_treatment TEXT,
  industry_code_l1 TEXT,
  industry_name_l1 TEXT,
  industry_code_l2 TEXT,
  industry_name_l2 TEXT,
  industry_code_l3 TEXT,
  industry_name_l3 TEXT,
  list_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 预防措施

1. [ ] **数据库依赖检查**：模块启动时检查依赖的表是否存在，不存在时抛出明确错误
2. [ ] **迁移脚本管理**：所有数据库表变更必须通过迁移脚本，不得手动创建
3. [ ] **端到端测试**：黑天鹅检测等关键功能必须编写端到端测试，验证完整执行路径
4. [ ] **防御性编程**：查询前检查表/字段是否存在，提供友好的错误提示
5. [ ] **PR 审查清单**：涉及数据库查询的代码，审查时必须验证表结构已创建

### 验证结果
⏳ 待修复完成后验证

---

## 通用经验（跨任务）

### 1. 验收驱动开发
- **问题**：开发完成后才发现与验收标准不符
- **改进**：开发前先阅读验收标准，必要时先写测试用例

### 2. 文档与代码同步
- **问题**：代码修改后文档未同步更新
- **改进**：将文档更新纳入"完成"定义（DoD）

### 3. 迭代心态
- **问题**：期望一次验收通过，多次失败后产生挫败感
- **改进**：将多次验收视为正常流程，每次聚焦解决一个具体问题

### 4. 状态文件的重要性
- **问题**：任务执行过程中状态不透明
- **改进**：使用 `docs/runtime/TASK_{ID}_STATUS.md` 实时记录进展，便于交接和复盘

### 5. 数据库表依赖管理（2026-03-24 新增）
- **问题**：代码查询某表，但表未创建，导致功能静默失败
- **改进**：模块启动时检查依赖表是否存在，迁移脚本必须完整
