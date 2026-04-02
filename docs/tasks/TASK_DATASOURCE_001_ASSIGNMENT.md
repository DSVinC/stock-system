# 任务分配单：TASK_DATASOURCE_001

> **创建**: 2026-04-02 09:14  
> **状态**: ✅ done

---

## 📋 任务描述

**任务名称**: 公告数据源切换 - AkShare 主数据源 + Sina MCP 备用

**背景**: 
- 当前使用新浪财经 MCP 获取公司公告，需要收费
- AkShare 提供免费公告数据，功能完全覆盖 Sina MCP
- 目标：切换到 AkShare 主数据源，Sina MCP 作为备用

**工作内容**:
1. 扩展 `sina-free-api.js` 添加公告获取功能
2. 修改 `position-signals.js` 优先使用 AkShare
3. 保留 Sina MCP 作为自动回退备用
4. 测试验证双数据源架构

---

## 👤 分配信息（必填，缺一不可）

| 角色 | 人员 |
|------|------|
| 项目经理 | 灵爪 |
| 程序员 | Claude Code CLI |
| 验收员 | Gemini CLI |

**⚠️ 硬规则**：验收员必须与程序员不同，且必须在任务开始前指定！

---

## 🔗 功能边界与依赖（必填，缺一不可）

| 检查项 | 填写内容 |
|--------|---------|
| **功能边界** | 负责公告数据源切换，不影响其他模块（行情、回测、监控等） |
| **依赖关系** | 上游：无；下游：持仓监控脚本、公告信号生成 |
| **模块职责** | 提供可靠的公告数据获取能力，优先免费数据源，确保数据完整性 |

**⚠️ 硬规则**：以上 3 项必须填写，验收时会检查！

---

## ✅ 交付物

- [x] `stock-system/lib/sina-free-api.js` - 扩展公告获取函数
- [x] `stock-system/api/position-signals.js` - 双数据源逻辑
- [x] `stock-system/scripts/fetch_announcements_akshare.py` - Python 封装
- [x] `stock-system/docs/AKSHARE_PRIMARY_SINA_BACKUP.md` - 策略文档
- [x] `stock-system/docs/AKSHARE_VS_SINA_MCP_COMPARISON.md` - 对比评估

---

## 📝 进度记录（必填，时间戳自动记录）

- 2026-04-02 09:08 - 任务开始
- 2026-04-02 09:12 - 功能实现完成
- 2026-04-02 09:14 - 测试验证通过
- 2026-04-02 09:14 - 任务完成

---

## 🧪 验收结果

**验收员**: Gemini CLI  
**验收时间**: 2026-04-02 09:14  
**验收结果**: ✅ 通过

**验收检查项**:
- [x] AkShare 主数据源正常工作
- [x] Sina MCP 备用逻辑正常
- [x] 全板块覆盖测试通过
- [x] 文档完整

---

## 📎 相关文档

- `docs/AKSHARE_PRIMARY_SINA_BACKUP.md` - 双数据源策略
- `docs/AKSHARE_VS_SINA_MCP_COMPARISON.md` - 功能对比评估
- `docs/SINA_MCP_REPLACED.md` - 替换文档（已废弃，更新为双数据源）
