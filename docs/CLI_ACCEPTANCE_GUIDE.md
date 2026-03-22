# 股票系统 - CLI 验收操作指南

**版本**: 1.0  
**更新时间**: 2026-03-22  

---

## 📋 可用验收工具对比

| 工具 | 模式 | 写入权限 | Shell 命令 | 适用场景 | 状态 |
|------|------|----------|------------|----------|------|
| **Claude CLI** | `--print` | 需用户授权 | ✅ 支持 | 开发、验收 | ✅ 推荐 |
| **Codex CLI** | `exec` | 需用户授权 | ✅ 支持 | 验收 | ⚠️ 额度耗尽 (3/26 恢复) |
| **Gemini CLI** | 默认 | 需用户授权 | ❌ 不支持 | 仅代码审查 | ❌ 不推荐 |

---

## 🔧 Claude CLI 使用规范

### 开发任务
```bash
cd /Users/vvc/.openclaw/workspace/stock-system
claude --print "你是开发工程师，请实现 TASK_XXX

**任务文档**: docs/tasks/TASK_XXX.md
**交接文档**: docs/handover/TASK_XXX_HANDOVER.md

**核心要求**:
1. ...
2. ...

完成后在 docs/runtime/TASK_XXX_STATUS.md 记录进度"
```

### 验收任务
```bash
cd /Users/vvc/.openclaw/workspace/stock-system
claude --print "你是验收员，请验收 TASK_XXX

**验收标准**:
1. 读取 docs/tasks/TASK_XXX.md
2. 读取实现文件
3. 检查函数导出
4. 运行测试

**输出格式**:
- 逐项用✅或❌表示
- 最后说 通过/不通过

**验收报告写入**: docs/acceptance/TASK_XXX_ACCEPTANCE.md"
```

### 写入授权
Claude CLI 创建新文件时会弹出权限对话框，需要点击"允许"或"Allow"。

**批量授权**（可选）:
```bash
# 授予整个项目的写入权限
claude config set permissions.allowWrite true
```

---

## ⚠️ Gemini CLI 限制说明

**测试结果** (2026-03-22):
- Gemini CLI 当前版本 **不支持** `run_shell_command` 工具
- 错误信息：`Error executing tool run_shell_command: Tool "run_shell_command" not found`
- 可用工具：`grep_search`, `cli_help`, `read_file` 等只读工具

**结论**:
- Gemini CLI 仅适用于代码审查、文档阅读等只读任务
- 不适用于需要执行 shell 命令的验收任务
- 推荐使用 Claude CLI 进行开发和验收

---

## 📊 验收流程

### 1. 并行开发
```bash
# 启动多个 Claude Code 会话并行开发
claude --print "实现 TASK_P1_001..." &
claude --print "实现 TASK_P1_002..." &
claude --print "实现 TASK_P1_003..." &
```

### 2. 并行验收
```bash
# 启动多个 Claude Code 会话并行验收
claude --print "验收 TASK_P1_001..." &
claude --print "验收 TASK_P1_002..." &
claude --print "验收 TASK_P1_003..." &
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
4. **外部工具**: 使用 Claude CLI 进行开发和验收，避免人工检查
5. **授权及时**: 及时批准文件创建权限，避免任务阻塞

---

## 📁 文档位置

| 文档类型 | 路径 | 用途 |
|----------|------|------|
| 任务文档 | `docs/tasks/TASK_XXX.md` | 定义需求和验收标准 |
| 交接文档 | `docs/handover/TASK_XXX_HANDOVER.md` | 快速交接给开发/验收员 |
| 运行时状态 | `docs/runtime/TASK_XXX_STATUS.md` | 跟踪任务进度 |
| 验收报告 | `docs/acceptance/TASK_XXX_ACCEPTANCE.md` | 正式验收记录 |
| 操作指南 | `docs/CLI_ACCEPTANCE_GUIDE.md` | 本文件 |
