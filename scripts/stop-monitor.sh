#!/bin/bash
# 条件单监控服务停止脚本

PID_FILE="/tmp/stock-monitor.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "🛑 停止监控服务 (PID: $PID)..."
        kill "$PID"
        rm "$PID_FILE"
        echo "✅ 监控服务已停止"
    else
        echo "⚠️ 进程不存在，清理PID文件"
        rm "$PID_FILE"
    fi
else
    echo "ℹ️ 监控服务未运行"
fi
