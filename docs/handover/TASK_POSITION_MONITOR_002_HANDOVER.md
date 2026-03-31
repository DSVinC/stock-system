# TASK_POSITION_MONITOR_002 - 持仓监控公告推送优化 - 交接文档

**创建时间**: 2026-03-31 10:55  
**开发者**: 灵爪  
**状态**: 开发完成，待验收

---

## 任务背景
用户反馈持仓监控无推送，实际是推送策略问题：
- 原策略：只在有 HIGH/MEDIUM 信号时推送
- 低风险公告（财报发布、大宗交易、机构调研）被过滤
- 用户无法确认公告监控是否正常工作

## 解决方案
实施选项 C：有公告就推送，标记风险等级

## 修改文件清单
| 文件 | 修改内容 | 行数变化 |
|------|----------|----------|
| `api/position-signals.js` | `runFullMonitoring()` 返回 `announcements` 数据 | +20 行 |
| `api/position-signals.js` | `getRecentMajorAnnouncements()` 添加 `content` 字段查询 | +2 行 |
| `scripts/monitor-positions.mjs` | 新增 `formatAnnouncementMessage()` 函数 | +40 行 |

## 推送格式（最终版）
```
📋 持仓公告 10:49

• 中际旭创：财报发布：2025 年年报归母净利润 107.97 亿元，同比增长 108.78%...
• 中际旭创：预计财报发布：2026-03-31 发布年报
• 中际旭创：机构调研：中际旭创：2026 年 03 月 30 日投资者关系活动记录表
• 中际旭创：分配方案：2025 年度，10 股派 10.00 元。（预案）
• 德赛西威：分配方案：2025 年度，10 股派 12.50 元...

共 5 条
```

**规范**: 单条≤100 字（股票名：标题：摘要）

## 验证步骤
```bash
# 1. 测试脚本执行
cd /Users/vvc/.openclaw/workspace/stock-system
node scripts/monitor-positions.mjs --mode=daily

# 2. 检查输出格式
# 预期：看到 📋 持仓公告 格式的摘要

# 3. 等待定时任务执行
# 下次执行：今日 20:00（盘后监控）
```

## 验收标准
- [ ] 脚本执行无错误
- [ ] 输出格式符合要求（单条≤100 字）
- [ ] 飞书推送正常（20:00 执行后确认）
- [ ] 公告内容完整（股票名 + 标题 + 摘要）

## 相关文档
- `docs/runtime/TASK_POSITION_MONITOR_002_STATUS.md` - 实时状态
- `memory/2026-03-31.md` - 当天过程记录
- `docs/PROJECT_LESSONS.md` - 项目经验更新

## 注意事项
1. 推送使用 OpenClaw 飞书插件渠道，不是 webhook
2. cron 任务 delivery 机制会自动推送到飞书私聊
3. 单条公告 100 字限制，摘要自动截断
