# TASK_V4_FIX_003 - 策略参数配置与自迭代系统

**创建时间**: 2026-03-25 20:55  
**更新时间**: 2026-03-25 21:00 (主人澄清)  
**优先级**: P1  
**阶段**: V4 修复  
**状态**: pending  
**预计工时**: 2h

---

## 📋 需求澄清

### 策略选项（共 5 个）

**经典技术指标策略（4 个）**:
- 双均线策略
- RSI 超买超卖
- MACD 金叉死叉
- 布林带突破

**量化策略（1 个）**:
- 四维度七因子策略

### 核心设计

**每个策略都需要支持"自动回测迭代"**：
1. 用户配置初始参数（或选择默认值）
2. 点击"一键自迭代"按钮
3. 系统自动回测 → 评分 → 参数优化 → 迭代
4. 保存高评分的策略参数配置

### 保存配置规则

| 配置类型 | 命名规则 | 说明 |
|---------|---------|------|
| 初始配置 | 用户自定义名字 | 用户手动配置的初始参数 |
| 高评分配置 | 用户自定义名字 + 版本号 | 自动迭代优化后的高评分参数（v1, v2...） |
| 异常配置 | 用户自定义名字 + 异常 + 版本号 | 胜率 100% 等异常情况，单独保存 |

---

## 🎯 验收标准

### 1. 选股界面 (select.html)

- [ ] 每个策略选择后显示对应的参数配置面板
- [ ] 参数配置面板包含默认值（参考 A 股量化市场基准）
- [ ] [💾 保存初始配置] - 用户命名，保存到 strategy_configs 表
- [ ] [🚀 一键自迭代] - 按钮放在回测按钮旁边

### 2. 回测界面 (backtest.html)

- [ ] 与选股界面完全一致的策略参数配置面板
- [ ] [🚀 一键自迭代] - 按钮放在"开始回测"按钮旁边
- [ ] 自迭代流程：回测 → 评分 → 参数优化 → 迭代
- [ ] 保存高评分配置（用户命名 + 版本号）
- [ ] 异常情况处理（胜率 100% 单独保存）

### 3. 数据同步

- [ ] 选股界面保存的配置 → 回测界面可以读取
- [ ] 回测界面保存的配置 → 选股界面可以读取
- [ ] 数据源：strategy_configs 表

**四维度七因子策略参数配置面板**:
```
┌─────────────────────────────────────┐
│  四维度权重配置                       │
├─────────────────────────────────────┤
│  社会影响力：[====|====] 25%          │
│  政策方向： [====|====] 25%          │
│  舆论热度： [====|====] 25%          │
│  商业变现： [====|====] 25%          │
├─────────────────────────────────────┤
│  七因子阈值配置                       │
├─────────────────────────────────────┤
│  PE 最大值：[60]                      │
│  PEG 最大值：[2.0]                    │
│  PS 最大值：[20]                      │
│  ROC 最小值：[10]%                    │
│  MOM 最小值：[5]%                     │
│  RPS 最小值：[70]                     │
│  ATLAS 最小值：[60]                   │
├─────────────────────────────────────┤
│  [💾 保存参数配置] [📥 导入参数配置]  │
└─────────────────────────────────────┘
```

---

## 🎯 验收标准

### 1. 选股界面 (select.html)

- [ ] 选择"四维度七因子策略"模板后，显示详细参数配置面板
- [ ] **四维度权重配置**（滑块，总和 100%）
- [ ] **七因子阈值配置**（输入框）
- [ ] [💾 保存参数配置] - 保存到 strategy_configs 表
- [ ] [📥 导入参数配置] - 从 strategy_configs 表加载

### 2. 回测界面 (backtest.html)

- [ ] 与选股界面完全一致的四维度七因子参数配置面板
- [ ] 参数配置共享（strategy_configs 表）

---

## 📐 技术方案

### 1. 策略参数默认值（参考 A 股量化市场基准）

**四维度七因子策略**:
```javascript
const DEFAULT_PARAMS = {
  // 四维度权重（参考"因子配置建议 2025"）
  industry_weights: {
    social: 0.25,        // 社会影响力
    policy: 0.30,        // 政策方向（推荐权重最高）
    sentiment: 0.20,     // 舆论热度
    commercial: 0.25     // 商业变现
  },
  // 七因子阈值（参考"不同策略类型典型表现"）
  seven_factor_thresholds: {
    pe_max: 60,          // PE 最大值
    peg_max: 2.0,        // PEG 最大值
    ps_max: 20,          // PS 最大值
    roc_min: 10,         // ROC 最小值 (%)
    mom_min: 5,          // MOM 最小值 (%)
    rps_min: 70,         // RPS 最小值
    atlas_min: 60        // ATLAS 最小值
  },
  // 仓位配置（参考"核心 - 卫星投资组合"）
  position: {
    core_ratio: 0.75,    // 核心仓 70-80%
    satellite_ratio: 0.25, // 卫星仓 20-30%
    satellite_count: 3   // 卫星仓股票数
  }
};
```

