# 股票系统 - 项目进度总览

**最后更新**: 2026-04-02 08:35  
**项目经理**: 灵爪  
**程序员**: Claude Code（按任务分配）  
**验收员**: Gemini CLI（按任务分配）  

---

## 📋 今日完成（2026-04-01）

### 数据源架构确认（20:30-20:39）

**任务**：排查新浪财经 MCP 使用情况，统一切换到免费 API

**排查结果**：
- MCP 使用：财经早报采集、持仓监控公告、新闻数据库
- 免费 API 使用：实时行情、分钟线数据、板块成分股

**决策**：保持两层架构
- 采集层：MCP（批量采集、历史可查）
- 查询层：免费 API（实时查询、无 Token 限制）

**文档更新**：
- ✅ README.md - 添加数据源说明章节
- ✅ DESIGN_CONSENSUS.md - 添加 9.3 数据源架构
- ✅ memory/2026-04-01.md - 当天工作记录
- ✅ memory/project/stock_system/ - 创建记忆锚点

### 独立模拟账户主线推进（22:00-23:35）

**任务完成**：
- ✅ TASK_MOCK_001：4 张模拟表迁移完成（mock_account/mock_position/mock_trade/mock_performance）
- ✅ TASK_MOCK_002：模拟交易引擎 API 完成（`POST /api/mock/trade/execute`，BUY/SELL 实测通过）
- ✅ TASK_MOCK_003：绩效计算脚本完成（`scripts/calculate_mock_performance.mjs`）
- ✅ TASK_MOCK_004：偏差人工触发二次迭代接口完成（`POST /api/iteration/trigger-by-deviation`）
- ✅ TASK_MOCK_005：模拟账户管理 API 完成（`/api/mock/*`）
- 🟡 TASK_MOCK_006：`mock-account.html` 页面初版完成，待浏览器细验收

**三保险同步**：
- ✅ `docs/tasks/TASK_MOCK_00{1..6}_ASSIGNMENT.md`
- ✅ `docs/runtime/TASK_MOCK_00{1..6}_STATUS.md`
- ✅ `memory/project/stock_system/2026-04-01T*.json`

---

## 📊 任务状态总览

### 四维度七因子策略优化（2026-03-29 设计）

| 任务 ID | 任务名称 | 优先级 | 状态 | 说明 |
|---------|----------|--------|------|------|
| **TASK_OPTIMIZE_001** | **筛选层参数扩展** | **P0** | 🟢 done | 搜索空间已覆盖 min_score/pe_max/peg_max/max_price + 风控参数 |
| **TASK_OPTIMIZE_002** | **四维度权重搜索接入** | **P0** | 🟢 done | 4 维权重归一化采样与回测消费链路已落地 |
| **TASK_OPTIMIZE_003** | **样本外验证最小闭环** | **P0** | 🟢 done | Optuna 输出 validation(IS/OOS/WFE) 并在页面展示 |
| **TASK_OPTIMIZE_004** | **七因子权重搜索接入** | **P1** | 🟢 done | 已加入 0.03~0.40 边界约束 + 归一化 sum=1 |
| **TASK_OPTIMIZE_005** | **多目标评分函数** | **P1** | 🟢 done | objective 已接入交易样本/回撤/负收益惩罚项 |
| **TASK_OPTIMIZE_006** | **网格参数独立优化** | **P1** | 🟢 done | `/api/grid-optimizer/run` 已修复崩溃并可稳定返回结果 |
| **TASK_OPTIMIZE_007** | **Walk-Forward 分析** | **P2** | 🟢 done | API 已落地并完成数据前置修复，`/api/walk-forward/run` 实测成功 |
| **TASK_OPTIMIZE_008** | **市场状态切换** | **P2** | 🟢 done | 识别+展示+边界切换+回归测试已完成 |
| **TASK_OPTIMIZE_009** | **因子稳定性指标** | **P2** | 🟢 done | 已接入 IC/IC衰减/行业偏离与页面展示 |

### 独立模拟账户（2026-04-01 设计）

| 任务 ID | 任务名称 | 优先级 | 状态 | 说明 |
|---------|----------|--------|------|------|
| **TASK_MOCK_001** | **数据库迁移：4 张模拟表** | **P0** | 🟢 done | mock_account/position/trade/performance 已建表并验收 |
| **TASK_MOCK_002** | **模拟交易引擎 API** | **P0** | 🟢 done | `POST /api/mock/trade/execute` 已落地并完成 BUY/SELL 实测 |
| **TASK_MOCK_003** | **绩效计算脚本** | **P0** | 🟢 done | `calculate_mock_performance.mjs` 已落地并完成落库验收 |
| **TASK_MOCK_004** | **偏差检测 + 二次迭代触发** | **P1** | 🟢 done | 已实现人工触发接口 `/api/iteration/trigger-by-deviation` |
| **TASK_MOCK_005** | **模拟账户管理 API** | **P1** | 🟢 done | `/api/mock/*` 账户/交易/绩效/告警接口已落地 |
| **TASK_MOCK_006** | **前端页面：mock-account.html** | **P1** | 🟡 in_progress | 页面初版已落地，待浏览器验收与细节收口 |

### 体验治理与版本管理（2026-04-01 新增）

| 任务 ID | 任务名称 | 优先级 | 状态 | 说明 |
|---------|----------|--------|------|------|
| **TASK_UI_REFINEMENT_001** | **迭代管理器与策略导入体验重构** | **P0** | 🟢 done | A:导航统一 B:版本筛选/归档 C:select 导入固定底栏 |

---

