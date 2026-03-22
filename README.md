# A股股票投资系统

> 基于Tushare + 新浪财经的A股投资分析与交易系统

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端界面层                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  首页    │ │ 选股分析 │ │ 监控池   │ │ 条件单   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌──────────┐                                  │
│  │ 账户管理 │ │ 回测系统 │                                  │
│  └──────────┘ └──────────┘                                  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                        API服务层                           │
│  /api/select    - 选股筛选                                  │
│  /api/analyze   - 个股分析                                  │
│  /api/analysis  - 分析报告                                  │
│  /api/portfolio - 账户管理                                  │
│  /api/conditional-order - 条件单引擎                        │
│  /api/monitor   - 监控池                                    │
│  /api/backtest  - 回测系统                                  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                        数据层                              │
│  SQLite数据库 + Tushare/Sina Finance MCP                    │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 启动服务

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node api/server.js
```

服务默认运行在 `http://127.0.0.1:3000`

### 2. 访问界面

- 首页：`http://127.0.0.1:3000/`
- 选股分析：`http://127.0.0.1:3000/analysis.html`
- 监控池：`http://127.0.0.1:3000/monitor-pool.html`
- 账户管理：`http://127.0.0.1:3000/portfolio.html`
- 条件单：`http://127.0.0.1:3000/conditional-order.html`
- 回测系统：`http://127.0.0.1:3000/backtest.html`

### 3. 启动监控服务（可选）

```bash
# 启动定时监控（5分钟间隔，交易时段运行）
./scripts/start-monitor.sh

# 查看日志
tail -f logs/monitor.log

# 停止监控
./scripts/stop-monitor.sh
```

## 核心功能

### 1. 选股筛选

支持多维度筛选：
- 估值指标：PE、PB、ROE
- 技术指标：RSI、MACD
- 资金面：主力资金净流入
- 成长性：营收增长率、净利润增长率

API：`POST /api/select`

### 2. 个股分析

六因子评分系统：
1. 技术面（25%）- RSI、MACD、均线
2. 基本面（25%）- ROE、营收增长、净利润增长
3. 资金面（20%）- 主力净流入、换手率
4. 估值面（15%）- PE/PB分位数
5. 市场情绪（10%）- 行业热度
6. 风险控制（5%）- 波动率、回撤

API：`POST /api/analyze`

### 3. 模拟账户

- 支持创建多个模拟账户
- 初始资金可配置（默认100万）
- 实时持仓查询
- 交易记录追踪
- 收益率统计

API：
- `POST /api/portfolio/account` - 创建账户
- `GET /api/portfolio/account` - 账户列表
- `GET /api/portfolio/account/:id/positions` - 持仓查询
- `GET /api/portfolio/account/:id/trades` - 交易记录

### 4. 条件单引擎

支持的条件类型：
- **价格条件**：股价 ≥/≤ 目标价
- **涨跌幅条件**：涨跌幅 ≥/≤ 目标值
- **成交量条件**：成交量/量比 条件
- **技术指标**：RSI、MACD金叉/死叉
- **估值指标**：PE/PB分位数
- **资金面**：主力净流入
- **复合条件**：AND/OR 组合多个条件

触发流程：
```
监控池检查 → 条件评估 → 触发交易 → 飞书通知
```

API：
- `POST /api/conditional-order` - 创建条件单
- `GET /api/conditional-order` - 条件单列表
- `PUT /api/conditional-order/:id` - 更新条件单
- `DELETE /api/conditional-order/:id` - 删除条件单
- `POST /api/conditional-order/:id/cancel` - 取消条件单

### 5. 回测系统

支持策略回测：
- 历史数据回放
- 条件单策略回测
- 收益统计（总收益率、年化收益率）
- 风险指标（最大回撤、夏普比率、胜率）
- 交易明细记录

API：
- `POST /api/backtest/run` - 运行回测
- `GET /api/backtest/history` - 回测历史

## 数据配置

### Tushare Token

在 `api/analyze.js` 中配置：
```javascript
const TUSHARE_TOKEN = 'your_token_here';
```

### 新浪财经MCP

确保已安装 sina-ashare-mcp skill：
```bash
openclaw skills info sina-ashare-mcp
```

## 数据库结构

主要数据表：
- `portfolio_account` - 账户表
- `portfolio_position` - 持仓表
- `portfolio_trade` - 交易记录表
- `conditional_order` - 条件单表
- `monitoring_pool` - 监控池表
- `backtest_reports` - 回测报告表
- `backtest_trades` - 回测交易表

