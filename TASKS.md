# Codex 任务分配

## 任务1: 首页 + 选股接口 (Codex-1)

### 页面: index.html
- 标题: A股投资系统
- 副标题: 自上而下，系统化投资
- 主按钮: "开始选股"
- 选股结果展示区域（方向名称 + 评分 + 选择框）
- 底部按钮: "下一步：个股分析"（跳转到 analysis.html）

### 接口: api/select.js
- 调用现有 skill: `skills/a股行业筛选/SKILL.md`
- 返回格式:
```json
{
  "directions": [
    {"name": "AI算力", "score": 85, "reason": "..."},
    {"name": "机器人", "score": 78, "reason": "..."}
  ]
}
```

---

## 任务2: 个股分析页面 + 接口 (Codex-2)

### 页面: analysis.html
- 显示用户选中的方向列表
- "分析"按钮
- 分析结果展示区域（股票名称 + 代码 + 推荐评分 + 选择框）
- 自定义输入框（股票名称或代码）
- 底部按钮: "加入监控池"（跳转到 monitor-pool.html）

### 接口: api/analyze.js
- 调用现有 skill: `skills/a股个股分析/SKILL.md`
- 参数: directions (选中的方向数组)
- 返回格式:
```json
{
  "stocks": [
    {"name": "中际旭创", "code": "300308.SZ", "score": 4, "decision": "买入"},
    {"name": "浪潮信息", "code": "000977.SZ", "score": 4, "decision": "买入"}
  ]
}
```

---

## 任务3: 监控池管理页面 + 接口 (Codex-3)

### 页面: monitor-pool.html
- 监控池股票列表（表格形式）
  - 列: 股票名称、代码、添加时间、操作
  - 操作: 查看报告、移除
- "前往监控面板"按钮（跳转到 monitor.html）

### 接口: api/monitor.js
- 数据库: data/stock_system.db
- 表结构:
```sql
CREATE TABLE monitor_pool (
  id INTEGER PRIMARY KEY,
  stock_code TEXT,
  stock_name TEXT,
  report_path TEXT,
  added_at DATETIME
);
```
- 操作: list / add / remove

---

## 样式要求
- 暗色主题，参考现有 monitor.html 的风格
- 响应式布局
- 统一的 CSS 文件: pages/style.css

## 数据交互
- 前端用 fetch 调用 api/*.js
- 后端返回 JSON