| 任务 ID | 任务名称 | 优先级 | 状态 | 负责人 | 进度 |
|---------|----------|--------|------|--------|------|
| **TASK_FLOW_REFACTOR_001** | **系统总闭环梳理（研究流程/执行流程/策略库中枢）** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_002** | **执行流页面文案收口（select/analysis）** | **P0** | **🟢 done** | **Codex / Claude Code / Gemini CLI** | **100%** |
| **TASK_FLOW_REFACTOR_003** | **研究流页面文案收口（backtest/iteration-manager）** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_004** | **策略库导入身份同步（select）** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_005** | **执行流程策略身份字段统一（select）** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_006A** | **执行流上下文传递：analysis → monitor draft** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_006B** | **执行流上下文传递：monitor draft → batch 参数** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_006C1** | **执行流上下文传递：conditional-order 前端透传** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_006C2A** | **执行流上下文持久化：conditional-order context 侧表写入** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_006C2B** | **执行流上下文持久化：conditional-order 查询聚合侧表** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_006C2C1** | **执行流上下文持久化：report-storage 导入路径对齐侧表** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_006C2C2** | **执行流上下文持久化：backtest-to-conditional 导入路径对齐侧表** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_006C2C3** | **执行流上下文持久化：conditional-order 报告导入旧写法对齐侧表** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_007A** | **执行反馈回流：execution_feedback migration** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_007B** | **执行反馈回流：条件单成交写 simulated_trade** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_007C** | **执行反馈回流：触发未成交写 conditional_trigger** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_017A** | **执行流可见性：analysis 策略上下文 banner** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_017B** | **执行流浏览器回归：analysis → monitor-pool** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_017C** | **执行流浏览器回归：analysis → monitor-pool → conditional-order** | **P0** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_FLOW_REFACTOR_018A** | **研究流发布桥收口：发布即公开可见** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_018B** | **策略库页面反馈展示：public API + feedback 摘要** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_019A** | **V5 研究输入显式化：页面摘要 + parallelTasks 提交** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_019B** | **V5 任务输入摘要：status API 回显** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_020A** | **V5 任务快照持久化：status 回读 SQLite 快照** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_020B** | **V5 页面刷新恢复：恢复最近迭代任务** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_021A** | **V5 运行态展示增强：恢复后显示当前任务输入与最佳结果** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_022A** | **V5 结果摘要持久化：status 回读 resultSummary** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_022B** | **V5 结果摘要展示：恢复后显示任务结果摘要** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_023A** | **V5 恢复链路回归：刷新恢复任务的轻量页面测试** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_023B** | **V5 终态恢复回归：completed/stopped 轻量页面测试** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_024A** | **V5 终态徽标语义修复：stopped/failed 不再误报完成** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_024B** | **V5 回归入口收口：iteration-manager 测试纳入默认 runner** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_025A** | **旧红灯收口：TASK_TEST_001 mock/数据口径修复** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_025B** | **旧红灯收口：TASK_TEST_002 mock/字段语义修复** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_025C** | **旧红灯收口：TASK_TEST_003 交易日起点 mock 修复** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_025D** | **旧红灯收口：TASK_TEST_004 性能测试 mock/缓存口径修复** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_026A** | **V5_007 最小闭环：真实评分 CLI** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_026B** | **V5_007 最小闭环：Optuna 脚本接入真实评分 CLI** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_026C** | **V5_007 环境收口：安装 optuna 并跑通 1-trial smoke** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_027A** | **V5_007 研究流接入：iteration-manager 后端支持 optuna 启动** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_027B** | **V5_007 研究流接入：iteration-manager 页面支持 optimizationBackend** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_027C** | **V5_007 研究流接入：浏览器 smoke 验证 optuna 请求链路** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_028A** | **V5_007 可见性收口：research input summary 展示 optimizationBackend** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_028B** | **V5_007 可见性收口：默认 heuristic 路径回显 optimizationBackend** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_029A** | **V5_007 恢复态收口：恢复任务时同步 optimizationBackend 下拉框** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_029B** | **V5_007 恢复态回归：浏览器 smoke 验证 backend 控件同步** | **P0** | **🟢 done** | **Codex / subagent** | **100%** |
| **TASK_FLOW_REFACTOR_030A** | **V5_007 停止链路收口：optuna 手动停止终止子进程并保持 stopped** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_030B** | **V5_007 停止态展示收口：前端按 stop 接口快照展示 stopped** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_030C** | **V5_007 可读性收口：停止原因枚举值映射为中文文案** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_031A** | **V5_007 健壮性收口：进度条防 NaN/Infinity 与越界** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_031B** | **V5_007 启动参数收口：maxIterations/scoreThreshold/parallelTasks 归一化** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_031C** | **V5_007 兼容性收口：修复 031B 引出的 iteration-manager 回归测试漂移** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_031D** | **V5_007 总测收口：run-all-tests 恢复 42/42 全通过** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_032A** | **文档口径收口：README 与 PROJECT_PROGRESS 统一到单一真源** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_033A** | **V5 深化任务登记：未做项拆解并纳入三保险跟踪** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_033B** | **V5_007 深化：Optuna 结果结构化沉淀（trial 维度）** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_033C** | **V5_007 深化：中等规模 trial 回归与稳定性验证** | **P0** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_033D** | **V5 研究→策略库闭环增强：优化结果发布口径统一** | **P1** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_034A** | **文档真源回写：V3 阶段 3/4 pending 口径与 runtime 对齐** | **P1** | **🟢 done** | **Codex** | **100%** |
| **TASK_FLOW_REFACTOR_034B** | **V5 规划对照回写：TASK_V5_000 规划项与落地证据映射** | **P1** | **🟢 done** | **Codex** | **100%** |
| TASK_P0_001 | 黑天鹅检测模块 | P0 | 🟢 accepted | 灵爪 | 100% |
| TASK_P0_002 | 舆情因子计算模块 | P0 | 🟢 accepted | 灵爪 | 100% |
| TASK_P0_003 | 因子快照库模块 | P0 | 🟢 accepted | 灵爪 | 100% |
| TASK_P0_004 | 7 因子整合模块 | P0 | 🟢 accepted | 灵爪 | 100% |
| TASK_P1_001 | LLM 情感分析模块 | P1 | 🟢 accepted | 灵爪 | 100% |
| TASK_P1_002 | 异步流水线模块 | P1 | 🟢 accepted | 灵爪 | 100% |
| TASK_P1_003 | 时间衰减函数优化 | P1 | 🟢 accepted | 灵爪 | 100% |
| TASK_POSITION_MONITOR | 持仓监控功能 | P0 | 🟢 accepted | 灵爪 | 100% |
| ~~TASK_BACKTEST_SYSTEM_001~~ | ~~回测系统完整功能实现~~ | ~~P0~~ | ~~🟢 accepted~~ | ~~Claude Code~~ | ~~100%~~ |
| ~~└─ TASK_BACKTEST_001~~ | ~~策略执行脚本数据库导出~~ | ~~P0~~ | ~~🟢 accepted~~ | ~~Claude Code~~ | ~~100%~~ |
| ~~└─ TASK_BACKTEST_002~~ | ~~回测引擎核心功能~~ | ~~P0~~ | ~~🟢 accepted~~ | ~~Claude Code~~ | ~~100%~~ |
| ~~└─ TASK_BACKTEST_003~~ | ~~回测报告生成~~ | ~~P0~~ | ~~🟢 accepted~~ | ~~Claude Code~~ | ~~100%~~ |
| ~~└─ TASK_BACKTEST_004~~ | ~~策略参数扫描回测~~ | ~~P1~~ | ~~🟢 accepted~~ | ~~Claude Code~~ | ~~100%~~ |
| ~~└─ TASK_BACKTEST_005~~ | ~~行情阶段识别框架~~ | ~~P1~~ | ~~🟢 accepted~~ | ~~Claude Code~~ | ~~100%~~ |
| **TASK_CODEX_FIX_001~005** | **PR #4 遗留问题修复** | **P0** | **🟢 accepted** | **灵爪** | **100%** |
| └─ TASK_CODEX_FIX_001 | analyze.js ReferenceError 修复 | P0 | 🟢 accepted | 灵爪 | 100% |
| └─ TASK_CODEX_FIX_002 | portfolio.js 清仓损益修复 | P0 | 🟢 accepted | 灵爪 | 100% |
| └─ TASK_CODEX_FIX_003 | monitor.js DB 方法修复 | P0 | 🟢 accepted | 灵爪 | 100% |
| └─ TASK_CODEX_FIX_004 | backtest.js 年化收益修复 | P0 | 🟢 accepted | 灵爪 | 100% |
| └─ TASK_CODEX_FIX_005 | backtest.js 字段名修复 | P0 | 🟢 accepted | 灵爪 | 100% |
| **TASK_BACKTEST_FIX_001** | **回测系统端到端修复** | **P0** | **🟢 accepted** | **灵爪** | **100%** |
| └─ FIX_001_01 | 股票代码格式转换 | P0 | 🟢 accepted | 灵爪 | 100% |
| └─ FIX_001_02 | orderConfig 作用域修复 | P0 | 🟢 accepted | 灵爪 | 100% |
| └─ FIX_001_03 | 数据库连接优化 | P0 | 🟢 accepted | 灵爪 | 100% |
| **TASK_100** | **回测界面核心功能** | **🔴重要紧急** | **🟢 done** | **Claude Code** | **100%** |
| **TASK_99** | **条件单因子权重面板** | **🔴重要紧急** | **🟢 done** | **灵爪** | **100%** |
| **TASK_109** | **v2.0 架构规划文档** | **🔴重要紧急** | **🟢 done** | **灵爪** | **100%** |
| **TASK_POSITION_MONITOR_002** | **持仓监控公告推送优化（选项 C）** | **🔴重要紧急** | **🟢 done** | **灵爪** | **100%** |
| **TASK_ITERATION_MANAGER_FIX_001** | **策略版本总收益显示格式修复** | **🔴重要紧急** | **🟢 done** | **灵爪** | **100%** |
| **TASK_103** | **条件单界面重构：stock_analyzer.py 结构化改造** | **🔴重要紧急** | **🟢 done** | **Claude Code** | **100%** |
| **TASK_104** | **analysis.js API 适配 v2** | **🔴重要紧急** | **🟢 done** | **Claude Code** | **100%** |
| **TASK_SELECT_FIX_001** | **选股功能割裂问题修复** | **🔴重要紧急** | **🟢 done** | **灵爪** | **100%** |
| └─ 问题 1 | 选股逻辑割裂（行业指数 vs 概念板块） | P0 | 🟢 fixed | 灵爪 | 100% |
| └─ 问题 2 | 休市日数据为空（ths_hot 接口） | P0 | 🟢 fixed | 灵爪 | 100% |
| └─ 问题 3 | 个股评分缺失 | P0 | 🟢 fixed | 灵爪 | 100% |
| **TASK_V4_V5_E2E_FIX_001~004** | **V4/V5 E2E 验收失败修复** | **🔴重要紧急** | **🟢 done** | **灵爪** | **100%** |
| └─ TASK_E2E_FIX_001 | stock_factor_snapshot 数据回填 | P0 | 🟢 done | 灵爪 | 100% |
| └─ TASK_E2E_FIX_002 | backtest.html 添加#maxPosition 控件 | P0 | 🟢 done | 灵爪 | 100% |
| └─ TASK_E2E_FIX_003 | V5 迭代管理器 API 实现 | P0 | 🟢 done | 灵爪 | 100% |
| └─ TASK_E2E_FIX_004 | 回测结果显示修复 | P0 | 🟢 done | 灵爪 | 100% |
| **TASK_E2E_FIX_005** | **日期选择器禁用非交易日 UI** | **🔴重要紧急** | **🟢 done** | **灵爪** | **100%** |
| └─ 前端 | Flatpickr 日历组件，非交易日灰色禁用 | P0 | 🟢 done | 灵爪 | 100% |
| └─ 后端 | select.js 调整到上一个交易日 | P0 | 🟢 done | 灵爪 | 100% |
| └─ 后端 | market-data.js 优先查询数据库 | P0 | 🟢 done | 灵爪 | 100% |
| **TASK_SNAPSHOT_006** | **选股报告保存功能** | **🔴重要紧急** | **🟢 done** | **Codex / Claude Code** | **100%** |
| **TASK_SNAPSHOT_001~005** | **历史快照数据表 + 回填** | **🔴重要紧急** | **🟢 done** | **Gemini CLI / Codex** | **100%** |

---

## 📋 状态说明

### ✅ 已完成任务（持续累计）

所有 P0/P1 任务已完成并验收通过。

