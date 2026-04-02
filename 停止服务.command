#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/scripts/stop-server.sh"

echo
echo "按任意键关闭窗口..."
read -r -n 1 _
echo
