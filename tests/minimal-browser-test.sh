#!/bin/bash
# V4/V5 最小浏览器验收测试
# 使用 agent-browser 验证核心 UI 功能

set -e
REPORT_FILE="docs/acceptance/AGENT_BROWSER_MINIMAL_TEST_$(date +%Y%m%d).md"

echo "# V4/V5 最小浏览器验收报告" > $REPORT_FILE
echo "生成时间：$(date)" >> $REPORT_FILE
echo "测试工具：agent-browser v$(agent-browser --version)" >> $REPORT_FILE
echo "" >> $REPORT_FILE

## 测试 1: select.html - 验证 5 个策略选项
echo "## 测试 1: select.html 策略选择器" >> $REPORT_FILE
echo "" >> $REPORT_FILE

agent-browser open http://127.0.0.1:3000/select.html
sleep 2

# 获取页面标题
TITLE=$(agent-browser get title)
echo "- 页面标题：$TITLE" >> $REPORT_FILE

# 快照获取元素
agent-browser snapshot -i > /tmp/select_snapshot.txt 2>&1 || true

# 验证策略选择器存在
if agent-browser get count "#strategySelect" 2>/dev/null | grep -q "5\|6"; then
    echo "- ✅ 策略选择器存在 (5-6 个选项)" >> $REPORT_FILE
else
    echo "- ❌ 策略选择器验证失败" >> $REPORT_FILE
fi

# 验证开始选股按钮
if agent-browser is visible "#startSelectionBtn" 2>/dev/null; then
    echo "- ✅ 开始选股按钮可见" >> $REPORT_FILE
else
    echo "- ⚠️ 开始选股按钮不可见" >> $REPORT_FILE
fi

agent-browser close
echo "" >> $REPORT_FILE

## 测试 2: backtest.html - 验证 9 个指标位
echo "## 测试 2: backtest.html 回测指标" >> $REPORT_FILE
echo "" >> $REPORT_FILE

agent-browser open http://127.0.0.1:3000/backtest.html
sleep 2

# 验证指标容器存在
METRICS_COUNT=$(agent-browser get count ".metric-card" 2>/dev/null || echo "0")
echo "- 指标卡片数量：$METRICS_COUNT" >> $REPORT_FILE

if [ "$METRICS_COUNT" -ge "9" ]; then
    echo "- ✅ 9 个指标位存在" >> $REPORT_FILE
else
    echo "- ⚠️ 指标卡片数量不足 9 个" >> $REPORT_FILE
fi

agent-browser close
echo "" >> $REPORT_FILE

## 测试 3: iteration-manager.html - 版本历史
echo "## 测试 3: iteration-manager.html 版本管理" >> $REPORT_FILE
echo "" >> $REPORT_FILE

agent-browser open http://127.0.0.1:3000/iteration-manager.html
sleep 2

# 验证版本列表容器
if agent-browser is visible "#versionList" 2>/dev/null; then
    echo "- ✅ 版本列表容器存在" >> $REPORT_FILE
else
    echo "- ⚠️ 版本列表容器不可见" >> $REPORT_FILE
fi

agent-browser close
echo "" >> $REPORT_FILE

## 测试 4: API 连通性
echo "## 测试 4: API 连通性" >> $REPORT_FILE
echo "" >> $REPORT_FILE

API_RESULT=$(curl -s "http://127.0.0.1:3000/api/select?strategy=seven_factor&limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print('success' if d.get('success') else 'fail')" 2>/dev/null || echo "error")
echo "- 选股 API: $API_RESULT" >> $REPORT_FILE

if [ "$API_RESULT" = "success" ]; then
    echo "- ✅ API 连通性正常" >> $REPORT_FILE
else
    echo "- ❌ API 连通性异常" >> $REPORT_FILE
fi
echo "" >> $REPORT_FILE

## 总结
echo "## 测试总结" >> $REPORT_FILE
echo "" >> $REPORT_FILE
echo "测试完成。详细结果见上。" >> $REPORT_FILE

echo "报告已生成：$REPORT_FILE"
cat $REPORT_FILE