**最新完成** (2026-03-28):
- TASK_FLOW_REFACTOR_042B: 已修复选股页四维评分全为 3 分的问题，确认根因包括服务未加载 `.env` 中的 `TUSHARE_TOKEN` 与快照分支固定维度占位；实时路径与历史快照路径现均返回非固定四维
- TASK_FLOW_REFACTOR_042A: 选股页已恢复“完整方向选择 -> 带参进入个股分析”链路，并在个股分析页补来源提示；本地浏览器验收确认 10 个高分方向可选、默认带入 Top3 且支持手动扩选
- TASK_RELEASE_001: PR #9 已合并 `main`，GitHub Pages 已恢复上线并完成线上 smoke 验收（首页/select/backtest/iteration-manager 全部 200）
- TASK_FLOW_REFACTOR_041C: `TASK_V5_000_RECONCILIATION` 已同步最新落地证据，V5_008 口径更新为“已落地（持续优化）”
- TASK_FLOW_REFACTOR_041B: iteration-manager 页面导出入口已支持 Markdown/HTML 可选，前端导出链路与后端格式能力一致
- TASK_FLOW_REFACTOR_041A: 迭代报告导出新增 `format=html`（JSON + download 双模式），并完成合同与回归覆盖，默认总测保持 50/50
- TASK_FLOW_REFACTOR_040B: V5 结果摘要新增 tuningPlan（执行清单+约束条件），报告导出新增“执行清单/约束条件”章节，默认总测保持 50/50
- TASK_FLOW_REFACTOR_040A: V5 二次迭代决策树增强（偏差/夏普/收益结构/未达阈值完成态规则），默认总测升级为 50/50
- TASK_FLOW_REFACTOR_039C: README 与 runtime 测试口径已统一，默认总测当前口径固定为 49/49
- TASK_FLOW_REFACTOR_039B: `iteration-manager-default-backend.test.js` 已改为无端口模式，独立执行不再触发 listen EPERM
- TASK_FLOW_REFACTOR_039A: iteration-manager 相关默认总测脚本已完成无端口改造，沙箱下默认总测恢复 49/49 全通过
- TASK_FLOW_REFACTOR_038A: 已修复 strategy-template 路由顺序（/default 优先于 /:id），新增无端口回归测试并接入默认总测
- TASK_FLOW_REFACTOR_034B: 已新增 `TASK_V5_000` 规划项与落地证据对照文档，保留规划态 pending 同时补足执行态可追溯映射
- TASK_FLOW_REFACTOR_034A: 已将 V3 阶段 3/4 的 pending 口径按 runtime 验收证据回写为 done，V3 总体进度更新为 21/21
- TASK_FLOW_REFACTOR_033D: 已统一研究版本发布到策略库的反馈 summary 口径，补齐 `position_closed_count/total_realized_pnl` 等字段，并为历史快照缺字段场景补渲染回退，默认总测保持 43/43
- TASK_FLOW_REFACTOR_033C: 已新增中等规模 Optuna trial 回归（40/55/80）并纳入默认总测，验证 resultSummary trial 字段稳定，默认总测提升到 43/43
- TASK_FLOW_REFACTOR_033B: 已将 Optuna trial 维度信息（计划试验数/完成试验数）沉淀到 resultSummary，页面结果摘要已展示并通过总测 43/43
- TASK_FLOW_REFACTOR_033A: 已完成 V5 未闭环项拆解，并纳入 runtime/PROJECT_PROGRESS/memory 三保险持续跟踪
- TASK_FLOW_REFACTOR_032A: README 已改为“进度真源在 PROJECT_PROGRESS/runtime”，移除 V4/V5 旧完成口径冲突
- TASK_FLOW_REFACTOR_031D: 默认总测已恢复全绿（`tests/run-all-tests.js` = `42/42`），随机波动和函数抽取兼容问题已收口
- TASK_FLOW_REFACTOR_031C: 修复 `formatResultReason` 在子集测试环境缺失的问题，并同步快照测试期望到新参数归一化口径
- TASK_FLOW_REFACTOR_031B: 启动接口已归一化关键参数，非法输入不再污染任务快照和 optuna trial 配置
- TASK_FLOW_REFACTOR_031A: `updateProgress()` 已补数值归一化与 clamp，异常快照下不再出现 `NaN%/Infinity%`
- TASK_FLOW_REFACTOR_030C: 结果摘要停止原因已映射为中文可读文案，不再直接展示 `manual_stop`
- TASK_FLOW_REFACTOR_030B: stop API 返回全量任务快照，前端停止后按 `stopped` 实际状态展示，不再误回到 `idle`
- TASK_FLOW_REFACTOR_030A: 修复 `optuna` 手动停止链路，停止时会终止子进程，且状态保持 `stopped` 不再误转 `failed`
- TASK_FLOW_REFACTOR_029B: 已新增恢复态浏览器 smoke，验证恢复最近任务后 `optimizationBackend` 下拉框与任务真实值一致
- TASK_FLOW_REFACTOR_029A: 恢复最近任务时，`iteration-manager` 会同步 `optimizationBackend` 下拉框，避免摘要与控件口径漂移
- TASK_FLOW_REFACTOR_028B: 后端默认路径也稳定回显 `optimizationBackend=heuristic`，恢复摘要不再出现“未导入优化后端”
- TASK_FLOW_REFACTOR_028A: `iteration-manager` 研究输入摘要已新增“优化后端”展示块
- TASK_FLOW_REFACTOR_027C: 已补 Playwright 浏览器 smoke，验证 `iteration-manager` 在真实浏览器里会带上 `optimizationBackend=optuna` 与导入后的 `parallelTasks`
- TASK_FLOW_REFACTOR_027B: `iteration-manager.html` 已新增 `heuristic / optuna` 选择器，启动请求会显式提交 `optimizationBackend`
- TASK_FLOW_REFACTOR_027A: `iteration-manager` 后端已正式支持 `optimizationBackend=optuna`，可从研究流启动真实优化脚本
- TASK_FLOW_REFACTOR_026C: 当前环境已安装 `optuna 4.8.0`，并用真实数据库样本跑通了 `1` 个真实 trial；V5_007 进入“最小可运行”状态
- TASK_FLOW_REFACTOR_026B: `scripts/optuna_optimizer.py` 已移除 `75.0` 占位分数，`objective()` 改为调用真实评分 CLI；当前只剩环境未安装 `optuna`
- TASK_FLOW_REFACTOR_026A: 已新增 `scripts/real_score_cli.mjs`，用 `BacktestEngine + quickScore` 打通最小真实评分闭环，并显式拦住 mock 数据降级
- TASK_FLOW_REFACTOR_025D: `TASK_TEST_004` 的 SQL mock 识别已收口，性能测试由 `4/2` 收口为 `6/0`；默认 `run-all-tests` 达到 `42/42`
- TASK_FLOW_REFACTOR_025C: `TASK_TEST_003` 的交易日起点 mock 已对齐，完整流程集成测试由 `5/1` 收口为 `6/0`；总 runner 提升到 `40/42`
- TASK_FLOW_REFACTOR_025B: `TASK_TEST_002` 的 mock/字段语义已收口，回测引擎集成测试由 `4/4` 收口为 `8/0`；总 runner 提升到 `39/42`
- TASK_FLOW_REFACTOR_025A: `TASK_TEST_001` 的 mock/测试数据口径已修正，决策引擎单元测试由 `5/2` 收口为 `7/0`
- TASK_FLOW_REFACTOR_024B: 默认 `run-all-tests` 已纳入 9 条 iteration-manager 回归；总 runner 仍被旧 V4 套件拖红，但接入目标已完成
- TASK_FLOW_REFACTOR_024A: 修复运行态轮询在 `stopped/failed` 终态下的徽标语义，`stopped` 不再误报为“完成”
- TASK_FLOW_REFACTOR_023B: 已补 completed/stopped 恢复回归，覆盖终态恢复后不继续轮询、结果摘要正确显示
- TASK_FLOW_REFACTOR_023A: 已补“刷新恢复任务”的轻量页面回归，覆盖输入摘要/最佳结果/结果摘要/失败清缓存
- TASK_FLOW_REFACTOR_022B: `iteration-manager.html` 恢复后已显示任务结果摘要，并保持既有恢复链路通过
- TASK_FLOW_REFACTOR_022A: 迭代任务结果摘要已持久化到 `iteration_task_runs`，status 可回读 `resultSummary`
- TASK_FLOW_REFACTOR_021A: `iteration-manager.html` 恢复后已显示当前任务输入摘要与当前最佳结果，且未破坏既有 research input 能力
- TASK_FLOW_REFACTOR_020B: `iteration-manager.html` 已支持刷新后恢复最近任务，404/失败时会清理本地缓存
- TASK_FLOW_REFACTOR_020A: 迭代任务最小快照已落到 `iteration_task_runs`，status 可回读 SQLite 快照
- TASK_FLOW_REFACTOR_019B: `GET /api/iteration/status/:taskId` 已返回 `inputSummary`，任务输入上下文可读
- TASK_FLOW_REFACTOR_019A: `iteration-manager.html` 已显式展示研究输入，并真实提交 `parallelTasks`
- TASK_FLOW_REFACTOR_018B: `strategy-config.html` 已切到真实 `/api/strategy-config/*` 路径，并在公开策略列表展示反馈摘要
- TASK_FLOW_REFACTOR_018A: `publishVersionToStrategyLibrary()` 已显式写入 `is_public = 1`，发布后的策略可进入 public 口径
- TASK_FLOW_REFACTOR_007C: 条件已触发但未成交的失败场景，现已写入 `execution_feedback.conditional_trigger`，并兼容旧缺表环境
- TASK_FLOW_REFACTOR_007B: 条件单执行成功后已同步写入 `execution_feedback.simulated_trade`
- TASK_FLOW_REFACTOR_007A: `execution_feedback` migration 已创建并应用到真实数据库，schema 测试通过
- TASK_FLOW_REFACTOR_006C2C3: `createFromReport()` 已改为真实 `getDatabase()` + side table 写入，报告导入旧写法完成对齐
- TASK_FLOW_REFACTOR_006C2C2: `backtest-to-conditional#createConditionalOrderInDB()` 已补写 `conditional_order_context`，研究流来源与导入原因可持久化
- TASK_FLOW_REFACTOR_006C2C1: `report-storage#importToOrderFromReport()` 已停止依赖 `conditional_order.remark`，并将报告来源说明 / `report_id` 写入 `conditional_order_context`
- TASK_FLOW_REFACTOR_006C2B: 条件单列表 / 详情查询已联表返回策略上下文字段，查询测试通过
- TASK_FLOW_REFACTOR_006C2A: `conditional_order_context` 侧表 migration 与 `createConditionalOrder()` 持久化写入已完成，持久化测试通过
- TASK_FLOW_REFACTOR_006C1: `conditional-order.html` 批量创建条件单时，已透传策略身份字段，并补了回归测试
- TASK_FLOW_REFACTOR_006B: `monitor-pool.html` 读取草稿和组装 batch 参数时，已保留策略身份字段
- TASK_FLOW_REFACTOR_006A: `analysis.html` 写入监控池草稿时，已继承选股页的策略身份上下文
- TASK_FLOW_REFACTOR_005: 执行流程新增 `strategySource / strategyConfigId / strategyConfigName`，并保留 `templateId/templateName` 兼容字段
- TASK_FLOW_REFACTOR_004: `select.html` 从策略库导入参数后，已将复制后的策略副本 `id/name` 写回当前配置，并补了复现测试
- TASK_FLOW_REFACTOR_003: 研究流页面文案收口，`backtest.html` / `iteration-manager.html` 明确回到“回测 -> 策略迭代 -> 策略库”主线
- TASK_FLOW_REFACTOR_002: 执行流页面文案收口，`select.html` / `analysis.html` 明确回到“选股 -> 分析 -> 监控 -> 条件单”主线
- TASK_FLOW_REFACTOR_001: 形成系统总闭环共识，明确研究流程 / 执行流程 / 策略库中枢关系
- TASK_V4_V5_E2E_FIX_001~004: V4/V5 E2E 验收失败修复（数据回填 826 万条、#maxPosition 控件、V5 API、回测结果显示）
- TASK_E2E_FIX_005: 日期选择器禁用非交易日 UI（Flatpickr 日历组件，后端兜底逻辑修复）

### 🔄 近期任务状态

- TASK_OPTIMIZE_001/002/003: 已按代码证据完成口径回填并同步三保险，避免“文档 pending / 代码已实现”偏差
- TASK_OPTIMIZE_004: 已落地七因子权重防极端约束（0.03~0.40）并完成代码级验证，三保险已登记
- TASK_OPTIMIZE_005: 已将 objective 升级为惩罚型综合目标（交易样本/回撤/负收益），并同步三保险
- TASK_OPTIMIZE_006: 已完成网格优化 API 稳定化，修复 `objectiveWeights` 为空导致打分崩溃问题，接口回归通过（`successCount=1`）
- TASK_OPTIMIZE_007: 已完成 Walk-Forward API 化（`/api/walk-forward/run|config`）与前置校验；主库已补齐并回填 `stock_factor_snapshot.peg`，接口实测返回 `success=true`
- TASK_OPTIMIZE_008: 已完成市场状态切换基础能力（识别/展示/边界切换）并通过回归测试 `tests/test_optuna_regime.py`（3/3）
- TASK_OPTIMIZE_009: 已完成因子稳定性指标（IC均值/波动/衰减、行业偏离、HHI），并接入迭代摘要展示与回归测试
- TASK_MOCK_001: 已完成模拟账户 4 张基础表迁移（`018_create_mock_tables.sql`），主库建表/外键/索引/插入链路验收通过
- TASK_UI_REFINEMENT_001: 已完成并验收（迭代页导航统一 + 多维筛选 + 归档/取消归档 + select 导入筛选与固定底栏）
- TASK_FLOW_REFACTOR_044K: 已生成交接状态单并同步接力计划（已完成项/未完成项/优先级/验收命令）；灵爪可按文档直接接手推进迭代稳定性与最终交付复验
- TASK_FLOW_REFACTOR_044J: 已完成持仓监控公司公告链路稳健化；公告同步保留新浪 MCP 主路径，MCP 不可用或失败时自动回退 `tushare anns_d`，并新增回退回归测试 `position-signals-announcement-fallback.test.js`（通过）
- TASK_FLOW_REFACTOR_044I: 已收口 iteration-manager 回归失败 5 项（前端隔离兼容 + 后端 stock_daily 缺表回退 + 用例对齐），全量总测恢复 `52/52` 通过
- TASK_FLOW_REFACTOR_044H: 已修复 `analysis.html#importToConditional()` 回归（`inferStrategyVersionFromConfig` 在局部测试上下文缺失导致导入失败）；已补函数存在性保护与兜底推断，相关 2 条回归测试通过
- TASK_FLOW_REFACTOR_044G: 已修复条件单页“手动输入股票代码时报告不加载”问题；手动输入 `ts_code` 现会自动触发 `loadReports`，浏览器回归确认 `#report-selector` 可加载 `ANALYZE_...` 报告列表
- TASK_FLOW_REFACTOR_044F: 已完成本地最终交付验收并生成验收报告，研究流与执行流关键链路全部通过；新增 `CODEX_DELIVERY_ACCEPTANCE_20260329.md`，并固化 E2E/链路证据到 `temp/e2e_results.json`、`temp/final-delivery-flow-check.json`
- TASK_FLOW_REFACTOR_044E: 已为持仓估值增加实时行情兜底（`stock_daily` 未命中时走 `getRealtimeQuote`），`/api/portfolio/account/1/summary` 实测 5 只持仓均返回非零市值
- TASK_FLOW_REFACTOR_044D: 已为 `create-from-report` 增加去重保护（`account_id + stock_code + report_id`），同一分析报告重复导入不再生成重复条件单
- TASK_FLOW_REFACTOR_044C: 已修复条件单列表“未识别条件”展示问题，报告导入产生的 `field/operator/value` 条件现可正常渲染；浏览器验收 `unknownCount=0`
- TASK_FLOW_REFACTOR_044B: 已修复“个股分析报告生成后条件单页仍显示无报告”的根因；`POST /api/analyze/report` 现会同步写入 `stock_analysis_reports` 并返回 `report_id`，`/api/report/list?stock_code=...` 可直接查询到新报告
- TASK_FLOW_REFACTOR_044A: 已修复回测页“开始选股”流程割裂（顺序统一为“选择策略 → 选股配置 → 添加回测股票”），并移除重复的“选股时点”输入，选股时点固定跟随开始日期；浏览器实测可正常返回选股结果。同时复核持仓监控公司公告来源为新浪 MCP（`company_events.source=sina_mcp_major_events`）
- TASK_FLOW_REFACTOR_043Z: seven_factor 真实 Optuna 迭代 `40` 轮已跑出 `93` 分（阈值 `90`），版本 `ITER_1774766085148_1pbgra` 已成功发布到策略库（`strategy_config.id=11`）；页面验收确认版本历史指标可见、发布状态为“✅ 已发布”、雷达图有有效数据集
- TASK_FLOW_REFACTOR_043Y: 已修复回测成交明细 `quantity=undefined`（统一 `shares/BUY/stockName` 字段映射并补渲染兜底）；同时为 Optuna 增加 trial 级进度回传，`iteration/status` 可见 `currentIteration/progress` 实时推进，不再长期固定 `0/N`
- TASK_FLOW_REFACTOR_043B: 已统一七因子回测分值口径（0~10 快照分 -> 0~1 决策阈值），并将四维权重接入回测决策分与 Optuna 搜索；同一股票池仅更换权重即可使 `scoreTotal` 从 `40` 提升到 `60`，自动迭代已能产出新的 `dimensionWeights`
- TASK_FLOW_REFACTOR_043C: 已将七因子权重接入 Optuna 搜索，`best_params` 现可直接返回 `dimensionWeights + factorWeights + filters + 风控参数` 的完整研究配置结构
- TASK_FLOW_REFACTOR_043D: 已为 `real_score_cli` 增加 trial 级超时保护（45s），浏览器实测 `ITER_1774724164656_73owxo` 在 `2/2` 后正常收敛为终态，页面可见完整 `dimensionWeights/factorWeights` 最佳参数
- TASK_FLOW_REFACTOR_043E: 已接入最小样本外验证输出（IS/OOS/WFE），`iteration` 结果摘要可读 `validation`；当前自动迭代不再只有单一 best_score 口径
- TASK_FLOW_REFACTOR_043A: 已将 `seven_factor` 的筛选层参数 `pe_max/peg_max/max_price` 接入 Optuna + 真实评分 CLI + 回测引擎；同股票池下仅放宽筛选条件即可观察到 `scoreTotal/tradeCount` 变化，说明七因子自动迭代已不再只调交易阈值
- TASK_FLOW_REFACTOR_042L: 浏览器已真实跑出 `double_ma` 的 `93.0` 新版本，雷达图有有效数据，版本历史已显示评分指标

