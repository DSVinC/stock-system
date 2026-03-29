# 四维度七因子策略优化重构方案（工程版）

日期：2026-03-29  
适用范围：`select.html -> backtest.html -> iteration-manager.html -> /api/iteration/*`  
当前技术栈：Node.js + SQLite + 浏览器前端 + Python Optuna

---

## 1. 目标

把“四维度七因子策略”的自动优化，从当前的“只调少量交易阈值”，升级成一套可渐进落地的分层优化方案。

本方案优先解决：

1. 当前优化对象不完整
2. 权重参数未进入搜索空间
3. 高分结果缺乏样本外验证
4. 回测分、执行反馈、策略发布条件口径混杂

本方案不做：

1. 不引入 HMM / RL / Transformer 这类重研究型改造
2. 不推翻现有 Node.js + SQLite + Python Optuna 架构
3. 不在第一阶段直接把所有参数一次性放进大搜索空间

---

## 2. 当前问题

### 2.1 当前可自动优化的参数过少

当前 `seven_factor` 实际仅优化：

- `min_score`
- `score_stop_loss`
- `stop_loss`
- `take_profit`

这只覆盖了：

- 入场阈值
- 评分止损阈值
- 交易层止损止盈

没有覆盖：

- 四维度权重
- 七因子权重
- 选股筛选条件
- 网格交易参数

结论：当前系统只能算“部分调参”，不能算“完整优化四维度七因子策略”。

### 2.2 策略核心能力并未进入优化面

四维度七因子策略的核心不是单个阈值，而是：

1. 行业四维度如何赋权
2. 个股七因子如何赋权
3. 估值与价格筛选如何收缩股票池
4. 交易层如何在高分股票中执行

当前只优化交易层参数，会导致：

- 高分结果更像“后端交易阈值运气好”
- 难以解释为什么某些权重组合优于另一些
- 对市场状态变化缺乏适应能力

### 2.3 当前系统缺少最小样本外验证闭环

当前版本历史主要记录：

- 回测分数
- 部分回测指标
- 执行反馈摘要

但缺少系统性的：

- Walk-forward 窗口
- IS/OOS 区分
- WFE（Walk-Forward Efficiency）

结果是：

- `93` 分可能只是样本内优秀
- 不能直接说明泛化能力强

### 2.4 网格参数目前未进入自动迭代

当前状态：

- `backtest.html` 已有 `gridConfig`
- 回测接口可接收网格参数
- 但 `iteration-manager -> optuna_optimizer.py` 未搜索 `gridConfig`

结论：网格参数优化当前不存在，只能手动配置。

---

## 3. 分层优化架构

## 3.1 总体原则

四维度七因子策略改成三层主优化 + 一层验证增强：

1. 筛选层优化
2. 权重层优化
3. 交易层优化
4. 样本外验证层

不建议第一阶段直接做“市场状态机层”，应在前三层稳定后再做。

---

## 4. 参数分层归属

### 4.1 筛选层（Selection Layer）

负责决定“哪些股票进入候选池”。

应归属此层的参数：

- `min_score`
- `pe_max`
- `peg_max`
- `max_price`

说明：

- 这些参数直接影响行业/个股筛选结果
- 它们应该在 `select` 与 `backtest` 链路中语义一致
- 这是七因子策略最先应扩展的搜索空间

### 4.2 权重层（Weighting Layer）

负责决定“候选股票如何被评分”。

应归属此层的参数：

- `dimensionWeights.social`
- `dimensionWeights.policy`
- `dimensionWeights.public`
- `dimensionWeights.business`
- `factorWeights.trend`
- `factorWeights.momentum`
- `factorWeights.valuation`
- `factorWeights.earnings`
- `factorWeights.capital`
- `factorWeights.volatility`
- `factorWeights.sentiment`

说明：

- 这是四维度七因子策略的核心层
- 没有这层，就谈不上真正优化该策略

### 4.3 交易层（Trading Layer）

负责决定“筛出股票后怎么进出场”。

应归属此层的参数：

- `score_stop_loss`
- `stop_loss`
- `take_profit`

说明：

- 当前系统已具备这层优化能力
- 后续应和筛选层联动，而不是单独存在

### 4.4 独立执行层（Execution/Grid Layer）

负责网格与执行控制。

应归属此层的参数：

- `gridConfig.gridSize`
- `gridConfig.maxPosition`
- `gridConfig.triggerThreshold`

说明：

- 这一层不建议在 P0 与前 3 层混搜
- 适合在 P1 独立接入

---

## 5. 当前系统应该怎么改

## 5.1 P0：立即落地

### P0-1 扩展 seven_factor 搜索空间

把 `optuna_optimizer.py` 的 `seven_factor` 搜索空间从 4 个参数，扩展到：

- `min_score`
- `pe_max`
- `peg_max`
- `max_price`
- `score_stop_loss`
- `stop_loss`
- `take_profit`

推荐范围：

- `min_score`: `0.65 ~ 0.90`
- `pe_max`: `30 ~ 100`
- `peg_max`: `1.0 ~ 4.0`
- `max_price`: `80 ~ 800`
- `score_stop_loss`: `0.50 ~ 0.80`
- `stop_loss`: `0.03 ~ 0.15`
- `take_profit`: `0.10 ~ 0.50`

要求：

- 页面当前传入参数作为 seed
- Optuna 先试当前参数，再局部扩展搜索

### P0-2 接入四维度权重搜索

第一版建议：

- 只先接 4 个四维度权重
- 七因子权重先固定

原因：

- 4 维比 11 维更可控
- 更容易验证权重搜索链路是否稳定

实现建议：

1. 采样 4 个非负系数 `a,b,c,d`
2. 做归一化：
   - `w_i = a_i / sum(a)`
