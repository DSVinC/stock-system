# API 契约保障流程 (API Contract Flow)

> **目标**：彻底解决前后端接口契约不一致问题  
> **生效日期**：2026-03-26  
> **强制执行**：所有涉及前后端交互的功能开发必须遵守

---

## 一、问题定义

### 什么是"接口契约不一致"？

前后端对同一接口的理解不一致，导致：
- 参数名对不上（前端发 `minScore`，后端等 `minSevenFactorScore`）
- 字段名对不上（前端发 `strategy`，后端解构 `coreStrategy`）
- DOM ID 对不上（前端写 `strategySelector`，实际 HTML 是 `strategySelect`）
- 返回结构对不上（后端返回 `stop_loss`，前端不映射）

### 历史损失统计

| 日期 | 问题数量 | 修复耗时 | 验收延误 |
|------|----------|----------|----------|
| 2026-03-22 | 5 个 | ~4 小时 | 1 天 |
| 2026-03-25 | 6 个 | ~6 小时 | 1 天 |
| 2026-03-26 | 4 个 | ~2 小时 | 0.5 天 |
| **合计** | **15 个** | **~12 小时** | **2.5 天** |

---

## 二、解决方案：三层契约保障

### 第一层：契约先行（开发前）

**规则**：在写任何代码之前，必须先定义接口契约。

**执行步骤**：

1. **创建契约文档** (`docs/api-contracts/{feature-name}.md`)
   ```markdown
   ## API: /api/select
   
   ### 请求参数
   | 字段 | 类型 | 必填 | 说明 | 前端来源 |
   |------|------|------|------|----------|
   | limit | number | 是 | 返回数量 | selectionLimit input |
   | minSevenFactorScore | number | 否 | 最低因子分 (0-1) | selectionMinScore / 100 |
   | strategy | string | 是 | 策略类型 | strategySelect value |
   
   ### 返回结构
   | 字段 | 类型 | 说明 | 前端用途 |
   |------|------|------|----------|
   | success | boolean | 是否成功 | 判断是否继续 |
   | stocks | array | 股票列表 | 渲染卡片 |
   | stocks[].stop_loss | number | 止损价 | 显示在卡片上 |
   | stocks[].target_prices | array | 止盈目标 | 显示在卡片上 |
   
   ### DOM 元素清单
   | ID | 类型 | 用途 |
   |----|------|------|
   | strategySelect | select | 策略选择器 |
   | selectionLimit | input | 数量限制 |
   ```

2. **契约审查**（开发 + 验收双方确认）
   - [ ] 参数名与后端代码一致
   - [ ] 返回字段与前端需求一致
   - [ ] DOM ID 与 HTML 一致
   - [ ] 数据类型转换已注明（如百分制→小数）

3. **契约锁定**
   - 契约文档提交后，不得单方面修改
   - 如需修改，必须通知对方并更新文档

---

### 第二层：契约验证（开发中）

**规则**：代码完成后，必须通过契约验证才能提交验收。

**执行步骤**：

1. **自生成契约检查表**
   ```bash
   # 从后端代码提取参数名
   grep -o "params.get('[^']*')" api/select.js | sort -u
   
   # 从前端代码提取发送参数
   grep -o "params.set('[^']*'" select.html | sort -u
   
   # 对比两者是否一致
   ```

2. **运行验证脚本** (`scripts/verify-api-contract.sh`)
   ```bash
   #!/bin/bash
   # 自动检查前后端参数名是否一致
   # 自动检查 DOM ID 是否存在
   # 自动检查返回字段是否映射
   ```

3. **填写验证报告** (`docs/runtime/{task-id}_CONTRACT_CHECK.md`)
   ```markdown
   ## 契约验证报告
   
   ### 参数一致性
   - [ ] 前端发送参数：minSevenFactorScore, limit, strategy
   - [ ] 后端接收参数：minSevenFactorScore, limit, strategy
   - [ ] 一致性：✅ 通过
   
   ### DOM ID 一致性
   - [ ] HTML 定义：strategySelect, selectionLimit
   - [ ] JS 引用：strategySelect, selectionLimit
   - [ ] 一致性：✅ 通过
   
   ### 返回字段映射
   - [ ] 后端返回：stop_loss, target_prices
   - [ ] 前端映射：stop_loss, target_prices
   - [ ] 一致性：✅ 通过
   ```

---

### 第三层：契约验收（验收时）

**规则**：验收员必须验证契约执行情况，而不仅仅是功能是否正常。

**执行步骤**：

1. **契约审查清单**（验收员必填）
   ```markdown
   ## 验收契约检查
   
   ### 参数传递验证
   - [ ] 前端输入能正确传到后端（打断点或日志验证）
   - [ ] 参数名与契约文档一致
   - [ ] 数据类型转换正确（如百分制→小数）
   
   ### 返回数据验证
   - [ ] 后端返回所有契约字段
   - [ ] 前端正确映射所有字段
   - [ ] 缺失字段有默认值或错误处理
   
   ### DOM 一致性验证
   - [ ] 所有 getElementById 的 ID 在 HTML 中存在
   - [ ] 所有 class 名在 CSS 中定义
   
   ### 端到端验证
   - [ ] 改变输入参数，输出结果有预期变化
   - [ ] 边界条件测试（最大值、最小值、空值）
   ```

