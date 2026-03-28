# V4/V5 E2E 验收失败修复计划

**日期**: 2026-03-26  
**验收结论**: 不通过  
**验收报告**: `docs/acceptance/CODEX_FINAL_E2E_20260326.md`  
**截图证据**: `temp/screenshots/`

---

## 问题汇总

| # | 问题 | 页面 | 严重性 | 根因 |
|---|------|------|--------|------|
| 1 | `/api/select` 返回 `decisions: []` | select.html | 🔴 P0 | `stock_factor_snapshot` 表数据不足（仅 5 条测试记录） |
| 2 | 回测指标显示 `--`，缺少 `#maxPosition` 控件 | backtest.html | 🔴 P0 | 数据不足 + 页面控件缺失 |
| 3 | V5 API 返回 404 | iteration-manager.html | 🔴 P0 | API 未实现 |

---

## 修复任务

### TASK_E2E_FIX_001: stock_factor_snapshot 数据回填

**问题**: 表中只有 2020-2021 年的 5 条测试记录，需要回填 2020-2026 年完整数据

**当前状态**:
```sql
SELECT trade_date, COUNT(*) FROM stock_factor_snapshot GROUP BY trade_date;
-- 20210104 | 2
-- 20200102 | 3
```

**目标**: 回填约 826 万条记录（2020-2026 年，全 A 股，日线）

**执行步骤**:
1. 确认数据源（Tushare Pro）
2. 创建批量回填脚本 `scripts/backfill_factor_snapshot_batch.mjs`
3. 执行回填（预计 25 分钟）
4. 验证数据完整性

**验收标准**:
- [x] `stock_factor_snapshot` 表包含 2020-2026 年所有交易日数据
- [x] 每个交易日至少有 3000+ 只股票记录
- [x] `industry` 字段有值
- [x] `/api/select?strategy=seven_factor&limit=5` 返回 `decisions` 数组非空

**状态**: ✅ **已完成** (2026-03-26)  
**实际结果**: 8,269,446 条记录，1506 个交易日，5491 只股票

**估计工时**: 2 小时

---

### TASK_E2E_FIX_002: backtest.html 添加 #maxPosition 控件

**问题**: 页面缺少 `#maxPosition` 输入控件，但 API 合同和前端逻辑都引用该字段

**修复步骤**:
1. 在 `backtest.html` 的网格交易参数区域添加 `#maxPosition` 输入框
2. 确保前端请求组装时包含 `gridConfig.maxPosition`
3. 验证 API 接收参数正确

**验收标准**:
- [x] 页面存在 `#maxPosition` 输入框
- [x] 默认值合理（如 5 或 10）
- [x] 回测请求包含 `gridConfig.maxPosition` 字段

**状态**: ✅ **已完成** (2026-03-26)  
**位置**: `backtest.html` line 1523

**估计工时**: 30 分钟

---

### TASK_E2E_FIX_003: 实现 V5 迭代管理器 API

**问题**: `POST /api/iteration/start` 和 `GET /api/iteration/versions/{strategy}` 返回 404

**需要实现的 API**:
1. `POST /api/iteration/start` - 启动策略自迭代
2. `GET /api/iteration/versions/{strategy}` - 获取策略版本历史
3. `GET /api/iteration/compare` - 比较版本得分

**参考文档**:
- `docs/tasks/TASK_V5_000.md`
- `docs/design/STRATEGY_SCORE_CONFIG.md`

**执行步骤**:
1. 创建 `api/iteration-manager.js`
2. 实现上述 3 个端点
3. 在 `api/server.js` 中注册路由
4. 测试 API 功能

**验收标准**:
- [x] `POST /api/iteration/start` 返回成功
- [x] `GET /api/iteration/versions/seven_factor` 返回版本列表
- [x] 数据库表 `strategy_versions` 和 `strategy_score_records` 有数据

**状态**: ✅ **已完成** (2026-03-26)  
**文件**: `api/iteration-manager.js`

**估计工时**: 2 小时

---

### TASK_E2E_FIX_004: backtest.html 回测结果不显示

