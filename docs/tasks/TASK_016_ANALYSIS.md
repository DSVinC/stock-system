# TASK_016 任务分析文档

## 任务概述
**任务名称**: 每日监控 - 技术指标+事件监控（盘后）
**任务ID**: TASK_016
**优先级**: 🔴 重要紧急
**分析时间**: 2026-03-19 21:15

## 功能需求分析

### 1. 技术指标监控（盘后）

#### 输入数据源
1. **持仓股票列表** - 从模拟账户数据库读取
   - 数据库: `stock-system/data/simulation.db`
   - 表: `simulation_position`
   - 字段: `stock_code`, `quantity`, `avg_cost`

2. **个股分析报告** - 读取分析报告中的关键价位
   - 路径: `report/stockana/YYYYMMDD/*.json`
   - 关键字段:
     - `buyZone`: [下轨, 上轨] 建仓区间
     - `stopLoss`: 止损价位
     - `targetPrice`: 目标价位
     - `strategy`: 结构化策略数据

3. **实时行情数据** - 获取当前价格和技术指标
   - 数据源: 新浪财经 MCP
   - 需要指标:
     - 当前价格
     - MA5/MA10/MA20
     - MACD
     - RSI
     - 成交量

#### 监控逻辑
1. **价格 vs 关键价位**
   - 当前价格 vs 止损价位: 是否触发止损
   - 当前价格 vs 止盈价位: 是否达到目标
   - 当前价格 vs 建仓区间: 是否进入买入区间

2. **技术指标变化**
   - MA趋势分析: 金叉/死叉
   - MACD状态: 零轴上下，金叉/死叉
   - RSI超买超卖: >70超买, <30超卖
   - 成交量变化: 放量/缩量

### 2. 事件监控

#### 监控内容
1. **个股相关新闻/公告** - 新浪财经
2. **财报发布提醒** - 根据财报日期
3. **关键观察点事件** - 来自分析报告

#### 数据源
1. 新浪财经新闻接口
2. Tushare财报日期
3. 分析报告中的关键事件字段

### 3. 报告生成与推送

#### 报告内容
1. **监控时间范围**: 昨日收盘 - 今日收盘
2. **持仓股票状态概览**: 总持仓数，总市值，总盈亏
3. **触发关注条件的股票详情**: 列表展示
4. **相关事件列表**: 新闻/公告/财报
5. **建议操作**: 买入/卖出/持有/关注

#### 推送方式
- **飞书私聊推送**: 使用Feishu API
- **推送频率**: 每日收盘后一次
- **推送格式**: Markdown + 结构化数据

## 技术实现分析

### 1. 技术栈选择
- **主语言**: Node.js (与现有系统一致)
- **数据库**: SQLite (simulation.db)
- **数据源**: 新浪财经 MCP + Tushare Pro
- **推送**: 飞书 API

### 2. 文件结构设计
```
stock-system/
├── scripts/
│   └── daily-monitor.mjs          # 主监控脚本
├── data/
│   └── monitor-reports/           # 监控报告存储
│       └── YYYY-MM-DD-report.json
└── docs/
    └── tasks/
        ├── TASK_016_ASSIGNMENT.md # 任务分配
        └── TASK_016_ANALYSIS.md   # 本文档
```

### 3. 核心模块设计

#### 模块1: 数据获取模块
```javascript
// 功能: 获取所有需要的数据
class DataFetcher {
  async getPortfolioPositions() {}      // 获取持仓
  async getStockAnalysis(stockCode) {}  // 获取分析报告
  async getRealTimeData(stockCode) {}   // 获取实时数据
  async getNewsEvents(stockCode) {}     // 获取新闻事件
}
```

#### 模块2: 指标计算模块
```javascript
// 功能: 计算技术指标和监控条件
class IndicatorCalculator {
  calculatePriceVsKeyLevels(price, analysis) {}  // 价格vs关键价位
  calculateTechnicalIndicators(historyData) {}   // 技术指标
  checkTriggerConditions(position, data) {}      // 检查触发条件
}
```