#### V5 自动迭代系统 - 完成口径回调

**状态**: `阶段性完成`

**说明**:
- 本轮已确认：`select.html`、`backtest.html`、`iteration-manager.html` 的页面级与接口级链路通过浏览器 E2E 验收。
- 但这不等同于 V5 全能力最终闭环完成。
- `scripts/optuna_optimizer.py` 已接入真实评分 CLI，且当前环境已跑通最小 `1` trial smoke。
- `docs/runtime/V5_FINAL_STATUS.md` 已更新为“阶段性完成（约 90%，最小可运行闭环已跑通）”。

**当前结论**:
- V4：已收口并验收通过
- V5：框架、页面和关键链路已落地；自动优化已具备最小可运行闭环，后续重点转向更大规模 trial 与正式接入

#### TASK_SNAPSHOT_006 - 选股报告保存功能实现

**状态**: `done`

**最新进展**:
- 选股完成后保存到 `stock_selection_reports` 的主逻辑已存在
- `TASK_SNAPSHOT_006A` 已完成：
  - `/api/selection/history` 不再挂死
  - 历史页数据源已恢复为可消费 JSON
- `TASK_SNAPSHOT_006B` 已完成：
  - `selection-report.html` 详情页已补齐
  - 历史页“查看详情”链路已打通
- `TASK_SNAPSHOT_006C1` 已完成：
  - `backtest.html` 已支持通过历史报告 URL 参数导入股票列表
  - 历史报告 -> 回测页的接收端已经打通
- `TASK_SNAPSHOT_006C2` 已完成：
  - `selection-history.html` 的“导入回测”按钮已接入真实跳转
  - 历史报告 -> 回测页整条导入链路已闭环

**验收结论**:
- 选股报告保存功能已闭环完成

#### TASK_SNAPSHOT_001~005 - 历史快照数据表 + 回填

**状态**: `done`

**最新进展**:
- `stock_factor_snapshot` 表已创建，并已回填到 8269446 条历史快照
- `policy_events` 表已创建，当前数据库中已有 56 条记录
- `stock_selection_reports` 表已创建并已有真实数据
- `scripts/backfill_snapshot.py` 与批量回填脚本均已存在

**验收结论**:
- 历史快照数据表与回填链路已具备完成证据，原总览 `pending` 口径已修正

#### TASK_FLOW_REFACTOR_005 - 模板 / 策略库副本 / 执行配置字段语义统一

**状态**: `done`

**目标**:
1. 统一 `templateId/templateName` 与“策略库副本身份”的实际含义
2. 明确执行流程消费的是“策略库副本”还是“模板定义”
3. 为后续“执行反馈 -> 策略管理”回流打字段基础

**完成情况**:
- `select.html` 已新增 `strategySource / strategyConfigId / strategyConfigName`
- 模板导入与策略库副本导入两条路径已做区分
- 通过双测试覆盖模板来源和策略库副本来源

#### TASK_FLOW_REFACTOR_006 - 策略身份字段跨页面传递

**状态**: `done`

**目标**:
1. 让 `analysis.html` / 监控池 / 条件单能够消费统一后的策略身份字段
2. 为“执行反馈 -> 策略管理”建立基础上下文

**拆分进度**:
- `TASK_FLOW_REFACTOR_006A`：analysis → monitor draft ✅
- `TASK_FLOW_REFACTOR_006B`：monitor draft → monitor-pool / batch 参数 ✅
- `TASK_FLOW_REFACTOR_006C1`：conditional-order 前端透传 ✅
- `TASK_FLOW_REFACTOR_006C2A`：conditional-order context 侧表写入 ✅
- `TASK_FLOW_REFACTOR_006C2B`：conditional-order 查询聚合侧表 ✅
- `TASK_FLOW_REFACTOR_006C2C1`：report-storage 导入路径对齐侧表 ✅
- `TASK_FLOW_REFACTOR_006C2C2`：backtest-to-conditional 创建路径对齐 ✅
- `TASK_FLOW_REFACTOR_006C2C3`：createFromReport 旧写法对齐 ✅

#### TASK_STRATEGY_LIB_001 - 策略模板库设计与实现

**状态**: `done`

**最终结论**:
- 原始验收未通过的问题已由后续修复补齐
- `scripts/run_strategy.py` 现已支持 `--db-export`
- `strategy_signals` 表已存在，当前数据库中已有 189 条记录
- runtime 状态与 todo 镜像均已体现完成结果

**收口说明**:
- `TASK_STRATEGY_LIB_001_FIX_001` 不再单独视为进行中任务，已并入主任务最终完成口径

---

## 📈 里程碑

| 日期 | 里程碑 | 状态 |
|------|--------|------|
| 2026-03-19 | 量化系统 v1.0 发布 | ✅ |
| 2026-03-22 | 7 因子量化体系完成 | ✅ |
| 2026-03-23 00:37 | 持仓监控功能测试通过 | ✅ |
| 2026-03-23 00:55 | 策略模板库 Deep Research 完成 | ✅ |
| 2026-03-23 07:20 | 策略模板库开发启动 | ✅ |
| 2026-03-23 07:45 | 策略模板库开发完成 | ✅ |
| 2026-03-26 19:00 | V4/V5 E2E 验收失败修复完成（4 项） | ✅ |
| 2026-03-27 08:00 | 日期选择器禁用非交易日 UI 完成 | ✅ |
| 2026-03-23 07:50 | 策略模板库验收（未通过） | ✅ |
| 2026-03-23 12:05 | PR #4 遗留问题修复完成 | ✅ |
| 2026-03-23 18:03 | TASK_100 回测界面功能完成 | ✅ |
| 2026-03-23 18:35 | TASK_99 因子权重面板测试通过 | ✅ |
| 2026-03-23 18:35 | TASK_109 v2.0 架构规划完成 | ✅ |
| 2026-03-23 18:35 | TASK_100 后端 API 修复完成 | ✅ |
| 2026-03-24 00:12 | V3 版开发计划制定完成 | ✅ |
| **2026-03-24 12:50** | **V3 阶段 0：选股自动化完成** | **✅** |
| **2026-03-24 14:30** | **V3 阶段 1：回测核心框架完成** | **✅** |
| **2026-03-24 16:10** | **V3 阶段 2：网格交易回测完成** | **✅** |
| **2026-03-24 17:17** | **V3 阶段 3：联合优化器完成** | **✅** |
| **2026-03-24 17:24** | **V3 阶段 4：集成开发启动** | **🔄** |
| **2026-03-24 17:52** | **V3 全部 21 个任务完成！** | **🎉** |

---

## 🚀 V3 版开发计划（2026-03-24 制定）

### 阶段 0：选股自动化改造（P0）

| 任务 ID | 任务名称 | 优先级 | 状态 | 负责人 | 进度 | 预计 |
|---------|----------|--------|------|--------|------|--------|
| **TASK_V3_DB_FIX_001** | 补充数据库表 | P0 | 🟢 done | 灵爪 | 100% | 0.5 天 |
| **TASK_V3_001** | 4 维度行业自动评分 | P0 | 🟢 done | 灵爪 | 100% | 1 天 |
| **TASK_V3_002** | 行业 Top3 自动筛选 | P0 | 🟢 done | 灵爪 | 100% | 0.5 天 |
| **TASK_V3_003** | Top3 行业内个股 7 因子评分 | P0 | 🟢 done | 灵爪 | 100% | 1 天 |
| **TASK_V3_004** | 个股 Top10 自动筛选 | P0 | 🟢 done | 灵爪 | 100% | 0.5 天 |
| **TASK_V3_005** | 选股 UI 改造（移除手动选择） | P0 | 🟢 done | 灵爪 | 100% | 1 天 |
| **TASK_V3_006** | 选股→分钟线获取触发 | P0 | 🟢 done | 灵爪 | 100% | 1 天 |

**阶段 0 交付物**：
- ✅ 自动行业筛选（Top3）
- ✅ 自动个股筛选（Top10）
- ✅ UI 从手动改为自动
- ✅ 分钟线数据获取接口

**阶段 0 工期**：5 天（实际 1 天完成）
**完成日期**：2026-03-24

---

### 阶段 1：回测系统核心框架（P0）

| 任务 ID | 任务名称 | 优先级 | 状态 | 负责人 | 进度 | 预计 |
|---------|----------|--------|------|--------|------|--------|
| **TASK_V3_101** | 日线回测引擎 | P0 | 🟢 done | Claude Code | 100% | 2-3 天 |
| **TASK_V3_102** | 选股参数优化模块 | P0 | 🟢 done | Claude Code | 100% | 2 天 |
| **TASK_V3_103** | 回测结果缓存机制 | P0 | 🟢 done | Claude Code | 100% | 1 天 |
| **TASK_V3_104** | 7 指标计算模块 | P0 | 🟢 done | Claude Code | 100% | 1 天 |

**阶段 1 交付物**：
- ✅ 日线回测框架（`api/backtest-engine.js` 等 12 个文件）
- ✅ 选股参数优化（贝叶斯优化）
- ✅ 缓存机制（7 天过期策略）
- ✅ 7 个绩效指标计算
- ✅ 单元测试 50/50 通过

**阶段 1 工期**：6-7 天（实际 1 天完成）
**完成日期**：2026-03-24
**验收报告**：`docs/acceptance/TASK_V3_101_104_ACCEPTANCE.md`