数据库位置：`/Volumes/SSD500/openclaw/stock-system/stock_system.db`

## 安全特性

- ✅ 股票代码格式校验（正则：`^[0-9]{6}\.(SZ|SH|BJ)$`）
- ✅ SQL参数化查询（防注入）
- ✅ JSON安全解析（try-catch）
- ✅ 环境变量配置（无硬编码敏感信息）

## 开发流程

### PR 工作流程

本项目采用 Git 分支 + Codex 审查的 PR 流程：

#### 1. 创建特性分支

```bash
git checkout -b feature/{feature-name}
```

#### 2. 开发与提交

```bash
# 开发完成后添加文件
git add .

# 提交代码（使用规范的 commit message）
git commit -m "feat: 功能描述"
# 或
git commit -m "fix: 修复问题描述"
```

#### 3. 推送到远程

```bash
git push origin feature/{feature-name}
```

#### 4. 创建 PR 并请求审查

```bash
# 创建 PR（如果尚未创建）
gh pr create --base main --head feature/{feature-name} --title "功能描述" --body "详细说明"

# 请求 Codex 审查
gh pr comment {PR_NUMBER} --body "@codex"
```

#### 5. ⚠️ 等待 Codex 审查（重要）

- **等待时间**：提交 `@codex` 评论后，**等待 2 分钟**再查看回复
- **原因**：Codex 需要时间拉取代码、运行测试、生成审查报告
- **不要**：频繁刷新或重复 `@codex`，避免重复审查

#### 6. 处理审查意见

- 如果 Codex 提出问题：
  ```bash
  # 修复问题
  # 修改代码...
  
  git add .
  git commit -m "fix: 修复 Codex 审查问题"
  git push origin feature/{feature-name}
  
  # 再次请求审查
  gh pr comment {PR_NUMBER} --body "@codex 已修复，请重新审查"
  ```

- 如果 Codex 审查通过：
  ```bash
  # 合并到 main 分支
  git checkout main
  git pull origin main
  git merge feature/{feature-name}
  git push origin main
  
  # 删除特性分支（可选）
  git branch -d feature/{feature-name}
  git push origin --delete feature/{feature-name}
  ```

#### 7. 更新项目文档

合并后更新相关文档：
- `docs/PROJECT_PROGRESS.md` - 项目进度
- `docs/runtime/{TASK_ID}_STATUS.md` - 任务状态

---

### Codex 审查检查清单

Codex 会自动检查：
- ✅ 代码语法正确性
- ✅ 单元测试覆盖率
- ✅ API 接口一致性
- ✅ 数据库查询安全性
- ✅ 错误处理完整性
- ✅ 日志记录规范性

---

## 项目日志

项目进度日志：`memory/project/stock_system/`

## 开发状态

| 阶段 | 模块 | 状态 |
|------|------|------|
| Phase 1 | 数据库设计 | ✅ 完成 |
| Phase 2 | 账户API | ✅ 完成 |
| Phase 3 | 条件单引擎 | ✅ 完成 |
| Phase 4 | 监控触发集成 | ✅ 完成 |
| Phase 5 | 前端界面 | ✅ 完成 |
| - | 回测模块 | ✅ 完成 |

## 相关文档

- `docs/system_architecture.md` - 系统架构设计
- `docs/conditional_order_design.md` - 条件单设计文档
- `docs/monitor-guide.md` - 监控服务使用指南
- `docs/backtest_integration_plan.md` - 回测集成方案

## 部署

### 本地开发（macOS）

```bash
# 配置定时任务（每个交易日 15:30 执行）
crontab -e
# 添加：30 15 * * 1-5 cd /Users/vvc/.openclaw/workspace/stock-system && node scripts/daily-monitor.mjs >> logs/daily-monitor.log 2>&1
```

### 生产环境（Linux 服务器）

详细部署指南请参考 [DEPLOYMENT.md](DEPLOYMENT.md)，支持：
- **crontab**：简单 VPS/云服务器
- **systemd timer**：现代 Linux（推荐）
- **Docker**：容器化部署

### 环境变量配置

```bash
cp .env.example .env
# 编辑 .env 填入飞书配置（FEISHU_APP_ID / FEISHU_APP_SECRET）
```

---

## 许可证

MIT
