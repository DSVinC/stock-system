# TASK_POSITION_MONITOR_002 - 持仓监控公告推送优化

**状态**: done  
**开发者**: 灵爪  
**验收员**: 待验收  
**最后更新**: 2026-03-31 10:55

---

## 任务描述
优化持仓监控公告推送策略，从"仅高危/中危推送"改为"有公告就推送，标记风险等级"。

## 修改内容
| 文件 | 修改内容 |
|------|----------|
| `api/position-signals.js` | `runFullMonitoring()` 返回 `announcements` 数据 |
| `api/position-signals.js` | `getRecentMajorAnnouncements()` 添加 `content` 字段查询 |
| `scripts/monitor-positions.mjs` | 新增 `formatAnnouncementMessage()` 函数 |

## 推送格式
```
📋 持仓公告 10:49

• 中际旭创：财报发布：2025 年年报归母净利润 107.97 亿元，同比增长 108.78%...
• 中际旭创：预计财报发布：2026-03-31 发布年报
• 德赛西威：分配方案：2025 年度，10 股派 12.50 元...

共 5 条
```

## 验证结果
```bash
node scripts/monitor-positions.mjs --mode=daily
```
- ✅ 输出正常
- ✅ 单条公告≤100 字
- ✅ 下次 20:00 执行时飞书推送

## 相关文档
- `memory/2026-03-31.md` - 当天过程记录
- `docs/PROJECT_LESSONS.md` - 项目经验更新