**双均线策略**:
```javascript
const DEFAULT_PARAMS = {
  short_period: 5,       // 短期均线（参考"中频最优区间"）
  long_period: 20,       // 长期均线
  stop_loss: -0.15,      // 止损线（参考"最大回撤风控"）
  take_profit: 0.25      // 止盈线
};
```

**RSI 策略**:
```javascript
const DEFAULT_PARAMS = {
  rsi_period: 14,        // RSI 周期
  oversold_threshold: 30, // 超卖阈值（买入）
  overbought_threshold: 70, // 超买阈值（卖出）
  stop_loss: -0.15       // 止损线
};
```

### 2. 一键自迭代流程

```javascript
async function startAutoIteration() {
  // 1. 获取当前策略参数
  const initialParams = collectStrategyParams();
  
  // 2. 保存初始配置
  const initialConfig = {
    name: prompt('请输入初始配置名称:'),
    strategy_type: currentStrategy,
    params: initialParams,
    is_initial: true,
    created_at: new Date().toISOString()
  };
  await saveConfig(initialConfig);
  
  // 3. 开始自迭代
  const iterationResult = await fetch('/api/backtest/auto-iterate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      strategy: currentStrategy,
      initial_params: initialParams,
      max_iterations: 50,
      target_score: 0.85  // 优秀评分阈值
    })
  });
  
  // 4. 处理结果
  if (iterationResult.win_rate === 1.0) {
    // 异常情况：胜率 100%
    const abnormalConfig = {
      name: prompt('异常配置名称 (胜率 100%):') + '_异常_v1',
      strategy_type: currentStrategy,
      params: iterationResult.params,
      is_abnormal: true,
      win_rate: 1.0
    };
    await saveConfig(abnormalConfig);
  } else if (iterationResult.score >= 0.85) {
    // 高评分配置
    const optimizedConfig = {
      name: prompt('优化配置名称:') + '_v1',
      strategy_type: currentStrategy,
      params: iterationResult.params,
      score: iterationResult.score,
      version: 'v1'
    };
    await saveConfig(optimizedConfig);
  }
  
  // 5. 显示结果
  showIterationResult(iterationResult);
}
```

### 3. 策略迭代决策树（参考文档）

```
回测完成
    │
    ▼
计算综合评分 (STRATEGY_SCORE_CONFIG.md)
    │
    ├── score ≥ 0.90 (excellent)
    │       │
    │       ▼
    │   直接生成版本号 → 保存配置
    │
    ├── 0.75 ≤ score < 0.90 (pass)
    │       │
    │       ▼
    │   Optuna 参数优化 → 更新配置 → 生成版本号
    │
    └── score < 0.75 (fail)
            │
            ▼
        二次迭代决策
            │
            ├── 方案 A：调整评分标准阈值
            │
            └── 方案 B：切换策略库
```

### 4. 评分指标（STRATEGY_SCORE_CONFIG.md）

| 指标 | 权重 | 优秀阈值 | 良好阈值 | 合格阈值 |
|------|------|---------|---------|---------|
| 夏普比率 | 25% | ≥ 2.5 | ≥ 1.8 | ≥ 1.0 |
| 最大回撤 | 20% | ≤ -10% | ≤ -15% | ≤ -20% |
| 年化收益 | 20% | ≥ 22% | ≥ 18% | ≥ 12% |
| 卡玛比率 | 15% | ≥ 2.5 | ≥ 1.5 | ≥ 1.0 |
| 盈亏比 | 10% | ≥ 2.0 | ≥ 1.5 | ≥ 1.2 |
| 胜率 | 5% | ≥ 60% | ≥ 55% | ≥ 50% |
| 换手率 | 5% | ≤ 15 倍 | ≤ 25 倍 | ≤ 40 倍 |

**综合评分 ≥ 0.75** 为合格，**≥ 0.90** 为优秀

---

## 📁 需要修改的文件

- `select.html` - 添加策略参数配置面板 + 一键自迭代按钮
- `backtest.html` - 添加策略参数配置面板 + 一键自迭代按钮
- `api/backtest.js` - 添加自迭代 API (`/api/backtest/auto-iterate`)
- `utils/strategy-optimizer.js` - 新增策略优化器（Optuna 参数优化）
- `config/strategy_score_config.json` - 评分配置（已存在）

---

## 🔗 依赖关系

- 依赖：strategy_configs 表结构（TASK_V4_012 已创建）
- 依赖：策略评分系统（STRATEGY_SCORE_CONFIG.md）
- 依赖：Optuna 或类似参数优化库

---

## 📝 备注

**设计共识来源**: 主人澄清 (2026-03-25 21:00)

**关键点**:
1. 按钮名称："一键自迭代"
2. 按钮位置：回测系统"开始回测"按钮旁边
3. 保存配置：初始配置（用户命名）、高评分配置（用户命名 + 版本号）、异常配置（用户命名 + 异常 + 版本号）
4. 每个策略都需要支持自迭代
5. 参数默认值参考 A 股量化市场基准
6. 自迭代逻辑参考策略迭代决策树