2. **浏览器自动化测试**（如环境允许）
   ```javascript
   // Playwright 脚本自动验证
   await page.fill('#selectionMinScore', '65');
   await page.click('#runSelectionBtn');
   await page.waitForResponse('/api/select');
   // 验证请求参数
   // 验证返回数据
   // 验证页面渲染
   ```

3. **验收签字**
   - 验收员确认契约检查通过后，才能签字
   - 签字后发现问题，验收员承担连带责任

---

## 三、强制执行机制

### 1. 流程嵌入

**任务模板更新** (`docs/tasks/TASK_TEMPLATE.md`)：
```markdown
## 完成定义 (DoD)

- [ ] 契约文档创建 (`docs/api-contracts/{name}.md`)
- [ ] 契约验证通过 (`scripts/verify-api-contract.sh`)
- [ ] 契约检查报告 (`docs/runtime/{id}_CONTRACT_CHECK.md`)
- [ ] 功能开发完成
- [ ] 自测通过
- [ ] 验收通过
- [ ] todo.db 同步
```

### 2. 自动化检查

**CI 脚本** (`scripts/ci/check-contract.sh`)：
```bash
#!/bin/bash
# 检查所有 API 是否有契约文档
# 检查契约文档与代码是否一致
# 检查验收报告是否有契约检查签字
```

### 3. 违规处理

| 违规类型 | 处理方式 |
|----------|----------|
| 未创建契约文档就开发 | 任务打回，重新走流程 |
| 未通过契约验证就提交 | 验收拒绝，记录违规 |
| 验收未检查契约就签字 | 验收员连带责任 |
| 同一问题重复发生 3 次 | 升级为主人决策 |

---

## 四、工具支持

### 契约文档模板

```markdown
# API 契约：{API 名称}

**路径**: `POST /api/xxx`  
**创建日期**: YYYY-MM-DD  
**最后更新**: YYYY-MM-DD  
**负责人**: {开发 + 验收双方签字}

---

## 请求参数

| 字段 | 类型 | 必填 | 默认值 | 说明 | 前端来源 |
|------|------|------|--------|------|----------|
| | | | | | |

## 返回结构

| 字段 | 类型 | 必填 | 说明 | 前端用途 |
|------|------|------|------|----------|
| | | | | |

## DOM 元素清单

| ID | 类型 | 用途 | 所在文件 |
|----|------|------|----------|
| | | | |

## 数据类型转换

| 前端格式 | 后端格式 | 转换逻辑 |
|----------|----------|----------|
| | | |

## 变更记录

| 日期 | 变更内容 | 变更人 | 对方确认 |
|------|----------|--------|----------|
| | | | |
```

### 验证脚本模板

```bash
#!/bin/bash
# scripts/verify-api-contract.sh

echo "=== API 契约验证 ==="

# 1. 检查契约文档是否存在
if [ ! -f "docs/api-contracts/$1.md" ]; then
  echo "❌ 契约文档缺失：docs/api-contracts/$1.md"
  exit 1
fi

# 2. 提取后端参数
BACKEND_PARAMS=$(grep -o "params.get('[^']*')" api/$1.js | sort -u)

# 3. 提取前端参数
FRONTEND_PARAMS=$(grep -o "params.set('[^']*'" {select,backtest}.html | sort -u)

# 4. 对比
echo "后端期望参数:"
echo "$BACKEND_PARAMS"
echo ""
echo "前端发送参数:"
echo "$FRONTEND_PARAMS"
echo ""

# 5. 检查 DOM ID
echo "=== DOM ID 检查 ==="
for id in $(grep -o "getElementById('[^']*')" *.html | grep -o "'[^']*'" | sort -u); do
  if ! grep -q "id=$id" *.html; then
    echo "❌ DOM ID 不存在：$id"
    exit 1
  fi
done

echo "✅ 契约验证通过"
```

---

## 五、执行承诺

**项目经理（灵爪）**：
- [ ] 任务分配时检查契约文档是否创建
- [ ] 进度跟踪时检查契约验证是否通过
- [ ] 验收安排时检查契约检查报告是否完整

**开发工程师（Claude Code）**：
- [ ] 开发前先创建契约文档
- [ ] 开发中运行契约验证脚本
- [ ] 提交前填写契约检查报告

**验收工程师（Codex/Gemini）**：
- [ ] 验收时检查契约文档是否存在
- [ ] 验收时验证参数传递是否正确
- [ ] 验收时验证返回字段是否映射
- [ ] 验收报告必须包含契约检查签字

---

## 六、生效与修订

**生效日期**：2026-03-26  
**适用范围**：股票投资系统 V4 及后续所有版本  
**修订流程**：发现问题 → 提出修订 → 双方确认 → 更新文档

---

**签字确认**：

| 角色 | 姓名 | 日期 | 签字 |
|------|------|------|------|
| 项目经理 | 灵爪 | 2026-03-26 | 🐾 |
| 开发工程师 | Claude Code | - | - |
| 验收工程师 | Codex | - | - |
