# TASK_FLOW_REFACTOR_038A 实时状态

**状态**: done  
**开始时间**: 2026-03-28 11:27  
**完成时间**: 2026-03-28 11:30  
**负责人**: Codex  
**开发执行**: Codex

## 任务目标

修复 `strategy-template` 路由顺序，避免更具体的静态路由被参数路由提前吞掉；同时把对应的回归测试接入默认测试链路，保证后续不会再回退。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/strategy-template.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/strategy-template-default-route.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/strategy-template-profiles.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/tests/run-all-tests.js`
- `/Users/vvc/.openclaw/workspace/stock-system/docs/runtime/TASK_FLOW_REFACTOR_038A_STATUS.md`
- `/Users/vvc/.openclaw/workspace/stock-system/docs/PROJECT_PROGRESS.md`

## 已完成

- 已修复 `api/strategy-template.js` 路由顺序：`/default` 先于 `/:id` 注册，避免静态路由被动态路由吞掉。
- 已新增 `test/strategy-template-default-route.test.js`，无端口监听地校验 `/default` 与 `/profiles` 均在 `/:id` 之前。
- 已将新回归脚本接入 `tests/run-all-tests.js`。
- 已将 `test/strategy-template-profiles.test.js` 改为无端口监听执行，规避当前沙箱 `listen EPERM`。

## 待完成

- 无

## 验收结果

- 通过
- 验证方式：
  - `node test/strategy-template-default-route.test.js` ✅
  - `node test/strategy-template-profiles.test.js` ✅
  - `node tests/run-all-tests.js` ⚠️ 当前环境存在已知沙箱限制：多个 iteration-manager 脚本在 `app.listen()` 时报 `listen EPERM`（非本任务逻辑回归）

## 边界情况

- 若后续新增静态子路由，需继续保持“静态路由在动态路由前”的注册顺序。
