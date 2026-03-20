# Claude 任务派发模板

## 1. 适用范围

适合交给 Claude Code 的任务：

- 单文件脚本开发或修复
- 一个明确 bug 的修复
- 一个明确字段、导出函数或接口补齐
- 已有实现基础上的小范围增量改动

不适合直接交给 Claude Code 的任务：

- 目标模糊的大任务
- 需要先做大量方案设计的任务
- 多条技术路线差异很大的任务
- 缺少验收标准、只能靠主观判断的任务

原则：

- Claude Code 负责小范围执行
- 任务拆分、验收、进度记录由项目主流程负责

---

## 2. 标准调用方式

推荐使用一次性、非交互、无会话持久化的调用方式，避免旧上下文污染新任务。

```bash
cat <<'EOF' >/tmp/claude_task.txt
你在 /Users/vvc/.openclaw/workspace/stock-system 仓库中开发。

只修改 scripts/example.mjs。

任务目标：
实现一个最小可运行的脚本。

要求：
1. 不引入新依赖
2. 不要改别的文件
3. 完成后运行 node --check scripts/example.mjs

最终只输出：
1. 修改文件
2. 执行命令
3. 关键结果
EOF

claude -p \
  --no-session-persistence \
  --disable-slash-commands \
  --dangerously-skip-permissions \
  --output-format json \
  --add-dir /Users/vvc/.openclaw/workspace/stock-system \
  < /tmp/claude_task.txt
```

参数说明：

- `-p`：一次性输出并退出
- `--no-session-persistence`：避免旧任务污染当前任务
- `--disable-slash-commands`：减少插件、skills 和额外规则干扰
- `--output-format json`：便于后续核对结果
- `--add-dir`：限制访问范围在当前项目目录

---

## 3. 任务派发模板

推荐按以下结构编写 prompt：

```text
你在 /Users/vvc/.openclaw/workspace/stock-system 仓库中开发。

只修改 [文件路径]。

任务目标：
[一句话描述本次要完成的目标]

要求：
1. ...
2. ...
3. ...

约束：
- 不要改别的文件
- 不要引入新依赖
- 保持现有字段不回退
- 保持容错

完成后必须运行：
- [命令1]
- [命令2]

最终只输出：
1. 修改文件
2. 执行命令
3. 关键结果
```

---

## 4. 任务拆分规则

一个 Claude 任务最好满足以下条件：

- 最多只涉及 1 到 3 个强相关文件
- 目标可以在一轮命令里说清
- 验收标准可以落到具体命令或具体字段
- 失败后可以明确指出差异并发起下一轮修复

推荐拆分方式：

- 不要说“继续推进 TASK_016”
- 要说“只修改 scripts/daily-monitor.mjs，为 monitor_assessment 增加 watch_items”

---

## 5. 标准验收流程

Claude 返回后，不直接相信自然语言结果，必须独立复验：

1. 读取修改后的文件
2. 运行语法检查
3. 运行目标脚本或测试命令
4. 检查输出文件、返回值或关键字段
5. 只有通过验收后，才更新项目内记录

推荐验收项：

- `node --check ...`
- `node scripts/...`
- 读取生成的 JSON / HTML / 日志文件
- 检查关键导出、关键字段、关键行为

---

## 6. 失败回灌模板

如果 Claude 没完成要求，不要笼统说“继续修”，而要把验收差异原样回灌。

```text
你上一次交付没有通过验收。

当前事实：
1. ...
2. ...
3. ...

现在请只修改 [文件路径]，修复这个缺口。

必须满足：
- ...
- ...

完成后运行：
- ...

最终只输出：
1. 修改文件
2. 执行命令
3. 关键结果
```

原则：

- 只指出实际失败点
- 不重新描述整个大任务
- 只让 Claude 修正当前缺口

---

## 7. 本项目推荐用法

在 `stock-system` 中，Claude Code 优先用于：

- `scripts/` 下的小脚本开发和修复
- 单点接口修复
- 已有结构基础上的字段补齐
- 任务阶段内的小范围增量改动

项目主流程仍然负责：

- 任务拆分
- 项目内状态更新
- GitHub PR 和 Code Review
- 本地验收
- 交接记录

---

## 8. 当前最佳实践

推荐流程：

1. 先更新 `docs/runtime/TASK_{ID}_STATUS.md`
2. 再派发 Claude 小任务
3. Claude 返回后做独立验收
4. 验收通过后更新 `memory/project_log.md`
5. 再决定是否提交 GitHub PR 和触发 Code Review

一句话原则：

先拆小、再执行、后验收，始终不要把 Claude 当成自主项目经理。
