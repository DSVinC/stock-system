#!/bin/bash
# 股票投资系统 - 整体联调测试脚本

BASE_URL="http://127.0.0.1:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

passed=0
failed=0
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

    node api/server.js >/tmp/stock-system-integration-server.log 2>&1 &
    SERVER_PID=$!

    for _ in $(seq 1 30); do
        if curl -s "$BASE_URL/api/" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done

    echo -e "${RED}无法启动测试服务${NC}"
    echo "日志: /tmp/stock-system-integration-server.log"
    exit 1
}

trap cleanup EXIT

ensure_server

echo "================================"
echo "  股票投资系统 - 整体联调测试"
echo "================================"
echo ""

# 测试函数
test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    
    echo -n "测试 $name ... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -sL -w "\n%{http_code}" "$BASE_URL$endpoint" 2>/dev/null || echo "error")
    else
        response=$(curl -sL -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null || echo "error")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        if echo "$body" | grep -q '"success":true'; then
            echo -e "${GREEN}PASS${NC}"
            ((passed++))
        else
            echo -e "${RED}FAIL${NC} (API返回失败)"
            echo "  响应: $body"
            ((failed++))
        fi
    else
        echo -e "${RED}FAIL${NC} (HTTP $http_code)"
        ((failed++))
    fi
}

# 1. 基础服务测试
echo "【1. 基础服务测试】"
test_api "服务健康检查" "GET" "/api"
echo ""

# 2. 账户API测试
echo "【2. 账户API测试】"
test_api "获取账户列表" "GET" "/api/portfolio/account"
test_api "创建测试账户" "POST" "/api/portfolio/account" '{"account_name":"联调测试账户","initial_cash":1000000}'
echo ""

# 3. 条件单API测试
echo "【3. 条件单API测试】"
test_api "获取条件单列表" "GET" "/api/conditional-order"
test_api "创建条件单" "POST" "/api/conditional-order" '{
    "account_id":1,
    "ts_code":"300308.SZ",
    "stock_name":"中际旭创",
    "action":"buy",
    "order_type":"price",
    "amount":100000,
    "conditions":[{"type":"price","operator":"<=","value":600}],
    "condition_logic":"AND",
    "start_date":"2026-03-18",
    "end_date":"2026-06-18",
    "max_trigger_count":1
}'
echo ""

# 4. 监控API测试
echo "【4. 监控API测试】"
test_api "获取监控池" "GET" "/api/monitor/list"
echo ""

# 5. 回测API测试
echo "【5. 回测API测试】"
test_api "获取回测历史" "GET" "/api/backtest/history"
echo ""

# 6. 选股分析API测试
echo "【6. 选股分析API测试】"
test_api "获取分析报告" "POST" "/api/analysis" '{"stock_code":"300308.SZ"}'
echo ""

# 7. 前端页面测试
echo "【7. 前端页面测试】"
echo -n "测试首页 ... "
if curl -s "$BASE_URL/" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((passed++))
else
    echo -e "${RED}FAIL${NC}"
    ((failed++))
fi

echo -n "测试分析页面 ... "
if curl -s "$BASE_URL/analysis.html" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((passed++))
else
    echo -e "${RED}FAIL${NC}"
    ((failed++))
fi

echo -n "测试账户页面 ... "
if curl -s "$BASE_URL/portfolio.html" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((passed++))
else
    echo -e "${RED}FAIL${NC}"
    ((failed++))
fi

echo -n "测试条件单页面 ... "
if curl -s "$BASE_URL/conditional-order.html" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((passed++))
else
    echo -e "${RED}FAIL${NC}"
    ((failed++))
fi

echo -n "测试回测页面 ... "
if curl -s "$BASE_URL/backtest.html" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((passed++))
else
    echo -e "${RED}FAIL${NC}"
    ((failed++))
fi

echo ""

# 8. 数据库连接测试
echo "【8. 数据库连接测试】"
echo -n "测试数据库连接 ... "
if [ -f "/Volumes/SSD500/openclaw/stock-system/stock_system.db" ]; then
    echo -e "${GREEN}PASS${NC}"
    ((passed++))
else
    echo -e "${RED}FAIL${NC} (数据库文件不存在)"
    ((failed++))
fi
echo ""

# 汇总
echo "================================"
echo "  测试结果汇总"
echo "================================"
echo -e "通过: ${GREEN}$passed${NC}"
echo -e "失败: ${RED}$failed${NC}"
echo ""

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✅ 所有测试通过！系统联调成功。${NC}"
    exit 0
else
    echo -e "${RED}❌ 部分测试失败，请检查日志。${NC}"
    exit 1
fi
