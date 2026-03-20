# 股票投资系统 (stock_system)

> **版本**: v1.0.0
> **创建时间**: 2026-03-18
> **项目状态**: ⚠️ 核心功能基本成型，盘后监控、行业监控闭环与部分设计共识项仍待核实/补齐

---

## 🎯 项目概述

股票投资系统是一个完整的A股投资分析与模拟交易平台，提供从选股、分析、监控到条件单执行的完整闭环。

### 核心功能

| 模块 | 功能 | 状态 |
|------|------|------|
| **选股系统** | 多维度筛选、概念板块选股 | ✅ 完成 |
| **个股分析** | 6因子评分、技术面/基本面/资金面分析 | ✅ 完成 |
| **监控池** | 股票监控、价格提醒、飞书通知 | ✅ 完成 |
| **条件单** | 价格条件、技术指标条件、自动执行 | ✅ 完成 |
| **模拟账户** | 虚拟资金、持仓跟踪、交易记录 | ✅ 完成 |
| **盘后监控** | 基本面变化监控（公告/财报/新闻） | ⏳ 待开发 |

---

## 📁 项目结构

```
stock-system/
├── 📁 api/                     # 后端API
│   ├── server.js               # Express主服务
│   ├── analysis.js             # 个股分析API
│   ├── selection.js            # 选股API
│   ├── monitor.js              # 监控池API
│   ├── conditional-order.js    # 条件单API
│   ├── portfolio.js            # 账户/持仓API
│   ├── monitor-conditional.js  # 条件单监控触发
│   └── db.js                   # 数据库连接
│
├── 📁 scripts/                 # 脚本工具
│   ├── conditional-order-monitor.mjs  # 条件单监控脚本
│   ├── start-monitor.sh        # 启动监控服务
│   └── stop-monitor.sh         # 停止监控服务
│
├── 📁 skills/                  # 技能模块
│   └── a股个股分析/            # 个股分析技能
│       └── scripts/
│           └── stock_analyzer.py
│
├── 📁 docs/                    # 📚 项目文档
│   ├── README.md               # 本文件（项目总入口）
│   ├── PROJECT_ROLES.md        # 三角色分工
│   ├── WORK_LOG_POLICY.md      # 日志登记制度
│   ├── FIX_SUMMARY_TEMPLATE.md # 修复模板
│   ├── TASK_STATUS_TEMPLATE.md # 实时状态模板
│   ├── api-reference.md        # API参考
│   ├── monitor-guide.md        # 监控指南
│   └── security-fixes-2026-03-18.md  # 安全修复记录
│
│   ├── 📁 tasks/               # 任务分配单
│   ├── 📁 runtime/             # 实时状态（接力入口）
│   ├── 📁 handover/            # 交接文档
│   ├── 📁 acceptance/          # 验收报告
│   └── 📁 fixes/               # 修复文档
│
├── 📁 memory/                  # 项目内补充日志
│   └── project_log.md
│
├── 📁 /Users/vvc/.openclaw/workspace/memory/project/stock_system/  # 工作区事件日志
│   └── {timestamp}.json
│
├── 📄 *.html                   # 前端页面
│   ├── index.html              # 系统主页
│   ├── report.html             # 选股报告
│   ├── analysis.html           # 个股分析
│   ├── monitor-pool.html       # 监控池
│   ├── conditional-order.html  # 条件单管理
│   ├── portfolio.html          # 账户/持仓
│   └── backtest.html           # 回测
│
├── 📄 stock_system.db          # 系统数据库
└── 📄 package.json             # 依赖配置
```

---

## 🚀 快速开始

### 启动服务

```bash
# 进入项目目录
cd /Users/vvc/.openclaw/workspace/stock-system

# 启动API服务
node api/server.js

# 启动条件单监控（后台）
./scripts/start-monitor.sh
```

### 访问系统

- 主页: http://localhost:3000/index.html
- API文档: 见 `docs/api-reference.md`

---

## 👥 项目团队

| 角色 | 职责 | 当前担当 |
|------|------|----------|
| **项目经理** | 规划、分配、跟踪、沟通 | 灵爪 |
| **程序员** | 编码、自测、文档、交接 | Codex / Qwen / Gemini CLI |
| **验收员** | 审查、测试、记录、报告 | Gemini CLI |

详细规范见: `docs/PROJECT_ROLES.md`

---

## 📝 工作日志

项目采用"项目内实时状态 + 外部事件日志"并行记录：

| 日志类型 | 触发时机 | 存储位置 |
|----------|----------|----------|
| 实时状态 | 任务进入 `in_progress` 后每次阶段变化 | `docs/runtime/TASK_{ID}_STATUS.md` |
| 任务分配/开发/验收/修复事件 | 每次关键节点 | `/Users/vvc/.openclaw/workspace/memory/project/stock_system/` |
| 项目内进度补充 | 需要在仓库内留痕时 | `memory/project_log.md` |

详细规范见: `docs/WORK_LOG_POLICY.md`

