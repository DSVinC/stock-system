#!/bin/bash
# Codex 浏览器验收最小测试方案
# 根据"外部工具调用"技能文档，使用 CLI 方式调用 Codex

set -e

cd /Users/vvc/.openclaw/workspace/stock-system

# 配置代理（根据技能文档要求）
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export ALL_PROXY=socks5://127.0.0.1:7890

# 验收任务描述
cat > /tmp/codex_browser_test.txt << 'EOF'
你是 Codex 浏览器验收专家，执行 V4/V5 最终 E2E 浏览器验收。

【环境】
- 服务已运行：http://127.0.0.1:3000
- 工作目录：/Users/vvc/.openclaw/workspace/stock-system

【任务】
使用 Playwright 进行浏览器自动化测试，验证以下内容：

1. **select.html** (选股页面)
   - 打开 http://127.0.0.1:3000/select.html
   - 验证策略选择器有 5 个选项 (double_ma, rsi, macd, bollinger, seven_factor)
   - 验证"开始选股"按钮存在且可见
   - 点击"开始选股"，验证返回结果包含决策单字段 (entry_zone, stop_loss, target_prices)

2. **backtest.html** (回测页面)
   - 打开 http://127.0.0.1:3000/backtest.html
   - 验证 9 个指标卡片存在 (total_return, sharpe, max_drawdown, calmar, profit_loss, win_rate, turnover, annualized_return, sortino)
   - 验证策略选择器存在

3. **iteration-manager.html** (迭代管理器)
   - 打开 http://127.0.0.1:3000/iteration-manager.html
   - 验证版本列表容器存在
   - 验证"开始迭代"按钮存在

【输出】
生成验收报告到：docs/acceptance/CODEX_BROWSER_E2E_$(date +%Y%m%d).md

报告格式：
# V4/V5 浏览器 E2E 验收报告
## 测试 1: select.html
- [ ] 策略选择器 5 个选项
- [ ] 开始选股按钮
- [ ] 决策单字段

## 测试 2: backtest.html
- [ ] 9 个指标卡片
- [ ] 策略选择器

## 测试 3: iteration-manager.html
- [ ] 版本列表
- [ ] 开始迭代按钮

## 结论
[通过/不通过]
EOF

# 使用 Codex CLI 执行验收（根据技能文档要求）
# 配置 sandbox_permissions 允许浏览器和网络访问
echo "启动 Codex 浏览器验收..."
codex exec \
  -c 'sandbox_permissions=["disk-full-read-access","network-access"]' \
  -c 'shell_environment_policy.inherit=all' \
  < /tmp/codex_browser_test.txt

echo "验收完成"
