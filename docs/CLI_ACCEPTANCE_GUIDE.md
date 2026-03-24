# 股票系统 - CLI 验收操作指南

**版本**: 1.2  
**更新时间**: 2026-03-24  
**更新内容**: 
- 补充角色分工说明
- 补充 Claude Code、Codex、Gemini 详细用法
- 补充代理配置和 CLI 优先原则
- 完善并行开发/验收流程

---

## 🎭 角色分工

| 角色 | 工具 | 职责 | 优先级 |
|------|------|------|--------|
| **灵爪小弟** 🛠️ | Claude Code | 代码实现、功能开发、bug 修复 | 开发首选 |
| **专家顾问** 👨‍🔬 | Codex | 代码审查、验收、技术咨询 | 验收首选 |
| **备选专家** 🧠 | Gemini | 备选开发/验收、技术分析 | Codex 不可用时 |
| **灵爪** 🐾 | 自己处理 | 文档、配置、轻量验证 | 简单任务 |

---

## 📋 可用验收工具对比

| 工具 | 模式 | 写入权限 | Shell 命令 | 适用场景 | 状态 |
|------|------|----------|------------|----------|------|
| **Gemini CLI** | `--approval-mode=yolo` | 需用户授权 | ✅ 支持 | 开发、验收 | ✅ 推荐 |
| **Codex CLI** | `exec` | 需用户授权 | ✅ 支持 | 验收 | ⚠️ 额度耗尽 (3/26 恢复) |
| **Claude Code** | CLI | 需用户授权 | ✅ 支持 | 开发 | ✅ 开发首选 |

---

## 🔧 工具详细用法

### 🛠️ Claude Code（灵爪小弟 - 开发主力）

**适用场景**: 代码实现、功能开发、bug 修复、批量处理

**调用方式**:
```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# 开发任务
claude "你是开发工程师，请实现 TASK_V3_101：日线回测引擎核心功能..."

# 或使用 claude-code
claude-code "实现分钟线回测策略批量回测功能..."
```

**典型任务示例**:
- "实现一个股票数据爬虫"
- "修复这个 bug"
- "重构这段代码"
- "批量生成测试用例"

**注意**: 我们只用 CLI，不用 ACP

---

### 👨‍🔬 Codex（专家顾问 - 验收与疑难解答）

**适用场景**: 代码审查、技术咨询、架构设计、最佳实践

**调用方式**:
```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# 验收任务
codex exec "你是验收员，请对 TASK_V3_101 进行验收，检查清单：1... 2... 3..."

# 技术咨询
codex exec "这个技术方案可行吗？请分析优缺点..."
```

**典型任务示例**:
- "审查这段代码质量"
- "这个技术方案可行吗"
- "如何优化这个架构"
- "验收 TASK_XXX 任务"

**注意**: 
- 我们只用 CLI，不用 AppleScript 远程控制
- Codex 有额度限制（每月重置），优先用于验收和疑难问题

---

### 🧠 Gemini（备选专家 - 需要代理配置）

**适用场景**: 备选开发/验收、技术分析、量化策略、多语言支持

**代理配置**（必需）:
```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
```

**调用方式**:
```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# 配置代理
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890

# 开发任务
gemini --approval-mode=yolo "实现 TASK_V3_102：回测参数优化器..."

# 验收任务
gemini --approval-mode=yolo "你是验收员，请验收 TASK_V3_101..."

# 技术分析
gemini --approval-mode=yolo "分析这个量化策略的风险和优化建议..."
```

**典型任务示例**:
- "分析这个量化策略"
- "提供技术架构建议"
- "多语言代码审查"
- "实现 TASK_XXX 功能"
- "验收 TASK_XXX 任务"

**注意**: 
- Codex 额度耗尽时的首选替代方案
- 必须配置代理才能使用

---

## ⚠️ CLI 优先原则

**当前环境默认策略**: CLI 优先，不默认尝试 ACP

**原因**:
1. ACP 健康状态未知
2. 目标 agent 可能不在 `acp.allowedAgents` 中
3. 某些代理在 ACP 模式下不稳定
4. CLI 更简单、更可靠

**只有满足以下条件时才尝试 ACP**:
1. ACP 后端正常
2. 目标 agent 在 `acp.allowedAgents` 中
3. 该代理已通过最小 ACP 验证
4. 用户明确要求使用 ACP

**最小 ACP 验证规则**:
```bash
# 1. ACP 适配器能完成 initialize
# 2. 能成功创建 session/new
# 3. 能完成最小 prompt（如 reply exactly: OK）
```

任一项失败，直接回退 CLI。

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