---

## 🔀 GitHub 开发流程

项目采用"项目内状态优先 + GitHub PR 审查 + 本地验收"的协作流程。

### 基本原则

- 项目内文档是接力真源，GitHub PR 是代码审查入口
- `docs/runtime/TASK_{ID}_STATUS.md` 必须先更新，再提交分支和 PR
- GitHub Code Review 负责首轮审查，不替代本地脚本执行和最终验收
- `todo.db` 和工作区 `memory/project/stock_system/` 仍作为外部管理/审计层，不替代项目内证据

### 标准流程

1. 项目经理拆分任务，确保一个子任务可以形成一个小 PR
2. 开发者在本地完成该子任务
3. 提交前更新 `docs/runtime/TASK_{ID}_STATUS.md`
4. 推送分支并创建 GitHub PR
5. 触发 Codex Code Review 进行首轮审查
6. 根据 review 结果继续修复
7. 在本地执行真实验收命令，确认脚本、接口或页面行为
8. 验收通过后更新 `docs/runtime/`、`memory/project_log.md`，必要时补 `docs/acceptance/` 或 `docs/fixes/`

### 验收闭环流程

**验收不通过时的处理**:

```
验收不通过
  ↓
生成修复报告 (docs/fixes/TASK_{ID}_FIX_{N}.md)
  ↓
修复问题 → 提交新 PR 或更新现有 PR
  ↓
重新验收（回归测试 + 修复验证）
  ↓
├─ 通过 → 合并 PR → 任务关闭
└─ 不通过 → 继续修复循环
```

**修复报告要求**:
- 必须对应验收报告中的问题 ID
- 说明修复方案和修改文件
- 包含回归测试结果
- 申请复验确认

**状态流转**:
```
in_progress → pending_review → in_review → done
                       ↑           ↓
                       └──────←────┘
                      (循环直到通过)
```

**详细规范**: 见 `docs/PROJECT_ROLES.md` 第五章「重新验收流程」

### PR 粒度要求

- 推荐一个可独立验收的子任务对应一个 PR
- 推荐把脚本修复、接口修复、文档同步拆成独立 PR
- 避免把功能开发、数据修复、页面改版和大量文档改写混在同一个 PR

### 角色分工

- 项目经理：拆任务、推动 PR 流程、同步外部任务系统
- 开发者：实现改动、自测、更新项目内状态、提交 PR
- GitHub Code Review：负责首轮代码审查
- 验收者：负责本地复验、查看输出、确认是否通过，并补项目内记录

### 并行开发模式（效率优先 ✅）

**核心原则**: 并行开发、并行 PR、并行验收

**流程对比**:
```
串行模式（低效）: A 开发→A PR→A 验收→B 开发→B PR→B 验收
并行模式（高效）: A 开发→A PR→A 验收
                  B 开发→B PR→B 验收
                  C 开发→C PR→C 验收
```

**执行规范**:
1. **任务拆分**: 项目经理把大任务拆成独立子任务（依赖最小化）
2. **并行开发**: 多个开发者同时开发不同子任务，每个子任务独立分支
3. **并行 PR**: 每个子任务完成后立即创建 PR，并行触发 `@codex review`
4. **并行验收**: 多个验收任务同时处理，验收通过立即合并，不阻塞其他任务

**效率提升**:
- 交付周期：6 天 → 2 天（**3x 提升**）
- PR 等待时间：长队列 → 即时处理（**5x 提升**）
- 反馈循环：慢 → 快（**3x 提升**）

**适用场景**:
- ✅ 大任务拆分成多个独立子任务
- ✅ 多个开发者可用
- ✅ 子任务之间依赖关系弱

**本项目应用**:
- `TASK_016` 阶段 5 拆分为 5 个子任务（5A-5E），并行开发
- 每个子任务独立 PR、独立验收、独立合并

---

## 🛠️ 外部工具调用规范

### Codex 调用方法

**✅ 正确方式：后台 CLI 调用**
```bash
cd /Users/vvc/.openclaw/workspace/stock-system && \
codex exec "你是程序员/验收员，请..." &
```

**⚠️ 配置要求**:
- Codex 需要配置代理：`export HTTP_PROXY=... HTTPS_PROXY=...`
- 使用 `exec` 子命令进行非交互式任务
- 长任务用 `&` 后台执行

**❌ 禁止方式**:
- 不要使用 ACP/sessions_spawn（Codex 不在允许列表中）
- 不要直接用 `codex -p`（参数解析问题）

**示例**:
```bash
# 开发任务
codex exec "你是程序员，请实现飞书推送接口..." &

# 验收任务
codex exec "你是验收员，请对 TASK_016 进行验收..." &
```

### Claude Code 调用方法

**✅ 正确方式：后台 CLI 调用**
```bash
cd /Users/vvc/.openclaw/workspace/stock-system && \
claude -p "你的任务描述" &
```