---

### 阶段 2：网格交易回测（P1）

| 任务 ID | 任务名称 | 优先级 | 状态 | 负责人 | 进度 | 预计 |
|---------|----------|--------|------|--------|------|--------|
| **TASK_V3_201** | BaoStock 分钟线获取脚本 | P1 | 🟢 done | Claude Code | 100% | 1 天 |
| **TASK_V3_202** | stock_minute 表设计 | P1 | 🟢 done | Claude Code | 100% | 0.5 天 |
| **TASK_V3_203** | 分钟线回测引擎适配 | P1 | 🟢 done | Claude Code | 100% | 2-3 天 |
| **TASK_V3_204** | 网格参数优化模块 | P1 | 🟢 done | Claude Code | 100% | 2 天 |

**阶段 2 交付物**：
- ✅ `scripts/fetch_minute_data.mjs` - BaoStock 分钟线获取脚本
- ✅ `db/migrations/008_create_stock_minute_table.sql` - 分钟线表（联合主键）
- ✅ `api/backtest-minute.js` - 分钟线回测引擎
- ✅ `api/grid-optimizer.js` - 网格参数优化器（Worker 多线程并行）
- ✅ `test/grid-optimizer.test.js` - 网格优化测试

**阶段 2 工期**：实际 1 天完成（原计划 5.5-6.5 天）

**验收报告**：
- `docs/acceptance/TASK_V3_201_ACCEPTANCE.md`
- `docs/acceptance/TASK_V3_202_ACCEPTANCE.md`
- `docs/acceptance/TASK_V3_203_ACCEPTANCE.md`
- `docs/acceptance/TASK_V3_204_ACCEPTANCE.md`

---

### 阶段 3：联合优化器（P2）

| 任务 ID | 任务名称 | 优先级 | 状态 | 负责人 | 进度 | 预计 |
|---------|----------|--------|------|--------|------|--------|
| **TASK_V3_301** | 联合优化器（数学组合） | P2 | 🟢 done | Claude Code | 100% | 1 天 |
| **TASK_V3_302** | 8 核并行支持 | P2 | 🟢 done | Claude Code | 100% | 1 天 |
| **TASK_V3_303** | Walk-Forward 样本外测试 | P2 | 🟢 done | Claude Code | 100% | 1-2 天 |

**阶段 3 交付物**：
- ✅ 三目标协同优化完整流程
- ✅ 并行加速（4 分钟完成）
- ✅ 过拟合风险控制

**阶段 3 工期**：3-4 天

---

### 阶段 4：与现有系统集成（P1）

| 任务 ID | 任务名称 | 优先级 | 状态 | 负责人 | 进度 | 预计 |
|---------|----------|--------|------|--------|------|--------|
| **TASK_V3_401** | 回测→条件单导入 | P1 | 🟢 done | Claude Code | 100% | 1 天 |
| **TASK_V3_402** | 回测→监控池推荐 | P1 | 🟢 done | Claude Code | 100% | 1 天 |
| **TASK_V3_403** | 回测 UI 面板 | P1 | 🟢 done | Claude Code | 100% | 2 天 |

**阶段 4 交付物**：
- ✅ 回测结果可导入条件单
- ✅ 回测结果可推荐到监控池
- ✅ 用户可视化界面

**阶段 4 工期**：4 天

---

## 📊 V3 版总体进度

| 阶段 | 任务数 | 已完成 | 进行中 | 待开始 | 总工期 |
|------|--------|--------|--------|--------|--------|
| **阶段 0** | 7 个 | ✅ 7 | 0 | 0 | 5 天 |
| **阶段 1** | 4 个 | ✅ 4 | 0 | 0 | 6-7 天 |
| **阶段 2** | 4 个 | ✅ 4 | 0 | 0 | 5.5-6.5 天 |
| **阶段 3** | 3 个 | ✅ 3 | 0 | 0 | 3-4 天 |
| **阶段 4** | 3 个 | ✅ 3 | 0 | 0 | 4 天 |
| **总计** | **21 个** | **21** | **0** | **0** | **24-27 天** |

**预计完成日期**：2026-04-28 左右（5 周）
**实际进度**：21/21 完成（100%）

---

## 2026-03-24 阶段 0 完成报告

### 完成任务清单

| 任务 ID | 任务名称 | 状态 | 验收时间 |
|---------|----------|------|----------|
| TASK_V3_DB_FIX_001 | 补充数据库表 | ✅ 完成 | 2026-03-24 |
| TASK_V3_001 | 4 维度行业评分 | ✅ 完成 | 2026-03-24 08:57 |
| TASK_V3_002 | 行业 Top3 筛选 | ✅ 完成 | 2026-03-24 08:59 |
| TASK_V3_003 | 7 因子评分 | ✅ 完成 | 2026-03-24 09:04 |
| TASK_V3_004 | Top10 筛选 | ✅ 完成 | 2026-03-24 09:01 |
| TASK_V3_005 | 选股 UI 改造 | ✅ 完成 | 2026-03-24 12:50 |
| TASK_V3_006 | 分钟线获取触发 | ✅ 完成 | 2026-03-24 12:50 |

### 阶段 0 完成度
**进度**: 100% (6/6 任务完成)

### 新增 API 接口

| 接口 | 功能 | 状态 |
|------|------|------|
| GET /api/industry/score | 4 维度行业评分 | ✅ 完成 |
| GET /api/industry/score/top3 | 行业 Top3 筛选 | ✅ 完成 |
| GET /api/industry/:industry/top-stocks | 行业内个股 7 因子评分 | ✅ 完成 |
| GET /api/stock/select/top10 | 全市场股票 Top10 | ✅ 完成 |
| POST /api/minute/fetch | 分钟线数据获取 | ✅ 完成 |

---

## 2026-03-24 阶段 1 完成报告

### 完成任务清单

| 任务 ID | 任务名称 | 状态 | 验收时间 |
|---------|----------|------|----------|
| TASK_V3_101 | 日线回测引擎 | ✅ 完成 | 2026-03-24 |
| TASK_V3_102 | 选股参数优化模块 | ✅ 完成 | 2026-03-24 |
| TASK_V3_103 | 回测结果缓存机制 | ✅ 完成 | 2026-03-24 |
| TASK_V3_104 | 7 指标计算模块 | ✅ 完成 | 2026-03-24 |

### 阶段 1 完成度
**进度**: 100% (4/4 任务完成)

### 交付物清单（12 个文件）

| 文件 | 大小 | 状态 |
|------|------|------|
| `api/backtest-engine.js` | 21KB | 已修复关键 Bug |
| `api/backtest.js` | 54KB | 完成 |
| `api/backtest-report.js` | 14KB | 完成 |
| `api/backtest-cache.js` | 11KB | 完成 |
| `api/optimizer.js` | 19KB | 已集成缓存 |
| `scripts/run_backtest.mjs` | 7.5KB | 完成 |
| `scripts/run_optimizer.mjs` | 8.5KB | 完成 |
| `db/migrations/006_*.sql` | 4.5KB | 完成 |
| `db/migrations/007_*.sql` | 1.4KB | 完成 |
| `test/backtest-report.test.js` | 19KB | 50 用例通过 |

### 验收期间修复的问题
1. **回测引擎 Bug**: `run()` 方法中 `this.reset()` 调用时机不对
2. **日期格式不匹配**: `stock_daily` 表日期格式问题
3. **属性名冲突**: `tradeCount` / `totalTrades` 属性名不一致

### 开发策略
- **并行开发**: 4 个子任务同时启动
- **并行验收**: 每个任务完成后立即验收
- **实际完成**: 2026-03-24（1 天完成，原计划 6-7 天）
| 2026-03-23 12:10 | PR #5 创建待审查 | ⏳ |
| 2026-03-23 07:50 | 修复任务启动 | ✅ |
| 2026-03-23 预计 08:15 | 修复完成并重新验收 | ⏳ |

---

## 📁 文档导航

| 文档类型 | 路径 |
|----------|------|
| 任务文档 | `docs/tasks/` |
| 运行时状态 | `docs/runtime/` |
| 交接文档 | `docs/handover/` |
| 验收报告 | `docs/acceptance/` |
| 研究报告 | `docs/research/` |
| **策略决策** | `docs/research/strategy_optimization_decision.md` |
| 事件日志 | `memory/project/stock-system/` |

---

## ⚠️ 当前阻塞

| 阻塞项 | 影响 | 解决方案 |
|--------|------|----------|
| 无 | - | 当前该板块无阻塞，后续按新增任务推进 |

---

## 📝 最近事件

*2026-03-24 14:30* - PROJECT_PROGRESS.md 更新（阶段 0/1 完成状态）  
*2026-03-24 14:00* - 阶段 1 验收通过（TASK_V3_101~104，12 个文件，50 测试用例）  
*2026-03-24 12:50* - 阶段 0 完成（TASK_V3_005/006 UI 改造 + 分钟线获取）  
*2026-03-24 09:04* - TASK_V3_003 完成（7 因子评分）  
*2026-03-24 08:59* - TASK_V3_002 完成（行业 Top3 筛选）  
*2026-03-24 08:57* - TASK_V3_001 完成（4 维度行业评分）  
*2026-03-24 00:12* - V3 版开发计划制定完成  
*2026-03-23 12:05* - PR #4 遗留问题修复完成（TASK_CODEX_FIX_001~005）  

---

*最后更新：2026-03-24 14:30*

---

## 🚀 V4 修复阶段（已完成）

**阶段目标**: 修复 V4 回测系统重构后发现的关键问题，核心功能已完成验收并收口

### V4 修复任务清单

| 任务 ID | 任务名称 | 优先级 | 状态 | 预计工时 | 备注 |
|---------|----------|--------|------|---------|------|
| **TASK_V4_FIX_006** | 核心仓/卫星仓比例不生效 | P0 | ✅ 完成 | 1h | 前端改用 `/api/backtest/joint/run`，已验收 |
| **TASK_V4_FIX_001** | 选股时点未生效 | P0 | ✅ 完成 | 2h | `/api/select` 接口接收日期参数，已验收 |
| **TASK_V4_FIX_004** | 回测指标缺失 | P0 | ✅ 完成 | 1h | 补充卡玛比率、盈亏比，已验收 |
| **TASK_V4_FIX_003** | 策略参数配置 + 一键自迭代按钮 | P1 | ✅ 完成 | 1h | 5 个策略的参数配置面板，已验收 |
| **TASK_V4_FIX_002** | 选股时点 UI 说明 | P1 | ✅ 完成 | 0.5h | 选股时点可早于回测起点，已验收 |
| **TASK_V4_FIX_005** | 指标注释 | P1 | ✅ 完成 | 1h | 所有回测指标已添加注释并验收 |

**V4 总计**: 6.5 小时  
**V4 状态**: 🟢 已完成（2026-03-26 验收通过）

---

## 🔮 V5 自动迭代系统（框架已落地 / 未全闭环）

**阶段目标**: 策略参数自动迭代优化、评分可视化、版本管理等框架已落地，页面链路与 E2E 已通过；但自动优化核心仍保留未完全闭环的能力点

### V5 落地任务清单（页面链路/E2E 已通）

