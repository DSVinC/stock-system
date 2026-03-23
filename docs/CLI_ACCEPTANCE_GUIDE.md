# 股票系统 - CLI 验收操作指南

**版本**: 1.1  
**更新时间**: 2026-03-23  
**更新内容**: 添加 Gemini CLI `--approval-mode=yolo` 用法说明  

---

## 📋 可用验收工具对比

| 工具 | 模式 | 写入权限 | Shell 命令 | 适用场景 | 状态 |
|------|------|----------|------------|----------|------|
| **Gemini CLI** | `--approval-mode=yolo` | 需用户授权 | ✅ 支持 | 开发、验收 | ✅ 推荐 |
| **Codex CLI** | `exec` | 需用户授权 | ✅ 支持 | 验收 | ⚠️ 额度耗尽 (3/26 恢复) |

---

## 🔧 CLI 使用规范

### 开发任务
```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# Gemini CLI
gemini --approval-mode=yolo "你是开发工程师，请实现 TASK_XXX..."

# Codex CLI (额度耗尽，3/26 恢复)
codex exec "你是开发工程师，请实现 TASK_XXX..."
```

### 验收任务
```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# Gemini CLI
gemini --approval-mode=yolo "你是验收员，请验收 TASK_XXX..."

# Codex CLI (额度耗尽，3/26 恢复)
codex exec "你是验收员，请验收 TASK_XXX..."
```

### 写入授权
- **Gemini CLI**: 使用 `--approval-mode=yolo` 自动批准所有操作
- **Codex CLI**: 需要用户授权

---

## ⚠️ Gemini CLI 使用说明

### 启用 Shell 命令（2026-03-23 更新）

**问题**: Gemini CLI 默认不自动批准 shell 命令
**错误**: `Error executing tool run_shell_command: Tool "run_shell_command" not found`

**解决方法**: 使用 `--approval-mode=yolo` 参数

```bash
# 启用 YOLO 模式（自动批准所有操作）
gemini --approval-mode=yolo "你的指令"

# 示例：语法检查
gemini --approval-mode=yolo "请运行：node --check api/analyze.js"

# 示例：验收任务
gemini --approval-mode=yolo "你是验收员，请验收 TASK_XXX..."
```

**注意**: YOLO 模式会跳过所有安全检查，仅在受信任的环境中使用。

---

## 📊 验收流程

### 1. 并行开发
```bash
# Gemini CLI
gemini --approval-mode=yolo "实现 TASK_P1_001..." &
gemini --approval-mode=yolo "实现 TASK_P1_002..." &
gemini --approval-mode=yolo "实现 TASK_P1_003..." &
```

### 2. 并行验收
```bash
# Gemini CLI
gemini --approval-mode=yolo "验收 TASK_P1_001..." &
gemini --approval-mode=yolo "验收 TASK_P1_002..." &
gemini --approval-mode=yolo "验收 TASK_P1_003..." &
```

### 3. 验收报告
验收报告写入 `docs/acceptance/TASK_XXX_ACCEPTANCE.md`，包含：
- 验收清单（逐项✅/❌）
- 详细检查结果
- 最终结论（通过/不通过）
- 交付物清单

### 4. 状态更新
- 更新 `docs/runtime/TASK_XXX_STATUS.md` 状态为 `done`
- 登记验收日志到 `memory/project/stock-system/{timestamp}.json`
- 更新 todo.db（如任务已注册）

---

## 🎯 最佳实践

1. **并行优先**: 多个任务并行开发/验收，提升效率
2. **文档先行**: 先创建任务文档和交接文档，再启动开发
3. **三重记录**: runtime 状态 + 交接文档 + 验收报告
4. **CLI 选择**: 优先使用 Gemini CLI (--approval-mode=yolo)，Codex CLI 作为备选
5. **授权及时**: 使用 `--approval-mode=yolo` 自动批准，避免任务阻塞

---

## 📁 文档位置

| 文档类型 | 路径 | 用途 |
|----------|------|------|
| 任务文档 | `docs/tasks/TASK_XXX.md` | 定义需求和验收标准 |
| 交接文档 | `docs/handover/TASK_XXX_HANDOVER.md` | 快速交接给开发/验收员 |
| 运行时状态 | `docs/runtime/TASK_XXX_STATUS.md` | 跟踪任务进度 |
| 验收报告 | `docs/acceptance/TASK_XXX_ACCEPTANCE.md` | 正式验收记录 |
| 操作指南 | `docs/CLI_ACCEPTANCE_GUIDE.md` | 本文件 |
