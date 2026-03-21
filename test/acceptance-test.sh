#!/bin/bash
# 股票投资系统验收测试脚本

BASE_URL="http://127.0.0.1:3000"
PASS_COUNT=0
FAIL_COUNT=0
SERVER_PID=""

cleanup() {
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}

ensure_server() {
    if curl -s "$BASE_URL/api/" >/dev/null 2>&1; then
        return 0
    fi

    node api/server.js >/tmp/stock-system-acceptance-server.log 2>&1 &
    SERVER_PID=$!

    for _ in $(seq 1 30); do
        if curl -s "$BASE_URL/api/" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done

    echo "❌ 无法启动测试服务"
    echo "   日志: /tmp/stock-system-acceptance-server.log"
    exit 1
}

trap cleanup EXIT

ensure_server

echo "========================================"
echo "🚀 股票投资系统验收测试"
echo "========================================"
echo ""

# 测试函数
test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected=$5
    
    echo -n "Testing $name... "
    
    if [ "$method" = "GET" ]; then
        RESPONSE=$(curl -s -X GET "$BASE_URL$endpoint" 2>&1)
    else
        RESPONSE=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    fi
    
    if echo "$RESPONSE" | grep -q "$expected"; then
        echo "✅ PASS"
        ((PASS_COUNT++))
    else
        echo "❌ FAIL"
        echo "   Response: $RESPONSE"
        ((FAIL_COUNT++))
    fi
}

echo "📦 Phase 2: 账户API测试"
echo "----------------------------------------"

# 创建账户
test_api "创建账户" "POST" "/api/portfolio/account" \
    '{"account_name":"测试账户","initial_cash":1000000}' \
    '"success":true'

# 获取账户列表
test_api "获取账户列表" "GET" "/api/portfolio/account" \
    "" \
    '"success":true'

echo ""
echo "📦 Phase 3: 条件单API测试"
echo "----------------------------------------"

# 创建条件单
test_api "创建条件单" "POST" "/api/conditional-order" \
    '{"account_id":1,"ts_code":"300308.SZ","stock_name":"中际旭创","order_type":"price","action":"buy","amount":100000,"conditions":[{"type":"price","operator":"<=","value":600}]}' \
    '"success":true'

# 获取条件单列表
test_api "获取条件单列表" "GET" "/api/conditional-order" \
    "" \
    '"success":true'

echo ""
echo "📦 Phase 4: 监控API测试"
echo "----------------------------------------"

# 获取监控池
test_api "获取监控池" "GET" "/api/monitor/list" \
    "" \
    '"success":true'

echo ""
echo "📦 Phase 5: 回测API测试"
echo "----------------------------------------"

# 运行回测
test_api "运行回测" "POST" "/api/backtest/run" \
    '{"startDate":"2024-01-01","endDate":"2024-03-01","initialCash":1000000,"stocks":["300308.SZ"],"strategy":{"name":"PE策略","buyCondition":{"type":"pe","operator":"<=","value":30},"sellCondition":{"type":"pe","operator":">=","value":40}}}' \
    '"success":true'

# 获取回测历史
test_api "获取回测历史" "GET" "/api/backtest/history" \
    "" \
    '"success":true'

echo ""
echo "========================================"
echo "📊 验收测试结果"
echo "========================================"
echo "✅ 通过: $PASS_COUNT"
echo "❌ 失败: $FAIL_COUNT"
echo "========================================"

if [ $FAIL_COUNT -eq 0 ]; then
    echo "🎉 所有测试通过！"
    exit 0
else
    echo "⚠️  存在失败的测试"
    exit 1
fi