| 任务 ID | 任务名称 | 优先级 | 状态 | 预计工时 | 备注 |
|---------|----------|--------|------|---------|------|
| **TASK_V5_000** | V5 自动迭代系统总体规划 | P0 | 🟡 pending | - | 任务规划文档，保留 pending 口径 |
| **TASK_V5_001** | 创建策略版本数据库表 | P0 | ✅ 完成 | 1h | strategy_versions 等 3 张表 |
| **TASK_V5_002** | 实现策略评分器 | P0 | ✅ 完成 | 2h | strategy-scorer.js |
| **TASK_V5_003** | 实现自迭代管理页面 | P0 | ✅ 完成 | 3h | iteration-manager.html |
| **TASK_V5_004** | 实现策略评分可视化面板 | P1 | ✅ 完成 | 2h | 雷达图/柱状图/趋势图 |
| **TASK_V5_005** | 实现策略版本对比功能 | P1 | ✅ 完成 | 2h | 指标/参数/收益曲线对比 |
| **TASK_V5_006** | 实现策略回测报告模板 | P1 | ✅ 完成 | 2h | PDF/HTML/Markdown 导出 |
| **TASK_V5_007** | 实现 Optuna 参数优化集成 | P0 | 🟢 最小可运行闭环已跑通 | 3h | 已跑通 `1` trial smoke，后续补更大规模回归 |
| **TASK_V5_008** | 实现二次迭代决策逻辑 | P1 | ✅ 完成 | 2h | 失败原因分析 + 方案选择 |
| **TASK_V5_009** | 实现策略库 4 类策略详细设计 | P1 | ✅ 完成 | 2h | 趋势/均值回归/多因子 |
| **TASK_V5_010** | 实现模拟账户验证周期标准 | P2 | ✅ 完成 | 1h | ≥2 周或≥30 次交易 |
| **TASK_V5_011** | 实现实盘前检查清单标准化 | P2 | ✅ 完成 | 1h | 5 项检查清单 |

**V5 规划/落地工时**: 21 小时  
**V5 状态**: 🟡 框架已落地，页面链路/E2E 已通，自动优化核心仍待补全

**收口说明**:
- `docs/tasks/TASK_V5_000.md` 仍保留 `pending` 规划口径，不按“已验收完成”处理
- `scripts/optuna_optimizer.py` 已不再使用假分数，且当前环境已跑通最小真实优化；后续主要工作是扩大 trial 数并正式接入迭代管理器
- 自迭代管理页、版本管理与相关页面链路已打通，E2E 结论可保留

---

## 📋 V4/V5 交付收口

### V4 修复阶段（已验收）
- ✅ 策略参数配置面板（5 个策略）
- ✅ [💾 保存初始配置] 按钮
- ✅ [🚀 一键自迭代] 按钮（放在"开始回测"按钮旁边）
- ✅ 点击"一键自迭代"后跳转到 V5 的"自迭代管理"页面

### V5 自动迭代系统（框架已交付，能力未全闭环）
**包含内容**:
1. **自迭代管理页面**（新页面）
   - 展示各策略的迭代情况
   - 评分情况可视化（雷达图/柱状图/趋势图）
   - 策略版本对比功能
   - 策略回测报告模板

2. **核心能力**
   - 策略评分器（strategy-scorer.js）
   - 策略版本管理（strategy_versions 表）
   - 策略迭代日志（strategy_iteration_log 表）
   - 自动参数优化流程（目前仍有 TODO / 占位实现）
   - 模拟账户验证周期标准
   - 实盘前检查清单标准化

**收口提示**:
- 页面链路和 E2E 已通过，可以继续沿用当前交付口径
- `docs/tasks/TASK_V5_000.md` 仍保留 `pending` 规划口径，不能当成全量验收完成
   - 实盘前检查清单标准化

---

## 📝 最近事件

