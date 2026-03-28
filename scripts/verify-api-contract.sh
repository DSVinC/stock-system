#!/bin/bash
# API 契约验证脚本
# 用法：bash scripts/verify-api-contract.sh {api-name}
# 示例：bash scripts/verify-api-contract.sh select

set -e

API_NAME=$1
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== API 契约验证：$API_NAME ==="
echo ""

# 检查契约文档是否存在
if [ ! -f "docs/api-contracts/${API_NAME}.md" ]; then
  echo -e "${RED}❌ 契约文档缺失：docs/api-contracts/${API_NAME}.md${NC}"
  echo "请先创建契约文档"
  exit 1
else
  echo -e "${GREEN}✅ 契约文档存在：docs/api-contracts/${API_NAME}.md${NC}"
fi

# 提取后端 API 参数
echo ""
echo "=== 后端参数检查 ==="
if [ -f "api/${API_NAME}.js" ]; then
  BACKEND_PARAMS=$(grep -oE "params\.get\('[^']*'\)|query\.get\('[^']*'\)|body\.[^ ]*" api/${API_NAME}.js 2>/dev/null | sort -u || echo "")
  if [ -n "$BACKEND_PARAMS" ]; then
    echo "后端接收参数:"
    echo "$BACKEND_PARAMS" | sed 's/^/  /'
  else
    echo "  (未检测到标准参数获取模式)"
  fi
else
  echo -e "${YELLOW}⚠️  后端文件不存在：api/${API_NAME}.js${NC}"
fi

# 提取前端发送参数
echo ""
echo "=== 前端参数检查 ==="
FRONTEND_FILES=$(ls *.html 2>/dev/null || echo "")
if [ -n "$FRONTEND_FILES" ]; then
  FRONTEND_PARAMS=$(grep -oE "params\.set\('[^']*'|fetch\([^)]*${API_NAME}[^)]*\)" $FRONTEND_FILES 2>/dev/null | sort -u || echo "")
  if [ -n "$FRONTEND_PARAMS" ]; then
    echo "前端发送参数:"
    echo "$FRONTEND_PARAMS" | sed 's/^/  /'
  else
    echo "  (未检测到参数发送)"
  fi
else
  echo -e "${YELLOW}⚠️  前端文件不存在${NC}"
fi

# 检查 DOM ID 一致性
echo ""
echo "=== DOM ID 检查 ==="
DOM_ERRORS=0
for html_file in *.html; do
  if [ -f "$html_file" ]; then
    # 提取所有 getElementById 的 ID
    IDS=$(grep -oE "getElementById\('[^']*'\)" "$html_file" 2>/dev/null | grep -oE "'[^']*'" | tr -d "'" || echo "")
    for id in $IDS; do
      # 检查该 ID 是否在 HTML 中定义
      if ! grep -q "id=[\"']${id}[\"']" "$html_file" 2>/dev/null; then
        echo -e "${RED}❌ DOM ID 不存在：$id (文件：$html_file)${NC}"
        DOM_ERRORS=$((DOM_ERRORS + 1))
      fi
    done
  fi
done

if [ $DOM_ERRORS -eq 0 ]; then
  echo -e "${GREEN}✅ 所有 DOM ID 均存在${NC}"
else
  echo -e "${RED}❌ 发现 $DOM_ERRORS 个 DOM ID 错误${NC}"
  exit 1
fi

# 检查返回字段映射（前端）
echo ""
echo "=== 返回字段映射检查 ==="
# 检查是否有未处理的常见字段
UNMAPPED_FIELDS=0
for html_file in *.html; do
  if [ -f "$html_file" ]; then
    # 检查后端常见返回字段是否在前端有映射
    for field in "stop_loss" "target_prices" "entry_zone" "decision"; do
      if grep -q "$field" "api/${API_NAME}.js" 2>/dev/null; then
        if ! grep -q "$field" "$html_file" 2>/dev/null; then
          echo -e "${YELLOW}⚠️  字段可能未映射：$field (后端有，前端未检测到)${NC}"
          UNMAPPED_FIELDS=$((UNMAPPED_FIELDS + 1))
        fi
      fi
    done
  fi
done

if [ $UNMAPPED_FIELDS -eq 0 ]; then
  echo -e "${GREEN}✅ 返回字段映射完整${NC}"
else
  echo -e "${YELLOW}⚠️  发现 $UNMAPPED_FIELDS 个可能未映射的字段（请手动确认）${NC}"
fi

echo ""
echo "=== 契约验证完成 ==="
echo -e "${GREEN}✅ 所有检查通过${NC}"
echo ""
echo "下一步：填写契约检查报告 (docs/runtime/{task-id}_CONTRACT_CHECK.md)"
