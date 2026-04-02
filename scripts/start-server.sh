#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
LOG_DIR="$PROJECT_DIR/logs"
PID_FILE="$RUNTIME_DIR/server.pid"
LOG_FILE="$LOG_DIR/server.out.log"

mkdir -p "$RUNTIME_DIR" "$LOG_DIR"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "服务已在运行 (PID: $OLD_PID)"
    echo "地址: http://127.0.0.1:3000"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

cd "$PROJECT_DIR"

nohup node api/server.js >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

sleep 1
if kill -0 "$NEW_PID" 2>/dev/null; then
  echo "服务启动成功 (PID: $NEW_PID)"
  echo "地址: http://127.0.0.1:3000"
  echo "日志: $LOG_FILE"
else
  echo "服务启动失败，请查看日志: $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
