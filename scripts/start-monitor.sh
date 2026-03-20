#!/bin/bash
# 条件单监控服务启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 启动条件单监控服务..."
echo "工作目录: $WORKSPACE_DIR"

# 检查是否已在运行
PID_FILE="/tmp/stock-monitor.pid"
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "⚠️ 监控服务已在运行 (PID: $OLD_PID)"
        echo "使用 ./stop-monitor.sh 停止后再启动"
        exit 1
    fi
fi

# 启动服务
cd "$WORKSPACE_DIR"
node scripts/monitor-service.mjs > logs/monitor.log 2>&1 &
PID=$!
echo $PID > "$PID_FILE"

echo "✅ 监控服务已启动 (PID: $PID)"
echo "日志文件: $WORKSPACE_DIR/logs/monitor.log"
echo ""
echo "常用命令:"
echo "  查看日志: tail -f logs/monitor.log"
echo "  停止服务: ./scripts/stop-monitor.sh"
echo "  单次检查: node scripts/conditional-order-monitor.mjs"
