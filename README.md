# A 股股票投资系统

> 基于新浪财经免费 API 的 A 股投资分析与交易系统

## ⚠️ 数据源说明

### 核心数据源：新浪财经免费 HTTP API

**实时数据查询**统一使用 `lib/sina-free-api.js`：

| 数据类型 | API 函数 | 说明 |
|----------|----------|------|
| **实时行情** | `getQuote()`, `getQuotes()` | 替代收费 MCP 服务 |
| **分钟线数据** | `getMinuteData()` | 5/15/30/60 分钟 K 线 |
| **板块成分股** | `getSectorComponents()` | 行业板块成分股 |

**优势**：
- ✅ 免费使用，无调用限制
- ✅ 无需 Token 配置
- ✅ 数据实时性好
- ✅ 覆盖 A 股全市场（沪深北）

### 公司公告数据源（2026-04-02 更新）

持仓监控公告链路采用“双数据源”：

| 优先级 | 数据源 | 说明 |
|------|------|------|
| **主数据源** | AkShare | 免费公告数据，默认使用 |
| **备用数据源** | 新浪财经 MCP | AkShare 无数据或失败时自动回退 |

**说明**：
- 实时行情/分钟线/板块成分股：仍使用新浪免费 HTTP API
- 公司公告：`api/position-signals.js` 优先 AkShare，失败时回退 Sina MCP

## 📚 文档路由

### 核心文档
| 文档 | 路径 | 说明 |
|------|------|------|
| 项目进度总览 | `docs/PROJECT_PROGRESS.md` | **唯一进度真源** |
| 设计共识 | `docs/DESIGN_CONSENSUS.md` | 系统设计基准 |
| 版本历史 | `docs/VERSIONS.md` | 版本演进记录 |

### 开发规范
| 文档 | 路径 | 说明 |
|------|------|------|
| 角色分工 | `docs/PROJECT_ROLES.md` | 三角色职责 |
| 工作日志 | `docs/WORK_LOG_POLICY.md` | 日志登记制度 |
| API 契约流程 | `docs/API_CONTRACT_FLOW.md` | ✅ 已创建 |
| 项目教训 | `docs/PROJECT_LESSONS.md` | 经验沉淀 |

### 任务文档
| 文档 | 路径 | 说明 |
|------|------|------|
| 任务分配单 | `docs/tasks/TASK_{ID}_ASSIGNMENT.md` | 任务需求 |
| 实时状态 | `docs/runtime/TASK_{ID}_STATUS.md` | 任务进展 |
| 交接文档 | `docs/handover/TASK_{ID}_HANDOVER.md` | 工作交接 |
| 验收报告 | `docs/acceptance/TASK_{ID}_ACCEPTANCE.md` | 验收结论 |

### 技术文档
| 文档 | 路径 | 说明 |
|------|------|------|
| API 参考 | `docs/api-reference.md` | API 接口文档 |
| 测试指南 | `docs/CLI_ACCEPTANCE_GUIDE.md` | CLI 验收操作 |

### 项目日志
- 当天记录：`memory/YYYY-MM-DD.md`
- 项目记忆：`memory/project/stock_system/`

---

## 🚀 快速开始

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node api/server.js
```

访问：`http://127.0.0.1:3000`

### 双击启动（macOS）

- 双击项目根目录：`启动服务.command`
- 停止服务：双击 `停止服务.command`
- 日志文件：`logs/server.out.log`

---

## 📊 当前状态

**最后更新**: 2026-04-02 08:35  
**设计文档**: 查看 [`docs/design/2026-03-29-seven-factor-optimization-engineering-plan.md`](docs/design/2026-03-29-seven-factor-optimization-engineering-plan.md)  
**设计共识**: 查看 [`docs/DESIGN_CONSENSUS.md`](docs/DESIGN_CONSENSUS.md) 第十七节  
**详细进度**: 查看 [`docs/PROJECT_PROGRESS.md`](docs/PROJECT_PROGRESS.md)

**新增设计**：四维度七因子策略优化重构方案（分层优化架构）  
**昨日进展同步**：`TASK_MOCK_001~005` 已完成，`TASK_MOCK_006` 进行中（以 `docs/PROJECT_PROGRESS.md` 与 `docs/runtime/` 为准）