3. 写回：
   - `dimensionWeights.social`
   - `dimensionWeights.policy`
   - `dimensionWeights.public`
   - `dimensionWeights.business`

不建议第一版直接上 Dirichlet 特殊采样，原因是：

- 当前项目先要可维护
- 用“系数 + 归一化”最容易读懂、调试和落地

### P0-3 版本历史补充样本内指标口径

版本历史当前已经能显示评分指标，但还应明确补充：

- 这是“回测评分指标”
- 不是“执行反馈指标”

页面建议新增两组标题：

1. 回测评分指标
2. 执行反馈指标

避免用户再次把：

- `总收益 ¥163,123`
- `模拟交易 0 笔`

看成互相矛盾

### P0-4 加入最小样本外验证

不必一开始就上完整 WFO 平台，先做最小闭环：

训练窗口：

- `2023-01-01 ~ 2024-06-30`

验证窗口：

- `2024-07-01 ~ 2024-12-31`

每个新版本至少记录：

- `in_sample_score`
- `out_of_sample_score`
- `in_sample_total_return`
- `out_of_sample_total_return`
- `out_of_sample_trade_count`

发布前加一个最小门槛：

- `out_of_sample_score >= 75`

---

## 6. P1：中期改造

### P1-1 接入七因子权重搜索

在四维权重稳定后，再接七因子权重。

推荐方式：

1. 采样 7 个非负系数
2. 归一化为 7 因子权重
3. 增加防极端约束

防极端规则建议：

- 任意单因子权重不得超过 `0.40`
- 任意单因子权重不得低于 `0.03`

若超界：

- 重采样
- 或加入 penalty

### P1-2 多目标评分函数

当前评分维度保留：

- `sharpeRatio`
- `maxDrawdown`
- `calmarRatio`
- `profitLossRatio`
- `winRate`
- `totalReturn`

同时新增约束项：

- `tradeCount`
- `turnover` 或近似换手惩罚
- `sampleCoverage`

建议目标函数从“单一总分”升级为：

1. 主分数：当前 `quickScore`
2. 惩罚项：
   - 交易笔数过少惩罚
   - 换手过高惩罚
   - 样本外退化惩罚

### P1-3 网格参数独立自动优化

先独立于主策略参数搜索：

- `gridSize`
- `maxPosition`
- `triggerThreshold`

建议顺序：

1. 先锁定主策略参数
2. 再在固定主策略版本下单独优化网格参数

原因：

- 否则搜索空间膨胀太快
- 很难判断收益提升来自主策略还是来自执行层

---

## 7. P2：后续增强

### P2-1 真正的 Walk-Forward 分析

实现滚动窗口：

- IS：2 年
- OOS：6 个月
- Step：3 个月

新增指标：

- `WFE`
- `score_stability`
- `return_stability`

### P2-2 市场状态切换

不建议 P0 就做 HMM。

第一版市场状态切换建议使用规则法：

- 高波动
- 低波动
- 趋势
- 震荡

根据状态切换不同参数模板，而不是直接上复杂模型。

### P2-3 更高级因子稳定性指标

后续再接：

- 因子 IC
- IC 衰减
- 行业偏离度
- 风格暴露稳定性

这属于增强研究项，不是当前主线必需项。

---

## 8. 权重优化技术选型建议

### 8.1 第一版推荐：归一化系数

推荐原因：

1. 与当前 Optuna 最兼容
2. 易读易调试
3. 前后端 JSON 结构容易对齐
4. 不会给维护带来额外数学复杂度

### 8.2 第二版可选：Dirichlet

适合场景：

- 权重搜索已经成熟
- 需要更标准的 simplex 采样

不建议一开始就上，原因：

- 当前项目先要快速落地
- 第一阶段的主要风险不在采样数学，而在工程链路不通

### 8.3 当前不推荐：Softmax 温度搜索

原因：

- 对当前系统解释性不够直接
- 增加了额外温度参数和调试成本
- 现阶段收益不如“归一化系数 + 约束”明显

---

## 9. 与当前代码的映射关系

### 9.1 前端

- `select.html`
  - 需要支持导入并展示筛选层参数
  - 后续支持展示权重来源

- `backtest.html`
  - 当前已具备筛选参数与网格参数面板
  - 应成为“研究参数总入口”

- `iteration-manager.html`
  - 当前已能跑通 `90+`
  - 后续需支持展示：
    - 样本内结果
    - 样本外结果
    - 权重摘要
    - 分层参数摘要

### 9.2 后端

- `api/iteration-manager.js`
  - 负责分层参数透传
  - 负责版本历史字段扩展
  - 负责发布条件增加 OOS 校验

- `scripts/optuna_optimizer.py`
  - 负责主搜索空间扩展
  - 负责权重采样与归一化
  - 负责 seed 参数搜索

- `scripts/real_score_cli.mjs`
  - 负责统一评分入口
  - 后续可扩展样本外评分模式

### 9.3 数据库

建议后续扩展 `strategy_versions` 或旁表，新增：

- `in_sample_score`
- `out_of_sample_score`
- `in_sample_metrics_json`
- `out_of_sample_metrics_json`
- `weights_json`
- `search_space_version`

---

## 10. 最终建议

当前项目最正确的推进方式不是“继续盲目调更多阈值”，而是：

1. 先把 `seven_factor` 升级为“筛选层 + 交易层”联合优化
2. 再把“四维度权重”接入搜索空间
3. 再把“七因子权重”接进来
4. 最后再补样本外验证与网格参数优化

一句话总结：

当前系统已经具备“自动调参”能力，但还没有具备“完整优化四维度七因子策略”的能力。  
这次重构的目标，不是推倒重做，而是把现有链路逐步升级成一套分层、可解释、可验证的优化系统。