**问题**: 点击"开始回测"后，指标卡片仍显示 `--`

**可能原因**:
1. 数据不足（与 TASK_E2E_FIX_001 相关）
2. 回测引擎逻辑错误
3. 前端未正确处理 API 响应

**排查步骤**:
1. 先完成 TASK_E2E_FIX_001（数据回填）
2. 测试回测 API `/api/backtest/joint/run`
3. 检查前端 JavaScript 控制台错误
4. 验证指标计算逻辑

**验收标准**:
- [x] 回测完成后 9 个指标卡片显示数值
- [x] 权益曲线图表正常渲染
- [x] 无 JavaScript 控制台错误

**状态**: ✅ **已完成** (2026-03-26)  
**依赖**: TASK_E2E_FIX_001 (数据回填)

**估计工时**: 1 小时（依赖 TASK_E2E_FIX_001）

---

### TASK_E2E_FIX_005: 日期选择器禁用非交易日 UI

**问题**: 用户可以选择非交易日（周末、节假日），导致后端需要使用"未来函数"调整日期

**根因**: HTML5 `<input type="date">` 原生不支持禁用特定日期，只能设置 min/max 范围

**修复方案**:
1. 引入 Flatpickr 日历组件替换原生 date input
2. 配置 `enable` 选项，只允许交易日可选
3. 非交易日显示为灰色，不可点击
4. 后端兜底：`select.js` 从"找下一个交易日"改为"找上一个交易日"

**执行步骤**:
1. ✅ 引入 Flatpickr CSS/JS (CDN)
2. ✅ 修改 `selectionDate` input 为 `type="text"`
3. ✅ 修改 `loadTradingDays()` 初始化 Flatpickr
4. ✅ 添加 CSS 样式：非交易日灰色显示
5. ✅ 修改 `select.js`: `>= ASC` → `<= DESC`
6. ✅ 修改 `market-data.js`: 优先查询数据库最新交易日

**验收标准**:
- [x] 日历中非交易日显示为灰色
- [x] 非交易日不可点击选择
- [x] 交易日正常可点击
- [x] 后端兜底逻辑正确（调整到上一个交易日）
- [x] API 测试通过（1506 个交易日，范围 2020-01-02 ~ 2026-03-24）

**状态**: ✅ **已完成** (2026-03-27)

**修改文件**:
| 文件 | 修改内容 |
|------|---------|
| `backtest.html` | 引入 Flatpickr，初始化配置，CSS 样式 |
| `select.js` | 修复非交易日调整逻辑 |
| `market-data.js` | 优先查询数据库最新交易日 |

**估计工时**: 30 分钟

---

## 执行顺序

```
1. TASK_E2E_FIX_001 (数据回填) - 必须先完成 ✅ 已完成 (2026-03-26)
2. TASK_E2E_FIX_002 (添加控件) - 独立任务 ✅ 已完成 (2026-03-26)
3. TASK_E2E_FIX_003 (V5 API) - 独立任务 ✅ 已完成 (2026-03-26)
4. TASK_E2E_FIX_004 (回测结果) - 依赖任务 1 ✅ 已完成 (2026-03-26)
5. 日期选择器优化：禁用非交易日 ✅ 已完成 (2026-03-27)
6. 重新执行 E2E 验收 ⏳ 待执行
```

---

## 重新验收计划

完成所有修复后，执行：

```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# 方式 1: 本机 Playwright 测试
node tests/browser-automation-test.mjs

# 方式 2: agent-browser
bash tests/minimal-browser-test.sh

# 方式 3: Codex interactive 模式
codex -c 'sandbox_permissions=["disk-full-read-access","network-access"]'
# 然后粘贴验收提示词
```

---

## 相关文档

- `docs/acceptance/CODEX_FINAL_E2E_20260326.md` - 验收报告
- `docs/api-contracts/select.md` - 选股 API 合同
- `docs/api-contracts/backtest-joint.md` - 回测 API 合同
- `docs/tasks/TASK_V5_000.md` - V5 任务清单

---

*创建时间：2026-03-26*
*创建者：灵爪*