*2026-03-28 15:22* - TASK_FLOW_REFACTOR_042B 完成，`api/select.js` 历史快照分支已从固定 3 分改为快照维度聚合；同时确认并重启服务加载工作区 `.env` 中的 `TUSHARE_TOKEN`，实时选股页四维显示恢复为非固定值
*2026-03-28 15:08* - TASK_FLOW_REFACTOR_042A 完成，`select.html` 已恢复完整高分方向选择并显式导流到 `analysis.html`，本地浏览器验收确认方向数量 `10 > Top3 3`，扩选后可稳定带入 4 个方向
*2026-03-28 12:27* - TASK_RELEASE_001 完成，PR #9 已合并主分支；修复 Pages 部署阻塞（移除被跟踪 db 链接）后，线上地址 `https://dsvinc.github.io/stock-system/` 恢复可访问并完成页面 smoke 验收
*2026-03-28 12:17* - TASK_FLOW_REFACTOR_041C 完成，V5 规划对照文档已补 040A~041B 证据映射并更新 V5_008 口径为“已落地（持续优化）”
*2026-03-28 12:16* - TASK_FLOW_REFACTOR_041B 完成，iteration-manager 页面新增报告格式选择器并支持导出 Markdown/HTML，默认总测 `50/50` 全通过
*2026-03-28 12:13* - TASK_FLOW_REFACTOR_041A 完成，`/api/iteration/report/:taskId` 新增 `format=html` 与 HTML 下载模式，合同文档已更新，默认总测 `50/50` 全通过
*2026-03-28 12:09* - TASK_FLOW_REFACTOR_040B 完成，V5 `resultSummary` 新增 `tuningPlan`（action/priority/steps/guardrails），报告导出新增“执行清单/约束条件”，默认总测 `50/50` 全通过
*2026-03-28 12:03* - TASK_FLOW_REFACTOR_040A 完成，迭代下一步建议规则新增 4 类决策分支并接入新回归，`tests/run-all-tests.js` 升级为 `50/50` 全通过
*2026-03-28 11:46* - TASK_FLOW_REFACTOR_039C 完成，README 默认总测口径已更新为 49/49，并回写 038A runtime 的过期环境告警
*2026-03-28 11:43* - TASK_FLOW_REFACTOR_039B 完成，`iteration-manager-default-backend.test.js` 已改为无端口模式，脚本可在当前沙箱直接通过
*2026-03-28 11:40* - TASK_FLOW_REFACTOR_039A 完成，iteration-manager 6 条默认总测脚本改为无端口模式，`tests/run-all-tests.js` 恢复 `49/49` 全绿
*2026-03-28 11:30* - TASK_FLOW_REFACTOR_038A 完成，修复 strategy-template 路由顺序并新增无端口回归测试（default-route/profiles），已接入默认总测
*2026-03-28 10:59* - TASK_FLOW_REFACTOR_037C 完成，新增策略画像接口契约文档 docs/api-contracts/strategy-template-profiles.md
*2026-03-28 10:55* - TASK_FLOW_REFACTOR_037B 完成，新增 /api/strategy-template/profiles（4类策略画像）与回归测试，默认总测提升至 48/48
*2026-03-28 10:49* - TASK_FLOW_REFACTOR_037A 完成，报告接口新增 download=1 直出模式（text/markdown 附件），新增回归并接入默认总测（47/47）
*2026-03-28 10:43* - TASK_FLOW_REFACTOR_036C 完成，README 默认总测口径由 42/42 更新为 46/46，并复核默认总测全绿
*2026-03-28 10:40* - TASK_FLOW_REFACTOR_036B 完成，新增迭代报告导出接口契约文档 docs/api-contracts/iteration-report.md，导出接口已形成可交接合同
*2026-03-28 10:36* - TASK_FLOW_REFACTOR_036A 完成，V5_000 对照文档已回写：V5_006、V5_010、V5_011 调整为已落地口径并补 035A~035F 映射
*2026-03-28 10:31* - TASK_FLOW_REFACTOR_035F 完成，迭代管理页新增“一键导出报告”按钮并接入 Markdown 导出 API，新增前端下载回归，默认总测 46/46
*2026-03-28 10:25* - TASK_FLOW_REFACTOR_035E 完成，新增 /api/iteration/report/:taskId Markdown 报告导出与回归测试，默认总测升级为 45/45 全通过
*2026-03-28 10:14* - TASK_FLOW_REFACTOR_035D 完成，达标分数下的下一步建议已接入“实盘前检查门禁”，新增回归测试并接入默认总测（44/44）
*2026-03-28 10:11* - TASK_FLOW_REFACTOR_035C 完成，迭代结果摘要已展示 deploymentReadiness（实盘就绪/待处理项/检查清单），恢复态渲染回归通过
*2026-03-28 10:08* - TASK_FLOW_REFACTOR_035B 完成，resultSummary 新增 deploymentReadiness（5项实盘前检查）并接入快照回归，默认总测保持 43/43
*2026-03-28 10:04* - TASK_FLOW_REFACTOR_035A 完成，V5 迭代结果摘要新增 nextActionSuggestion（动作+原因）并在页面展示，默认总测保持 43/43
*2026-03-28 09:53* - TASK_FLOW_REFACTOR_034B 完成，已补 V5_000 规划对照回写文档，交接可直接定位规划项落地证据
*2026-03-28 09:53* - V3 阶段 3/4 pending 口径已按 runtime 证据回写为 done，V3 总体进度已对齐为 21/21
*2026-03-28 09:49* - TASK_FLOW_REFACTOR_033D 完成，研究版本发布 feedback summary 与执行流渲染口径统一，历史快照缺字段可回退展示
*2026-03-28 09:44* - TASK_FLOW_REFACTOR_033C 完成，新增中等规模 trial 稳定性回归并接入默认总测，当前 43/43 全通过
*2026-03-28 09:37* - TASK_FLOW_REFACTOR_033B 完成，Optuna trial 维度结果已结构化沉淀并展示，默认总测保持 43/43
*2026-03-28 09:33* - TASK_FLOW_REFACTOR_033A 完成，V5 深化未做项已拆解并登记到三保险
*2026-03-28 09:19* - TASK_FLOW_REFACTOR_032A 完成，README 与运行时进度口径已统一
*2026-03-28 09:16* - TASK_FLOW_REFACTOR_031D 完成，默认总测恢复 42/42 全通过
*2026-03-28 09:14* - TASK_FLOW_REFACTOR_031C 完成，iteration-manager 回归测试已回稳，兼容 031B 新口径
*2026-03-28 09:11* - TASK_FLOW_REFACTOR_031B 完成，迭代启动参数已归一化，非法输入回退默认/安全值
*2026-03-28 19:16* - TASK_FLOW_REFACTOR_042K 完成，`/api/report/list` 已支持报告目录回退扫描，条件单页可重新识别未落库的 HTML 报告
*2026-03-28 19:16* - TASK_FLOW_REFACTOR_042K 完成，浏览器实测 `conditional-order.html` 选择中国电信后已能显示报告下拉并启用导入按钮
*2026-03-28 19:10* - TASK_FLOW_REFACTOR_042J 完成，已清理监控池与条件单中的测试假股票脏数据（111111/222222/333333）
*2026-03-28 19:10* - TASK_FLOW_REFACTOR_042J 完成，已删除 `300308.SZ` 重复旧条件单，仅保留当前有效记录
*2026-03-28 19:05* - TASK_FLOW_REFACTOR_042I 完成，真实七因子版本 `ITER_1774694107289_wnfrdb` 已写入执行反馈并成功发布到策略库
*2026-03-28 19:05* - TASK_FLOW_REFACTOR_042I 完成，已修复“从报告导入条件单”动作解析，浏览器实测中国联通条件单创建成功并保留版本上下文
*2026-03-28 19:05* - TASK_FLOW_REFACTOR_042I 完成，迭代管理页恢复最近任务时已同步策略下拉，打开页面即可看到七因子版本历史与已发布状态
*2026-03-28 09:08* - TASK_FLOW_REFACTOR_031A 完成，进度条显示已加防御逻辑，异常迭代数不会再渲染 NaN/Infinity
*2026-03-28 09:05* - TASK_FLOW_REFACTOR_030C 完成，停止原因文案映射收口，页面不再直接暴露内部枚举值
*2026-03-28 09:02* - TASK_FLOW_REFACTOR_030B 完成，stop 响应切全量任务快照，前端停止态展示与后端口径统一
*2026-03-28 08:59* - TASK_FLOW_REFACTOR_030A 完成，optuna 手动停止会终止子进程，任务状态稳定保持 stopped
*2026-03-28 08:30* - TASK_FLOW_REFACTOR_029B 完成，新增恢复态浏览器 smoke，已验证恢复任务时 optimizationBackend 控件同步
*2026-03-27 18:31* - TASK_FLOW_REFACTOR_015E 完成，分析页导入条件单已支持本地 `stockV2Data` 回退，不再被 TUSHARE token 依赖卡死
*2026-03-27 18:27* - TASK_FLOW_REFACTOR_015D 完成，条件单导入在股票详情缺失时已可回退，浏览器联调确认导入、创建、来源展示整段闭环可用
*2026-03-27 18:22* - TASK_FLOW_REFACTOR_015C 完成，条件单列表已显示策略来源与名称，执行流可直接识别条件单来源
*2026-03-27 18:18* - TASK_FLOW_REFACTOR_015B 完成，分析页导入条件单时已附带策略身份，执行链路上游导入载荷补齐
*2026-03-27 18:15* - TASK_FLOW_REFACTOR_015A 完成，单条导入创建条件单已透传策略身份字段，且不会污染后续手动创建
*2026-03-27 18:08* - TASK_FLOW_REFACTOR_014B1 完成，迭代管理页雷达图已确认单例化，浏览器控制台不再出现 `Canvas is already in use`
*2026-03-27 18:02* - TASK_FLOW_REFACTOR_014A2 完成，/api/strategy-config/public 已恢复可用，执行流公开策略入口重新打通
*2026-03-27 17:55* - TASK_FLOW_REFACTOR_013C2 完成，真实发布链路已恢复，浏览器回归确认版本列表可从“📤 发布”刷新为“✅ 已发布”
*2026-03-27 17:57* - TASK_FLOW_REFACTOR_013C1 完成，版本历史 API 在 strategy_config_feedback 侧表缺失时已安全回退
*2026-03-27 17:51* - TASK_FLOW_REFACTOR_013B2 完成，迭代管理页版本列表已显示已发布状态并禁用重复发布
*2026-03-27 17:45* - TASK_FLOW_REFACTOR_013B1 完成，版本历史 API 已附带 published_strategy_config_id / is_published_to_library
*2026-03-27 17:23* - TASK_FLOW_REFACTOR_013A 完成，迭代管理页发布入口已对齐真实 API 返回结构，成功提示不再读取错误顶层字段
*2026-03-27 17:15* - TASK_FLOW_REFACTOR_012 完成，选股页导入列表已展示策略 feedback，研究流到执行流入口闭环打通
*2026-03-27 17:08* - TASK_FLOW_REFACTOR_012B1 完成，公开策略列表 API 已附带 feedback 快照
*2026-03-27 16:58* - TASK_FLOW_REFACTOR_012A2 完成，研究版本已可发布到策略库并写入 feedback 快照
*2026-03-27 16:45* - TASK_FLOW_REFACTOR_012A1 完成，已补 strategy_config_feedback side table 与快照 helper
*2026-03-27 16:26* - TASK_FLOW_REFACTOR_011 完成，研究流 compare 页面已展示 execution feedback 摘要
*2026-03-27 16:10* - TASK_FLOW_REFACTOR_011A 完成，compare API 已附带 execution feedback 信息
*2026-03-27 16:04* - TASK_FLOW_REFACTOR_010A 完成，迭代管理页已支持按反馈状态/置信度筛选版本历史
*2026-03-27 15:58* - TASK_FLOW_REFACTOR_009B 完成，迭代管理页已展示 feedback 状态与置信度标签
*2026-03-27 15:51* - TASK_FLOW_REFACTOR_009A 完成，版本历史 API 已附带 execution feedback 状态与置信度
*2026-03-27 15:43* - TASK_FLOW_REFACTOR_008 完成，迭代管理页已展示 execution feedback 摘要
*2026-03-27 15:33* - TASK_FLOW_REFACTOR_008A 完成，版本历史 API 已可返回 execution feedback 摘要
*2026-03-27 15:22* - TASK_FLOW_REFACTOR_007 完成，执行反馈回流最小闭环打通（execution_feedback 已覆盖 conditional_trigger / simulated_trade / position_closed）
*2026-03-27 18:39* - TASK_FLOW_REFACTOR_015F 完成，条件单列表/详情 API 已附带策略 feedback 字段（status/confidence/trades/pnl）
*2026-03-27 18:43* - TASK_FLOW_REFACTOR_015G 完成，条件单列表已显示执行 feedback 标签与统计摘要
*2026-03-27 18:47* - TASK_FLOW_REFACTOR_016A 完成，监控池 add/list 已持久化并返回策略上下文
*2026-03-27 18:50* - TASK_FLOW_REFACTOR_016B 完成，监控池列表已显示策略来源与策略名称
*2026-03-27 18:55* - TASK_FLOW_REFACTOR_016C 完成，监控池批量创建条件单已改用正确接口并在浏览器中成功落单
*2026-03-27 18:57* - TASK_FLOW_REFACTOR_016D 完成，监控池 -> 条件单浏览器 smoke 已固化为正式回归脚本
*2026-03-27 19:00* - TASK_FLOW_REFACTOR_017A 完成，分析页已显示当前策略上下文 banner
*2026-03-27 19:03* - TASK_FLOW_REFACTOR_017B 完成，分析页 -> 监控池浏览器 smoke 已固化为正式回归脚本
*2026-03-27 19:05* - TASK_FLOW_REFACTOR_017C 完成，分析页 -> 监控池 -> 条件单全链路浏览器 smoke 已固化为正式回归脚本
*2026-03-28 16:09* - TASK_FLOW_REFACTOR_042C 完成，回测页已收口日期/策略/数值输入校验，选股时点统一为开始日期
*2026-03-28 16:09* - TASK_FLOW_REFACTOR_042C 完成，自迭代页已改为“无效结果”语义，无交易样本不再伪装成 completed + 50 分
*2026-03-28 16:16* - TASK_FLOW_REFACTOR_042D 完成，个股分析已取消失败时的 `6.0/10 + 观望` 假兜底，恢复真实分化评分
*2026-03-28 16:16* - TASK_FLOW_REFACTOR_042D 完成，个股报告历史查询已按 `ts_code` 隔离，不再串开同一天的隆基绿能报告
*2026-03-28 17:01* - TASK_FLOW_REFACTOR_042E 完成，Python 个股分析环境已补齐 `tushare + pandas`，`stock_analyzer.py` 与 `/api/analysis/report` 已恢复
*2026-03-28 17:20* - TASK_FLOW_REFACTOR_042F 完成，自迭代历史旧结果已识别为无效记录，不再显示 `50.0` 且禁止发布
*2026-03-28 17:20* - TASK_FLOW_REFACTOR_042F 完成，当前最佳配置在无效结果下已改为显示 `无效 / --`，不再把 `50 分` 伪装成有效结果
*2026-03-28 17:28* - TASK_FLOW_REFACTOR_042G 完成，自迭代无执行样本版本已统一标记为 `待验证样本` 并禁止发布
*2026-03-28 17:28* - TASK_FLOW_REFACTOR_042G 完成，`POST /api/strategy-config/publish-version` 已新增后端硬校验，缺样本版本返回 `409`
*2026-03-28 17:53* - TASK_FLOW_REFACTOR_042H 完成，`seven_factor` 回测已修复快照关联失败问题，真实评分恢复非零交易样本
*2026-03-28 17:53* - TASK_FLOW_REFACTOR_042H 完成，`optuna` 已改为搜索 `seven_factor` 真实参数空间，并回填 `trade_count + metrics`
*2026-03-28 17:53* - TASK_FLOW_REFACTOR_042H 完成，浏览器已完成 `backtest.html -> iteration-manager.html` 实测，20 轮自迭代成功产出 `87.0` 有效版本
*2026-03-29 01:27* - TASK_FLOW_REFACTOR_042L 完成，迭代页已修复 URL 导入与旧任务缓存冲突，浏览器导入任务不再被历史失败任务劫持
*2026-03-29 01:27* - TASK_FLOW_REFACTOR_042L 完成，版本历史卡片已直接展示夏普/回撤/卡玛/盈亏比/胜率/总收益，雷达图已确认灌入有效数据集
*2026-03-29 01:27* - TASK_FLOW_REFACTOR_042L 完成，真实数据覆盖校验已对齐 DB 代码格式，`double_ma + 600030/601988/600887 + 2024` 浏览器自迭代成功产出 `93.0` 新版本 `ITER_1774718703327_eup92a`
*2026-03-29 09:16* - TASK_FLOW_REFACTOR_043F 完成，自迭代版本发布门槛已调整为“有效结果 + 有样本或评分>=75”，97 分版本 `ITER_1774746788838_1tw3j8` 已实测可发布并成功入库（策略 ID `9`）
*2026-03-29 09:16* - TASK_FLOW_REFACTOR_043F 完成，迭代雷达图已统一 winRate/return/drawdown 口径，浏览器实测已显示有效多维数据，不再出现维度失真
*2026-03-29 09:16* - TASK_FLOW_REFACTOR_043F 完成，条件单“从分析报告导入”已补齐双路兜底（`/api/report/list` + `/api/analysis/reports`），`688302.SH` 实测可拉取报告且导入按钮可用
*2026-03-29 09:16* - TASK_FLOW_REFACTOR_043F 完成，条件单页“导入选定报告策略”已实测写入触发条件（2 条 condition + 条件预览），回测页 `2020-01-09` 复现场景下“开始选股”结果可见且无“未选策略”误报
*2026-03-29 09:28* - TASK_FLOW_REFACTOR_043G 完成，新增交付验收报告 `docs/acceptance/CODEX_DELIVERY_ACCEPTANCE_20260329.md`，本轮交付口径三条主链路均已浏览器+接口实测通过
*2026-03-29 09:59* - TASK_FLOW_REFACTOR_043I 完成，自迭代任务新增最小有效样本门槛（`MIN_VALID_TRADE_SAMPLES=5`），`tradeCount<5` 不再被视作有效完成
*2026-03-29 09:59* - TASK_FLOW_REFACTOR_043I 完成，新增 `insufficient_trade_samples` 失败原因与统一提示，下一步建议已收口为“先补齐有效样本”
*2026-03-29 10:07* - TASK_FLOW_REFACTOR_043J 完成，`trade_count` 已回填到迭代任务 `history.metrics`，并在缺失时按 `invalid_optuna_result` 直接失败
*2026-03-29 10:07* - TASK_FLOW_REFACTOR_043J 完成，版本历史已同步 `iteration_task_runs` 快照中的 `invalid_reason`，失败版本统一“无效结果 + 不可发布”
*2026-03-29 10:12* - TASK_FLOW_REFACTOR_043K 完成，回测页已补联合回测结果归一化，`rawResults.core.details.equityCurve/trades` 可稳定驱动图表与交易表
*2026-03-29 10:12* - TASK_FLOW_REFACTOR_043K 完成，浏览器 E2E 脚本图表判定已改为“页面真实渲染口径”，`select/backtest/iteration` 三模块复测全绿
*2026-03-29 10:22* - TASK_FLOW_REFACTOR_043L 完成，Optuna 异常路径已补 invalidReason 自动归类，`failed` 任务不再出现“原因为空”
*2026-03-29 10:22* - TASK_FLOW_REFACTOR_043L 完成，`double_ma + 002594.SZ + 2020-2021` 迭代实测产出 `97` 分有效版本 `ITER_1774750893035_mkpqay`（`tradeCount=11`）
*2026-03-29 10:22* - TASK_FLOW_REFACTOR_043L 完成，高分版本发布链路实测通过，已发布到策略库（`strategy_config.id=10`）
*2026-03-29 10:31* - TASK_FLOW_REFACTOR_043M 完成，seven_factor 启动已支持自动补池（排除 BJ）并二次真实行情过滤，启动响应新增 `autoAddedStocks/autoExcludedStocks`
*2026-03-29 10:31* - TASK_FLOW_REFACTOR_043M 完成，seven_factor Optuna 搜索空间改为全局范围，避免 seed 收窄导致无样本空跑
*2026-03-29 10:31* - TASK_FLOW_REFACTOR_043M 完成，窄股票池场景已实测从“无交易样本”提升到有效样本结果（`ITER_1774751346777_u0mtt1`: `score=80`, `tradeCount=30`, `completed`）
*2026-03-29 11:06* - TASK_FLOW_REFACTOR_043N 完成，`real_score_cli` 已改为股票代码多格式自动解析（`600519.SH` / `sh.600519` 均可命中真实数据）
*2026-03-29 11:06* - TASK_FLOW_REFACTOR_043N 完成，真实评分链路已实测通过（`--stocks sh.600519` 返回 `success=true, tradeCount=6`），不再误报“指定区间内缺少真实数据”
*2026-03-29 11:14* - TASK_FLOW_REFACTOR_043O 完成，股票搜索已改为本地库优先（`stocks/stock_list`），Tushare 改为兜底，离线环境不再频繁“未找到匹配股票”
*2026-03-29 11:14* - TASK_FLOW_REFACTOR_043O 完成，`/api/stock/search/fuzzy?q=中国电信` 实测返回 `601728.SH`，回测/条件单页面股票搜索可用性恢复
*2026-03-29 11:20* - TASK_FLOW_REFACTOR_043P 完成，模拟账户持仓估值已支持 API/DB 代码格式自动匹配，修复“持仓市值=0”误判
*2026-03-29 11:20* - TASK_FLOW_REFACTOR_043P 完成，`/api/portfolio/account/1/summary` 实测 5 只持仓均已刷新到最新收盘价口径（trade_date `20260324`）
*2026-03-29 11:24* - TASK_FLOW_REFACTOR_043Q 完成，执行流浏览器烟测回归通过（analysis -> monitor -> conditional 全链路）
*2026-03-29 11:24* - TASK_FLOW_REFACTOR_043Q 完成，迭代发布按钮与 next-action 规则测试全通过（`publish-button 15/15` + `next-action`）
*2026-03-29 11:33* - TASK_FLOW_REFACTOR_043R 完成，`dimensionWeights` 已从“仅回显”改为真实参与行业排序，七因子迭代权重可直接影响选股结果
*2026-03-29 11:33* - TASK_FLOW_REFACTOR_043R 完成，`factorWeights` 已增加归一化计算，避免权重和漂移导致评分失真；`minScore` 阈值口径已与筛选逻辑对齐
*2026-03-29 11:36* - TASK_FLOW_REFACTOR_043S 完成，seven_factor Optuna 采样已改为“raw 采样 + 归一化权重”，维度/因子权重和为 1
*2026-03-29 11:36* - TASK_FLOW_REFACTOR_043S 完成，`build_cli_params` 已剔除 `*_raw` 中间字段，real_score_cli 下发参数保持干净可解释
*2026-03-29 11:39* - TASK_FLOW_REFACTOR_043T 完成，`select/backtest/iteration` 全链路 E2E 回归通过（权重改造后无回归）
*2026-03-29 11:39* - TASK_FLOW_REFACTOR_043T 完成，回归后已自动释放本地 3000 端口，避免后台进程堆积
*2026-03-29 11:44* - TASK_FLOW_REFACTOR_043U 完成，账户管理闭环实测通过（手动添加持仓 -> summary 估值刷新）
*2026-03-29 11:44* - TASK_FLOW_REFACTOR_043U 完成，临时账户链路验证后已自动清理测试数据并释放端口
*2026-03-29 11:50* - TASK_FLOW_REFACTOR_043V 完成，条件单监控 E2E 函数校验已对齐当前 API（create/toggle/deleteConditionalOrder），消除假阳性日志
*2026-03-29 11:50* - TASK_FLOW_REFACTOR_043V 完成，新增“执行失败仍触发通知分支”回归用例并通过（`conditional-monitor-notification-failure.test.js`）
*2026-03-29 11:53* - TASK_FLOW_REFACTOR_043W 完成，通知链路改造后 `monitor-to-conditional` 浏览器 smoke 回归通过
*2026-03-29 11:53* - TASK_FLOW_REFACTOR_043W 完成，回归过程已自动拉起/回收本地服务，避免端口与进程堆积
*2026-03-29 12:01* - TASK_FLOW_REFACTOR_043X 完成，迭代管理器恢复链路测试已对齐新增输入校验与样本门槛规则，相关测试恢复全绿
*2026-03-29 12:01* - TASK_FLOW_REFACTOR_043X 完成，总 E2E 回归再次通过（`select/backtest/iteration=true`）
*2026-03-25 21:10* - V4 修复阶段规划完成，V5 自动迭代系统规划完成（TASK_V5_000 创建）

