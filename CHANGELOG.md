# A股投资系统 - 开发日志

## 2026-03-13 状态

### 已完成

**后端接口**：
- `api/select.js` - 选股接口，返回 6 个方向 + 评分
- `api/analyze.js` - 个股分析接口，返回股票列表
- `api/monitor.js` - 监控池接口（list/add/remove）
- `api/server.js` - Express 服务器入口

**前端页面**：
- `index.html` - 首页
- `analysis.html` - 个股分析页
- `monitor-pool.html` - 监控池管理页
- `pages/style.css` - 暗色主题样式

**数据库**：
- `data/stock_system.db` - SQLite 数据库（通过 /usr/bin/sqlite3）

### 已修复的问题

1. **express 模块引用问题**
   - select.js 和 analyze.js 直接用 `require('express')` 但项目没安装
   - 修复：改用 `createRequire` 引用 sina-ashare-mcp 的 express

2. **路由导出格式问题**
   - server.js 的 mountApi 函数判断顺序错误
   - 修复：先检查 `exported.stack`（Express Router），再检查其他

3. **首页 scrollButton 引用问题**
   - HTML 已删除按钮，但 JS 里还有 scrollButton 变量和事件监听
   - 修复：删除相关代码，添加 viewReportBtn 功能

4. **个股分析页"已选方向"显示问题**
   - 原来显示技术说明文字
   - 修复：直接显示方向名称的 tag

### 待修复问题

1. **前端请求接口失败**
   - 现象：浏览器点击"开始选股"提示"接口请求失败"
   - 接口本身正常（curl 测试通过）
   - 可能原因：浏览器缓存、跨域、或其他前端问题
   - 建议：清浏览器缓存 / 检查 fetch 路径 / 打开浏览器开发者工具看具体错误

2. **查看选股报告功能**
   - 按钮已添加，但后端接口 `/api/select/report` 未实现
   - 需要调用 `skills/a股行业筛选` 生成报告

3. **查看个股报告功能**
   - 按钮已添加，但后端接口 `/api/analyze/report` 未实现
   - 需要调用 `skills/a股个股分析` 生成报告

### 启动方式

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node api/server.js
# 访问 http://localhost:3000/index.html
```

### 依赖

- Node.js
- Express（通过 sina-ashare-mcp 的 node_modules）
- SQLite3（系统自带 /usr/bin/sqlite3）

---

*更新时间：2026-03-13 20:10*