**⚠️ 配置要求**:
- Claude Code 配置已就绪（火山引擎/百炼）
- 不需要代理
- 使用 `-p` 参数传递提示词

**示例**:
```bash
# 开发任务
claude -p "你是程序员，请修复测试脚本..." &
```

### 工具选择建议

| 场景 | 推荐工具 | 原因 |
|------|----------|------|
| 代码开发 | Claude Code | 配置简单，不需要代理 |
| 代码验收 | Codex | 擅长审查和测试 |
| 文档编写 | Claude Code | 文档质量高 |
| 复杂重构 | Codex | 代码理解能力强 |

---

## 📊 当前任务状态

| 任务ID | 内容 | 状态 | 负责人 |
|--------|------|------|--------|
| TASK_016 | 每日监控 - 技术指标+事件监控（盘后） | in_progress | Claude Code 开发 / Codex 验收 |
| TASK_OPT_004 | 策略结构化改造 | done | Codex |
| TASK_OPT_003 | 待选池标记已添加股票功能 | done | Codex |
| TASK_OPT_005 | 模拟账户数据库设计与实现 | done | Codex |
| TASK_INDUSTRY_MONITOR | 行业监控模块修复与复核 | done | Claude Code 开发 / Codex 验收 |

完整任务列表: 使用 `todo.sh entry list --group="🔴重要紧急-股票投资系统"`

实时接力入口：
- `docs/TASK_STATUS_TEMPLATE.md`
- `docs/runtime/TASK_016_STATUS.md`
- `docs/runtime/TASK_OPT_004_STATUS.md`
- `docs/runtime/TASK_INDUSTRY_MONITOR_STATUS.md`

---

## 🔧 最近更新

### 2026-03-20
- ✅ 补齐项目内实时状态文件，新增 `docs/runtime/` 作为接力入口
- ✅ 新增 `docs/TASK_STATUS_TEMPLATE.md`，项目内可直接创建任务状态文件
- ✅ 新增 `docs/CLAUDE_TASK_DISPATCH_TEMPLATE.md`，固化 Claude 小任务派发、调用和验收模板
- ✅ 策略结构化改造任务完成：确认 `api/analyze.js` 中新增 `buildStructuredStrategy` 函数，并在最终 payload 返回 `strategy` 字段（TASK_OPT_004 完成）
- ✅ 行业监控模块完成修复并通过复验：`node --check` 通过，`node acceptance-check.js` 通过
- ✅ 已修复两个阻塞点：日报 SQL SQLite 兼容性、`acceptance-check.js` 纯语法检查
- ✅ TASK_016 第一阶段落地：新增 `scripts/daily-monitor.mjs`，已可读取持仓、关联报告并生成本地 JSON 监控报告
- ✅ TASK_016 第二阶段落地：监控报告已可解析 HTML 报告中的 `decision`、`report_score`、策略文案、关键观察点、操作建议、风险控制与脚注
- ✅ TASK_016 第三阶段落地：监控报告已可为持仓生成 `monitor_assessment`，为账户生成 `summary`，并在顶层输出 `overview`
- ✅ TASK_016 修复汇总口径：`overview.headline` 不再在"有持仓但盈亏为零"场景下误报"无持仓"
- ✅ TASK_016 第四阶段落地：监控报告已可结构化输出 `watch_items`、`risk_alerts`，并在账户和全局层输出对应计数

### 2026-03-19
- ✅ 修复条件单执行失败（`current_cash` NULL约束问题）
- ✅ 重启条件单监控服务

### 2026-03-18
- ✅ 创建项目主页 `index.html`
- ✅ 创建选股报告页面 `report.html`
- ✅ 修复评分逻辑（统一数据源）
- ✅ 新增委员会意见和策略建议
- ✅ 修复监控池按钮和状态栏
- ✅ 安全修复（命令注入、SQL注入、飞书推送安全）

---

## 📋 相关文档

| 文档 | 说明 |
|------|------|
| `PROJECT_ROLES.md` | 三角色分工与职责规范 |
| `WORK_LOG_POLICY.md` | 六类日志登记制度 |
| `FIX_SUMMARY_TEMPLATE.md` | 修复总结文档模板 |
| `CLAUDE_TASK_DISPATCH_TEMPLATE.md` | Claude Code 小任务派发与验收模板 |
| `api-reference.md` | API接口参考 |
| `monitor-guide.md` | 监控服务使用指南 |
| `security-fixes-2026-03-18.md` | 安全修复记录 |

---

## 🎯 下一步计划

1. **盘后监控开发**（任务16）
   - 多样本与容错校验
   - 基本面变化监控（公告/财报/新闻）
   - 飞书推送集成

2. **状态核实与文档闭环**
   - 核实 `TASK_OPT_004` 是否真实满足设计共识
   - 为活跃任务持续维护 `docs/runtime/`

3. **系统优化**
   - 性能监控
   - 日志完善
   - 文档补充

---

_🐾 规范化是项目质量的基石，严格执行才能避免混乱。_
