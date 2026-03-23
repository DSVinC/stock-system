# V2 当前架构分析

> **创建时间**: 2026-03-23
> **分析范围**: api/ 目录下所有模块

---

## 1. 模块清单

### 1.1 核心服务模块

| 模块 | 路由 | 职责 | 依赖 |
|------|------|------|------|
| **server.js** | - | Express 主服务入口，路由挂载，CORS/认证中间件 | 所有模块 |
| **db.js** | - | SQLite 数据库连接封装 | sqlite3 |
| **market-data.js** | /api/stock | 股票搜索（精确/模糊） | 外部数据源 |

### 1.2 业务 API 模块

| 模块 | 路由 | 职责 | 关键函数 |
|------|------|------|----------|
| **monitor.js** | /api/monitor | 监控池管理（添加/删除/查询） | createMonitorRouter |
| **portfolio.js** | /api/portfolio | 账户/持仓/交易管理 | getAccounts, createAccount, getPositions, getTrades |
| **conditional-order.js** | /api/conditional-order | 条件单 CRUD + 启停控制 | createConditionalOrder, toggleConditionalOrder |
| **select.js** | /api/select | 选股功能 | - |
| **industry.js** | /api/industry | 行业成分股查询 | getDirections, getDailyBasicMap |
| **analyze.js** | /api/analyze | 个股分析（6因子评分） | buildStructuredStrategy |
| **analysis.js** | /api/analysis | 分析辅助接口 | - |
| **v2.js** | /api/v2 | 结构化数据接口 | - |
| **backtest.js** | /api/backtest | 回测执行/历史/参数扫描/报告 | runBacktest, scanParameters, generateBacktestReport |
| **position-signals.js** | /api/monitor/signals | 持仓监控信号 | runFullMonitoring, handleGetSignals |

### 1.3 支撑模块（非路由）

| 模块 | 职责 | 导出函数 |
|------|------|----------|
| **score-factors.js** | 多因子评分计算 | - |
| **sentiment-factor.js** | 情绪因子（新闻/事件） | calculateSentimentFactor, calculateNewsScore |
| **time-decay.js** | 时间衰减计算 | calculateDecayFactor, createDecayCurve |
| **llm-sentiment.js** | LLM 情绪分析 | - |
| **factor-snapshot.js** | 因子快照存储 | - |
| **async-pipeline.js** | 异步管道工具 | - |
| **valuation-service.js** | 估值服务 | - |
| **report-template.js** | 报告模板 | - |
| **black-swan-check.js** | 黑天鹅检测 | - |
| **industry-news-monitor.js** | 行业新闻监控 | - |
| **monitor-conditional.js** | 条件单监控触发逻辑 | - |
| **conditional-executor.js** | 条件单执行器 | - |

### 1.4 测试文件

| 文件 | 类型 |
|------|------|
| async-pipeline.test.js | 单元测试 |
| llm-sentiment.test.js | 单元测试 |
| time-decay.test.js | 单元测试 |

---

## 2. 依赖关系图

```
                    ┌─────────────┐
                    │  server.js  │ (入口)
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │  db.js    │    │ monitor.js│    │portfolio.js│
   │(数据库层)  │    │           │    │           │
   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
         │                 │                 │
         │                 ▼                 ▼
         │          ┌─────────────┐   ┌─────────────┐
         │          │market-data.js│  │conditional- │
         │          │ (外部数据)   │  │  order.js   │
         │          └─────────────┘   └──────┬──────┘
         │                                    │
         ▼                                    ▼
   ┌───────────────────────────────────────────────┐
   │                   db.js                       │
   │              (SQLite 数据库)                   │
   └───────────────────────────────────────────────┘

   业务模块依赖链：
   analyze.js → score-factors.js → sentiment-factor.js
                                  → time-decay.js
                                  → llm-sentiment.js

   条件单链：
   conditional-order.js ← monitor-conditional.js
                        ← conditional-executor.js
```

---

## 3. 数据流向

### 3.1 个股分析流程
```
用户请求 → /api/analyze → analyze.js
                         → score-factors.js (评分计算)
                         → sentiment-factor.js (情绪因子)
                         → time-decay.js (时间衰减)
                         → llm-sentiment.js (LLM分析)
                         → 返回结构化策略
```

### 3.2 条件单执行流程
```
定时任务 → monitor-conditional.js (检测触发条件)
         → conditional-executor.js (执行交易)
         → portfolio.js (更新持仓/资金)
         → db.js (持久化)
```

### 3.3 回测流程
```
用户请求 → /api/backtest/run → backtest.js
                              → 执行模拟交易
                              → 存储结果
                              → 返回回测ID
```

---

## 4. 待改进点

### 4.1 架构层面

| 问题 | 现状 | 建议 |
|------|------|------|
| **路由定义分散** | server.js 中硬编码路由 | 使用路由注册表模式 |
| **模块导出不统一** | 有 createRouter、createMonitorRouter、直接导出 router | 统一为 `createRouter(express)` |
| **缺少服务层抽象** | API 层直接操作数据库 | 引入 Service/Repository 层 |
| **错误处理不统一** | 各模块自行处理 | 统一错误中间件 |

### 4.2 代码质量

| 问题 | 位置 | 建议 |
|------|------|------|
| 测试覆盖率不足 | 大部分模块无测试 | 补充单元测试至 80%+ |
| console.log 残留 | 多个模块 | 替换为统一日志系统 |
| 魔法数字 | time-decay.js 等 | 提取为配置常量 |

### 4.3 安全问题

| 问题 | 现状 | 建议 |
|------|------|------|
| 认证可选 | API_AUTH_TOKEN 未强制 | 生产环境强制认证 |
| 输入验证分散 | 各模块自行验证 | 使用 joi/zod 统一验证 |

### 4.4 性能问题

| 问题 | 现状 | 建议 |
|------|------|------|
| 无缓存层 | 每次请求查库 | 引入 Redis/内存缓存 |
| 无连接池 | SQLite 单连接 | 评估是否需要连接池 |

---

## 5. 模块详细说明

### 5.1 核心模块

#### server.js
- **职责**: 应用入口，路由挂载，中间件配置
- **关键逻辑**:
  - CORS 白名单校验
  - Bearer Token 认证
  - 动态路由加载 (mountApi)
- **改进点**: 路由注册表化，启动流程解耦

#### db.js
- **职责**: SQLite 数据库封装
- **改进点**: 事务支持，连接管理

### 5.2 业务模块

#### analyze.js
- **职责**: 个股分析核心逻辑
- **依赖**: score-factors, sentiment-factor, time-decay
- **输出**: 6 因子评分 + 结构化策略

#### portfolio.js
- **职责**: 模拟账户管理
- **功能**: 账户 CRUD，持仓查询，交易记录

#### conditional-order.js
- **职责**: 条件单管理
- **功能**: 条件单 CRUD，启停控制，历史查询

#### backtest.js
- **职责**: 策略回测
- **功能**: 回测执行，参数扫描，报告生成

---

## 6. 技术栈

| 类型 | 技术 |
|------|------|
| 运行时 | Node.js |
| Web 框架 | Express |
| 数据库 | SQLite |
| 外部数据 | 新浪财经 MCP |
| 前端 | 原生 HTML/JS |

---

## 7. 文件统计

| 类型 | 数量 |
|------|------|
| API 路由模块 | 12 |
| 支撑模块 | 10 |
| 测试文件 | 3 |
| 总计 | 25 |

---

_文档生成时间: 2026-03-23_