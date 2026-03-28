# 任务关闭检查清单

> **版本**: v1.0  
> **创建**: 2026-03-25  
> **适用范围**: 所有任务关闭场景  
> **触发时机**: 验收通过后，任务关闭前

---

## 🎯 目的

确保任务关闭前完成所有必要的同步和记录工作，防止进度不同步、经验流失等问题。

**核心原则**：验收通过不算完，todo.db 同步才关闭！

---

## 📋 检查清单（6 项）

### ✅ 1. 功能开发完成

**检查项**:
- [ ] 所有计划功能已实现
- [ ] 代码已提交到版本控制
- [ ] 无已知阻塞性 bug

**验证方式**:
- 检查交接文档 `docs/handover/TASK_{ID}_HANDOVER.md`
- 检查代码提交记录

---

### ✅ 2. 自测通过

**检查项**:
- [ ] 程序员已完成自测
- [ ] 单元测试通过（如适用）
- [ ] 功能测试通过

**验证方式**:
- 检查交接文档中的自测记录
- 运行 `npm test` 或等效命令

---

### ✅ 3. 验收通过

**检查项**:
- [ ] 验收员已完成验收
- [ ] 验收报告已生成（`docs/acceptance/TASK_{ID}_ACCEPTANCE.md`）
- [ ] 验收结论为「通过」

**验证方式**:
- 检查验收报告结论
- 检查验收员签名

---

### ✅ 4. 项目内文档更新

**检查项**:
- [ ] 任务状态文件已更新（`docs/runtime/TASK_{ID}_STATUS.md`）
- [ ] 状态标记为 `done`
- [ ] 最后更新时间正确

**验证方式**:
```bash
cat docs/runtime/TASK_{ID}_STATUS.md | grep -E "状态|done"
```

---

### ✅ 5. todo.db 同步（🔴 关键）

**检查项**:
- [ ] 已执行 `todo entry status` 命令
- [ ] todo.db 状态已更新为 `done`
- [ ] 同步结果已记录（验收报告中）

**执行命令**:
```bash
export TODO_DB=/Users/vvc/.openclaw/workspace/tasks/todo.db

# 使用 ID
bash skills/todo-management-1-1-2/scripts/todo.sh entry status <ID> --status=done

# 或使用 task_code
bash skills/todo-management-1-1-2/scripts/todo.sh entry status 523-0-020 --status=done
```

**验证方式**:
```bash
bash skills/todo-management-1-1-2/scripts/todo.sh entry show <ID>
# 或
bash skills/todo-management-1-1-2/scripts/todo.sh entry show 523-0-020
```

**预期输出**:
```
status = done
updated_at = 2026-03-25 12:00:00
```

---

### ✅ 6. 经验记录（如适用）

**检查项**:
- [ ] 如有新问题/新经验，已记录到 `docs/PROJECT_LESSONS.md`
- [ ] 如有修复，已生成修复报告（`docs/fixes/TASK_{ID}_FIX_{N}.md`）
- [ ] 修复报告已归档

**验证方式**:
- 检查 `docs/PROJECT_LESSONS.md` 最新条目
- 检查 `docs/fixes/` 目录

---

## 📊 检查流程

```
验收通过
    │
    ▼
读取本检查清单
    │
    ▼
逐项检查（1-6）
    │
    ▼
全部通过？───否──→ 补充缺失项
    │
   是
    │
    ▼
任务关闭 ✅
    │
    ▼
通知项目经理
```

---

## 📝 检查记录模板

**复制以下模板到验收报告中**:

```markdown
## 任务关闭检查

- **检查时间**: YYYY-MM-DD HH:MM
- **检查人**: xxx

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 1. 功能开发完成 | ✅ | - |
| 2. 自测通过 | ✅ | - |
| 3. 验收通过 | ✅ | 验收报告：`docs/acceptance/TASK_{ID}_ACCEPTANCE.md` |
| 4. 项目内文档更新 | ✅ | `docs/runtime/TASK_{ID}_STATUS.md` |
| 5. todo.db 同步 | ✅ | 命令：`todo entry status <ID> --status=done` |
| 6. 经验记录 | ✅ / ⚪ | 如适用 |

**结论**: ✅ 所有检查项通过，任务可以关闭
```

---

## ⚠️ 常见遗漏

| 遗漏项 | 后果 | 预防措施 |
|--------|------|----------|
| todo.db 未同步 | 跨项目进度不同步 | 将 todo.db 同步作为验收流程强制步骤 |
| 经验未记录 | 重复踩坑 | 在验收报告中添加经验记录检查项 |
| 状态文件未更新 | 项目内进度不明确 | 使用本检查清单逐项核对 |

---

## 🔗 相关文档

- `docs/ACCEPTANCE_WORKFLOW.md` - 验收流程规范
- `docs/PROJECT_ROLES.md` - 角色分工与职责
- `docs/WORK_LOG_POLICY.md` - 日志制度
- `docs/PROJECT_LESSONS.md` - 项目经验记录
- `skills/项目操作规范/SKILL.md` - 项目操作规范（三重保险）

---

## 📝 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-03-25 | 初始版本，基于 TASK_V3 进度滞后问题经验创建 |

---

*创建者：灵爪 🐾*  
*经验来源：TASK_V3 任务进度同步滞后根因分析（2026-03-25）*
