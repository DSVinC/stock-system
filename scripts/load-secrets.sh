#!/bin/bash
# 从 Keychain 加载敏感凭据到环境变量
# 用法：source scripts/load-secrets.sh

# 加载 Tushare Token
export TUSHARE_TOKEN=$(echo '{"ids": ["skills/tushare/token"]}' | /Users/vvc/.openclaw/bin/openclaw-keychain-secrets 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.values['skills/tushare/token'] || '')")

if [ -z "$TUSHARE_TOKEN" ]; then
  echo "⚠️ 警告：未能从 Keychain 加载 TUSHARE_TOKEN" >&2
  exit 1
fi