#### 模块3: 报告生成模块
```javascript
// 功能: 生成监控报告
class ReportGenerator {
  generateSummaryReport(monitorResults) {}       // 生成概要报告
  generateDetailedReport(stockResults) {}        // 生成详细报告
  formatForFeishu(report) {}                     // 格式化为飞书格式
}
```

#### 模块4: 推送模块
```javascript
// 功能: 推送到飞书
class FeishuNotifier {
  async sendDailyReport(report) {}               // 发送日报
  async sendUrgentAlert(alert) {}                // 发送紧急警报
}
```

### 4. 依赖分析

#### 已完成 / 已接入的依赖
1. ✅ 模拟账户数据库 (TASK_OPT_005) - 项目内有验收报告
2. ⚠️ 结构化分析报告 (TASK_OPT_004) - 任务文档存在，但项目内尚未确认满足设计共识要求的结构化 `strategy` 字段闭环
3. ✅ 新浪财经 MCP 接口
4. ✅ 飞书 API 集成

#### 需要开发的依赖
1. 🔄 技术指标计算库
2. 🔄 事件监控数据源
3. 🔄 报告生成模板

## 复杂度评估

### 开发工作量
| 模块 | 预估工时 | 复杂度 |
|------|----------|--------|
| 数据获取模块 | 2小时 | 中 |
| 指标计算模块 | 3小时 | 高 |
| 报告生成模块 | 2小时 | 中 |
| 推送模块 | 1小时 | 低 |
| 测试与集成 | 2小时 | 中 |
| **总计** | **10小时** | **高** |

### 风险点
1. **技术指标计算准确性**: 需要验证计算逻辑
2. **数据源稳定性**: 新浪财经/Tushare API 可能不稳定
3. **性能考虑**: 多只股票同时监控可能较慢
4. **错误处理**: 单只股票失败不应影响整体

## 实施建议

### 阶段1: 基础框架 (2小时)
1. 创建项目结构和主脚本
2. 实现数据获取基础功能
3. 创建基本报告模板

### 阶段2: 核心功能 (5小时)
1. 实现技术指标计算
2. 实现监控逻辑
3. 完善报告生成

### 阶段3: 集成测试 (3小时)
1. 单元测试
2. 集成测试
3. 飞书推送测试

### 建议开发顺序
1. 先实现单只股票的完整监控流程
2. 扩展为多只股票批量监控
3. 添加错误处理和重试机制
4. 优化性能和内存使用

## 参考代码

### 现有监控脚本参考
1. `scripts/conditional-order-monitor.mjs` - 条件单监控
2. `scripts/industry-news-monitor.mjs` - 行业新闻监控
3. `api/monitor-conditional.js` - 监控逻辑实现

### 数据操作参考
1. `scripts/simulation_db.py` - 模拟账户数据库操作
2. `api/analysis.js` - 个股分析报告处理
3. `api/market-data.js` - 市场数据获取

## 验收标准细化

### 功能验收
- [ ] 能正确读取模拟账户持仓 (测试数据: 至少3只股票)
- [ ] 能正确读取个股分析报告 (测试: 300308.SZ, 000977.SZ)
- [ ] 能正确获取实时行情数据 (测试: 价格/成交量)
- [ ] 能正确计算技术指标变化 (测试: MA/MACD/RSI)
- [ ] 能正确识别触发条件的股票 (测试: 价格触发止损/止盈)
- [ ] 能正确抓取相关新闻/事件 (测试: 最新新闻)
- [ ] 能正确生成监控报告 (测试: JSON + HTML格式)
- [ ] 能正确推送到飞书 (测试: 实际推送)

### 性能要求
- 单次监控执行时间 < 30秒 (10只股票)
- 内存使用 < 200MB
- 支持并发监控 (最多20只股票)

### 可靠性要求
- 单只股票失败不影响其他股票监控
- 网络异常自动重试 (最多3次)
- 数据不完整时降级处理

## 下一步行动

### 立即行动 (分析阶段)
1. ✅ 创建分析文档 (本文档)
2. 🔄 设计详细技术方案
3. 🔄 创建开发任务清单

### 开发准备
1. 🔄 准备测试数据
2. 🔄 设置开发环境
3. 🔄 确定开发时间窗口

### 等待决策
- 是否立即开始开发
- 开发优先级调整
- 资源分配确认
