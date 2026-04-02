# TASK_MOCK_001 - 数据库迁移：4 张模拟表 - 交接文档

**创建时间**: 2026-04-02 08:40  
**开发者**: Codex  
**状态**: 已完成

---

## 任务目标
为独立模拟账户系统创建基础数据表，支撑后续模拟交易、绩效评估与二次迭代触发链路。

## 实施结果
已落地迁移文件：`db/migrations/018_create_mock_tables.sql`

已创建数据表：
- `mock_account`
- `mock_position`
- `mock_trade`
- `mock_performance`

已补充：
- 主键与外键约束
- 关键查询索引

## 验证结果
- 迁移执行成功（主库已建表）
- 外键检查通过（`PRAGMA foreign_key_list`）
- 索引检查通过
- 联表插入链路验证通过并完成测试数据清理

## 交接说明
- 后续任务（`TASK_MOCK_002~006`）默认依赖这 4 张表，禁止绕过此迁移直接手工改库。
- 新增字段请走 `019+` 迁移，不要改写 `018`。

## 相关文件
- `db/migrations/018_create_mock_tables.sql`
- `docs/tasks/TASK_MOCK_001_ASSIGNMENT.md`
- `docs/runtime/TASK_MOCK_001_STATUS.md`
- `docs/PROJECT_PROGRESS.md`