---

## 2026-03-24 阶段 0 完成报告

### 完成任务清单

| 任务 ID | 任务名称 | 状态 | 验收时间 |
|---------|----------|------|----------|
| TASK_V3_DB_FIX_001 | 补充数据库表 | ✅ 完成 | 2026-03-24 |
| TASK_V3_001 | 4 维度行业评分 | ✅ 完成 | 2026-03-24 08:57 |
| TASK_V3_002 | 行业 Top3 筛选 | ✅ 完成 | 2026-03-24 08:59 |
| TASK_V3_003 | 7 因子评分 | ✅ 完成 | 2026-03-24 09:04 |
| TASK_V3_004 | Top10 筛选 | ✅ 完成 | 2026-03-24 09:01 |
| TASK_V3_005 | 选股 UI 改造 | ✅ 完成 | 2026-03-24 12:50 |
| TASK_V3_006 | 分钟线获取触发 | ✅ 完成 | 2026-03-24 12:50 |

### 阶段 0 完成度
**进度**: 100% (7/7 任务完成)

### 新增 API 接口

| 接口 | 功能 | 状态 |
|------|------|------|
| GET /api/industry/score | 4 维度行业评分 | ✅ 完成 |
| GET /api/industry/score/top3 | 行业 Top3 筛选 | ✅ 完成 |
| GET /api/industry/:industry/top-stocks | 行业内个股 7 因子评分 | ✅ 完成 |
| GET /api/stock/select/top10 | 全市场股票 Top10 | ✅ 完成 |
| POST /api/minute/fetch | 分钟线数据获取 | ✅ 完成 |

---

## 2026-03-31 任务规划

### 策略库导入参数映射补充

**问题根因**: 导入不同策略后选股结果相同，因为只应用了 `minScore` 一个参数

**设计更新**:
- 更新文件：`docs/design/2026-03-29-seven-factor-optimization-engineering-plan.md`
- 新增附录 C: 选股 API 参数映射设计
  - C.1: 四维度权重 → 行业选股 API
  - C.2: PE/PEG 上限 → 行业选股 API
  - C.3: 七因子权重 → 待设计

**任务规划**:
| 任务 ID | 任务名 | 优先级 | 工时 | 状态 |
|--------|--------|--------|------|------|
| TASK_SELECT_IMPORT_002 | 四维度权重映射到选股 API | P0 | 2h | pending |
| TASK_SELECT_IMPORT_003 | PE/PEG 上限映射到选股 API | P0 | 1.5h | pending |

**三保险同步**:
- ✅ Runtime 状态：`docs/runtime/TASK_SELECT_IMPORT_002_STATUS.md`, `TASK_SELECT_IMPORT_003_STATUS.md`
- ⏳ todo.db: 待派发后同步
- ✅ Memory 锚点：`memory/project/stock_system/{timestamp}-task-planning.json`

---

## 📅 今日完成（2026-04-01）

### Bug 修复

| 任务 ID | 任务名称 | 优先级 | 状态 | 开发者 | 验收员 | 完成时间 |
|--------|----------|--------|------|--------|--------|---------|
| **BUG_SELECT_IMPORT_001** | **策略库导入参数后选股结果不变** | **P0** | **🟢 accepted** | **Claude Code** | **Gemini CLI** | **2026-04-01 14:30** |

**根因**: 前端 `applyStrategyToUI()` 保存配置后没有调用 `loadSelectionData()` 刷新选股结果。

**修复**:
- `select.html`: 添加 `loadSelectionData()` 调用
- `api/select.js`: 移除 DEBUG 测试代码
- `e2e/smoke.spec.js`: 修复测试断言

**验收结果**: ✅ 单元测试 52/52 通过，E2E 测试 2/2 通过，API 功能验证通过

**验收报告**: `docs/acceptance/BUG_SELECT_IMPORT_001_ACCEPTANCE.md`

| **TASK_SEVEN_FACTOR_ANALYSIS** | **七因子权重集成到个股分析** | **P0** | **🟢 accepted** | **Claude Code** | **Gemini CLI** | **2026-04-01 15:20** |

**功能**: 策略库导入时保存七因子权重配置，个股分析页面使用这些权重影响评分决策。

**实现内容**:
1. `select.html`: `applyStrategyToUI()` 从导入策略的 `portfolio_config.factorWeights` 读取并保存到 localStorage
2. `analysis.html`: 从 localStorage 读取 factorWeights 并通过 POST body 传递给 `/api/analysis/report`
3. `api/analyze.js`: `buildReportData()`, `buildReportPayload()`, `writeStockReport()` 函数添加 `factorWeights` 参数
4. `api/score-factors.js`: `calculateCompositeScore()` 接收 `customWeights` 参数，使用自定义权重计算评分
5. `api/strategy-config.js`: `publishVersionToStrategyLibrary()` 在 `portfolio_config` 中保存 `factorWeights`

**验收结果**: ✅ 单元测试 52/52 通过，E2E 测试通过，七因子权重传递链完整

**验收报告**: `docs/acceptance/TASK_SEVEN_FACTOR_ANALYSIS_ACCEPTANCE.md`

---

## 📅 今日完成（2026-04-01）

### 策略库导入参数映射任务

| 任务 ID | 任务名称 | 优先级 | 状态 | 开发者 | 验收员 | 完成时间 |
|--------|----------|--------|------|--------|--------|---------|
| **SELECT-002** | **四维度权重映射到选股 API** | **P0** | **🟢 done** | **Claude Code** | **Gemini CLI** | **2026-03-31 18:04** |
| **SELECT-003** | **PE/PEG 上限映射到选股 API** | **P0** | **🟢 done** | **Claude Code** | **Gemini CLI** | **2026-03-31 18:04** |

### 验收改进建议修复任务

| 任务 ID | 任务名称 | 优先级 | 状态 | 开发者 | 验收员 | 完成时间 |
|--------|----------|--------|------|--------|--------|---------|
| **SELECT-FIX-001** | **修复 applyConfig() 覆盖隐藏配置问题** | **P0** | **🟢 done** | **Claude Code** | **Gemini CLI** | **2026-03-31 21:31** |
| **SELECT-FIX-002** | **添加策略参数 UI 提示** | **P2** | **🟢 done** | **Claude Code** | **Gemini CLI** | **2026-03-31 21:31** |

---

## 📊 总体进度

- **总任务数**: 待统计
- **已完成**: 待统计
- **完成率**: 待统计

**最后更新时间**: 2026-04-01 15:25