## 📊 并行开发/验收流程

### 1. 任务拆分原则

**拆分标准**:
- 每个任务可独立开发/验收
- 任务之间有明确边界
- 单个任务预计耗时 < 30 分钟
- 任务数 ≥ 3 时考虑并行

**示例**:
```
TASK_V3_101: 日线回测引擎
├── TASK_V3_101_001: 回测引擎核心类
├── TASK_V3_101_002: 回测报告生成
├── TASK_V3_101_003: 命令行工具
└── TASK_V3_101_004: 单元测试
```

### 2. 并行开发

**Claude Code（开发主力）**:
```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# 并行开发 3 个任务
claude "实现 TASK_V3_101_001..." &
claude "实现 TASK_V3_101_002..." &
claude "实现 TASK_V3_101_003..." &

# 等待所有任务完成
wait
```

**Gemini CLI（备选）**:
```bash
# 配置代理
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890

# 并行开发
gemini --approval-mode=yolo "实现 TASK_V3_101_001..." &
gemini --approval-mode=yolo "实现 TASK_V3_101_002..." &
gemini --approval-mode=yolo "实现 TASK_V3_101_003..." &

wait
```

### 3. 并行验收

**Codex（验收首选）**:
```bash
# 并行验收多个任务
codex exec "验收 TASK_V3_101_001，检查清单：1... 2... 3..." &
codex exec "验收 TASK_V3_101_002，检查清单：1... 2... 3..." &
codex exec "验收 TASK_V3_101_003，检查清单：1... 2... 3..." &

wait
```

**Gemini CLI（Codex 不可用时）**:
```bash
gemini --approval-mode=yolo "你是验收员，请验收 TASK_V3_101_001..." &
gemini --approval-mode=yolo "你是验收员，请验收 TASK_V3_101_002..." &
gemini --approval-mode=yolo "你是验收员，请验收 TASK_V3_101_003..." &

wait
```

### 4. 验收报告

验收报告写入 `docs/acceptance/TASK_XXX_ACCEPTANCE.md`，包含：
- 验收清单（逐项✅/❌）
- 详细检查结果
- 最终结论（通过/不通过）
- 交付物清单

### 5. 状态更新

- 更新 `docs/runtime/TASK_XXX_STATUS.md` 状态为 `done`
- 登记验收日志到 `memory/project/stock-system/{timestamp}.json`
- 更新 todo.db（如任务已注册）

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

### 工具选择

| 场景 | 首选工具 | 备选工具 |
|------|----------|----------|
| 开发任务 | Claude Code | Gemini CLI |
| 验收任务 | Codex | Gemini CLI |
| 技术咨询 | Codex | Gemini CLI |
| 简单任务 | 灵爪自己处理 | - |

### 执行原则

1. **并行优先**: 任务数≥3 时考虑并行开发/验收，提升效率
2. **文档先行**: 先创建任务文档和交接文档，再启动开发
3. **三重记录**: runtime 状态 + 交接文档 + 验收报告
4. **CLI 优先**: 默认使用 CLI，不尝试 ACP（除非明确验证通过）
5. **授权及时**: 使用 `--approval-mode=yolo` 自动批准，避免任务阻塞
6. **代理配置**: Gemini CLI 必须先配置代理 (127.0.0.1:7890)
7. **额度管理**: Codex 有额度限制，优先用于验收和疑难问题

### 常见错误

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| 忘记配置代理 | Gemini CLI 无法连接 | 先 export http_proxy/https_proxy |
| 不用 YOLO 模式 | 操作被阻塞，需要手动确认 | 加 `--approval-mode=yolo` 参数 |
| 单任务串行执行 | 效率低下 | 任务数≥3 时并行执行 |
| 尝试 ACP | 可能超时或失败 | 默认 CLI 优先，不尝试 ACP |
| Codex 用于简单任务 | 额度快速耗尽 | Codex 优先用于验收和疑难问题 |

---

## 📁 文档位置

| 文档类型 | 路径 | 用途 |
|----------|------|------|
| 任务文档 | `docs/tasks/TASK_XXX.md` | 定义需求和验收标准 |
| 交接文档 | `docs/handover/TASK_XXX_HANDOVER.md` | 快速交接给开发/验收员 |
| 运行时状态 | `docs/runtime/TASK_XXX_STATUS.md` | 跟踪任务进度 |
| 验收报告 | `docs/acceptance/TASK_XXX_ACCEPTANCE.md` | 正式验收记录 |
| 操作指南 | `docs/CLI_ACCEPTANCE_GUIDE.md` | 本文件 |
